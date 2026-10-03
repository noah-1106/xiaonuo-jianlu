'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/records?type=&status=&tag=&page=&pageSize=
router.get('/', (req, res) => {
  const { type, status, tag } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  res.json(db.listRecords({ type, status, tag, page, pageSize }));
});

router.get('/recent', (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 10);
  res.json({ records: db.getRecentRecords(limit) });
});

router.get('/search', (req, res) => {
  const keyword = String(req.query.keyword || '').trim();
  if (!keyword) return res.status(400).json({ error: '缺少 keyword 参数' });
  res.json({ records: db.searchRecords(keyword) });
});

router.get('/:id', (req, res) => {
  const record = db.getRecord(Number(req.params.id));
  if (!record) return res.status(404).json({ error: '简录不存在' });
  res.json({ record });
});

router.post('/', (req, res) => {
  const { title, content, type, tags, link, startTime, endTime } = req.body || {};
  if (!title && !content) return res.status(400).json({ error: 'title 或 content 至少提供一个' });
  const record = db.createRecord({ title, content, type, tags, link, startTime, endTime });
  res.status(201).json({ record });
});

router.put('/:id', (req, res) => {
  const record = db.updateRecord(Number(req.params.id), req.body || {});
  if (!record) return res.status(404).json({ error: '简录不存在' });
  res.json({ record });
});

router.delete('/:id', (req, res) => {
  if (!db.deleteRecord(Number(req.params.id))) return res.status(404).json({ error: '简录不存在' });
  res.json({ ok: true });
});

module.exports = router;
