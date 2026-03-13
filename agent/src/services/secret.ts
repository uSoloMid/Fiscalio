import { execSync } from 'child_process';

export class SecretService {

    /**
     * Encrypts a buffer using Windows DPAPI via PowerShell.
     * @param buffer The data to encrypt.
     * @returns Base64 string of the encrypted data.
     */
    encryptBuffer(buffer: Buffer): string {
        try {
            const inputBase64 = buffer.toString('base64');
            // PowerShell command to encrypt
            const psCommand = `
                Add-Type -AssemblyName System.Security;
                $bytes = [System.Convert]::FromBase64String('${inputBase64}');
                $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
                [System.Convert]::ToBase64String($enc)
            `;

            // Execute command and trim whitespace/newlines
            return execSync(`powershell -NoProfile -Command "${psCommand.replace(/\r?\n/g, ' ')}"`).toString().trim();
        } catch (error: any) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypts a base64 string using Windows DPAPI via PowerShell.
     * @param base64 The encrypted data (base64 string).
     * @returns The decrypted data as a Buffer.
     */
    decryptBuffer(base64: string): Buffer {
        try {
            const psCommand = `
                Add-Type -AssemblyName System.Security;
                try {
                    $bytes = [System.Convert]::FromBase64String('${base64}');
                    $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser);
                    [System.Convert]::ToBase64String($dec)
                } catch {
                    exit 1
                }
            `;

            const output = execSync(`powershell -NoProfile -Command "${psCommand.replace(/\r?\n/g, ' ')}"`).toString().trim();
            return Buffer.from(output, 'base64');
        } catch (error: any) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    encryptString(text: string): string {
        return this.encryptBuffer(Buffer.from(text, 'utf-8'));
    }

    decryptToString(base64: string): string {
        return this.decryptBuffer(base64).toString('utf-8');
    }
}

export const secretService = new SecretService();
