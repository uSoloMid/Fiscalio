import json
try:
    with open('debug_response.json', 'r', encoding='utf-8') as f:
        data = f.read()
        print(f"Read {len(data)} characters.")
        # Try to find the last '}'
        last_brace = data.rfind('}')
        if last_brace != -1:
            clean_data = data[:last_brace+1]
            obj = json.loads(clean_data)
            print(json.dumps(obj, indent=2))
        else:
            print("No closing brace found.")
except Exception as e:
    print(f"Error: {e}")
