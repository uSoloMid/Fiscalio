with open('debug_response.json', 'r', encoding='utf-8') as f:
    data = f.read()
    print(f"Total length: {len(data)}")
    print(data)
