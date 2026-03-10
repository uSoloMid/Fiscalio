import sys
import re

path = r'c:\Fiscalio\sat-api\app\Http\Controllers\ProvisionalControlController.php'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# I will use git checkout to restore first since it got mangled.
