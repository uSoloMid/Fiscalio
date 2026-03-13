import { db } from '../db';
import { satService, SatCredentials } from './sat';
import { vault } from './vault';
import { DateTime } from 'luxon';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';

export class SyncService {

    private parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
    });

    async runSync(clientId: number, options: { from?: Date, to?: Date, direction?: 'issued' | 'received' | 'both' } = {}) {
        // 1. Get Client & Lock
        const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
        if (!client) throw new Error('Client not found');

        const syncState = db.prepare('SELECT * FROM sync_state WHERE client_id = ?').get(clientId) as any;
        if (syncState && syncState.is_running) {
            console.warn(`Sync already running for client ${client.alias}`);
            return;
        }

        // Lock
        db.prepare('INSERT OR REPLACE INTO sync_state (client_id, is_running, last_attempt_at) VALUES (?, 1, ?)').run(clientId, new Date().toISOString());

        try {
            // 2. Determine credentials
            const secretPath = path.join(__dirname, `../../secrets/${client.rfc}.txt`);
            let password = '';
            if (fs.existsSync(secretPath)) {
                password = fs.readFileSync(secretPath, 'utf-8').trim();
            } else {
                // For development/mock: if no file, proceed with mock (empty password) which SatService handles
                console.warn(`Password file not found for ${client.rfc}, using empty.`);
            }

            const creds: SatCredentials = {
                cerPath: client.cer_path,
                keyPath: client.key_path,
                password: password
            };

            // 3. Execute Syncs
            const directions = options.direction === 'both' || !options.direction
                ? ['issued', 'received']
                : [options.direction];

            for (const dir of directions) {
                await this.syncDirection(client, creds, dir as 'issued' | 'received', options.from, options.to);
            }

            // 4. Update State (Success)
            db.prepare('UPDATE sync_state SET is_running = 0, last_success_at = ?, status = ? WHERE client_id = ?')
                .run(new Date().toISOString(), 'OK', clientId);

        } catch (err: any) {
            console.error(`Sync failed for ${client.alias}:`, err);
            db.prepare('UPDATE sync_state SET is_running = 0, last_error = ?, status = ? WHERE client_id = ?')
                .run(err.message, 'ERROR', clientId);
        }
    }

    private async syncDirection(client: any, creds: SatCredentials, direction: 'issued' | 'received', from?: Date, to?: Date) {
        // Determine window
        const end = to || new Date();
        const start = from || DateTime.now().minus({ days: 30 }).toJSDate();

        // Log run start
        const result = db.prepare('INSERT INTO sync_runs (client_id, direction, started_at, window_from, window_to) VALUES (?, ?, ?, ?, ?)')
            .run(client.id, direction, new Date().toISOString(), start.toISOString(), end.toISOString());
        const runId = result.lastInsertRowid;

        let newCount = 0;
        let updatedCount = 0;

        try {
            // Call SAT Service (MOCKED internally for now if auth fails)
            let zipPaths: string[] = [];
            try {
                zipPaths = await satService.downloadPeriod(creds, start, end, direction);
            } catch (e: any) {
                console.warn(`SAT Download failed (expected without real creds): ${e.message}`);
                // Verify manual test requirement: "Execute sync real manual". 
                // If I fail here, I can't verify functionality. 
                // I will assume for now I skip zip processing if download fails, but log error.
                throw e; // Rethrow to mark sync as error
            }

            // Process ZIPs
            for (const zipPath of zipPaths) {
                const zip = new AdmZip(zipPath);
                const zipEntries = zip.getEntries();

                for (const entry of zipEntries) {
                    if (entry.entryName.endsWith('.xml')) {
                        const xmlContent = entry.getData().toString('utf8');
                        const metrics = await this.processXml(client, xmlContent, direction);
                        if (metrics.isNew) newCount++;
                        if (metrics.isUpdated) updatedCount++;
                    }
                }
            }

            // Update Run Log (Success)
            db.prepare('UPDATE sync_runs SET finished_at = ?, result = ?, new_count = ?, updated_count = ? WHERE id = ?')
                .run(new Date().toISOString(), 'OK', newCount, updatedCount, runId);

        } catch (err: any) {
            db.prepare('UPDATE sync_runs SET finished_at = ?, result = ?, error_message = ? WHERE id = ?')
                .run(new Date().toISOString(), 'ERROR', err.message, runId);
            throw err;
        }
    }

    private async processXml(client: any, xmlContent: string, direction: 'issued' | 'received') {
        const parsed = this.parser.parse(xmlContent);
        const comprobante = parsed['cfdi:Comprobante'];
        if (!comprobante) return { isNew: false, isUpdated: false };

        const timbre = comprobante['cfdi:Complemento']?.['tfd:TimbreFiscalDigital'];
        const uuid = timbre?.['@_UUID'];
        if (!uuid) return { isNew: false, isUpdated: false };

        // Basic Fields
        const total = parseFloat(comprobante['@_Total']);
        // const subtotal = parseFloat(comprobante['@_SubTotal']); // Not in DB yet
        const currency = comprobante['@_Moneda'];
        const date = new Date(comprobante['@_Fecha']);
        const stampDate = new Date(timbre['@_FechaTimbrado']);
        const type = comprobante['@_TipoDeComprobante'];
        const paymentMethod = comprobante['@_MetodoPago'];
        const paymentForm = comprobante['@_FormaPago'];

        // Emitter / Receiver
        const emisor = comprobante['cfdi:Emisor'];
        const receptor = comprobante['cfdi:Receptor'];

        const emisorName = emisor?.['@_Nombre'] || '';
        const emisorRfc = emisor?.['@_Rfc'] || '';
        const receptorName = receptor?.['@_Nombre'] || '';
        const receptorRfc = receptor?.['@_Rfc'] || '';

        // Taxes (IVA)
        let iva = 0;
        const impuestos = comprobante['cfdi:Impuestos'];
        if (impuestos && impuestos['cfdi:Traslados']) {
            const traslados = impuestos['cfdi:Traslados']['cfdi:Traslado'];
            const list = Array.isArray(traslados) ? traslados : [traslados];
            for (const t of list) {
                if (t && (t['@_Impuesto'] === '002' || t['@_Impuesto'] === '2')) { // 002 is IVA
                    iva += parseFloat(t['@_Importe'] || '0');
                }
            }
        }

        // Save File
        const rawPath = vault.saveXml(client.rfc, uuid, date, xmlContent);

        // Upsert DB
        const existing = db.prepare('SELECT * FROM invoices WHERE uuid = ?').get(uuid) as any;

        let isNew = false;
        let isUpdated = false;

        if (!existing) {
            isNew = true;
            const stmt = db.prepare(`
        INSERT INTO invoices (
          uuid, client_id, direction, type, 
          emitter_name, emitter_rfc, receiver_name, receiver_rfc,
          issue_date, stamp_date, total, iva, currency,
          payment_method, payment_form, status, source, raw_path,
          first_seen_at, last_seen_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?
        )
      `);

            stmt.run(
                uuid, client.id, direction, type,
                emisorName, emisorRfc, receptorName, receptorRfc,
                date.toISOString(), stampDate.toISOString(), total, iva, currency,
                paymentMethod, paymentForm, 'vigente', 'SAT', rawPath,
                new Date().toISOString(), new Date().toISOString()
            );

        } else {
            isUpdated = true;
            db.prepare('UPDATE invoices SET last_seen_at = ? WHERE uuid = ?').run(new Date().toISOString(), uuid);
        }

        return { isNew, isUpdated };
    }
}

export const syncService = new SyncService();
