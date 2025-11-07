# utils/smart_chunking.py
import tiktoken
from typing import List
from config import get_model_config

def get_token_count(text: str, model: str = "gpt-4o") -> int:
    """
    Get accurate token count for text.
    
    Args:
        text: Text to count tokens for
        model: Model name for appropriate tokenizer
    
    Returns:
        Token count
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        # Fallback for unknown models
        encoding = tiktoken.get_encoding("cl100k_base")
    
    return len(encoding.encode(text))


def calculate_optimal_chunk_size(model_name: str, prompt_template: str) -> int:
    """
    Calculate optimal chunk size based on model limits and prompt overhead.
    
    Args:
        model_name: Name of the LLM model
        prompt_template: The prompt template to account for overhead
    
    Returns:
        Recommended chunk size in tokens
    """
    model_config = get_model_config(model_name)
    
    # Get prompt overhead (without the actual text)
    prompt_overhead = get_token_count(prompt_template, model_name)
    
    # Account for thinking tokens in Gemini
    thinking_overhead = model_config.get("thinking_tokens_overhead", 0)
    
    # Calculate available tokens for content
    max_output = model_config["max_output"]
    max_input = model_config["max_input"]
    
    # Reserve space: prompt + content + buffer + thinking + output
    buffer = 500  # Safety buffer
    available_for_content = max_input - prompt_overhead - thinking_overhead - max_output - buffer
    
    # Use recommended chunk size or calculated limit, whichever is smaller
    recommended = model_config.get("recommended_chunk", 2000)
    optimal = min(recommended, available_for_content)
    
    print(f"📊 Token budget for {model_name}:")
    print(f"   - Max input tokens: {max_input}")
    print(f"   - Max output tokens: {max_output}")
    print(f"   - Prompt overhead: {prompt_overhead}")
    print(f"   - Thinking tokens (Gemini): {thinking_overhead}")
    print(f"   - Safety buffer: {buffer}")
    print(f"   - Available for content: {available_for_content}")
    print(f"   - Optimal chunk size: {optimal}")
    
    return max(500, optimal)  # Minimum 500 tokens


def split_text_smart(
    text: str,
    model_name: str,
    prompt_template: str = "",
    max_chunk_tokens: int = None,
    overlap_tokens: int = 200
) -> List[str]:
    """
    Smart text splitting based on model capabilities and token limits.
    
    Args:
        text: Full text to split
        model_name: LLM model name
        prompt_template: Prompt template for overhead calculation
        max_chunk_tokens: Override automatic calculation
        overlap_tokens: Overlap between chunks
    
    Returns:
        List of text chunks optimized for the model
    """
    # Calculate optimal chunk size if not provided
    if max_chunk_tokens is None:
        max_chunk_tokens = calculate_optimal_chunk_size(model_name, prompt_template or "")
    
    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base")
    
    # Tokenize full text
    tokens = encoding.encode(text)
    total_tokens = len(tokens)
    
    print(f"\n📊 Chunking text:")
    print(f"   - Total tokens: {total_tokens:,}")
    print(f"   - Chunk size: {max_chunk_tokens:,} tokens")
    print(f"   - Overlap: {overlap_tokens} tokens")
    
    chunks = []
    start = 0
    
    while start < total_tokens:
        end = start + max_chunk_tokens
        chunk_tokens = tokens[start:end]
        chunk_text = encoding.decode(chunk_tokens)
        chunks.append(chunk_text)
        
        # Move start forward with overlap
        start = end - overlap_tokens
        
        if start >= total_tokens or end >= total_tokens:
            break
    
    print(f"   - Generated {len(chunks)} chunks")
    print(f"   - Avg chunk size: {total_tokens // len(chunks) if chunks else 0:,} tokens\n")
    
    return chunks


def validate_chunk_fits(chunk: str, prompt: str, model_name: str) -> bool:
    """
    Validate that a chunk + prompt will fit within model limits.
    
    Args:
        chunk: Text chunk
        prompt: Full prompt including the chunk
        model_name: Model name
    
    Returns:
        True if it fits, False otherwise
    """
    model_config = get_model_config(model_name)
    
    total_tokens = get_token_count(prompt, model_name)
    max_input = model_config["max_input"]
    thinking_overhead = model_config.get("thinking_tokens_overhead", 0)
    max_output = model_config["max_output"]
    
    # Total budget needed
    required = total_tokens + thinking_overhead + max_output
    
    if required > max_input:
        print(f"⚠️ WARNING: Chunk too large!")
        print(f"   Required: {required:,} tokens")
        print(f"   Available: {max_input:,} tokens")
        print(f"   Overage: {required - max_input:,} tokens")
        return False
    
    return True