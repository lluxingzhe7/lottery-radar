import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const DATA_DIR = process.env.RADAR_HOME ? path.resolve(process.env.RADAR_HOME) : path.join(ROOT, 'data');
export const DB_FILE = path.join(DATA_DIR, 'activities.json');
export const CONFIG_FILE = path.join(ROOT, 'config', 'settings.json');
