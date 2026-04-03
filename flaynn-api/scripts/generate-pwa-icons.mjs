/**
 * Génère public/icons/icon-192.png et icon-512.png à partir de public/favicon.svg
 * Usage : npm run build:icons (depuis flaynn-api/)
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const svgPath = join(root, 'public', 'favicon.svg');
const outDir = join(root, 'public', 'icons');

const svg = await readFile(svgPath);

await sharp(svg).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'));

console.log('PWA icons OK → public/icons/icon-192.png, icon-512.png');
