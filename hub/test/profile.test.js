'use strict';

// 个人资料接口测试
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MOCK_LLM = '1';
process.env.IMAGES_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xiaonuo-img-')), '');
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xiaonuo-profile-')), 'test.db');

const app = require('../src/app');

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  // 图片写盘目录跟随 DB_PATH 之外，用 hub/data——测试后清理
});

after(() => server.close());

test('资料读写', async () => {
  const empty = await fetch(`${base}/api/profile`).then((r) => r.json());
  assert.strictEqual(empty.nickname, '');
  assert.strictEqual(empty.hasAvatar, false);

  const updated = await fetch(`${base}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '陈一诺', signature: '随时记录' }),
  }).then((r) => r.json());
  assert.strictEqual(updated.profile.nickname, '陈一诺');

  const got = await fetch(`${base}/api/profile`).then((r) => r.json());
  assert.strictEqual(got.signature, '随时记录');
});

test('头像上传生成 96×96 RGB565 并可下载', async () => {
  // 构造 8×8 PNG
  const { Jimp } = require('jimp');
  const img = new Jimp({ width: 8, height: 8, color: 0xff8800ff });
  const png = await img.getBuffer('image/png');

  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'avatar.png');
  const up = await fetch(`${base}/api/profile/avatar`, { method: 'POST', body: form }).then((r) => r.json());
  assert.strictEqual(up.ok, true);
  assert.strictEqual(up.bytes, 96 * 96 * 2);

  const raw = await fetch(`${base}/api/profile/avatar.raw`);
  assert.strictEqual(raw.status, 200);
  const buf = await raw.arrayBuffer();
  assert.strictEqual(buf.byteLength, 96 * 96 * 2);

  const profile = await fetch(`${base}/api/profile`).then((r) => r.json());
  assert.strictEqual(profile.hasAvatar, true);

  // 清理
  await fetch(`${base}/api/profile/avatar`, { method: 'DELETE' });
});

test('二维码上传转黑白 RGB565', async () => {
  const { Jimp } = require('jimp');
  const img = new Jimp({ width: 8, height: 8, color: 0x000000ff });
  const png = await img.getBuffer('image/png');

  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'qr.png');
  const up = await fetch(`${base}/api/profile/qrcode`, { method: 'POST', body: form }).then((r) => r.json());
  assert.strictEqual(up.ok, true);
  assert.strictEqual(up.bytes, 176 * 176 * 2);

  await fetch(`${base}/api/profile/qrcode`, { method: 'DELETE' });
});
