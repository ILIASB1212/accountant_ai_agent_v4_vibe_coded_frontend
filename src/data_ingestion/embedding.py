from dotenv import load_dotenv

load_dotenv()
from langchain_openai import OpenAIEmbeddings


class Embeddings:

    def __init__(self,model_name:str="text-embedding-3-large"):

        self.model_name = model_name
        self._embeddings = None


    def initializing_embedding(self):
        if self._embeddings is None:
            try:
                self._embeddings = OpenAIEmbeddings(model=self.model_name)
            except Exception as exc:
                raise RuntimeError(
                    f"Failed to initialize embedding model {self.model_name}: {exc}"
                ) from exc
        return self._embeddings
    
