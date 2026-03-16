import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH_DIR = path.join(__dirname, '..', '.auth');

export const PLAYER_AUTH_FILES = [
  path.join(AUTH_DIR, 'player-0.json'),
  path.join(AUTH_DIR, 'player-1.json'),
  path.join(AUTH_DIR, 'player-2.json'),
];

export const USERS_META_FILE = path.join(AUTH_DIR, 'users.json');
