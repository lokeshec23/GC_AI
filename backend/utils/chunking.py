# utils/chunking.py
import tiktoken
from typing import List

def split_text_into_chunks(
    text: str, 
    max_tokens: int = 3000,  # ✅ Reduced from 7000
    overlap_tokens: int = 200,
    model: str = "gpt-4o"
) -> List[str]:
    """
    Split extracted text into chunks based on token count.
    
    Args:
        text: Full text to split
        max_tokens: Maximum tokens per chunk (reduced for better results)
        overlap_tokens: Overlap between chunks for context
        model: Model name for tokenizer
    
    Returns:
        List of text chunks
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        # Fallback to cl100k_base for unknown models
        encoding = tiktoken.get_encoding("cl100k_base")
    
    tokens = encoding.encode(text)
    chunks = []
    
    print(f"📊 Total tokens in document: {len(tokens)}")
    print(f"📊 Chunk size: {max_tokens} tokens")
    
    start = 0
    while start < len(tokens):
        end = start + max_tokens
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text)
        
        # Move start forward, accounting for overlap
        start = end - overlap_tokens
        
        if start >= len(tokens) or end >= len(tokens):
            break
    
    print(f"✅ Text split into {len(chunks)} chunks")
    return chunks