import paramiko
import time

def run_remote(cmd):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('100.123.107.90', username='fiscalio', password='Solomid8')
    stdin, stdout, stderr = ssh.exec_command(cmd)
    output = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    ssh.close()
    return output, err

def main():
    print("Starting Host Queue Runner...")
    while True:
        # 1. Prepare
        out, err = run_remote('docker exec sat-api-app php artisan scraper:manual-run --step=prepare')
        if "READY|" in out:
            parts = out.split("\n")[-1].split("|")
            rfc, pwd, type_, start, end = parts[1], parts[2], parts[3], parts[4], parts[5]
            print(f"[*] Scraping {rfc} ({type_}) {start} to {end}...")
            
            # 2. Scrape
            y, m, d = start.split('-')
            # If day is 01 and end is 28/30/31, we assume full month
            # For simplicity, we pass 00 to mean month-wide if needed, or just the day.
            # Our scraper now handles '00' as full month for emitidas.
            d_val = d if start != end else d

            scrape_cmd = f"docker exec fiscalio-agent node scraper_xml.js {rfc} {type_} {y} {m} {d_val} \"{pwd}\""
            s_out, s_err = run_remote(scrape_cmd)
            print(f"    Scraper output: {s_out[:100]}...")
            if s_err: print(f"    Scraper ERR: {s_err[:100]}...")
            
            # 3. Import
            i_out, i_err = run_remote('docker exec sat-api-app php artisan scraper:manual-run --step=import')
            print(f"    Import result: {i_out}")
            
        else:
            if "No pending" in out or not out:
                # print("No pending requests. Sleeping 10s...")
                pass
            else:
                print(f"Unexpected output: {out}")
        
        time.sleep(5)

if __name__ == "__main__":
    main()
