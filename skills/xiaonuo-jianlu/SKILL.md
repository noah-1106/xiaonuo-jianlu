---
name: xiaonuo-jianlu
description: 小诺简录 - AI 简录系统。当用户想记录待办/灵感/文章（"记一下""别忘了""提醒我"）、查看或整理清单（"我的待办""把X标记完成""归档灵感"）时使用。数据存于用户的小诺简录中枢，记录会同步到用户的 AI 卡片和 Web 端。
---

# 小诺简录（xiaonuo-jianlu）

用户的个人 AI 简录系统。通过本 skill 记录和整理的内容会实时同步到用户的 AI 智能卡片和 Web 界面。

## 配置

中枢地址读环境变量 `XIAONUO_HUB_URL`，默认 `http://localhost:3000`。

## 使用方法

所有操作通过 `scripts/` 下的脚本完成（依赖 curl 和 python3）：

### 记录 / 语义整理（首选入口）

```bash
scripts/record.sh "<自然语言>"
```

AI 会自动判断意图：创建（"记一下明天交报告"）、查询（"我有什么待办"）、整理（"把上周的灵感归档""报告那条完成了"）。
输出 AI 确认语和本次涉及的简录。**除非用户明确要求精确操作，一律用这个入口。**

### 查询清单

```bash
scripts/list.sh [--type todo|article|inspiration|other] [--status pending|completed|archived] [--keyword 关键词]
```

输出紧凑列表：`[id] 类型 | 状态 | 标题 | 标签`。

### 勾选完成 / 改状态

```bash
scripts/done.sh <id>              # 标记完成
scripts/done.sh <id> archived     # 归档
```

id 从 list.sh 输出获得。用户说"把X完成了"时优先用 record.sh 让 AI 自己找；找不到再 list + done 两步。

## 行为准则

- 记录类请求直接执行，不要反问确认（系统设计就是"随手记"）
- 执行后用一两句话复述结果（类型、标题），不要说多余的话
- 中枢不可达时如实告知，并提示检查 XIAONUO_HUB_URL 或中枢是否运行
