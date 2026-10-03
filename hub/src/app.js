'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'xiaonuo-hub' }));

app.use('/api/records', require('./routes/records'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/device', require('./routes/device'));

// MCP 端点：Agent 客户端配置一次 URL 即可常驻访问简录工具
require('./mcp').mountMcp(app);

// 静态托管 Web 前端（hub/web 的 Vite 构建产物），放在 API 路由之后
app.use(express.static(path.join(__dirname, '..', 'web', 'dist')));

module.exports = app;
