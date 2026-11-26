// Rasterizes public/logo.png into the favicon/PWA PNG set.
// Usage: npm run icons
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = path.join(root, 'public', 'logo.png');
const outDir = path.join(root, 'public');

// Rasterized icons bake in the SVG's drop-shadow, so we render at 2x and
// downscale for crisp edges. The 512 viewBox has ~24px of padding around the
// artwork, which keeps the shadow from clipping at small sizes.
const jobs = [
  // Transparent favicons
  { file: 'favicon-16x16.png', size: 16, background: null },
  { file: 'favicon-32x32.png', size: 32, background: null },
  { file: 'favicon-48x48.png', size: 48, background: null },
  // Opaque icons (iOS ignores alpha; PWA maskable needs a safe background)
  { file: 'apple-touch-icon.png', size: 180, background: '#111319' },
  { file: 'icon-192.png', size: 192, background: '#111319' },
  { file: 'icon-512.png', size: 512, background: '#111319' },
];

await mkdir(outDir, { recursive: true });

for (const { file, size, background } of jobs) {
  let pipeline = sharp(logoPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png();
  if (background) {
    pipeline = sharp(logoPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .flatten({ background })
      .png();
  }
  await pipeline.toFile(path.join(outDir, file));
  console.log(`wrote public/${file} (${size}x${size}${background ? ', ' + background : ', transparent'})`);
}
