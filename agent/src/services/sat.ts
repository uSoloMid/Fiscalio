import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { secretService } from './secret';
import {
    Service,
    Fiel,
    FielRequestBuilder,
    HttpsWebClient,
    QueryParameters,
    DateTimePeriod,
    RequestType,
    DownloadType,
    DateTime as SatDateTime,
    DocumentStatus,
    DocumentType,
    ComplementoUndefined,
    Uuid,
    RfcOnBehalf,
    RfcMatches,
    ServiceType
} from '@nodecfdi/sat-ws-descarga-masiva';
import { DateTime } from 'luxon';

// Re-export SatCredentials for sync.ts compatibility
export interface SatCredentials {
    cerPath: string;
    keyPath: string;
    password: string;
}

export class SatService {

    // Public helper to create FIEL instance (used by routes for testing)
    public createFiel(cerContent: string, keyContent: string, password: string): Fiel {
        return Fiel.create(cerContent, keyContent, password);
    }

    // Public helper to test FIEL from paths (used by routes)
    public testFiel(cerPath: string, keyPath: string, password: string): { valid: boolean, message?: string, rfc?: string } {
        try {
            if (!fs.existsSync(cerPath) || !fs.existsSync(keyPath)) {
                return { valid: false, message: 'Files not found' };
            }
            const cerContent = fs.readFileSync(cerPath, 'binary');
            const keyContent = fs.readFileSync(keyPath, 'binary');
            const fiel = Fiel.create(cerContent, keyContent, password);
            if (!fiel.isValid()) {
                return { valid: false, message: 'La FIEL no es válida (caducada o corrupta)' };
            }
            return { valid: true, rfc: fiel.getRfc() };
        } catch (e: any) {
            return { valid: false, message: e.message };
        }
    }

    // Internal helper to reconstruct FIEL for a client from DB/DPAPI
    private getFielForClient(clientId: number): Fiel {
        const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
        if (!client) throw new Error('Client not found');

        // 1. Get Password
        const pwdEntry: any = db.prepare("SELECT value FROM secrets WHERE client_id = ? AND kind = 'fiel_password'").get(clientId);
        if (!pwdEntry) throw new Error('FIEL password not found in secrets');
        const password = secretService.decryptToString(pwdEntry.value);

        let cerContent: string;
        let keyContent: string;

        // 2. Get Certificate & Key (From DB secrets OR File System)
        const cerEntry: any = db.prepare("SELECT value FROM secrets WHERE client_id = ? AND kind = 'fiel_cer'").get(clientId);
        const keyEntry: any = db.prepare("SELECT value FROM secrets WHERE client_id = ? AND kind = 'fiel_key'").get(clientId);

        if (cerEntry && keyEntry) {
            // Decrypt from DPAPI blobs
            cerContent = secretService.decryptBuffer(cerEntry.value).toString('binary');
            keyContent = secretService.decryptBuffer(keyEntry.value).toString('binary');
        } else {
            // Read from filesystem paths
            if (!client.fiel_cer_path || !fs.existsSync(client.fiel_cer_path)) throw new Error('Certificate file not found');
            if (!client.fiel_key_path || !fs.existsSync(client.fiel_key_path)) throw new Error('Key file not found');

            cerContent = fs.readFileSync(client.fiel_cer_path, 'binary');
            keyContent = fs.readFileSync(client.fiel_key_path, 'binary');
        }

        return Fiel.create(cerContent, keyContent, password);
    }

    private makeService(fiel: Fiel): Service {
        // Factory method similar to legacy makeService
        const webClient = new HttpsWebClient();
        const requestBuilder = new FielRequestBuilder(fiel);
        return new Service(requestBuilder, webClient);
    }

