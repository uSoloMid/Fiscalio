import os

file_path = "sat-api/app/Http/Controllers/ProvisionalControlController.php"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_ours = False
in_theirs = False

for line in lines:
    if line.startswith("<<<<<<< ours"):
        in_ours = True
        continue
    elif line.startswith("======="):
        in_ours = False
        in_theirs = True
        continue
    elif line.startswith(">>>>>>> theirs"):
        in_theirs = False
        continue

    # Logic: keep theirs, discard ours
    if in_ours:
        pass
    elif in_theirs:
        new_lines.append(line)
    else:
        new_lines.append(line)

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)
print("done")
