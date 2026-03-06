import 'dotenv/config';
import fs from 'fs-extra';
import axios from 'axios';
import path from 'path';
import chalk from 'chalk';
import schedule from 'node-schedule';
import http from 'http';
import { exec } from 'child_process';


// Configuración
const API_URL = process.env.API_URL || 'http://localhost:3333';
const AGENT_SECRET = process.env.AGENT_SECRET || '';
const FIEL_DIR = path.join(process.cwd(), 'fiel');

// ===== SISTEMA DE COLA CSF/OPINIÓN =====
const MAX_OUTER_ATTEMPTS = 3;
const scraperQueue = [];  // [{ rfc, attempts }]
let queueRunning = false;

function loadRfcsFromFiel() {
    try {
        if (!fs.existsSync(FIEL_DIR)) return [];
        return fs.readdirSync(FIEL_DIR).filter(name => {
            const dir = path.join(FIEL_DIR, name);
            return fs.statSync(dir).isDirectory()
                && fs.existsSync(path.join(dir, `${name}.cer`))
                && fs.existsSync(path.join(dir, `${name}.key`))
                && fs.existsSync(path.join(dir, 'clave.txt'));
        });
    } catch (e) { return []; }
}

function runScraperForRfc(rfc) {
    return new Promise((resolve) => {
        let output = '';
        const child = exec(`node scraper_sat.js ${rfc}`, { timeout: 600000 });
        child.stdout.on('data', d => { process.stdout.write(d); output += d; });
        child.stderr.on('data', d => { process.stderr.write(d); output += d; });
        child.on('close', () => resolve(output.includes('¡ÉXITO!')));
    });
}

async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;
    console.log(chalk.green.bold(`\n🎯 Cola iniciada: ${scraperQueue.length} RFCs en cola`));

    while (scraperQueue.length > 0) {
        const item = scraperQueue.shift();
        console.log(chalk.cyan(`\n[COLA] ${item.rfc} (intento ${item.attempts + 1}/${MAX_OUTER_ATTEMPTS}) — quedan ${scraperQueue.length}`));

        const success = await runScraperForRfc(item.rfc);
        if (success) {
            console.log(chalk.green(`[COLA] ✅ ${item.rfc} completado`));
        } else {
            item.attempts++;
            if (item.attempts < MAX_OUTER_ATTEMPTS) {
                scraperQueue.push(item);
                console.log(chalk.yellow(`[COLA] ⚠️  ${item.rfc} falló (${item.attempts}/${MAX_OUTER_ATTEMPTS}) → al final de la cola`));
            } else {
                console.log(chalk.red(`[COLA] ❌ ${item.rfc} agotó sus ${MAX_OUTER_ATTEMPTS} intentos`));
            }
        }
    }

    queueRunning = false;
    console.log(chalk.green.bold(`\n🏁 Cola completada`));
}

const agentHeaders = { 'X-Agent-Secret': AGENT_SECRET };

console.log(chalk.green.bold('\n🚀 Fiscalio Agent - Sistema de Descarga Masiva'));
console.log(chalk.gray('================================================'));
console.log(chalk.blue(`📡 Conectado a API: ${API_URL}`));
console.log(chalk.blue(`📂 Carpeta de FIEL: ${FIEL_DIR}`));
console.log(chalk.gray('================================================\n'));

