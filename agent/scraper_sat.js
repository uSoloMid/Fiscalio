import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

const FIEL_DIR = path.join(process.cwd(), 'fiel');
const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

async function loginWithFiel(page, loginUrl, rfc) {
    const cerPath = path.join(FIEL_DIR, rfc, `${rfc}.cer`);
    const keyPath = path.join(FIEL_DIR, rfc, `${rfc}.key`);
    const passPath = path.join(FIEL_DIR, rfc, `clave.txt`);

    if (!fs.existsSync(cerPath) || !fs.existsSync(keyPath) || !fs.existsSync(passPath)) {
        throw new Error(`Faltan archivos FIEL para el RFC: ${rfc}. Asegúrate de que .cer, .key y clave.txt existan.`);
    }

    const password = await fs.readFile(passPath, 'utf8');

    console.log(chalk.yellow(`=> Entrando a portal de Login...`));
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // En algunos portales del SAT, la pestaña e.firma se debe presionar primero
    try {
        const hasFielButton = await page.$('#buttonFiel');
        if (hasFielButton) {
            await page.click('#buttonFiel');
            // Mini pausa para que la animación termine
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (e) { }

    console.log(chalk.yellow(`=> Inyectando certificados e.Firma...`));

    const fileCer = await page.$('input[id="fileCertificate"]');
    if (!fileCer) throw new Error('No se encontró el campo para el archivo .CER');
    await fileCer.uploadFile(cerPath);

    const fileKey = await page.$('input[id="filePrivateKey"]');
    if (!fileKey) throw new Error('No se encontró el campo para el archivo .KEY');
    await fileKey.uploadFile(keyPath);

    const passInput = await page.$('#privateKeyPassword');
    if (!passInput) throw new Error('No se encontró el campo para la contraseña.');
    await passInput.type(password.trim());

    console.log(chalk.yellow(`=> Autenticando...`));
    await Promise.all([
        page.click('#submit'),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 })
    ]);
}

async function downloadCSF(browser, rfc) {
    console.log(chalk.blue(`\n[CSF] Iniciando descarga Constancia de Situación Fiscal...`));
    const page = await browser.newPage();

    // Evitar que el PDF abra en el navegador y forzar la descarga a disco
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.join(DOWNLOAD_DIR, rfc)
    });

    try {
        // Usamos la URL que pasaste para la CSF
        const loginUrl = 'https://login.siat.sat.gob.mx/nidp/idff/sso?id=fiel_Aviso&sid=0&option=credential&sid=0';
        await loginWithFiel(page, loginUrl, rfc);

        console.log(chalk.green(`[CSF] Login Exitoso. Buscando el botón de Generar Constancia...`));

        // A partir de aquí el sistema entra al menú Siat de CSF
        // Necesitamos esperar a ver si el botón de generar CSF carga mediante iframes o en la página
        // Este es un selector genérico comúnmente usado en el portal, sujeto a ajustes:
        try {
            await page.waitForSelector('button, a, input[type="button"], input[type="submit"]', { timeout: 15000 });
            // Aqui meteremos la lógica extra para esperar la descarga...
            // Por ejemplo, await page.click('button:has-text("Generar Constancia")');
            // await new Promise(r => setTimeout(r, 5000));
        } catch (e) {
            console.log(chalk.gray(`[CSF] Warning: No se encontró el botón evidente de CSF, revisando frame.`));
        }

        console.log(chalk.green(`[CSF] Flujo terminado.`));
    } catch (error) {
        console.error(chalk.red(`[CSF] Error: ${error.message}`));
    } finally {
        await page.close();
    }
}

async function downloadOpinion(browser, rfc) {
    console.log(chalk.blue(`\n[32-D] Iniciando revisión de Opinión de Cumplimiento...`));
    const page = await browser.newPage();

    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.join(DOWNLOAD_DIR, rfc)
    });

    try {
        // Usamos la URL para Opinión 32D
        // Usaremos el portal general de 32D para que el SAT nos redirija a SU URL dinámica de target
        const loginUrl = 'https://ptsc32d.clouda.sat.gob.mx/';
        await loginWithFiel(page, loginUrl, rfc);

        console.log(chalk.green(`[32-D] Login Exitoso. Obteniendo status de opinión...`));

        // Generalmente el portal 32D abre directo el PDF de respuesta o una pantalla que dice "Su opinión de cumplimiento es POSITIVA"
        // await new Promise(r => setTimeout(r, 5000));

    } catch (error) {
        console.error(chalk.red(`[32-D] Error: ${error.message}`));
    } finally {
        await page.close();
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log(chalk.red('Error: Debes proporcionar un RFC como argumento.'));
        console.log(chalk.gray('Uso: node scraper_sat.js <RFC>'));
        process.exit(1);
    }
    const rfc = args[0];

    console.log(chalk.cyan.bold(`\n⚙️  Fiscalio Bot - Scraping FIEL para ${rfc}`));
    await fs.ensureDir(path.join(DOWNLOAD_DIR, rfc));

    // Lanzamos el navegador en modo headless
    const browser = await puppeteer.launch({
        headless: "new", // Usa false si quieres ver lo que hace visualmente en tu PC local (X11)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' // Evasión básica de anti-bots
        ]
    });

    await downloadCSF(browser, rfc);
    await downloadOpinion(browser, rfc);

    await browser.close();
    console.log(chalk.cyan.bold(`\n✅ Proceso Finalizado para ${rfc}. Revisa la carpeta downloads/`));
}

main();
