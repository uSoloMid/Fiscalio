import json
import base64
import subprocess

with open('sync_clients.json', 'r') as f:
    clients = json.load(f)

for c in clients:
    if c['rfc'] == 'ROBL8205181B2':
        cert_b64 = c['certificate']
        with open('luis.cer', 'wb') as f2:
            f2.write(base64.b64decode(cert_b64))
        print(f"Extracted certificate for {c['rfc']}")
        
        # Try to parse with openssl if available
        try:
            res = subprocess.run(['openssl', 'x509', '-in', 'luis.cer', '-inform', 'der', '-noout', '-subject'], capture_output=True, text=True)
            print(res.stdout)
        except:
            print("OpenSSL not found or failed")
