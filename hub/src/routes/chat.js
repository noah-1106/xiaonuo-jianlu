'use strict';

const express = require('express');
const { chat } = require('../llm/client');

const router = express.Router();

// POST /api/chat/send  { message: "记一下明天要交报告" }
router.post('/send', async (req, res) => {
  const message = String((req.body || {}).message || '').trim();
  if (!message) return res.status(400).json({ error: 'message 不能为空' });
  try {
    const result = await chat(message);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
