// Local photo processing. Everything happens on this computer; nothing is uploaded anywhere.
// Faces are never touched: we only rotate (EXIF), resize and re-encode. No filters on people.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import exifr from 'exifr';
import heicConvert from 'heic-convert';

sharp.cache(false);

export const VARIANTS = ['thumb', 'preview', 'master', 'bg'];

const isHeic = (name) => /\.(heic|heif)$/i.test(name);

async function dhash(img) {
  const { data } = await img.clone().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

async function takenAt(file) {
  try {
    const e = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
    const d = e?.DateTimeOriginal || e?.CreateDate || e?.ModifyDate;
    return d instanceof Date && !isNaN(d) ? d.getTime() : null;
  } catch {
    return null;
  }
}

/**
 * Turn one uploaded file into the variants the editor and the renderer need.
 *  master  - up to 4096 px, JPEG q95 4:4:4 (quality kept for 1080p and 4K export)
 *  preview - 1600 px for the live preview
 *  thumb   - 360 px for the library
 *  bg      - small, blurred, darkened copy used behind photos that are shown whole
 */
export async function processPhoto(dir, id, file, originalName) {
  let input = file;
  if (isHeic(originalName)) {
    const out = await heicConvert({ buffer: fs.readFileSync(file), format: 'JPEG', quality: 0.97 });
    input = Buffer.from(out);
  }
  const base = sharp(input, { failOn: 'none', limitInputPixels: 400e6 }).rotate().toColorspace('srgb');
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const w = swap ? meta.height : meta.width, h = swap ? meta.width : meta.height;

  const write = (variant, pipeline) => pipeline.toFile(path.join(dir, variant, `${id}.jpg`));
  await write('master', base.clone().resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }));
  await write('preview', base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }));
  await write('thumb', base.clone().resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }));
  await write('bg', base.clone().resize({ width: 480, height: 480, fit: 'inside' }).blur(14).modulate({ brightness: 0.62, saturation: 0.85 }).jpeg({ quality: 82 }));

  return {
    w, h,
    takenAt: await takenAt(file),
    hash: await dhash(base),
    lowRes: Math.min(w, h) < 900,
  };
}

export function ensureDirs(dir) {
  for (const d of ['originals', 'audio', 'exports', 'incoming', ...VARIANTS]) fs.mkdirSync(path.join(dir, d), { recursive: true });
}
