const http = require('http');

// Config from Env (set these when running)
const RFC = process.env.FISCALIO_TEST_RFC;
const REQUEST_TYPE = process.env.FISCALIO_TEST_REQ_TYPE || 'xml';
const TYPE = process.env.FISCALIO_TEST_TYPE || 'received';

// Adjusted default range to 2 days as requested
const defaultTo = new Date();
const defaultFrom = new Date();
defaultFrom.setDate(defaultFrom.getDate() - 2);

const DATE_FROM = process.env.FISCALIO_TEST_DATE_FROM || defaultFrom.toISOString().split('T')[0];
const DATE_TO = process.env.FISCALIO_TEST_DATE_TO || defaultTo.toISOString().split('T')[0];

if (!RFC) {
    console.error('Please set FISCALIO_TEST_RFC env var');
    process.exit(1);
}

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: 3333,
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
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    try {
        console.log(`[VERIFY] Finding client for RFC: ${RFC}`);
        const clientsRes = await request('GET', '/clients');
        const client = clientsRes.body.find(c => c.rfc === RFC);

        if (!client) {
            console.error('[ERROR] Client not found. Run migration or create client first.');
            process.exit(1);
        }

        console.log(`[VERIFY] Creating Download Request...`);
        const createRes = await request('POST', `/clients/${client.id}/sat/request`, {
            type: TYPE,
            dateFrom: DATE_FROM,
            dateTo: DATE_TO,
            requestType: REQUEST_TYPE
        });

        if (!createRes.body.ok) {
            console.error('[ERROR] Request creation failed');
            process.exit(1);
        }

        const requestId = createRes.body.satRequestId;
        console.log(`[VERIFY] Request ID: ${requestId}`);

        // Poll status
        let finished = false;
        let attempts = 0;

        while (!finished && attempts < 40) {
            attempts++;
            const statusRes = await request('GET', `/sat/requests/${requestId}`);
            const status = statusRes.body;

            // Note: DB now returns 'state' in status.state and 'sat_status' in status.sat_status
            // We check for internal STATE completion
            console.log(`[VERIFY] Attempt ${attempts}: State=${status.state} (SAT=${status.sat_status}) Pkgs=${status.package_count || 0}`);

            if (status.state === 'completed') {
                console.log('[SUCCESS] Request completed internally!');
                if (status.package_count > 0) {
                    console.log(`[SUCCESS] Verified ${status.package_count} packages downloaded.`);
                } else {
                    console.log('[WARN] Completed but 0 packages?');
                }
                finished = true;
            } else if (status.state === 'expired' || status.state === 'failed') {
                console.error(`[ERROR] Request ended with state: ${status.state}`);
                process.exit(1);
            }

            if (!finished) await sleep(10000);
        }

        if (!finished) {
            console.log('[WARN] Timed out waiting for completion.');
        }

    } catch (err) {
        console.error('[FATAL]', err);
    }
}

run();
