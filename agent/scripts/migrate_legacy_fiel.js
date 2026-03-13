const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_DIR = 'C:\\Fiscalio\\legacy\\data\\clients';
const API_HOST = '127.0.0.1';
const API_PORT = 3333;

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: API_HOST,
            port: API_PORT,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function migrate() {
    if (!fs.existsSync(BASE_DIR)) {
        console.error(`Base directory not found: ${BASE_DIR}`);
        return;
    }

    const entries = fs.readdirSync(BASE_DIR, { withFileTypes: true });
    const rfcFolders = entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

    console.log(`Found ${rfcFolders.length} folders in ${BASE_DIR}`);

    for (const rfc of rfcFolders) {
        process.stdout.write(`Processing ${rfc}... `);

        const folderPath = path.join(BASE_DIR, rfc);
        const cerPath = path.join(folderPath, 'certificado.cer');
        const keyPath = path.join(folderPath, 'llave.key');
        const passPath = path.join(folderPath, 'password.txt');

        if (!fs.existsSync(cerPath) || !fs.existsSync(keyPath) || !fs.existsSync(passPath)) {
            console.log('SKIPPED (Missing files)');
            continue;
        }

        try {
            const password = fs.readFileSync(passPath, 'utf8').trim();
            if (!password) {
                console.log('SKIPPED (Empty password)');
                continue;
            }

            // 1. Create/Get Client
            let clientRes = await request('POST', '/clients', { rfc: rfc, name: rfc, alias: rfc });

            // Handle 400 if client already exists (unique constraint) - API currently doesn't standardly return existing, so we might need to GET or just handle 200/400.
            // Our API: returns 400 on error.
            let clientId;
            if (clientRes.status === 200) {
                clientId = clientRes.body.id;
            } else {
                // Try to get via GET by list or similar? API doesn't have GET /clients?rfc=...
                // We can assume it exists if 400 rfc unique.
                // Let's iterate GET /clients to find it.
                const listRes = await request('GET', '/clients');
                const existing = listRes.body.find(c => c.rfc === rfc);
                if (existing) {
                    clientId = existing.id;
                    // Check if FIEL already set (optional optimization, but user said "Reuse it")
                    // User said: "If already exists, reuse it." and "skipped (already has FIEL)"
                    if (existing.has_fiel) {
                        console.log('SKIPPED (Already has FIEL)');
                        continue;
                    }
                } else {
                    console.log(`ERROR (Create failed: ${JSON.stringify(clientRes.body)})`);
                    continue;
                }
            }

            if (!clientId) {
                console.log('ERROR (Could not resolve Client ID)');
                continue;
            }

            // 2. Import FIEL
            const importRes = await request('POST', `/clients/${clientId}/fiel`, {
                cerPath,
                keyPath,
                password,
                importFiles: true
            });

            if (importRes.status === 200 && importRes.body.ok) {
                console.log('IMPORTED');
            } else {
                console.log(`ERROR (Import failed: ${JSON.stringify(importRes.body)})`);
            }

        } catch (err) {
            console.log(`ERROR (${err.message})`);
        }
    }
}

migrate();
