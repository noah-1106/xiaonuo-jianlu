'use strict';

// 冒烟测试：MOCK_LLM 模式下跑通"对话 → 工具调用 → 建简录 → 查询"全链路
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MOCK_LLM = '1';
process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xiaonuo-')), 'test.db');

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

test('对话创建简录（mock LLM 全链路）', async () => {
  const resp = await fetch(`${base}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '记一下明天要交季度报告' }),
  });
  assert.strictEqual(resp.status, 200);
  const body = await resp.json();

  // 工具被调用且建出了 todo 类型简录
  assert.strictEqual(body.toolCalls.length, 1);
  assert.strictEqual(body.toolCalls[0].tool, 'createRecord');
  const record = body.toolCalls[0].result.record;
  assert.strictEqual(record.type, 'todo');
  assert.ok(record.title.includes('明天要交季度报告'));
  assert.ok(body.reply.includes(record.title));
});

test('REST 查询刚创建的简录', async () => {
  const list = await fetch(`${base}/api/records?type=todo`).then((r) => r.json());
  assert.strictEqual(list.total, 1);
  assert.strictEqual(list.records[0].status, 'pending');

  const id = list.records[0].id;
  const one = await fetch(`${base}/api/records/${id}`).then((r) => r.json());
  assert.strictEqual(one.record.id, id);

  const search = await fetch(`${base}/api/records/search?keyword=季度`).then((r) => r.json());
  assert.strictEqual(search.records.length, 1);
});

test('REST 更新与删除', async () => {
  const created = await fetch(`${base}/api/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '测试条目', type: 'inspiration', tags: ['测试'] }),
  }).then((r) => r.json());

  const updated = await fetch(`${base}/api/records/${created.record.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed' }),
  }).then((r) => r.json());
  assert.strictEqual(updated.record.status, 'completed');

  const del = await fetch(`${base}/api/records/${created.record.id}`, { method: 'DELETE' });
  assert.strictEqual(del.status, 200);
  const gone = await fetch(`${base}/api/records/${created.record.id}`);
  assert.strictEqual(gone.status, 404);
});

test('健康检查', async () => {
  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  assert.strictEqual(health.ok, true);
});
