# backend/ingest/processor.py

import os
import json
import time
import tempfile
import asyncio
import traceback
from typing import List, Dict, Tuple
from utils.ocr import AzureOCR
from utils.llm_provider import LLMProvider
from utils.json_to_excel import dynamic_json_to_excel
from utils.progress import update_progress


async def process_guideline_background(
    session_id: str,
    pdf_path: str,
    filename: str,
    user_settings: dict,
    model_provider: str,
    model_name: str,
    custom_prompt: str,
):
    excel_path = None
    try:
        pages_per_chunk = user_settings.get("pages_per_chunk", 1)

        print(f"\n{'='*60}")
        print(f"Parallel ingestion started for session {session_id[:8]}")
        print(f"File: {filename}")
        print(f"Model: {model_provider}/{model_name}")
        print(f"Pages per chunk: {pages_per_chunk}")
        print(f"{'='*60}\n")

        # === STEP 1: OCR ===
        update_progress(session_id, 5, f"Extracting text ({pages_per_chunk} page(s) per chunk)...")
        ocr_client = AzureOCR()
        text_chunks = ocr_client.analyze_doc_page_by_page(pdf_path, pages_per_chunk=pages_per_chunk)
        num_chunks = len(text_chunks)
        if num_chunks == 0:
            raise ValueError("OCR process failed to extract text from document.")

        update_progress(session_id, 35, f"OCR complete. Created {num_chunks} text chunk(s).")

        # === STEP 2: Initialize LLM ===
        update_progress(session_id, 40, f"Initializing {model_provider} LLM...")
        llm = initialize_llm_provider(user_settings, model_provider, model_name)
        update_progress(session_id, 45, f"Running {num_chunks} chunks in full parallel with {model_name}...")

        # === STEP 3: Parallel LLM Calls ===
        results, failed = await run_parallel_llm_processing(
            llm, text_chunks, custom_prompt, session_id, num_chunks
        )

        # === STEP 4: Convert to Excel ===
        update_progress(session_id, 90, "Converting results to Excel...")
        excel_path = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", prefix=f"extraction_{session_id[:8]}_").name
        dynamic_json_to_excel(results, excel_path)

        update_progress(session_id, 100, "Processing complete.")
        print(f"{'='*60}\nPARALLEL PROCESSING COMPLETE\n{'='*60}")

        from utils.progress import progress_store, progress_lock
        with progress_lock:
            progress_store[session_id].update({
                "excel_path": excel_path,
                "preview_data": results,
                "filename": f"extraction_{os.path.basename(filename).split('.')[0]}.xlsx",
                "status": "completed",
                "total_chunks": num_chunks,
                "failed_chunks": failed,
            })

    except Exception as e:
        error_msg = str(e)
        print(f"\nCritical error: {error_msg}\n")
        traceback.print_exc()
        update_progress(session_id, -1, f"Error: {error_msg}")
        from utils.progress import progress_store, progress_lock
        with progress_lock:
            if session_id in progress_store:
                progress_store[session_id].update({"status": "failed", "error": error_msg})

    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
            print("Temporary PDF file cleaned up.")


async def run_parallel_llm_processing(
    llm: LLMProvider,
    text_chunks: List[str],
    custom_prompt: str,
    session_id: str,
    total_chunks: int,
) -> Tuple[List[Dict], int]:
    results = []
    failed_count = 0
    completed = 0
    lock = asyncio.Lock()

    async def handle_chunk(idx: int, chunk_text: str):
        nonlocal results, failed_count, completed
        prompt = f"{custom_prompt}\n\n### TEXT TO PROCESS\n{chunk_text}"
        try:
            response = await asyncio.to_thread(llm.generate, prompt)
            parsed = parse_and_clean_llm_response(response, idx + 1)
            if parsed:
                async with lock:
                    results.extend(parsed)
        except Exception as e:
            failed_count += 1
            print(f"Chunk {idx+1} failed: {e}")
        finally:
            completed += 1
            progress = 45 + int((completed / total_chunks) * 45)
            update_progress(session_id, progress, f"Processed {completed}/{total_chunks} chunk(s)")

    # launch all tasks at once (no concurrency cap)
    await asyncio.gather(*(handle_chunk(i, chunk) for i, chunk in enumerate(text_chunks)))
    return results, failed_count


def initialize_llm_provider(user_settings: dict, provider: str, model: str) -> LLMProvider:
    params = {
        "temperature": user_settings.get("temperature", 0.5),
        "max_tokens": user_settings.get("max_output_tokens", 8192),
        "top_p": user_settings.get("top_p", 1.0),
        "stop_sequences": user_settings.get("stop_sequences", []),
    }
    if provider == "openai":
        return LLMProvider(
            provider=provider,
            api_key=user_settings.get("openai_api_key"),
            model=model,
            azure_endpoint=user_settings.get("openai_endpoint"),
            azure_deployment=user_settings.get("openai_deployment"),
            **params,
        )
    if provider == "gemini":
        return LLMProvider(
            provider=provider,
            api_key=user_settings.get("gemini_api_key"),
            model=model,
            **params,
        )
    raise ValueError(f"Unsupported provider: {provider}")


def parse_and_clean_llm_response(response: str, chunk_num: int) -> List[Dict]:
    import re, json
    cleaned = response.strip()
    match = re.search(r"(\[.*\]|\{.*\})", cleaned, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list) and all(isinstance(i, dict) for i in data):
            return data
        return []
    except json.JSONDecodeError:
        print(f"JSON parse error in chunk {chunk_num}")
        return []
