import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';

const FIEL_DIR = path.join(process.cwd(), 'fiel');
const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

async function main() {
    // Expected arguments: [RFC] [TIPO] [YEAR] [MONTH] [DAY] [PASS]
    const rfc = process.argv[2];
    const tipo = process.argv[3] ? process.argv[3].toLowerCase() : 'recibidas';
    const year = process.argv[4];
    const month = process.argv[5];
    const day = process.argv[6];
    const password = process.argv[7];

    if (!rfc || !year || !month || !day || !password) {
        console.error("Faltan parámetros. Uso: node scraper_xml.js [RFC] [recibidas|emitidas] [YYYY] [MM] [DD] [PASS]");
        process.exit(1);
    }

    const RFC_DOWNLOAD_DIR = path.join(DOWNLOAD_DIR, rfc);
    await fs.ensureDir(RFC_DOWNLOAD_DIR);

    console.log(`[XML] Iniciando extracción ${tipo} para ${rfc} en ${day}/${month}/${year}`);

    const launchOptions = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    try {
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: RFC_DOWNLOAD_DIR });

        await page.goto('https://portalcfdi.facturaelectronica.sat.gob.mx/', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 5000));

        let loginFrame = page;
        let efirmaBtn = null;
        for (const frame of page.frames()) {
            efirmaBtn = await frame.$('#buttonFiel');
            if (efirmaBtn) { loginFrame = frame; break; }
        }
        if (efirmaBtn) await efirmaBtn.click();
        await new Promise(r => setTimeout(r, 2000));

        const cerPath = path.join(FIEL_DIR, rfc, `${rfc}.cer`);
        const keyPath = path.join(FIEL_DIR, rfc, `${rfc}.key`);
        
        // Wait for inputs in frame
        await loginFrame.waitForSelector('#filecer', { timeout: 10000 });
        
        const [fc1] = await Promise.all([page.waitForFileChooser(), loginFrame.click('#filecer')]);
        await fc1.accept([cerPath]);
        
        const [fc2] = await Promise.all([page.waitForFileChooser(), loginFrame.click('#filekey')]);
        await fc2.accept([keyPath]);

        await loginFrame.type('#privateKeyPassword', password);
        await loginFrame.click('#submit');

        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        if (tipo === 'recibidas') {
            await page.goto('https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx');
            await page.waitForSelector('#ctl00_MainContent_CodelistAnio');
            await page.select('#ctl00_MainContent_CodelistAnio', year);
            await page.select('#ctl00_MainContent_CodelistMes', parseInt(month).toString());
            // Si el dia no es '00' o 'all', seleccionamos dia
            if (day !== '00' && day !== 'all') {
                await page.click('#ctl00_MainContent_RbtnDesde');
                await page.evaluate((d) => { document.getElementById('ctl00_MainContent_CodelistDia').value = d; }, day);
            }
        } else {
            await page.goto('https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaEmisor.aspx');
            await page.waitForSelector('#ctl00_MainContent_RbtnFechas');
            await page.click('#ctl00_MainContent_RbtnFechas');
            await new Promise(r => setTimeout(r, 1000));
            
            const startDate = `${day.padStart(2,'0')}/${month.padStart(2,'0')}/${year} 00:00:00`;
            const endDate = day === '00' || day === 'all' 
                ? `28/${month.padStart(2,'0')}/${year} 23:59:59` 
                : `${day.padStart(2,'0')}/${month.padStart(2,'0')}/${year} 23:59:59`;
            
            await page.evaluate((s) => { document.getElementById('ctl00_MainContent_TxtFechaInicio').value = s; }, startDate);
            await page.evaluate((e) => { document.getElementById('ctl00_MainContent_TxtFechaFin').value = e; }, endDate);
        }

        await page.click('#ctl00_MainContent_BtnBusqueda');
        await new Promise(r => setTimeout(r, 10000));

        const downloads = await page.$$('span[id="BtnDescarga"]');
        console.log(`Descargando ${downloads.length} XMLs...`);
        for (const dl of downloads) {
            await dl.click();
            await new Promise(r => setTimeout(r, 1000));
        }

        await new Promise(r => setTimeout(r, 5000 + (downloads.length * 1000)));
        console.log("FIN");

    } catch (err) {
        console.error("Error: ", err.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}
main();
