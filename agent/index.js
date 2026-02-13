import 'dotenv/config';
import fs from 'fs-extra';
import axios from 'axios';
import path from 'path';
import chalk from 'chalk';
import schedule from 'node-schedule';

// Configuración
const API_URL = process.env.API_URL || 'http://localhost:3333';
const FIEL_DIR = path.join(process.cwd(), 'fiel');

console.log(chalk.green.bold('\n🚀 Fiscalio Agent - Sistema de Descarga Masiva'));
console.log(chalk.gray('================================================'));
console.log(chalk.blue(`📡 Conectado a API: ${API_URL}`));
console.log(chalk.blue(`📂 Carpeta de FIEL: ${FIEL_DIR}`));
console.log(chalk.gray('================================================\n'));

async function syncCredentials() {
    try {
        process.stdout.write(chalk.yellow('🔄 Sincronizando credenciales... '));

        // Petición a la API
        const response = await axios.get(`${API_URL}/api/agent/sync-clients`);
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

            // 5. Avisar a la API para que borre las credenciales de la nube (Buzón Seguro)
            try {
                await axios.post(`${API_URL}/api/agent/confirm-credentials`, { rfc: rfc });
                console.log(chalk.gray(`      🔒 Nube limpiada para ${rfc}.`));
            } catch (confirmError) {
                console.log(chalk.red(`      ⚠️ No se pudo limpiar la nube para ${rfc}: ${confirmError.message}`));
            }
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

// 2. Programar revisión cada 5 minutos
schedule.scheduleJob('*/5 * * * *', syncCredentials);

// Mantener vivo
console.log(chalk.gray('⏱️  Agente activo. Revisando cambios cada 5 minutos...'));
