import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import axios from 'axios';
import FormData from 'form-data';

const FIEL_DIR = path.join(process.cwd(), 'fiel');
const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

const SAT_ERRORS = [
    'cantidad máxima de sesiones permitidas',
    'Error interno',
    'HTTP 500',
    '500 Internal Server Error',
    'Service Unavailable',
    'página no encontrada',
    'no se puede mostrar',
    'intentar más tarde'
];

function isSatError(text) {
    return SAT_ERRORS.some(err => text.toLowerCase().includes(err.toLowerCase()));
}

async function uploadToApi(rfc, type, filePath) {
    try {
        const form = new FormData();
        form.append('rfc', rfc);
        form.append('type', type);
        form.append('pdf', fs.createReadStream(filePath), path.basename(filePath));

        const apiUrl = process.env.API_URL || 'http://localhost:10000';
        const agentSecret = process.env.AGENT_SECRET || '';
        await axios.post(`${apiUrl}/api/agent/upload-document`, form, {
            headers: { ...form.getHeaders(), 'X-Agent-Secret': agentSecret },
            timeout: 30000,
        });
        console.log(chalk.green(`[UPLOAD] ${type} subido exitosamente para ${rfc}`));
    } catch (e) {
        console.log(chalk.yellow(`[UPLOAD] Advertencia: no se pudo subir ${type}: ${e.message}`));
        // Non-fatal: PDF stays on disk even if upload fails
    }
}

async function logoutSat(browser, logoutUrl) {
    try {
        const page = await browser.newPage();
        await page.goto(logoutUrl, { waitUntil: 'load', timeout: 15000 });
        await new Promise(r => setTimeout(r, 2000));
        await page.close();
        console.log(chalk.gray(`[LOGOUT] Sesión cerrada en ${logoutUrl}`));
    } catch (e) {
        console.log(chalk.gray(`[LOGOUT] No se pudo cerrar sesión (ignorado): ${e.message}`));
        // Non-fatal
    }
}

async function loginWithFiel(page, loginUrl, rfc) {
    const cerPath = path.join(FIEL_DIR, rfc, `${rfc}.cer`);
    const keyPath = path.join(FIEL_DIR, rfc, `${rfc}.key`);
    const passPath = path.join(FIEL_DIR, rfc, `clave.txt`);

    if (!fs.existsSync(cerPath) || !fs.existsSync(keyPath) || !fs.existsSync(passPath)) {
        throw new Error(`Faltan archivos FIEL para el RFC: ${rfc}`);
    }

    const password = (await fs.readFile(passPath, 'utf8')).replace(/[\r\n]+$/, '');

    console.log(chalk.yellow(`=> Navegando a ${loginUrl}...`));
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 90000 });

    try {
        await new Promise(r => setTimeout(r, 6000));
        const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
        if (isSatError(bodyText)) throw new Error(`SAT_ERROR_ON_ENTRY: ${bodyText.substring(0, 100)}`);

        let loginFrame = page;
        let fielBtn = null;
        for (const frame of page.frames()) {
            fielBtn = await frame.$('#buttonFiel, #btndev').catch(() => null);
            if (fielBtn) {
                loginFrame = frame;
                break;
            }
        }

        if (fielBtn) {
            await fielBtn.click();
            await new Promise(r => setTimeout(r, 4000));
        }

        console.log(chalk.yellow(`=> Cargando certificados...`));
        let cerInput = null;
        for (const frame of page.frames()) {
            cerInput = await frame.$('input[type="file"][id*="ertificate"], input[type="file"][id*="ER"]').catch(() => null);
            if (cerInput) {
                loginFrame = frame;
                break;
            }
        }

        if (!cerInput) {
            // Fallback second attempt with broader search
            for (const frame of page.frames()) {
                const els = await frame.$$('input[type="file"]');
                for (const el of els) {
                    const id = await (await el.getProperty('id')).jsonValue();
                    if (id.toLowerCase().includes('cert') || id.toLowerCase().includes('cer')) {
                        cerInput = el;
                        loginFrame = frame;
                        break;
                    }
                }
                if (cerInput) break;
            }
        }

        if (!cerInput) throw new Error('No se encontró el input del certificado (.cer)');
        await cerInput.uploadFile(cerPath);

        const keyInput = await loginFrame.$('input[type="file"][id*="rivateKey"], input[type="file"][id*="KEY"]');
        if (!keyInput) throw new Error('No se encontró el input de la llave (.key)');
        await keyInput.uploadFile(keyPath);

        const passInput = await loginFrame.$('input[type="password"]');
        if (!passInput) throw new Error('No se encontró el input de la contraseña');
        await passInput.type(password);

        console.log(chalk.yellow(`=> Enviando credenciales...`));
        let submitClicked = false;
        for (const sel of ['#submit', '#btnAceptar', '#btnEnviar', 'button[type="submit"]', 'input[type="submit"]']) {
            const btn = await loginFrame.$(sel).catch(() => null);
            if (btn) { await btn.click(); submitClicked = true; break; }
        }
        if (!submitClicked) {
            // Fallback: click by text "Enviar"
            await loginFrame.evaluate(() => {
                const btns = [...document.querySelectorAll('button, input[type="submit"], input[type="button"]')];
                const b = btns.find(b => /enviar/i.test(b.textContent || b.value || ''));
                if (b) b.click();
            }).catch(() => { });
        }
        await new Promise(r => setTimeout(r, 15000));

    } catch (e) {
        throw e;
    }
}

