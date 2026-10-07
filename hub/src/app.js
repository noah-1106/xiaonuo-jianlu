'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

// 请求日志:定位 Web 端上传问题(记录所有非 GET 请求)
app.use((req, res, next) => {
  if (req.method !== 'GET') console.log(`[req] ${req.method} ${req.url} ct=${req.headers['content-type'] || '-'} @${new Date().toISOString()}`);
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'xiaonuo-hub' }));

app.use('/api/records', require('./routes/records'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/device', require('./routes/device'));
app.use('/api/profile', require('./routes/profile'));

// MCP 端点：Agent 客户端配置一次 URL 即可常驻访问简录工具
require('./mcp').mountMcp(app);

// 静态托管 Web 前端（hub/web 的 Vite 构建产物），放在 API 路由之后
app.use(express.static(path.join(__dirname, '..', 'web', 'dist')));

module.exports = app;
