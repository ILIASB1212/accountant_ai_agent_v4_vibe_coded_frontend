from langchain_classic.retrievers import ContextualCompressionRetriever
from langchain_community.document_compressors.flashrank_rerank import FlashrankRerank


class Reranker:
    """Wrap a retriever with a FlashRank document reranker."""

    def __init__(self, model_name: str = "ms-marco-MiniLM-L-12-v2", top_n: int = 5):
        if top_n < 1:
            raise ValueError("top_n must be at least 1.")
        self.model_name = model_name
        self.top_n = top_n
        self.compressor = None
        self.compression_retriever = None

    def init_ranking(self, base_retriever):
        if base_retriever is None:
            raise ValueError("A base retriever is required for reranking.")
        if self.compressor is None:
            self.compressor = FlashrankRerank(
                model=self.model_name,
                top_n=self.top_n,
            )
        self.compression_retriever = ContextualCompressionRetriever(
            base_compressor=self.compressor,
            base_retriever=base_retriever,
        )
        return self.compression_retriever

    def rerank(self, query: str):
        if self.compression_retriever is None:
            raise RuntimeError("Call init_ranking() before rerank().")
        return self.compression_retriever.invoke(query)
