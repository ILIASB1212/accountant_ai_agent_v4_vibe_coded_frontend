from langchain_community.document_loaders import PyPDFDirectoryLoader
import sys



class DocumentLoader:
    def __init__(self,directory:str,):
        self.directory=directory

    def document_loader(self):
        rew_documents=PyPDFDirectoryLoader(self.directory)
        self.docs=rew_documents.load()
        if self.docs:
            try:
                # extract metada and LOG TROUGHT EASH DOCUMENT LOADED AND EXTRACT THE SOURCE:PDF NAME 
                pdf_files = set()
                for doc in self.docs:
                    source = doc.metadata.get('source', 'unknown')
                    pdf_files.add(source)
                # Log each PDF file
                print(f"✅ Successfully loaded {len(self.docs)} from directory {self.directory} documents lent is  {len(pdf_files)} PDF files:")
                for pdf in pdf_files:
                    print(f" 📄 {pdf}")
                
                
            except Exception as exc:
                    raise RuntimeError(f"Failed to load documents: {exc}") from exc
        elif not self.docs:
            print(f"⚠️ No documents found in {self.directory}")
         
        return self.docs