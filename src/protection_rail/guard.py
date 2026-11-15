import os

from deepagents import create_deep_agent
from dotenv import load_dotenv
from langchain.agents.middleware import after_agent, before_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_groq import ChatGroq
from nemoguardrails import LLMRails, RailsConfig
from nemoguardrails.integrations.langchain.llm_adapter import LangChainLLMAdapter
from nemoguardrails.rails.llm.options import RailStatus, RailType
from pathlib import Path


load_dotenv(override=True)

groq_key = os.getenv("GROQ_API_KEY")
if not groq_key:
    raise RuntimeError("GROQ_API_KEY is missing from the .env file.")

guard_llm = ChatGroq(
    api_key=groq_key,
    model="openai/gpt-oss-120b",
    temperature=0,
)

rails = LLMRails(
    RailsConfig.from_path(str(Path(__file__).resolve().parent)),
    llm=LangChainLLMAdapter(guard_llm),
)

BLOCKED_INPUT_MESSAGE = (
    "I only assist with accounting, business finance, and tax planning."
)
BLOCKED_OUTPUT_MESSAGE = (
    "I cannot provide this response under my financial assistant policy."
)


@before_agent(can_jump_to=["end"])
async def check_input(state, runtime):
    question = next(
        (
            message
            for message in reversed(state["messages"])
            if isinstance(message, HumanMessage)
        ),
        None,
    )
    if question is None:
        return None

    result = await rails.check_async(
        [{"role": "user", "content": question.content}],
        rail_types=[RailType.INPUT],
    )
    if result.status == RailStatus.BLOCKED:
        return {
            "messages": [AIMessage(content=BLOCKED_INPUT_MESSAGE)],
            "jump_to": "end",
        }
    return None


@after_agent
async def check_output(state, runtime):
    question = next(
        (
            message
            for message in reversed(state["messages"])
            if isinstance(message, HumanMessage)
        ),
        None,
    )
    answer = next(
        (
            message
            for message in reversed(state["messages"])
            if isinstance(message, AIMessage)
        ),
        None,
    )
    if question is None or answer is None or answer.content == BLOCKED_INPUT_MESSAGE:
        return None

    result = await rails.check_async(
        [
            {"role": "user", "content": question.content},
            {"role": "assistant", "content": answer.content},
        ],
        rail_types=[RailType.OUTPUT],
    )
    if result.status == RailStatus.BLOCKED:
        return {
            "messages": [
                answer.model_copy(update={"content": BLOCKED_OUTPUT_MESSAGE})
            ]
        }
    return None