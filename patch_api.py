import glob
import re
import os

files = glob.glob(r'c:\Fiscalio\ui\src\api\**\*.ts', recursive=True)
for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # If no fetch is used, skip
    if 'fetch' not in content:
        continue
    
    # Needs authFetch import
    if 'authFetch' not in content:
        # Find API_BASE_URL import and put authFetch after it
        content = re.sub(r"import \{ API_BASE_URL \} from '\./config';", "import { API_BASE_URL } from './config';\nimport { authFetch } from '../services';", content)
    
    # Replace fetch with authFetch
    content = re.sub(r'\bfetch\(', 'authFetch(', content)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated", path)
