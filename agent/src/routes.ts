import { FastifyInstance } from 'fastify';
import { db } from './db';
import { syncService } from './services/sync';
import { satService } from './services/sat';
import { secretService } from './services/secret';
import fs from 'fs';

export default async function routes(fastify: FastifyInstance) {

    // GET Clients
    fastify.get('/clients', async () => {
        const clients = db.prepare('SELECT * FROM clients').all();
        return clients.map((c: any) => ({
            ...c,
            has_fiel: !!(c.fiel_cer_path && c.fiel_key_path) // Checks if paths are set (files might be imported/hidden)
        }));
    });

    // POST Client
    fastify.post('/clients', async (req, reply) => {
        const { name, rfc } = req.body as any;
        if (!rfc) return reply.code(400).send({ error: 'RFC is required' });

        try {
            // Populate alias with name to satisfy legacy schema constraint if it exists
            const info = db.prepare('INSERT INTO clients (name, alias, rfc) VALUES (?, ?, ?)').run(name, name, rfc);
            return { id: info.lastInsertRowid, rfc, name };
        } catch (err: any) {
            // Fallback if alias column doesn't exist (new db)
            if (err.message.includes('no such column: alias')) {
                const info = db.prepare('INSERT INTO clients (name, rfc) VALUES (?, ?)').run(name, rfc);
                return { id: info.lastInsertRowid, rfc, name };
            }
            reply.code(400).send({ error: err.message });
        }
    });

    // POST Client FIEL Paths & Secrets
    fastify.post('/clients/:id/fiel', async (req, reply) => {
        const { id } = req.params as any;
        const { cerPath, keyPath, password, importFiles } = req.body as any;

        if (!cerPath || !keyPath || !password) {
            return reply.code(400).send({ error: 'cerPath, keyPath, and password are required' });
        }

        // Validate paths exist if we are not just updating password (though UI might send paths every time)
        // If importFiles is true, we MUST allow reading them now.
        if (!fs.existsSync(cerPath)) {
            return reply.code(400).send({ error: `File not found: ${cerPath}` });
        }
        if (!fs.existsSync(keyPath)) {
            return reply.code(400).send({ error: `File not found: ${keyPath}` });
        }

        try {
            // Transaction to update client and secrets
            const result = db.transaction(() => {
                // Update client paths
                const update = db.prepare('UPDATE clients SET fiel_cer_path = ?, fiel_key_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run(cerPath, keyPath, id);

                if (update.changes === 0) throw new Error('Client not found');

                // Encrypt and store password
                const encPassword = secretService.encryptString(password);
                db.prepare(`INSERT OR REPLACE INTO secrets (client_id, kind, value, updated_at) VALUES (?, 'fiel_password', ?, CURRENT_TIMESTAMP)`).run(id, encPassword);

                // If importFiles matches true, encrypt files too
                if (importFiles) {
                    const cerBuffer = fs.readFileSync(cerPath);
                    const keyBuffer = fs.readFileSync(keyPath);
                    const encCer = secretService.encryptBuffer(cerBuffer);
                    const encKey = secretService.encryptBuffer(keyBuffer);

                    db.prepare(`INSERT OR REPLACE INTO secrets (client_id, kind, value, updated_at) VALUES (?, 'fiel_cer', ?, CURRENT_TIMESTAMP)`).run(id, encCer);
                    db.prepare(`INSERT OR REPLACE INTO secrets (client_id, kind, value, updated_at) VALUES (?, 'fiel_key', ?, CURRENT_TIMESTAMP)`).run(id, encKey);
                }
            })();

            return { ok: true };
        } catch (err: any) {
            if (err.message === 'Client not found') return reply.code(404).send({ error: 'Client not found' });
            reply.code(500).send({ error: err.message });
        }
    });

    // POST Client FIEL Test
    fastify.post('/clients/:id/fiel/test', async (req, reply) => {
        const { id } = req.params as any;
        // Password optional in body if stored
        let { password } = req.body as any || {};

        try {
            // Get client
            const client: any = db.prepare('SELECT fiel_cer_path, fiel_key_path FROM clients WHERE id = ?').get(id);
            if (!client) return reply.code(404).send({ error: 'Client not found' });

            // Decrypt password if not provided
            if (!password) {
                const secret: any = db.prepare("SELECT value FROM secrets WHERE client_id = ? AND kind = 'fiel_password'").get(id);
                if (!secret) return reply.code(400).send({ error: 'Password not provided and not found in storage' });
                password = secretService.decryptToString(secret.value);
            }

            // Check if we have imported files
            const secretCer: any = db.prepare("SELECT value FROM secrets WHERE client_id = ? AND kind = 'fiel_cer'").get(id);
            const secretKey: any = db.prepare("SELECT value FROM secrets WHERE client_id = ? AND kind = 'fiel_key'").get(id);

            let result;

            if (secretCer && secretKey) {
                // Use imported encrypted files
                const cerBuffer = secretService.decryptBuffer(secretCer.value);
                const keyBuffer = secretService.decryptBuffer(secretKey.value);

                // satService.createFiel expects string contents (base64)
                // decryptBuffer returns Buffer.
                const cerContent = cerBuffer.toString('base64');
                const keyContent = keyBuffer.toString('base64');

                // We need a method in satService to accept contents directly? 
                // Currently creates from files or takes contents + password.
                // satService.createFiel -> public.
                try {
                    const fiel = satService.createFiel(cerContent, keyContent, password);
                    if (!fiel.isValid()) {
                        result = { valid: false, message: 'La FIEL no es válida (caducada o corrupta)' };
                    } else {
                        result = { valid: true, rfc: fiel.getRfc() };
                    }
                } catch (e: any) {
                    result = { valid: false, message: e.message };
                }

            } else {
                // Validate paths exist from DB request
                if (!client.fiel_cer_path || !client.fiel_key_path) {
                    return reply.code(400).send({ error: 'Client has no FIEL paths configured and no imported files found' });
                }

                result = satService.testFiel(client.fiel_cer_path, client.fiel_key_path, password);
            }

            if (!result.valid) {
                return reply.code(400).send({ ok: false, error: result.message });
            }

            return { ok: true, rfc: result.rfc };

        } catch (err: any) {
            reply.code(500).send({ error: err.message });
        }
    });

    // GET Client Detail
    fastify.get('/clients/:id', async (req, reply) => {
        const { id } = req.params as any;
        const client: any = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
        if (!client) return reply.code(404).send({ error: 'Not found' });

        // Check if we have password stored
        const has_password = !!db.prepare("SELECT 1 FROM secrets WHERE client_id = ? AND kind = 'fiel_password'").get(id);

        // For detail view, we can show if we have imported files too
        const has_imported_files = !!db.prepare("SELECT 1 FROM secrets WHERE client_id = ? AND kind IN ('fiel_cer', 'fiel_key')").get(id);

        return { ...client, has_password, has_imported_files };
    });

    // POST Trigger SAT Request (Manual)
    fastify.post('/clients/:id/sat/request', async (req, reply) => {
        const { id } = req.params as any;
        const { type, dateFrom, dateTo, requestType } = req.body as any;

        if (!type || !dateFrom || !dateTo) {
            return reply.code(400).send({ error: 'type (issued|received), dateFrom, dateTo are required' });
        }

        try {
            const requestId = await satService.createDownloadRequest(id, { type, dateFrom, dateTo, requestType });
            return { ok: true, satRequestId: requestId };
        } catch (err: any) {
            reply.code(500).send({ error: err.message });
        }
    });

    // GET List Requests
    fastify.get('/clients/:id/sat/requests', async (req) => {
        const { id } = req.params as any;
        return db.prepare('SELECT * FROM sat_requests WHERE client_id = ? ORDER BY created_at DESC').all(id);
    });

    // GET Check Request Status
    fastify.get('/sat/requests/:satRequestId', async (req, reply) => {
        const { satRequestId } = req.params as any;

        const request: any = db.prepare('SELECT * FROM sat_requests WHERE sat_request_id = ?').get(satRequestId);
        if (!request) return reply.code(404).send({ error: 'Request not found' });

        try {
            // If not finished, check status with SAT
            if (request.status !== 'finished' && request.status !== 'rejected' && request.status !== 'error') {
                await satService.checkRequestStatus(request.client_id, satRequestId);
            }

            // Re-fetch to get updated status
            const updated = db.prepare('SELECT * FROM sat_requests WHERE sat_request_id = ?').get(satRequestId) as any;

            // If finished, check packages
            const packages = db.prepare('SELECT * FROM sat_packages WHERE sat_request_id = ?').all(satRequestId);

            return { ...updated, packages };
        } catch (err: any) {
            return reply.code(500).send({ error: err.message });
        }
    });

    // POST Trigger Package Download (Manual)
    fastify.post('/sat/requests/:satRequestId/download', async (req, reply) => {
        const { satRequestId } = req.params as any;
        const request: any = db.prepare('SELECT * FROM sat_requests WHERE sat_request_id = ?').get(satRequestId);
        if (!request) return reply.code(404).send({ error: 'Request not found' });

        try {
            // First ensure status is up to date
            const status = await satService.checkRequestStatus(request.client_id, satRequestId);

            if (status.status !== 'finished') {
                return reply.code(400).send({ error: 'Request not finished yet', status: status.status });
            }

            const paths = await satService.downloadPackages(request.client_id, satRequestId, status.packages);
            return { ok: true, downloaded: paths.length, paths };
        } catch (err: any) {
            reply.code(500).send({ error: err.message });
        }
    });

    // TRIGGER Sync
    fastify.post('/clients/:id/sync/run', async (req, reply) => {
        const { id } = req.params as any;
        const { direction, from, to } = req.body as any;

        // Run async (don't await)
        syncService.runSync(id, { direction, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });

        return { status: 'started' };
    });

    // GET Invoices
    fastify.get('/clients/:id/invoices', async (req) => {
        const { id } = req.params as any;
        return db.prepare('SELECT * FROM invoices WHERE client_id = ? ORDER BY issue_date DESC LIMIT 100').all(id);
    });
}
