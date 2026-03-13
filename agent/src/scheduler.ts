import schedule from 'node-schedule';
import { db } from './db';
import { syncService } from './services/sync';

export const runScheduler = () => {
    schedule.scheduleJob('0 */6 * * *', async () => {
        console.log('[Scheduler] Starting auto-sync...');
        const clients = db.prepare('SELECT * FROM clients').all() as any[];

        for (const client of clients) {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - 10);

            console.log(`[Scheduler] Syncing ${client.alias} (${client.rfc})...`);

            syncService.runSync(client.id, { from: start, to: end, direction: 'both' })
                .catch(err => console.error(`[Scheduler] Error syncing ${client.alias}:`, err));
        }
    });
};
