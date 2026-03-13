import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';

const VAULT_ROOT = path.join(__dirname, '../../vault');

export class VaultService {

    constructor() {
        if (!fs.existsSync(VAULT_ROOT)) {
            fs.mkdirSync(VAULT_ROOT, { recursive: true });
        }
    }

    /**
     * Stores an XML file in the vault following the structure:
     * vault/<RFC>/<YYYY>/<MM>/<UUID>.xml
     */
    saveXml(rfc: string, uuid: string, date: Date, xmlContent: string): string {
        const dt = DateTime.fromJSDate(date);
        const year = dt.toFormat('yyyy');
        const month = dt.toFormat('MM');

        const dirPath = path.join(VAULT_ROOT, rfc, year, month);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, `${uuid}.xml`);
        fs.writeFileSync(filePath, xmlContent, 'utf-8');

        // Return relative path for DB
        return `vault/${rfc}/${year}/${month}/${uuid}.xml`;
    }

    exists(relativePath: string): boolean {
        const fullPath = path.join(__dirname, '../../', relativePath);
        return fs.existsSync(fullPath);
    }

    read(relativePath: string): string | null {
        const fullPath = path.join(__dirname, '../../', relativePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf-8');
        }
        return null;
    }
}

export const vault = new VaultService();
