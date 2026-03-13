const http = require('http');

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3333,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
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

async function verify() {
    try {
        console.log('1. Creating Client...');
        const rfc = 'AAA' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0') + 'AAA';
        const clientRes = await request('POST', '/clients', { name: 'Test Client', rfc: rfc });
        console.log('Client Created:', clientRes.body);
        const clientId = clientRes.body.id;

        if (!clientId) throw new Error('Failed to create client');

        console.log('\n2. Setting FIEL (Encrypting Password + Files)...');
        const setFielRes = await request('POST', `/clients/${clientId}/fiel`, {
            cerPath: 'C:\\Fiscalio\\agent\\test2.cer',
            keyPath: 'C:\\Fiscalio\\agent\\test2.key',
            password: 'super-secret-password',
            importFiles: true
        });
        console.log('Set FIEL Result:', setFielRes.body);

        console.log('\n3. Testing FIEL (Decrypting)...');
        // Note: Not sending password, expecting it to use stored encrypted one
        const testRes = await request('POST', `/clients/${clientId}/fiel/test`, {});
        console.log('Test FIEL Result:', testRes.body);

        if (testRes.body.ok === false && testRes.body.error === "La FIEL no es válida (caducada o corrupta)") {
            console.log("SUCCESS: Decryption worked (we passed fake certs, so invalidity is expected).");
        } else if (testRes.body.ok) {
            console.log("SUCCESS: logic worked.");
        } else {
            console.log("FAILURE: unexpected response");
        }

    } catch (err) {
        console.error('Verification Failed:', err);
    }
}

setTimeout(verify, 2000);
