"""Endpoint streaming checks with an isolated database and deterministic local models."""
import json

from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage
import pytest

import src.test.test_backend_flow as flow
from src.test.test_backend_flow import api  # noqa: F401


def setup_session(api):
    client, db, graph = api
    assert client.post(f"{flow.REG}/company", json={"company_name": "Stream Test"}, headers=flow.h("alice")).status_code == 201
    company = db.t["companies"][0]["id"]
    firm = client.post(f"{flow.AG}/clients", json={"name": "Atlas Stream"}, headers=flow.h("alice")).json()
    session = client.post(f"{flow.AG}/sessions", json={"client_id": firm["id"]}, headers=flow.h("alice")).json()
    return client, db, graph, session["id"], company


def events(response):
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    return [json.loads(frame.removeprefix("data: ")) for frame in response.text.strip().split("\n\n")]


def send(client, session, who="alice"):
    return client.post(f"{flow.AG}/invoke", json={"session_id": session, "message": "TVA ?"}, headers={**flow.h(who), "Accept": "text/event-stream"})


def test_stream_text_filters_tools_and_persists_once(api, monkeypatch):
    client, db, graph, session, company = setup_session(api)
    def stream(state, config, stream_mode):
        graph.calls.append((state, config))
        assert stream_mode == ["messages", "values"]
        yield "messages", (AIMessageChunk(content="private retriever text", id="retrieval"), {"langgraph_node": "tool_node"})
        yield "messages", (ToolMessage(content="private raw document", tool_call_id="t"), {"langgraph_node": "tool_node"})
        yield "messages", (AIMessageChunk(content="", id="call", tool_call_chunks=[{"name": "cgi", "args": "secret args", "id": "t", "index": 0}]), {"langgraph_node": "chat"})
        yield "messages", (AIMessageChunk(content="Réponse ", id="answer"), {"langgraph_node": "chat"})
        yield "messages", (AIMessageChunk(content="ضريبة TVA", id="answer"), {"langgraph_node": "chat"})
        yield "values", {"messages": [AIMessage(content="Réponse ضريبة TVA")]}
    monkeypatch.setattr(graph, "stream", stream, raising=False)
    result = send(client, session)
    frames = events(result)
    assert [frame["type"] for frame in frames] == ["status", "delta", "delta", "done"]
    assert frames[-1] == {"type": "done", "answer": "Réponse ضريبة TVA", "history_saved": True, "blocked": False}
    assert "private" not in result.text and "secret" not in result.text and "cgi" not in result.text
    assert [(row["role"], row["content"]) for row in db.t["messages"]] == [("user", "TVA ?"), ("assistant", "Réponse ضريبة TVA")]
    assert graph.calls[-1][1]["configurable"]["thread_id"] == session
    assert graph.calls[-1][1]["configurable"]["client_name"] == "Atlas Stream"
    assert flow.FakeMem0.adds[-1]["user_id"].startswith(company + ":")


def test_existing_invoke_node_streams_with_real_langgraph(api, monkeypatch):
    from typing import Annotated, TypedDict
    from langchain_core.language_models.fake_chat_models import FakeListChatModel
    from langgraph.graph import StateGraph, START, END, add_messages
    class State(TypedDict):
        messages: Annotated[list, add_messages]
    model = FakeListChatModel(responses=["Bonjour المغرب"])
    def chat(state):
        return {"messages": [model.invoke(state["messages"])]}
    graph = StateGraph(State)
    graph.add_node("chat", chat)
    graph.add_edge(START, "chat")
    graph.add_edge("chat", END)
    client, _, _, session, _ = setup_session(api)
    import src.backend as backend
    monkeypatch.setattr(backend.app.state, "graph", graph.compile())
    frames = events(send(client, session))
    assert len([frame for frame in frames if frame["type"] == "delta"]) > 1
    assert frames[-1]["answer"] == "Bonjour المغرب"


