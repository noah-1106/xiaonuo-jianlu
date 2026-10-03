'use strict';

const express = require('express');
const multer = require('multer');
const { transcribe } = require('../llm/asr');
const { chat } = require('../llm/client');

const router = express.Router();

// 两种上传方式：
// 1. multipart/form-data，字段名 audio（电脑/手机端方便）
// 2. 原始音频流直接 POST，Content-Type 为 audio/* 或 application/octet-stream（ESP32 固件最省事）
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const rawAudio = express.raw({ type: ['audio/*', 'application/octet-stream'], limit: 5 * 1024 * 1024 });

const MIME_BY_EXT = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.webm': 'audio/webm' };

// 卡片小屏适配：去 emoji/markdown、压空白、超长截断（模型不一定守规矩，服务端做确定性兜底）
const CARD_REPLY_MAX = 50;
function sanitizeForCard(text) {
  let s = String(text || '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}\u{2700}-\u{27BF}✅📌🆕]/gu, '');
  s = s.replace(/[*#`>\[\]]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > CARD_REPLY_MAX) s = s.slice(0, CARD_REPLY_MAX) + '…';
  return s;
}

// POST /api/device/capture —— 语音记录入口：音频 → ASR → 对话管线 → 建/整理简录
router.post('/capture', (req, res, next) => {
  if (req.is('multipart/form-data')) upload.single('audio')(req, res, next);
  else rawAudio(req, res, next);
}, async (req, res) => {
  try {
    let buffer; let filename = 'audio.wav'; let mime = 'audio/wav';

    if (req.file) {
      buffer = req.file.buffer;
      filename = req.file.originalname || filename;
      mime = req.file.mimetype || mime;
    } else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      buffer = req.body;
      mime = req.get('Content-Type') || mime;
    } else {
      return res.status(400).json({ error: '缺少音频：multipart 字段 audio 或原始音频流' });
    }

    const transcript = await transcribe(buffer, filename, mime);
    const result = await chat(transcript, { brief: true });

    // 返回给设备的紧凑结果：识别文字 + AI 确认 + 本次涉及的简录
    const records = result.toolCalls
      .map((t) => t.result && t.result.record)
      .filter(Boolean);
    res.json({ transcript, reply: sanitizeForCard(result.reply), records });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
