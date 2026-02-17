from datetime import datetime
from cryptography import x509
from cryptography.hazmat.backends import default_backend

with open('luis_server.cer', 'rb') as f:
    cert_data = f.read()
    cert = x509.load_der_x509_certificate(cert_data, default_backend())

print(f"Subject: {cert.subject}")
print(f"Serial: {cert.serial_number}")
print(f"Not Before: {cert.not_valid_before_utc}")
print(f"Not After: {cert.not_valid_after_utc}")

now = datetime.now()
if cert.not_valid_before_utc <= now.astimezone() <= cert.not_valid_after_utc:
    print("Certificate is VALID")
else:
    print("Certificate is EXPIRED or NOT YET VALID")
