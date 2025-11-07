# utils/excel_reader.py
import pandas as pd
from typing import List, Dict
import os

def read_excel_to_json(file_path: str, file_label: str = "File") -> List[Dict]:
    """
    Read Excel file and convert to JSON array format.
    
    Args:
        file_path: Path to Excel file
        file_label: Label for this file (e.g., "Guideline 1", "Guideline 2")
    
    Returns:
        List of dictionaries representing rows
    """
    try:
        print(f"📖 Reading Excel file: {file_path}")
        
        # Read Excel file (first sheet)
        df = pd.read_excel(file_path, engine='openpyxl')
        
        print(f"   Columns found: {list(df.columns)}")
        print(f"   Total rows: {len(df)}")
        
        # Convert to list of dictionaries
        data = df.to_dict('records')
        
        # Clean up - remove NaN values
        cleaned_data = []
        for idx, row in enumerate(data):
            cleaned_row = {
                "file_source": file_label,
                "row_number": idx + 1,
            }
            
            # Add all columns, replacing NaN with empty string
            for key, value in row.items():
                if pd.isna(value):
                    cleaned_row[key] = ""
                else:
                    cleaned_row[key] = str(value).strip()
            
            cleaned_data.append(cleaned_row)
        
        print(f"   ✅ Successfully read {len(cleaned_data)} rows from {file_label}")
        return cleaned_data
        
    except Exception as e:
        print(f"   ❌ Error reading Excel file: {str(e)}")
        raise Exception(f"Failed to read Excel file {file_label}: {str(e)}")


def excel_to_text_summary(data: List[Dict], label: str = "File") -> str:
    """
    Convert Excel data to readable text summary for LLM.
    
    Args:
        data: List of row dictionaries
        label: Label for this dataset
    
    Returns:
        Formatted text summary
    """
    if not data:
        return f"{label}: No data"
    
    # Get column names (excluding file_source and row_number)
    columns = [k for k in data[0].keys() if k not in ['file_source', 'row_number']]
    
    summary = f"\n{'='*60}\n{label}\n{'='*60}\n"
    summary += f"Total Rows: {len(data)}\n"
    summary += f"Columns: {', '.join(columns)}\n\n"
    
    # Add sample rows
    for idx, row in enumerate(data[:5]):  # First 5 rows as sample
        summary += f"Row {idx + 1}:\n"
        for col in columns:
            value = row.get(col, "")
            if value:
                summary += f"  - {col}: {value}\n"
        summary += "\n"
    
    if len(data) > 5:
        summary += f"... and {len(data) - 5} more rows\n"
    
    return summary