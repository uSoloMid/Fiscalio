import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { db } from './db';
import { runScheduler } from './scheduler';
import routes from './routes';

dotenv.config();

import { satRunner } from './services/runner';

const server = Fastify({
    logger: true
});

// Start Runner
satRunner.start();

server.register(cors, {
    origin: '*'
});

server.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

server.register(routes);

const start = async () => {
    try {
        await server.listen({ port: 3333, host: '0.0.0.0' });
        console.log('Server listening on http://localhost:3333');

        db.pragma('journal_mode = WAL');
        console.log('Database initialized');

        runScheduler();
        console.log('Scheduler started');

    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
