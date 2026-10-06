'use strict';

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const images = require('../images');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/profile —— 卡片主页拉取；图片带版本号(mtime ms)，卡片据此跳过重复下载
router.get('/', (req, res) => {
  const p = db.getProfile();
  const avatar = images.rawPath('avatar');
  const qrcode = images.rawPath('qrcode');
  res.json({
    nickname: p.nickname,
    signature: p.signature,
    hasAvatar: !!avatar,
    hasQrcode: !!qrcode,
    avatarVersion: avatar ? fs.statSync(avatar).mtimeMs : 0,
    qrcodeVersion: qrcode ? fs.statSync(qrcode).mtimeMs : 0,
  });
});

// PUT /api/profile {nickname, signature}
router.put('/', (req, res) => {
  res.json({ profile: db.updateProfile(req.body || {}) });
});

// POST /api/profile/avatar | /api/profile/qrcode（multipart 图片上传）
router.post('/:kind(avatar|qrcode)', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '缺少图片：multipart 字段 image' });
  try {
    const result = await images.processImage(req.params.kind, req.file.buffer);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: `图片处理失败: ${err.message}` });
  }
});

// GET /api/profile/avatar.raw | qrcode.raw —— 卡片拉取 RGB565 原始像素
router.get('/:kind(avatar|qrcode).raw', (req, res) => {
  const p = images.rawPath(req.params.kind);
  if (!p) return res.status(404).json({ error: '未设置' });
  res.set('Content-Type', 'application/octet-stream');
  res.sendFile(p);
});

// GET /api/profile/avatar.preview.png | qrcode.preview.png —— Web 端预览（即卡片上的呈现效果）
router.get('/:kind(avatar|qrcode).preview.png', (req, res) => {
  const p = images.previewPath(req.params.kind);
  if (!p) return res.status(404).json({ error: '未设置' });
  res.set('Content-Type', 'image/png');
  res.sendFile(p);
});

// DELETE /api/profile/avatar | qrcode
router.delete('/:kind(avatar|qrcode)', (req, res) => {
  images.deleteImage(req.params.kind);
  res.json({ ok: true });
});

module.exports = router;