async function syncCredentials() {
    try {
        process.stdout.write(chalk.yellow('🔄 Sincronizando credenciales... '));

        // 0. Pulsar el Runner (Marcapasos) para procesar solicitudes en la nube
        try {
            await axios.get(`${API_URL}/api/agent/runner-tick`, { headers: agentHeaders });
        } catch (tickErr) {
            // Ignoramos si falla el pulso, puede ser timeout de Render
        }

        // Petición a la API de clientes
        const response = await axios.get(`${API_URL}/api/agent/sync-clients`, { headers: agentHeaders });
        const clients = response.data;

        if (!clients || clients.length === 0) {
            console.log(chalk.gray('No hay cambios.'));
            return;
        }

        console.log(chalk.cyan(`\n📥 Procesando ${clients.length} clientes:`));

        for (const client of clients) {
            const rfc = client.rfc;
            if (!rfc) continue;

            const clientDir = path.join(FIEL_DIR, rfc);
            await fs.ensureDir(clientDir);

            // 1. Guardar Certificado (.cer)
            if (client.certificate) {
                const certBuffer = Buffer.from(client.certificate, 'base64');
                await fs.writeFile(path.join(clientDir, `${rfc}.cer`), certBuffer);
            }

            // 2. Guardar Llave Privada (.key)
            if (client.private_key) {
                const keyBuffer = Buffer.from(client.private_key, 'base64');
                await fs.writeFile(path.join(clientDir, `${rfc}.key`), keyBuffer);
            }

            // 3. Guardar Contraseña (clave.txt)
            if (client.passphrase) {
                await fs.writeFile(path.join(clientDir, 'clave.txt'), client.passphrase);
            }

            // 4. Guardar CIEC (ciec.txt) - Opcional, útil para el scraping
            if (client.ciec) {
                await fs.writeFile(path.join(clientDir, 'ciec.txt'), client.ciec);
            }

            console.log(chalk.green(`   ✅ ${chalk.bold(rfc)}: Archivos actualizados localmente.`));
        }
        console.log(chalk.gray('\n✨ Sincronización completada.'));

    } catch (error) {
        console.log(chalk.red('ERROR'));
        if (error.response) {
            console.error(chalk.red(`❌ Error del Servidor (${error.response.status}):`));
            console.error(chalk.gray(JSON.stringify(error.response.data, null, 2)));
        } else {
            console.error(chalk.red(`❌ Fallo al conectar con la API: ${error.message}`));
        }

        if (error.code === 'ECONNREFUSED') {
            console.log(chalk.yellow('   Sugerencia: Revisa que la API esté corriendo o el internet funcione.'));
        }
    }
}

// 1. Ejecutar inmediatamente al abrir
syncCredentials();

// 2. Programar revisión cada minuto (Mantiene el servidor despierto y es reactivo)
schedule.scheduleJob('* * * * *', syncCredentials);

// Mantener vivo
console.log(chalk.gray('⏱️  Agente activo. Revisando cambios cada minuto...'));

// Micro-servidor HTTP para gatillar acciones manuales
const server = http.createServer((req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/enqueue-all') {
        const rfcs = loadRfcsFromFiel();
        let added = 0;
        for (const rfc of rfcs) {
            if (!scraperQueue.some(i => i.rfc === rfc)) {
                scraperQueue.push({ rfc, attempts: 0 });
                added++;
            }
        }
        processQueue(); // fire and forget
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ queued: added, total: scraperQueue.length, running: queueRunning }));
        return;
    }

    if (req.method === 'GET' && req.url === '/queue-status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            running: queueRunning,
            pending: scraperQueue.length,
            queue: scraperQueue.map(i => ({ rfc: i.rfc, attempts: i.attempts }))
        }));
        return;
    }

    if (req.method === 'POST' && req.url === '/run-scraper') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.rfc) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'RFC is required' }));
                    return;
                }

                console.log(chalk.yellow(`\n[API CALL] Gatillando scraper manualmente para ${data.rfc}...`));

                // Ejecutamos en background
                exec(`node scraper_sat.js ${data.rfc}`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(chalk.red(`Error al ejecutar scraper de ${data.rfc}: ${error.message}`));
                    }
                    if (stderr) {
                        console.error(chalk.yellow(`Warning de scraper: ${stderr}`));
                    }
                    console.log(chalk.gray(`Salida de scraper para ${data.rfc}:\n${stdout}`));
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'started', rfc: data.rfc }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const AGENT_PORT = process.env.AGENT_PORT || 3005;
server.listen(AGENT_PORT, '0.0.0.0', () => {
    console.log(chalk.blue(`🌐 Servidor HTTP interno escuchando en puerto ${AGENT_PORT}`));
});