@pytest.mark.parametrize("failure", [False, True])
def test_refusal_and_error_do_not_emit_internal_data(api, monkeypatch, failure):
    client, db, graph, session, _ = setup_session(api)
    def stream(*args, **kwargs):
        if failure:
            yield "messages", (AIMessageChunk(content="Partial", id="answer"), {"langgraph_node": "chat"})
            raise RuntimeError("secret provider key")
        yield "values", {"messages": [AIMessage(content="Request blocked by existing guardrail.")], "blocked": True}
    monkeypatch.setattr(graph, "stream", stream, raising=False)
    response = send(client, session)
    frames = events(response)
    assert "secret" not in response.text
    if failure:
        assert frames[-1]["type"] == "error"
        assert not db.t["messages"]
        assert not flow.FakeMem0.adds
    else:
        assert frames[-1]["answer"] == "Request blocked by existing guardrail."
        assert frames[-1]["blocked"] is True
        assert len(db.t["messages"]) == 2


def test_stream_has_the_same_authentication_and_tenant_isolation(api):
    client, _, _, session, _ = setup_session(api)
    client.post(f"{flow.REG}/company", json={"company_name": "Other firm"}, headers=flow.h("mallory"))
    assert send(client, session, "mallory").status_code == 404
    client.post(f"{flow.REG}/company/join", json={"join_code": "ABCD1234"}, headers=flow.h("bob"))
    assert send(client, session, "bob").status_code == 403
    assert client.post(f"{flow.AG}/invoke", json={"session_id": session, "message": "TVA ?"}, headers={"Accept": "text/event-stream"}).status_code == 401


def test_openai_bound_tools_emit_tokens_through_the_real_adapter(api, monkeypatch):
    import httpx
    from typing import Annotated, TypedDict
    from langchain.chat_models import init_chat_model
    from langgraph.graph import StateGraph, START, END, add_messages
    from langgraph.checkpoint.memory import MemorySaver

    payloads = []
    def provider(request):
        payload = json.loads(request.content)
        payloads.append(payload)
        if not payload.get("stream"):
            return httpx.Response(200, json={"id": "chatcmpl-test", "object": "chat.completion", "model": "gpt-4o-mini", "choices": [{"index": 0, "message": {"role": "assistant", "content": "Bonjour المغرب"}, "finish_reason": "stop"}]})
        chunks = []
        for text in ["Bonjour ", "المغرب"]:
            chunks.append("data: " + json.dumps({"id": "chatcmpl-test", "object": "chat.completion.chunk", "model": "gpt-4o-mini", "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}]}) + "\n\n")
        chunks.append('data: {"id":"chatcmpl-test","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
        return httpx.Response(200, headers={"Content-Type": "text/event-stream"}, text="".join(chunks))

    def lookup_tax(query: str) -> str:
        """Look up a Moroccan tax rule."""
        return "not invoked in this test"

    with httpx.Client(transport=httpx.MockTransport(provider)) as http_client:
        model = init_chat_model(model="openai:gpt-4o-mini", temperature=0, api_key="local-test", http_client=http_client).bind_tools([lookup_tax])
        class State(TypedDict):
            messages: Annotated[list, add_messages]
        def chat(state):
            return {"messages": [model.invoke(state["messages"])]}
        builder = StateGraph(State)
        builder.add_node("chat", chat)
        builder.add_edge(START, "chat")
        builder.add_edge("chat", END)
        client, _, _, session, _ = setup_session(api)
        import src.backend as backend
        monkeypatch.setattr(backend.app.state, "graph", builder.compile(checkpointer=MemorySaver()))
        frames = events(send(client, session))
        assert payloads[0].get("stream") is True, "The actual OpenAI adapter did not request provider streaming"
        assert len([frame for frame in frames if frame["type"] == "delta"]) >= 2, frames
        assert frames[-1]["answer"] == "Bonjour المغرب"
