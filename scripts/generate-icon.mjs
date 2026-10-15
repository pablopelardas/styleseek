/**
 * Generates `media/icon.png`, the Marketplace icon.
 *
 * Kept as a script rather than a committed-and-forgotten binary: the icon is
 * reviewable, tweakable and reproducible. The Marketplace rejects SVG, so the
 * shapes are rasterised here — drawn at 4x and box-downsampled, which is what
 * gives the curves clean edges without pulling in an image library.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 128;
const SCALE = 4;
const S = SIZE * SCALE;

// --- geometry, in 0..1 units of the icon ---------------------------------
const CORNER_RADIUS = 0.22;
const LENS = { x: 0.42, y: 0.4, r: 0.24 };
const STROKE = 0.05;
const HANDLE = { from: 0.7071, to: { x: 0.82, y: 0.8 }, width: 0.062 };
const BARS = [
  { x0: 0.28, x1: 0.56, y: 0.325 },
  { x0: 0.33, x1: 0.56, y: 0.395 },
  { x0: 0.38, x1: 0.56, y: 0.465 },
];
const BAR_HEIGHT = 0.03;

// --- palette --------------------------------------------------------------
const GRADIENT_FROM = [30, 64, 175]; // deep blue
const GRADIENT_TO = [109, 40, 217]; // violet
const FOREGROUND = [255, 255, 255];

const canvas = new Float64Array(S * S * 4);

function blend(x, y, rgb, alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const a = Math.min(1, alpha);
  canvas[i] = canvas[i] * (1 - a) + rgb[0] * a;
  canvas[i + 1] = canvas[i + 1] * (1 - a) + rgb[1] * a;
  canvas[i + 2] = canvas[i + 2] * (1 - a) + rgb[2] * a;
  canvas[i + 3] = Math.min(255, canvas[i + 3] * (1 - a) + 255 * a);
}

/** Signed-distance helpers: negative is inside. */
const sdRoundedBox = (px, py, half, r) => {
  const qx = Math.abs(px - 0.5) - (half - r);
  const qy = Math.abs(py - 0.5) - (half - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

const sdSegment = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
};

/** Converts a signed distance to coverage, antialiased over one pixel. */
const coverage = (distance) => {
  const edge = 0.5 / S;
  return Math.max(0, Math.min(1, 0.5 - distance / (2 * edge)));
};

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S;
    const py = (y + 0.5) / S;

    // Rounded tile with a diagonal gradient.
    const tile = coverage(sdRoundedBox(px, py, 0.5, CORNER_RADIUS));
    if (tile > 0) {
      const t = Math.min(1, Math.max(0, (px + py) / 2));
      blend(
        x,
        y,
        [
          GRADIENT_FROM[0] + (GRADIENT_TO[0] - GRADIENT_FROM[0]) * t,
          GRADIENT_FROM[1] + (GRADIENT_TO[1] - GRADIENT_FROM[1]) * t,
          GRADIENT_FROM[2] + (GRADIENT_TO[2] - GRADIENT_FROM[2]) * t,
        ],
        tile,
      );
    }

    // Magnifier handle, drawn first so the lens ring sits on top of it.
    const hx = LENS.x + LENS.r * HANDLE.from;
    const hy = LENS.y + LENS.r * HANDLE.from;
    const handle = coverage(
      sdSegment(px, py, hx, hy, HANDLE.to.x, HANDLE.to.y) - HANDLE.width / 2,
    );
    blend(x, y, FOREGROUND, handle);

    // Lens ring.
    const ring = coverage(Math.abs(Math.hypot(px - LENS.x, py - LENS.y) - LENS.r) - STROKE / 2);
    blend(x, y, FOREGROUND, ring);

    // Three indented bars: the nesting the extension flattens.
    for (const bar of BARS) {
      const inside = coverage(
        sdSegment(px, py, bar.x0, bar.y, bar.x1, bar.y) - BAR_HEIGHT / 2,
      );
      blend(x, y, FOREGROUND, inside);
    }
  }
}

// --- downsample to the final size ----------------------------------------
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const i = ((y * SCALE + dy) * S + (x * SCALE + dx)) * 4;
        r += canvas[i];
        g += canvas[i + 1];
        b += canvas[i + 2];
        a += canvas[i + 3];
      }
    }
    const n = SCALE * SCALE;
    const o = (y * SIZE + x) * 4;
    pixels[o] = Math.round(r / n);
    pixels[o + 1] = Math.round(g / n);
    pixels[o + 2] = Math.round(b / n);
    pixels[o + 3] = Math.round(a / n);
  }
}

// --- minimal PNG encoder ---------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
// bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'media');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'icon.png');
writeFileSync(outFile, png);

console.log(`icon: ${SIZE}x${SIZE} RGBA, ${png.length} bytes -> ${outFile}`);
