// Copies face-api model weights from node_modules into public/models
// so the browser can load them without any external CDN (offline-safe demo).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@vladmandic', 'face-api', 'model');
const dest = join(root, 'public', 'models');

if (!existsSync(src)) {
  console.warn('[copy-models] face-api model folder not found, skipping:', src);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[copy-models] copied face-api models -> public/models');
