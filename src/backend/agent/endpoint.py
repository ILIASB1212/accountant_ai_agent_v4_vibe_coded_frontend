import json
import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from postgrest.exceptions import APIError

from src.backend.agent.schemas import ChatModel, ClientCreate, OCRResult, SessionCreate
from src.backend.dependencies import Membership, active_member, db_error
from src.memory.memory_class import Memory
from src.backend.agent.ocr import DocumentError, MAX_UPLOAD_BYTES, SUPPORTED_SUFFIXES, extract_document
from pathlib import Path

logger = logging.getLogger(__name__)
agent_router = APIRouter()


@agent_router.get("/health")
def check_health():
    return {"status": "ok"}


@agent_router.post("/ocr", response_model=OCRResult)
async def read_document(
    file: UploadFile = File(...),
    m: Membership = Depends(active_member),
):
    """Extract a member's uploaded document using the existing Groq OCR tool."""
    try:
        filename = (file.filename or "document").replace("\\", "/").rsplit("/", 1)[-1]
        suffix = Path(filename).suffix.lower()
        if suffix not in SUPPORTED_SUFFIXES:
            raise HTTPException(415, "Formats acceptés : PDF, PNG et JPEG.")
        chunks = []
        size = 0
        while chunk := await file.read(64 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "Le fichier dépasse la limite de 10 Mo.")
            chunks.append(chunk)
        if not size:
            raise HTTPException(422, "Le fichier est vide.")
        try:
            text = await run_in_threadpool(extract_document, b"".join(chunks), suffix)
        except DocumentError as error:
            raise HTTPException(422, str(error)) from error
        except Exception:
            logger.exception("document extraction failed")
            raise HTTPException(502, "La lecture du document a échoué. Réessayez plus tard.")
        return OCRResult(filename=filename[:255], text=text)
    finally:
        await file.close()


# ------------------------------------------------------------ client firms

@agent_router.post("/clients", status_code=201)
def add_client_firm(body: ClientCreate, m: Membership = Depends(active_member)):
    """A firm the fiduciary works for. Chat sessions are opened per client firm."""
    try:
        res = (
            m.user.db.table("clients")
            .insert({"company_id": m.company_id, "name": body.name.strip()})
            .execute()
        )
    except APIError as e:
        raise db_error(e)
    return res.data[0]


@agent_router.get("/clients")
def list_client_firms(m: Membership = Depends(active_member)):
    return (
        m.user.db.table("clients").select("id,name,created_at")
        .eq("company_id", m.company_id).order("name").execute().data
    )


# ------------------------------------------------------------ sessions

@agent_router.post("/sessions", status_code=201)
def create_session(body: SessionCreate, m: Membership = Depends(active_member)):
    client = (
        m.user.db.table("clients").select("id,name")
        .eq("id", str(body.client_id)).limit(1).execute().data
    )
    if not client:  # also what a client firm of ANOTHER company looks like: RLS hides it
        raise HTTPException(404, "Client firm not found.")
    try:
        res = (
            m.user.db.table("chat_sessions")
            .insert(
                {
                    "company_id": m.company_id,
                    "client_id": client[0]["id"],
                    "created_by": m.user.id,
                    "title": (body.title or client[0]["name"]).strip(),
                }
            )
            .execute()
        )
    except APIError as e:
        raise db_error(e)
    return res.data[0]


@agent_router.get("/sessions")
def list_sessions(client_id: str | None = None, m: Membership = Depends(active_member)):
    q = m.user.db.table("chat_sessions").select("id,client_id,title,created_by,created_at")
    if client_id:
        q = q.eq("client_id", client_id)
    return q.order("created_at", desc=True).limit(100).execute().data


def _get_session(m: Membership, session_id: str) -> dict:
    rows = (
        m.user.db.table("chat_sessions").select("id,company_id,client_id")
        .eq("id", session_id).limit(1).execute().data
    )
    if not rows:
        raise HTTPException(404, "Session not found.")
    return rows[0]


@agent_router.get("/sessions/{session_id}/messages")
def session_messages(session_id: str, m: Membership = Depends(active_member)):
    _get_session(m, session_id)
    return (
        m.user.db.table("messages").select("id,role,content,created_at")
        .eq("session_id", session_id).order("id").execute().data
    )


# ------------------------------------------------------------ chat

def _remember(memory: Memory, answer: str) -> None:
    """Runs after the response is sent; memory problems must never break a chat."""
    try:
        payload = memory.semantic_memory_for_facts(answer)
        if payload:
            memory.store_memory(payload)
    except Exception:
        logger.exception("mem0 store failed")


