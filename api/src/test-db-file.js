import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const dbFile = resolve(__dirname, '../data/nexus.db');

console.log('Opening file:', dbFile);
const db = new DatabaseSync(dbFile);
console.log('Opened database file successfully');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables present:', tables);