    private async withRetry<T>(operation: string, fn: () => Promise<T>, retries = 3): Promise<T> {
        let attempt = 0;
        const delays = [2000, 4000, 8000, 10000]; // Increasing delay
        while (true) {
            try {
                attempt++;
                return await fn();
            } catch (e: any) {
                if (attempt > retries) throw e;
                const delay = delays[attempt - 1] || 8000;
                console.warn(`[SAT] ${operation} failed (attempt ${attempt}/${retries + 1}): ${e.message}. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    async createDownloadRequest(clientId: number, params: { type: 'issued' | 'received', dateFrom: string, dateTo: string, requestType?: 'xml' | 'metadata' }): Promise<string> {
        const fiel = this.getFielForClient(clientId);
        const service = this.makeService(fiel);

        // 1. Date Logic & Anti-Future
        const zone = 'America/Mexico_City';

        // Start: 00:01:00
        const startDt = DateTime.fromISO(params.dateFrom, { zone }).set({ hour: 0, minute: 1, second: 0 });

        // End: 23:59:00 or 'now - 10 min' if end is in future
        let endDt = DateTime.fromISO(params.dateTo, { zone }).set({ hour: 23, minute: 59, second: 0 });

        const now = DateTime.now().setZone(zone);
        const safeEnd = now.minus({ minutes: 10 });

        if (endDt > safeEnd) {
            console.log(`[SAT] Anti-future: trimming end date from ${endDt.toISO()} to ${safeEnd.toISO()}`);
            endDt = safeEnd;
        }

        // Use createFromValues to avoid timestamp ambiguities
        const startStr = startDt.toFormat("yyyy-MM-dd'T'HH:mm:ss");
        const endStr = endDt.toFormat("yyyy-MM-dd'T'HH:mm:ss");
        const period = DateTimePeriod.createFromValues(startStr, endStr);

        // 2. Request Types
        const downloadType = params.type === 'issued' ? new DownloadType('issued') : new DownloadType('received');
        const rType = params.requestType === 'metadata' ? new RequestType('metadata') : new RequestType('xml');

        // 3. Force DocumentStatus.active for Received XML
        let statusKey: 'undefined' | 'active' | 'cancelled' = 'undefined';

        // Strict Legacy Rule: received + xml => FORCE active
        if (params.type === 'received' && (params.requestType === 'xml' || !params.requestType)) {
            statusKey = 'active';
        }

        const documentStatus = new DocumentStatus(statusKey);

        // 4. Payload Logging
        console.log('[SAT] Payload:', {
            rfc: fiel.getRfc(),
            type: params.type,
            requestType: params.requestType,
            status: statusKey,
            start: startDt.toISO(),
            end: endDt.toISO(),
            periodStart: startStr,
            periodEnd: endStr
        });

        // 5. QueryParameters via Fluent Interface
        const queryParams = QueryParameters.create(
            period,
            downloadType,
            rType,
            new ServiceType('cfdi')
        )
            .withDocumentType(new DocumentType('undefined'))
            .withComplement(new ComplementoUndefined('undefined'))
            .withDocumentStatus(documentStatus)
            .withUuid(Uuid.empty())
            .withRfcOnBehalf(RfcOnBehalf.empty())
            .withRfcMatches(RfcMatches.create());

        // 6. Call SAT with Retry
        const result = await this.withRetry('Query', async () => service.query(queryParams));

        const status = result.getStatus();
        if (!status.isAccepted()) {
            throw new Error(`SAT Request Rejected: ${status.getCode()} - ${status.getMessage()}`);
        }

        const requestId = result.getRequestId();
        if (!requestId) throw new Error('No Request ID returned by SAT');

        // Save to DB (Initialize state='created', sat_status='accepted', expires_at=now+24h)
        const expiresAt = new Date(Date.now() + 86400000).toISOString(); // 24 hours
        db.prepare(`
            INSERT INTO sat_requests (
                client_id, sat_request_id, type, date_from, date_to,
                status, sat_status, state, message, expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            clientId, requestId, params.type, params.dateFrom, params.dateTo,
            'accepted', 'accepted', 'created', status.getMessage(), expiresAt
        );

        return requestId;
    }

    async checkRequestStatus(clientId: number, satRequestId: string): Promise<any> {
        const fiel = this.getFielForClient(clientId);
        const service = this.makeService(fiel);

        const verifyResult = await this.withRetry('Verify', async () => service.verify(satRequestId));
        const status = verifyResult.getStatus();
        const code = status.getCode();
        const packages = verifyResult.getPackageIds();

        // Map SAT Code to Text Status (Informational)
        let satStatus = 'in_progress';
        if (code === 3) satStatus = 'finished';
        if (code === 5) satStatus = 'rejected';
        if (code === 4 || code === 6) satStatus = 'error';
        if (code === 1) satStatus = 'accepted';

        // Update DB: Only update informational fields (sat_status, package_count, last_check_at)
        // CRITICAL: DO NOT TOUCH 'state' here. Runner logic decides state transitions.
        db.prepare(`
            UPDATE sat_requests
            SET
                sat_status = ?,
                message = ?,
                updated_at = CURRENT_TIMESTAMP,
                last_check_at = CURRENT_TIMESTAMP,
                package_count = ?
            WHERE client_id = ? AND sat_request_id = ?
        `).run(satStatus, `[${code}] ${status.getMessage()}`, packages.length, clientId, satRequestId);

        return {
            satStatus: satStatus,
            code: code,
            message: status.getMessage(),
            packages: packages
        };
    }

    async downloadPackages(clientId: number, satRequestId: string, packageIds: string[]): Promise<string[]> {
        const fiel = this.getFielForClient(clientId);
        const service = this.makeService(fiel);

        const client = db.prepare('SELECT rfc FROM clients WHERE id = ?').get(clientId) as any;
        const baseDir = path.join(process.cwd(), 'data', client.rfc, 'sat', satRequestId);
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

        const downloadedPaths: string[] = [];

        for (const pkgId of packageIds) {
            const result = await this.withRetry(`Download ${pkgId}`, async () => service.download(pkgId));
            if (!result.getStatus().isAccepted()) {
                console.error(`Failed to download package ${pkgId}: ${result.getStatus().getMessage()}`);
                continue;
            }

            const filePath = path.join(baseDir, `${pkgId}.zip`);
            fs.writeFileSync(filePath, result.getPackageContent());

            // Save to DB
            db.prepare(`
                INSERT OR IGNORE INTO sat_packages (client_id, sat_request_id, package_id, file_path, downloaded_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(clientId, satRequestId, pkgId, filePath);

            downloadedPaths.push(filePath);
        }

        return downloadedPaths;
    }

    // Deprecated sync method signature
    async downloadPeriod(creds: SatCredentials, start: Date, end: Date, direction: 'issued' | 'received'): Promise<string[]> {
        throw new Error('This method is deprecated. Use createDownloadRequest/checkRequestStatus instead.');
    }
}

export const satService = new SatService();
