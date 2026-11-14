import os
from pathlib import Path

from data_ingestion.documents_loader import DocumentLoader
from data_ingestion.embedding import Embeddings
from data_ingestion.reranking import Reranker
from data_ingestion.text_spliter import TextSpliter
from data_ingestion.vectorestore import VectorStore


class RagPipeLine:
    def __init__(
        self,
        data_dir,
        persist_dir,
        force_rebuild=False,
        enable_reranking=True,
        reranker_model="ms-marco-MiniLM-L-12-v2",
        rerank_top_n=5,
    ):
        self.data_dir = data_dir
        self.persist_dir = persist_dir
        self.force_rebuild = force_rebuild
        self.enable_reranking = enable_reranking
        self.reranker_model = reranker_model
        self.rerank_top_n = rerank_top_n
        self.vectorstore = None
        self.retriever = None
        self.reranker = None

        persist_path = Path(self.persist_dir)
        self.vectorstore_exists = persist_path.exists() and any(
            persist_path.glob("*.sqlite3")
        )

        print("\n" + "=" * 50)
        print(f"RAG pipeline data: {self.data_dir}")
        print(f"Vector store: {self.persist_dir}")
        print(f"Vector store exists: {self.vectorstore_exists}")
        print("=" * 50 + "\n")

    def _with_reranking(self, base_retriever):
        if not self.enable_reranking:
            self.retriever = base_retriever
            return self.retriever

        self.reranker = Reranker(
            model_name=self.reranker_model,
            top_n=self.rerank_top_n,
        )
        self.retriever = self.reranker.init_ranking(base_retriever)
        print(
            f"[Reranker] Enabled {self.reranker_model}; returning top "
            f"{self.rerank_top_n} documents"
        )
        return self.retriever

    def run(self):
        self.embeding_model = Embeddings()
        embedding = self.embeding_model.initializing_embedding()
        self.vectorstore = VectorStore(
            embeddings=embedding,
            persist_directory=self.persist_dir,
        )

        if self.vectorstore_exists and not self.force_rebuild:
            print("Loading existing vector store...")
            base_retriever = self.vectorstore.load_existing()
            print(f"Loaded existing vector store from {self.persist_dir}")
            return self._with_reranking(base_retriever)

        if os.getenv("RAG_NO_REBUILD") == "1":
            raise RuntimeError(
                f"No usable vector store found in {self.persist_dir}, or a rebuild was "
                "requested. Refusing to rebuild while RAG_NO_REBUILD=1."
            )

        try:
            print(f"Building RAG index from {self.data_dir}")
            documents = DocumentLoader(directory=self.data_dir).document_loader()
            if not documents:
                raise ValueError(f"No documents found in {self.data_dir}")

            chunks = TextSpliter(embedding).split_documents(documents)
            if not chunks:
                raise ValueError("No chunks were created from the source documents.")

            base_retriever = self.vectorstore.create_from_documents(chunks)
            print(f"Vector store created with {len(chunks)} chunks")
            return self._with_reranking(base_retriever)
        except Exception as exc:
            raise RuntimeError(f"RAG pipeline failed: {exc}") from exc
