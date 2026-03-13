import { db } from '../db';
import { satService } from './sat';

export class SatRunner {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private readonly POLLING_INTERVAL_MS = 60000; // 60 seconds
    private readonly MAX_ATTEMPTS = 240; // ~4 hours if 60s/attempt, but failsafe for expiration

    start() {
        if (this.intervalId) return;
        console.log('[Runner] Starting SAT Background Runner (Package-First Mode)...');
        this.intervalId = setInterval(() => this.poll(), this.POLLING_INTERVAL_MS);
        this.poll(); // Initial run immediately
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[Runner] Stopped SAT Background Runner.');
        }
    }

    private async poll() {
        if (this.isRunning) {
            console.log('[Runner] Poll skip: previous run still active.');
            return;
        }
        this.isRunning = true;

        try {
            // Select active requests: State is 'created' or 'polling' AND not expired
            const pending = db.prepare<unknown[], {
                client_id: number;
                sat_request_id: string;
                state: string;
                sat_status: string;
                attempts: number;
                expires_at: string;
            }>(`
                SELECT client_id, sat_request_id, state, sat_status, attempts, expires_at
                FROM sat_requests 
                WHERE state IN ('created', 'polling')
            `).all();

            if (pending.length > 0) {
                console.log(`[Runner] Found ${pending.length} active requests.`);
                for (const req of pending) {
                    await this.processRequest(req);
                }
            }

        } catch (error) {
            console.error('[Runner] Error in poll loop:', error);
        } finally {
            this.isRunning = false;
        }
    }

    private async processRequest(req: { client_id: number; sat_request_id: string; state: string; sat_status: string; attempts: number; expires_at: string }) {
        const { client_id, sat_request_id, attempts, expires_at } = req;

        // Expiration Check
        if (expires_at && new Date() > new Date(expires_at)) {
            console.log(`[Runner] ${sat_request_id} EXPIRED (Now > ${expires_at}). Marking as expired.`);
            this.updateState(client_id, sat_request_id, 'expired', `Expired at ${new Date().toISOString()}`);
            return;
        }

        if (attempts >= this.MAX_ATTEMPTS) {
            console.log(`[Runner] ${sat_request_id} REACHED MAX ATTEMPTS (${attempts}). Marking as expired.`);
            this.updateState(client_id, sat_request_id, 'expired', 'Max attempts reached');
            return;
        }

        console.log(`[Runner] Checking ${sat_request_id}... (Attempt ${attempts + 1})`);

        try {
            // 1. Check Status & Packages (Updates sat_status in DB automatically)
            const result = await satService.checkRequestStatus(client_id, sat_request_id);
            const { satStatus, packages } = result;

            // Increment attempts
            db.prepare('UPDATE sat_requests SET attempts = attempts + 1 WHERE client_id = ? AND sat_request_id = ?')
                .run(client_id, sat_request_id);

            console.log(`[Runner] SAT says: ${satStatus}. Packages found: ${packages.length}`);

            // 2. Package-First Logic: If packages exist, download immediately
            if (packages && packages.length > 0) {
                console.log(`[Runner] Packages detected! Transitioning to DOWNLOADING.`);
                this.updateState(client_id, sat_request_id, 'downloading', 'Packages detected');

                // Filter out already downloaded packages
                const downloaded = db.prepare<string, { package_id: string }>(`
                    SELECT package_id FROM sat_packages WHERE sat_request_id = ?
                `).all(sat_request_id).map(p => p.package_id);

                const toDownload = packages.filter((p: string) => !downloaded.includes(p));

                if (toDownload.length > 0) {
                    console.log(`[Runner] Downloading ${toDownload.length} new packages...`);
                    const files = await satService.downloadPackages(client_id, sat_request_id, toDownload);
                    console.log(`[Runner] Downloaded package(s) -> saved to ${files.join(', ')}`);
                } else {
                    console.log(`[Runner] All ${packages.length} packages already downloaded.`);
                }

                // Mark as COMPLETED because we have the data
                console.log(`[Runner] Request completed internally (Packages present).`);
                this.updateState(client_id, sat_request_id, 'completed', 'Packages downloaded successfully');

                // Update downloaded_at
                db.prepare('UPDATE sat_requests SET downloaded_at = CURRENT_TIMESTAMP WHERE client_id = ? AND sat_request_id = ?')
                    .run(client_id, sat_request_id);

            } else {
                // No packages yet.
                // If SAT says 'rejected' or 'error', fail it.
                if (satStatus === 'rejected' || satStatus === 'error') {
                    console.error(`[Runner] SAT Rejected/Error. Marking as failed.`);
                    this.updateState(client_id, sat_request_id, 'failed', `SAT Status: ${satStatus}`);
                    return;
                }

                // Otherwise, stay in POLLING (or transition available->polling if needed)
                if (req.state !== 'polling') {
                    this.updateState(client_id, sat_request_id, 'polling', 'Waiting for packages');
                }
            }

        } catch (error: any) {
            console.error(`[Runner] Error processing ${sat_request_id}:`, error.message);
            // Don't mark failed immediately on network error, just logging.
            // Attempts counter will handle eventual expiration.
        }
    }

    private updateState(clientId: number, requestId: string, newState: string, message: string) {
        db.prepare(`
            UPDATE sat_requests 
            SET state = ?, message = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE client_id = ? AND sat_request_id = ?
        `).run(newState, message, clientId, requestId);
    }
}

export const satRunner = new SatRunner();
