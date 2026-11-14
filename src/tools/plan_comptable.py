from functools import lru_cache

from langchain_classic.tools.retriever import create_retriever_tool

from PipeLine.pipeline import RagPipeLine

@lru_cache(maxsize=1)
def _get_pcgm_retriever():
    rag = RagPipeLine(
        data_dir="./data/PLAN_COMPTABLE",
        persist_dir="artifacts/vectorestore/PLAN_COMPTABLE",
        force_rebuild=False,
        enable_reranking=True,
        reranker_model="ms-marco-MiniLM-L-12-v2",
        rerank_top_n=5,
    )
    return rag.run()

plan_comptable_tool = create_retriever_tool(
    _get_pcgm_retriever(),
    "plan_comptable_marocain",
    """Moroccan chart of accounts (PCGM): EXACT 4-digit account numbers and labels. 
    Use ONLY when you need the SPECIFIC account code to record a transaction.
    Classes 1-7: 1111 Capital, 2321 Matériel, 3421 Clients, 4411 Fournisseurs, 
    5141 Banque, 5161 Caisse, 3455 TVA récupérable, 4455 TVA facturée, 
    6111 Achats, 7111 Ventes, 6144 Publicité, 6171 Salaires.
    Keywords: numéro de compte, code comptable, compte 6, compte 7, débit, crédit, 
    écriture comptable, journal, comptabiliser."""
)
