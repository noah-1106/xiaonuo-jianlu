# 小诺简录（xiaonuo-jianlu）

把"对话即清单"搬到 AI 智能卡片上：**随时记录、随机整理**。

对着卡片（或 Web、或任何接入的 Agent）说一句话，AI 自动归类成简录卡片；
清单在卡片屏幕、手机/电脑浏览器之间实时同步。记录和整理不依赖手机电脑在场——
卡片独立联网工作，断网时录音存本地、联网自动补传。

```
┌─ AI Passport 卡片（固件）──────────┐
│ 堆叠卡片 UI · 按住说话 · 离线队列    │
└──────────────┬─────────────────────┘
               │ HTTP（局域网）
┌──────────────▼─── 中枢（hub/）──────────────┐
│ Express + SQLite 单进程，npm start 即跑       │
│ ASR/LLM：OpenAI 兼容格式云 API（可换 provider）│
│ function calling 自动记录/整理                │
│ 托管 Web 界面（hub/web）                      │
└──────────────┬───────────────────────────────┘
               │
   Web 端（浏览器） · Agent 端（skills/）
```

## 仓库结构

| 目录 | 说明 |
|---|---|
| `hub/` | 轻量中枢：API + ASR/LLM 适配 + SQLite 存储 |
| `hub/web/` | Web 界面（React + antd，移植自 xiaonuo-assistant 的简录卡片页面），由中枢托管 |
| `skills/xiaonuo-jianlu/` | Agent Skill：让任何 AI Agent 都能记录/查询/整理简录 |
| 固件 | 独立仓库：[ai-passport](https://github.com/folotoy/ai-passport) 的 fork，`feature/xiaonuo-jianlu` 分支 |

## 快速开始

```bash
cd hub
npm install
cp .env.example .env   # 填入 LLM key（任何 OpenAI 兼容服务）和 ASR key
cd web && npm install && npm run build && cd ..   # 构建 Web 界面（中枢托管 dist/）
npm start              # http://localhost:3000
```

没有 key 可先体验全链路（内置 mock）：`MOCK_LLM=1 MOCK_ASR=1 npm start`

```bash
curl -X POST http://localhost:3000/api/chat/send \
  -H 'Content-Type: application/json' \
  -d '{"message": "记一下明天要交季度报告"}'
```

## API

| 接口 | 说明 |
|---|---|
| `POST /api/chat/send` | 对话入口，AI 自动记录/整理 |
| `POST /api/device/capture` | 语音记录：音频 → ASR → 建/整理简录（原始音频流或 multipart） |
| `GET /api/records` | 列表（type/status/tag/分页） · `GET /api/records/recent` · `GET /api/records/search?keyword=` |
| `POST /api/records` · `PUT /api/records/:id` · `DELETE /api/records/:id` | 手动 CRUD |
| `GET /api/health` | 健康检查 |

## 简录数据模型

| 字段 | 说明 |
|---|---|
| title / content / summary | 标题 / 内容 / 摘要 |
| type | `todo` 待办 / `article` 文章 / `inspiration` 灵感 / `other` 其他 |
| status | `pending` 待处理 / `completed` 已完成 / `archived` 已归档 |
| tags / link / startTime / endTime | 标签、链接、起止时间 |

## Agent Skill

```bash
cp -R skills/xiaonuo-jianlu ~/.claude/skills/   # Claude Code
```

其他 Agent 直接读 `skills/xiaonuo-jianlu/SKILL.md`（脚本仅依赖 curl + python3）。
中枢地址用 `XIAONUO_HUB_URL` 环境变量指定。

## LLM / ASR 配置

均走 OpenAI 兼容格式，改 `.env` 即可换 provider：

- LLM：`LLM_BASE_URL / LLM_API_KEY / LLM_MODEL`（豆包/DeepSeek/MiniMax/OpenAI…）
- ASR：`ASR_BASE_URL / ASR_API_KEY / ASR_MODEL [/ ASR_PATH]`（OpenAI Whisper/Groq/硅基流动/MiniMax…）
