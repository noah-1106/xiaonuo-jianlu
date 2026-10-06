'use strict';

const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');
const { intToRGBA } = require('@jimp/utils');

const dataDir = path.join(__dirname, '..', 'data');

// 图片转 RGB565 原始像素（小端 uint16，卡片 LVGL 直接可用）
async function toRgb565(buffer, size, { monochrome = false } = {}) {
  const img = await Jimp.read(buffer);
  img.resize({ w: size, h: size });
  const out = Buffer.alloc(size * size * 2);
  for (let i = 0; i < size * size; i++) {
    let { r, g, b } = intToRGBA(img.getPixelColor(i % size, Math.floor(i / size)));
    if (monochrome) {
      // 二维码：灰度阈值压成纯黑白，屏幕上扫码最可靠
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const on = lum > 128;
      r = g = b = on ? 255 : 0;
    }
    const v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    out.writeUInt16LE(v, i * 2);
  }
  return out;
}

// 头像：96×96 RGB565；二维码：176×176 黑白 RGB565
async function processImage(kind, buffer) {
  const spec = kind === 'avatar'
    ? { size: 96, file: 'avatar.rgb565' }
    : { size: 176, file: 'qrcode.rgb565', monochrome: true };
  const raw = await toRgb565(buffer, spec.size, { monochrome: spec.monochrome });
  fs.writeFileSync(path.join(dataDir, spec.file), raw);
  return { size: spec.size, bytes: raw.length };
}

function rawPath(kind) {
  const file = kind === 'avatar' ? 'avatar.rgb565' : 'qrcode.rgb565';
  const p = path.join(dataDir, file);
  return fs.existsSync(p) ? p : null;
}

function deleteImage(kind) {
  const p = rawPath(kind);
  if (p) fs.unlinkSync(p);
}

module.exports = { processImage, rawPath, deleteImage };
