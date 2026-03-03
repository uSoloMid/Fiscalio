path = r'c:\Fiscalio\sat-api\app\Http\Controllers\ProvisionalControlController.php'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    # Detect the bad block
    if 'return response()->json([' in line and 'ingresos' in lines[i+1]:
        # Peek ahead to see if there's calculateAlerts before the next return
        is_bad = False
        for j in range(i+1, min(i+100, len(lines))):
            if 'calculateAlerts' in lines[j]:
                is_bad = True
                break
            if 'return response()->json([' in lines[j]:
                break
        if is_bad:
            print(f"Skipping lines from {i+1}...")
            skip = True
            continue
    
    if skip and 'calculateAlerts' in line:
        skip = False
        # Don't skip the calculateAlerts line itself
    
    if not skip:
        new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print("File cleaned.")
