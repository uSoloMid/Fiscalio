import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../fiscalio.db');
export const db = new Database(dbPath);

// Initialize schema
const schema = `
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rfc TEXT UNIQUE NOT NULL,
    name TEXT,
    fiel_cer_path TEXT,
    fiel_key_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS secrets (
    client_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, kind),
    FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sat_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    sat_request_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'issued' | 'received'
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    status TEXT NOT NULL, -- 'created', 'accepted', 'in_progress', 'finished', 'rejected', 'error'
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (client_id, sat_request_id),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS sat_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    sat_request_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (sat_request_id, package_id),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    client_id INTEGER PRIMARY KEY,
    is_running BOOLEAN DEFAULT 0,
    last_success_at DATETIME,
    last_attempt_at DATETIME,
    last_error TEXT,
    next_run_at DATETIME,
    status TEXT CHECK(status IN ('OK', 'LENTO', 'ERROR')),
    retry_count INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    direction TEXT CHECK(direction IN ('received', 'issued')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    window_from DATETIME,
    window_to DATETIME,
    result TEXT CHECK(result IN ('OK', 'ERROR')),
    new_count INTEGER DEFAULT 0,
    updated_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    uuid TEXT PRIMARY KEY,
    client_id INTEGER NOT NULL,
    direction TEXT CHECK(direction IN ('received', 'issued')),
    type TEXT,
    emitter_name TEXT,
    emitter_rfc TEXT,
    receiver_name TEXT,
    receiver_rfc TEXT,
    issue_date DATETIME,
    stamp_date DATETIME,
    total REAL,
    iva REAL,
    currency TEXT,
    payment_method TEXT,
    payment_form TEXT,
    status TEXT,
    source TEXT CHECK(source IN ('SAT', 'IMPORT')),
    raw_path TEXT,
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_status_change_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS invoice_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    code TEXT,
    severity TEXT CHECK(severity IN ('critical', 'warn', 'info')),
    title TEXT,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uuid) REFERENCES invoices(uuid)
  );
`;

db.exec(schema);

// Idempotent migrations for existing clients table (if needed)
try { db.prepare('ALTER TABLE clients ADD COLUMN name TEXT').run(); } catch (e) { }
try { db.prepare('ALTER TABLE clients ADD COLUMN fiel_cer_path TEXT').run(); } catch (e) { }
try { db.prepare('ALTER TABLE clients ADD COLUMN fiel_key_path TEXT').run(); } catch (e) { }

// Migrations for sat_requests (Package-First Logic)
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN state TEXT DEFAULT 'created'").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN sat_status TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN attempts INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN package_count INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN last_check_at DATETIME").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN downloaded_at DATETIME").run(); } catch (e) { }
try { db.prepare("ALTER TABLE sat_requests ADD COLUMN expires_at DATETIME").run(); } catch (e) { }

// Data migration: Set initial state for existing records
try {
  db.prepare("UPDATE sat_requests SET sat_status = status WHERE sat_status IS NULL").run();
  db.prepare("UPDATE sat_requests SET state = 'polling' WHERE status = 'in_progress' AND state = 'created'").run();
  db.prepare("UPDATE sat_requests SET state = 'completed' WHERE status = 'finished' AND state = 'created'").run();
  // Set default expiration for existing active requests (24h from now)
  db.prepare("UPDATE sat_requests SET expires_at = params.expiry WHERE state IN ('created', 'polling') AND expires_at IS NULL").run({ expiry: new Date(Date.now() + 86400000).toISOString() });
} catch (e) { }
