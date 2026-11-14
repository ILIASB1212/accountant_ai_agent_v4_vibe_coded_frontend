from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_experimental.text_splitter import SemanticChunker   # ← FIXED

import sys




class TextSpliter:
    def __init__(self,embeding_model,persist_directory:str="vectorestore_VDB"):
        self.embeding=embeding_model
        self.persist_directory=persist_directory
        


    
    def split_documents(self,documents):
        # Split
        try:
            text_splitter = SemanticChunker(
                            embeddings=self.embeding,
                            breakpoint_threshold_type="percentile"
                        )

           
            chunks = text_splitter.split_documents(documents)
            return chunks
        except Exception as exc:
            raise RuntimeError(f"Failed to chunk documents: {exc}") from exc




