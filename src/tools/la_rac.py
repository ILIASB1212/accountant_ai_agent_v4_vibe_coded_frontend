from functools import lru_cache

from langchain_classic.tools.retriever import create_retriever_tool

from PipeLine.pipeline import RagPipeLine

@lru_cache(maxsize=1)
def _get_ras_retriever():
    rag = RagPipeLine(
        data_dir="./data/RAS",
        persist_dir="./data/chroma",
        force_rebuild=False,
        enable_reranking=True,
        reranker_model="ms-marco-MiniLM-L-12-v2",
        rerank_top_n=5,
        
    )
    return rag.run()

ras_tool = create_retriever_tool(
    _get_ras_retriever(),
    "ras_maroc",
    """Moroccan accounting standards: RAS rules, 
    provisions, regularization entries. Use for: HOW to account for something, WHY an entry is made, 
    Keywords: RAS, retenu a la source , bilan, CPC, ESG, ETIC, taux de retenu ala source , 
    régularisation, clôture, stock CMUP FIFO, immobilisation, cession."""
)
