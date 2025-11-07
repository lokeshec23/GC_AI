# utils/ocr.py
import os
import tempfile
import concurrent.futures
from PyPDF2 import PdfReader, PdfWriter
from azure.core.credentials import AzureKeyCredential
from azure.ai.formrecognizer import DocumentAnalysisClient
from config import AZURE_DI_ENDPOINT, AZURE_DI_KEY

class AzureOCR:
    """Azure Document Intelligence OCR Wrapper"""

    def __init__(self, endpoint=None, key=None):
        self.endpoint = endpoint or AZURE_DI_ENDPOINT
        self.key = key or AZURE_DI_KEY

        if not self.endpoint or not self.key:
            raise ValueError("❌ Missing Azure Document Intelligence credentials")

        self.client = DocumentAnalysisClient(
            endpoint=self.endpoint,
            credential=AzureKeyCredential(self.key),
        )

        print("✅ AzureOCR client initialized")

    def split_pdf(self, pdf_path, pages_per_chunk=30):
        """
        Split PDF into chunks for faster OCR processing.
        
        Args:
            pdf_path: Path to PDF file
            pages_per_chunk: Number of pages per OCR request (default: 30 for speed)
        """
        print(f"📄 Splitting PDF into chunks of {pages_per_chunk} pages each...")
        reader = PdfReader(pdf_path)
        total_pages = len(reader.pages)
        chunks = []

        for i in range(0, total_pages, pages_per_chunk):
            writer = PdfWriter()
            end_page = min(i + pages_per_chunk, total_pages)
            
            for j in range(i, end_page):
                writer.add_page(reader.pages[j])

            tmp_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
            with open(tmp_path, "wb") as f:
                writer.write(f)
            
            chunks.append(tmp_path)
            print(f"📄 Created chunk: Pages {i + 1}-{end_page}")

        print(f"✅ Total OCR chunks: {len(chunks)} (from {total_pages} pages)")
        return chunks

    def analyze_chunk(self, chunk_path, model="prebuilt-layout"):
        """Run Azure OCR on one chunk"""
        try:
            with open(chunk_path, "rb") as f:
                poller = self.client.begin_analyze_document(model, f)
                result = poller.result()

            all_text = []
            for page in result.pages:
                page_num = page.page_number
                page_text = "\n".join(
                    para.content
                    for para in result.paragraphs
                    if para.bounding_regions
                    and para.bounding_regions[0].page_number == page_num
                )
                all_text.append(page_text)

            print(f"✅ OCR completed for chunk ({len(all_text)} pages)")
            return "\n\n".join(all_text)

        except Exception as e:
            print(f"❌ OCR failed for chunk: {e}")
            return ""

    def analyze_doc(self, pdf_path, pages_per_chunk=30):
        """
        Parallel OCR with configurable page grouping.
        Default 30 pages for faster processing.
        """
        print("🚀 Starting OCR pipeline...")
        chunks = self.split_pdf(pdf_path, pages_per_chunk=pages_per_chunk)
        results = []

        # Process in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            future_to_chunk = {
                executor.submit(self.analyze_chunk, chunk): chunk for chunk in chunks
            }

            for future in concurrent.futures.as_completed(future_to_chunk):
                chunk_path = future_to_chunk[future]
                try:
                    text = future.result()
                    results.append(text)
                except Exception as e:
                    print(f"❌ Error processing chunk {chunk_path}: {e}")

        # Cleanup
        for c in chunks:
            if os.path.exists(c):
                os.remove(c)

        combined_text = "\n\n".join(results)
        print(f"✅ OCR completed! Total: {len(combined_text)} characters")
        return combined_text