import pickle
from pathlib import Path

import chromadb
from langchain_chroma import Chroma
from langchain_classic.retrievers.ensemble import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever


class VectorStore:
    """Persistent Chroma + BM25 hybrid vector store."""

    def __init__(self, embeddings, persist_directory, collection_name: str = "langchain"):
        self.embeddings = embeddings
        self.persist_directory = str(persist_directory)
        self.collection_name = collection_name
        self.vectorstore = None
        self.hybrid_retriever = None
        Path(self.persist_directory).mkdir(parents=True, exist_ok=True)
        print(f"[VectorStore] Using persistence directory: {self.persist_directory}")

    @property
    def _bm25_path(self) -> Path:
        return Path(self.persist_directory) / "bm25_index.pkl"

    def _delete_existing_collection(self) -> None:
        """Remove the dense collection before a full rebuild to prevent duplicates."""
        client = chromadb.PersistentClient(path=self.persist_directory)
        collection_names = {collection.name for collection in client.list_collections()}
        if self.collection_name in collection_names:
            client.delete_collection(self.collection_name)

    def create_from_documents(self, documents):
        if not documents:
            raise ValueError("At least one document is required to build the vector store.")

        try:
            sparse_retriever = BM25Retriever.from_documents(documents)
            sparse_retriever.k = 7

            self._delete_existing_collection()
            self.vectorstore = Chroma.from_documents(
                documents=documents,
                embedding=self.embeddings,
                collection_name=self.collection_name,
                persist_directory=self.persist_directory,
            )
            dense_retriever = self.vectorstore.as_retriever(search_kwargs={"k": 10})

            temporary_path = self._bm25_path.with_suffix(".tmp")
            with temporary_path.open("wb") as file:
                pickle.dump(sparse_retriever, file)
            temporary_path.replace(self._bm25_path)

            self.hybrid_retriever = EnsembleRetriever(
                retrievers=[dense_retriever, sparse_retriever],
                weights=[0.6, 0.4],
            )
            print(f"[VectorStore] Indexed {len(documents)} documents in Chroma and BM25")
            return self.hybrid_retriever
        except Exception as e:
            raise RuntimeError(f"Failed to create vector store: {e}") from e

    def load_existing(self, k: int = 10):
        try:
            client = chromadb.PersistentClient(path=self.persist_directory)
            collection_names = {collection.name for collection in client.list_collections()}
            if self.collection_name not in collection_names:
                raise FileNotFoundError(
                    f"Chroma collection '{self.collection_name}' was not found in "
                    f"{self.persist_directory}."
                )

            self.vectorstore = Chroma(
                collection_name=self.collection_name,
                embedding_function=self.embeddings,
                persist_directory=self.persist_directory,
            )
            if self.vectorstore._collection.count() == 0:
                raise ValueError(f"Chroma collection '{self.collection_name}' is empty.")

            dense_retriever = self.vectorstore.as_retriever(search_kwargs={"k": k})
            self.hybrid_retriever = None

            if self._bm25_path.exists():
                with self._bm25_path.open("rb") as file:
                    sparse_retriever = pickle.load(file)
                sparse_retriever.k = 7
                self.hybrid_retriever = EnsembleRetriever(
                    retrievers=[dense_retriever, sparse_retriever],
                    weights=[0.6, 0.4],
                )
                print("[VectorStore] Loaded hybrid Chroma + BM25 retriever")
            else:
                print("[VectorStore] BM25 index missing; using dense retrieval")

            return self.get_retriever(k=k)
        except Exception as exc:
            raise RuntimeError(f"Failed to load vector store: {exc}") from exc

    def get_retriever(self, k: int = 10):
        if self.vectorstore is None:
            raise RuntimeError("Vector store has not been created or loaded.")

        if self.hybrid_retriever is not None:
            return self.hybrid_retriever

        return self.vectorstore.as_retriever(
            search_type="mmr",
            search_kwargs={"k": k, "fetch_k": max(20, k), "lambda_mult": 0.5},
        )
