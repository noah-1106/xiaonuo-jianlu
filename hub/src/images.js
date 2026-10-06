'use strict';

const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');
const { intToRGBA } = require('@jimp/utils');

const dataDir = path.join(__dirname, '..', 'data');

// 图片转 RGB565 原始像素（小端 uint16，卡片 LVGL 直接可用）
async function toRgb565(img, size) {
  const out = Buffer.alloc(size * size * 2);
  for (let i = 0; i < size * size; i++) {
    const { r, g, b } = intToRGBA(img.getPixelColor(i % size, Math.floor(i / size)));
    const v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    out.writeUInt16LE(v, i * 2);
  }
  return out;
}

// 头像：96×96 RGB565；二维码：176×176 彩色 RGB565（微信花式二维码原样保留）
async function processImage(kind, buffer) {
  const spec = kind === 'avatar'
    ? { size: 96, file: 'avatar.rgb565', preview: 'avatar.preview.png' }
    : { size: 176, file: 'qrcode.rgb565', preview: 'qrcode.preview.png' };
  const img = await Jimp.read(buffer);
  img.resize({ w: spec.size, h: spec.size });
  await img.write(path.join(dataDir, spec.preview));
  const out = await toRgb565(img, spec.size);
  fs.writeFileSync(path.join(dataDir, spec.file), out);
  return { size: spec.size, bytes: out.length };
}

function rawPath(kind) {
  const file = kind === 'avatar' ? 'avatar.rgb565' : 'qrcode.rgb565';
  const p = path.join(dataDir, file);
  return fs.existsSync(p) ? p : null;
}

function previewPath(kind) {
  const file = kind === 'avatar' ? 'avatar.preview.png' : 'qrcode.preview.png';
  const p = path.join(dataDir, file);
  return fs.existsSync(p) ? p : null;
}

function deleteImage(kind) {
  for (const p of [rawPath(kind), previewPath(kind)]) {
    if (p) fs.unlinkSync(p);
  }
}

module.exports = { processImage, rawPath, previewPath, deleteImage };