async function downloadCSF(browser, rfc) {
    let attempts = 0;
    while (attempts < 3) {
        attempts++;
        console.log(chalk.blue(`\n[CSF] [Intento ${attempts}/3] Iniciando...`));
        const page = await browser.newPage().catch(() => null);
        if (!page) continue;

        let pdfBuffer = null;
        let lastPopup = null;

        const onTarget = async (target) => {
            if (target.type() === 'page') {
                const p = await target.page().catch(() => null);
                if (p) {
                    lastPopup = p;
                    console.log(chalk.gray(`[CSF] Detectada nueva ventana emergente.`));
                    p.on('response', async (res) => {
                        try {
                            if ((res.headers()['content-type'] || '').includes('application/pdf')) {
                                const b = await res.buffer();
                                if (b.length > 5000) pdfBuffer = b;
                            }
                        } catch (e) { }
                    });
                }
            }
        };
        browser.on('targetcreated', onTarget);

        try {
            await loginWithFiel(page, 'https://wwwmat.sat.gob.mx/aplicacion/login/53027/genera-tu-constancia-de-situacion-fiscal.', rfc);
            console.log(chalk.green(`[CSF] Esperando 20s para controles...`));
            await new Promise(r => setTimeout(r, 20000));

            let clicked = false;
            for (const f of page.frames()) {
                clicked = await f.evaluate(() => {
                    const el = Array.from(document.querySelectorAll('button, input, a, span')).find(e => {
                        const t = (e.innerText || e.textContent || e.value || '').toUpperCase();
                        return t.includes('GENERAR') && t.includes('CONSTANCIA');
                    });
                    if (el) { el.click(); return true; }
                    return false;
                }).catch(() => false);
                if (clicked) break;
            }

            if (!clicked) {
                console.log(chalk.red(`[CSF] Botón no encontrado.`));
                await page.screenshot({ path: path.join(DOWNLOAD_DIR, rfc, `Debug_CSF_Login_${attempts}.png`) });
            } else {
                console.log(chalk.yellow(`[CSF] Botón clickeado. Esperando PDF (20s)...`));
                for (let i = 0; i < 20; i++) {
                    if (pdfBuffer) break;
                    await new Promise(r => setTimeout(r, 1000));
                }

                if (pdfBuffer) {
                    await fs.writeFile(path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'), pdfBuffer);
                    console.log(chalk.green(`[CSF] ¡ÉXITO! PDF interceptado por red.`));
                    await uploadToApi(rfc, 'csf', path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'));
                    await logoutSat(browser, 'https://wwwmat.sat.gob.mx/aplicacion/salir/general');
                    if (lastPopup) await lastPopup.close();
                    browser.removeListener('targetcreated', onTarget);
                    await page.close();
                    return;
                }

                if (lastPopup) {
                    console.log(chalk.yellow(`[CSF] Intentando extracción directa desde el visor...`));
                    const base64 = await lastPopup.evaluate(async () => {
                        try {
                            const response = await fetch(window.location.href);
                            const blob = await response.blob();
                            return new Promise(r => {
                                const reader = new FileReader();
                                reader.onloadend = () => r(reader.result.split(',')[1]);
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) { return null; }
                    }).catch(() => null);

                    if (base64) {
                        await fs.writeFile(path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'), Buffer.from(base64, 'base64'));
                        console.log(chalk.green(`[CSF] ¡ÉXITO! PDF extraído de la memoria del navegador.`));
                        await uploadToApi(rfc, 'csf', path.join(DOWNLOAD_DIR, rfc, 'Constancia_Situacion_Fiscal.pdf'));
                        await logoutSat(browser, 'https://wwwmat.sat.gob.mx/aplicacion/salir/general');
                        await lastPopup.close();
                        browser.removeListener('targetcreated', onTarget);
                        await page.close();
                        return;
                    }
                    console.log(chalk.red(`[CSF] No se pudo extraer el PDF de la ventana emergente.`));
                    await lastPopup.screenshot({ path: path.join(DOWNLOAD_DIR, rfc, `Debug_Popup_${attempts}.png`) });
                }
            }
        } catch (e) { console.log(chalk.red(`[CSF] Error: ${e.message}`)); }
        finally {
            browser.removeListener('targetcreated', onTarget);
            await page.close().catch(() => { });
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

async function downloadOpinion(browser, rfc) {
    let attempts = 0;
    while (attempts < 3) {
        attempts++;
        console.log(chalk.blue(`\n[32-D] [Intento ${attempts}/3] Iniciando...`));
        const page = await browser.newPage().catch(() => null);
        if (!page) continue;

        let pdfBuffer = null;

        // Intercept HTTP responses with PDF content type
        page.on('response', async (res) => {
            try {
                if ((res.headers()['content-type'] || '').includes('application/pdf')) {
                    const b = await res.buffer();
                    if (b.length > 5000) pdfBuffer = b;
                }
            } catch (e) { }
        });

        // Set up CDP download capture for when user clicks download button
        const cdp = await page.createCDPSession().catch(() => null);
        const downloadPath = path.join(DOWNLOAD_DIR, rfc);
        let downloadedFilename = null;
        let downloadComplete = false;
        if (cdp) {
            await cdp.send('Browser.setDownloadBehavior', {
                behavior: 'allow', downloadPath, eventsEnabled: true,
            }).catch(() => { });
            cdp.on('Browser.downloadWillBegin', ({ suggestedFilename }) => {
                downloadedFilename = suggestedFilename;
                console.log(chalk.gray(`[32-D] Descarga iniciada: ${suggestedFilename}`));
            });
            cdp.on('Browser.downloadProgress', ({ state }) => {
                if (state === 'completed') downloadComplete = true;
            });
        }

        try {
            await loginWithFiel(page, 'https://ptsc32d.clouda.sat.gob.mx/', rfc);
            console.log(chalk.green(`[32-D] Login completado, esperando página del reporte...`));

            // Step 1: Wait for OAuth redirect to reach ptsc32d (up to 60s)
            let onPtsc32d = false;
            for (let i = 0; i < 60; i++) {
                const url = page.url();
                if (url.includes('ptsc32d.clouda.sat.gob.mx') && !url.includes('login.mat')) {
                    onPtsc32d = true;
                    console.log(chalk.green(`[32-D] En ptsc32d. URL: ${url}`));
                    break;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!onPtsc32d) throw new Error(`No se llegó a ptsc32d tras el login. URL: ${page.url()}`);

            // Navigate explicitly to the report route (in case Angular landed on /#/ instead)
            const currentUrl = page.url();
            if (!currentUrl.includes('reporteOpinion32DContribuyente')) {
                console.log(chalk.yellow(`[32-D] Navegando a la ruta del reporte...`));
                await page.goto('https://ptsc32d.clouda.sat.gob.mx/#/reporteOpinion32DContribuyente', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 3000));
            }

            // Step 2: Wait for "Procesando" to APPEAR (Angular finished routing and started report, up to 20s)
            console.log(chalk.yellow(`[32-D] Esperando que inicie procesamiento...`));
            for (let i = 0; i < 20; i++) {
                if (pdfBuffer) break;
                const body = await page.evaluate(() => document.body.innerText).catch(() => '');
                if (isSatError(body)) throw new Error(`SAT_ERROR: ${body.substring(0, 100)}`);
                if (body.toLowerCase().includes('procesando')) { console.log(chalk.yellow(`[32-D] Procesando detectado.`)); break; }
                await new Promise(r => setTimeout(r, 1000));
            }

            // Step 3: Wait for "Procesando" to DISAPPEAR (report generated, up to 45s)
            console.log(chalk.yellow(`[32-D] Esperando resultado...`));
            for (let i = 0; i < 45; i++) {
                if (pdfBuffer) break;
                const body = await page.evaluate(() => document.body.innerText).catch(() => '');
                if (isSatError(body)) throw new Error(`SAT_ERROR: ${body.substring(0, 100)}`);
                if (!body.toLowerCase().includes('procesando')) { console.log(chalk.green(`[32-D] Procesamiento terminado.`)); break; }
                await new Promise(r => setTimeout(r, 1000));
            }
            await new Promise(r => setTimeout(r, 2000));

            // If PDF was captured via HTTP response, use it directly
            if (pdfBuffer) {
                console.log(chalk.green(`[32-D] PDF capturado por intercepción HTTP.`));
            } else {
                // PDF is rendered inline (blob/data URL) — click the download button
                console.log(chalk.yellow(`[32-D] PDF inline detectado, buscando botón de descarga...`));
                const downloadBtn = await page.evaluateHandle(() => {
                    // PDF.js viewer download button or Angular download button
                    const selectors = [
                        'button[title*="escargar"]', 'button[aria-label*="escargar"]',
                        'button[title*="ownload"]', 'button[aria-label*="ownload"]',
                        '#download', '.download', '[ng-click*="download"]',
                        'a[download]',
                    ];
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el) return el;
                    }
                    // Fallback: button/link with download text
                    const all = [...document.querySelectorAll('button, a')];
                    return all.find(el => /descargar|download/i.test(el.textContent || el.title || '')) || null;
                }).catch(() => null);

                if (downloadBtn && (await downloadBtn.asElement())) {
                    await downloadBtn.asElement().click();
                    console.log(chalk.yellow(`[32-D] Botón de descarga clicado, esperando archivo...`));
                    for (let i = 0; i < 30; i++) {
                        if (downloadComplete) break;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    if (downloadComplete && downloadedFilename) {
                        pdfBuffer = await fs.readFile(path.join(downloadPath, downloadedFilename));
                        await fs.remove(path.join(downloadPath, downloadedFilename)).catch(() => { });
                    }
                } else {
                    // Last resort: try to extract PDF from embedded iframe src
                    const pdfUrl = await page.evaluate(() => {
                        const iframe = document.querySelector('iframe[src*=".pdf"], embed[src*=".pdf"], object[data*=".pdf"]');
                        return iframe ? (iframe.src || iframe.data) : null;
                    }).catch(() => null);
                    if (pdfUrl) {
                        const res = await page.goto(pdfUrl, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
                        if (res) {
                            const buf = await res.buffer().catch(() => null);
                            if (buf && buf.length > 5000) pdfBuffer = buf;
                        }
                    }
                }
            }

            if (!pdfBuffer || pdfBuffer.length < 5000) throw new Error('No se pudo obtener el PDF');

            const outPath = path.join(DOWNLOAD_DIR, rfc, 'Opinion_Cumplimiento_32D.pdf');
            await fs.writeFile(outPath, pdfBuffer);
            console.log(chalk.green(`[32-D] ¡ÉXITO! Opinión guardada.`));
            await uploadToApi(rfc, 'opinion_32d', outPath);
            await logoutSat(browser, 'https://ptsc32d.clouda.sat.gob.mx/logout');
            await page.close();
            return;

        } catch (e) { console.log(chalk.red(`[32-D] Error: ${e.message}`)); }
        finally { await page.close().catch(() => { }); }
        await new Promise(r => setTimeout(r, 5000));
    }
}

async function main() {
    const rfc = process.argv[2];
    if (!rfc) { console.log('RFC requerido'); process.exit(1); }

    await fs.ensureDir(path.join(DOWNLOAD_DIR, rfc));
    const isHeadless = process.env.DISPLAY === undefined || process.env.DISPLAY === '';
    const launchOptions = {
        headless: isHeadless ? 'new' : false,
        protocolTimeout: 300000,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);

    try {
        await downloadCSF(browser, rfc);
        await downloadOpinion(browser, rfc);
    } finally {
        await browser.close().catch(() => { });
        console.log(`\n✅ Finalizado para ${rfc}`);
    }
}

main();