def _save_answer(m: Membership, session_id: str, message: str, answer: str) -> bool:
    try:
        m.user.db.table("messages").insert(
            [
                {"session_id": session_id, "role": "user", "content": message},
                {"session_id": session_id, "role": "assistant", "content": answer},
            ]
        ).execute()
        return True
    except APIError:
        logger.exception("could not save chat history")
        return False


def _answer_events(graph, body: ChatModel, config: dict, m: Membership, memory: Memory, background: BackgroundTasks):
    """Stream only chat text; tool output, arguments and internal events stay private."""
    def event(payload: dict) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    final_state = None
    message_id = None
    visible = ""
    tool_call = False
    text_events = 0
    try:
        yield event({"type": "status", "phase": "checking"})
        for mode, data in graph.stream(
            {"messages": [HumanMessage(content=body.message)]},
            config=config,
            stream_mode=["messages", "values"],
        ):
            if mode == "values":
                final_state = data
                continue
            chunk, metadata = data
            if metadata.get("langgraph_node") != "chat" or not isinstance(chunk, AIMessageChunk):
                continue
            if chunk.id != message_id:
                message_id = chunk.id
                tool_call = False
                if visible:
                    visible = ""
                    yield event({"type": "replace", "text": ""})
            if chunk.tool_call_chunks or chunk.tool_calls:
                tool_call = True
                if visible:
                    visible = ""
                    yield event({"type": "replace", "text": ""})
            if tool_call:
                continue
            text = chunk.text
            if text:
                text_events += 1
                visible += text
                yield event({"type": "delta", "text": text})

        # This is authoritative, including guardrail refusals and non-streaming model fallbacks.
        if not final_state or not final_state.get("messages"):
            raise RuntimeError("agent stream ended without a final state")
        if not isinstance(final_state["messages"][-1], AIMessage):
            raise RuntimeError("agent stream ended without an assistant answer")
        answer = final_state["messages"][-1].content
        answer = answer if isinstance(answer, str) else str(answer)
        if answer != visible:
            yield event({"type": "replace", "text": answer})
        saved = _save_answer(m, str(body.session_id), body.message, answer)
        background.add_task(_remember, memory, answer)
        blocked = bool(final_state.get("blocked", False))
        logger.info("chat stream completed: text_events=%d, blocked=%s", text_events, blocked)
        yield event({"type": "done", "answer": answer, "history_saved": saved, "blocked": blocked})
    except Exception:
        logger.exception("agent stream failed")
        yield event({"type": "error", "message": "The agent could not answer. Please try again."})


@agent_router.post("/invoke")
def ask_agent(
    body: ChatModel,
    request: Request,
    background: BackgroundTasks,
    m: Membership = Depends(active_member),
):
    session = _get_session(m, str(body.session_id))  # 404 unless it is in the caller's company

    client = (
        m.user.db.table("clients").select("name")
        .eq("id", session["client_id"]).limit(1).execute().data
    )
    client_name = client[0]["name"] if client else ""

    # Long-term memory is scoped by IDs read from the database row, never from the request.
    memory = Memory.for_client(body.message, session["company_id"], session["client_id"])
    try:
        memory_context = memory.format_context_for_systeme(memory.retrive())
    except Exception:
        logger.exception("mem0 search failed")
        memory_context = ""

    config = {
        "configurable": {
            "thread_id": str(body.session_id),  # conversation state lives per session
            "memory_context": memory_context,   # picked up by chat_node, never enters the checkpoint
            "client_name": client_name,
        }
    }

    if "text/event-stream" in request.headers.get("accept", ""):
        return StreamingResponse(
            _answer_events(request.app.state.graph, body, config, m, memory, background),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no"},
            background=background,
        )

    start = datetime.now()
    try:
        result = request.app.state.graph.invoke(
            {"messages": [HumanMessage(content=body.message)]}, config=config
        )
    except Exception:
        logger.exception("agent failed")
        raise HTTPException(500, "The agent could not answer. Please try again.")
    answer = result["messages"][-1].content
    answer = answer if isinstance(answer, str) else str(answer)
    elapsed = (datetime.now() - start).total_seconds()

    _save_answer(m, str(body.session_id), body.message, answer)

    background.add_task(_remember, memory, answer)
    return PlainTextResponse(f"_Response generated in {elapsed:.2f} seconds_ \n {answer}")
