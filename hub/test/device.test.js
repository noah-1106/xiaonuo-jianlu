'use strict';

// 设备语音记录接口测试：MOCK_ASR + MOCK_LLM 下验证"音频 → 识别 → 建简录"链路
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MOCK_LLM = '1';
process.env.MOCK_ASR = '1';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xiaonuo-device-')), 'test.db');

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
});

after(() => server.close());

test('原始音频流 POST（固件方式）', async () => {
  const fakeAudio = Buffer.alloc(3200, 1); // 假音频数据
  const resp = await fetch(`${base}/api/device/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: fakeAudio,
  });
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.transcript, '记一下明天要交季度报告');
  assert.strictEqual(body.records.length, 1);
  assert.strictEqual(body.records[0].type, 'todo');
  assert.ok(body.reply.length > 0);
});

test('multipart 上传（浏览器方式）', async () => {
  const form = new FormData();
  form.append('audio', new Blob([Buffer.alloc(3200, 2)], { type: 'audio/wav' }), 'test.wav');
  const resp = await fetch(`${base}/api/device/capture`, { method: 'POST', body: form });
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();
  assert.strictEqual(body.records.length, 1);
});

test('缺少音频返回 400', async () => {
  const resp = await fetch(`${base}/api/device/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.strictEqual(resp.status, 400);
});
