'use strict';

const db = require('../db');
const { buildSystemPrompt } = require('./prompt');
const { toolSchemas, executeTool } = require('./tools');
const { callMockLLM } = require('./mock');

const MAX_TOOL_ROUNDS = 5;

// 把工具调用压成一行摘要，供写入对话上下文（如 createRecord「牙医复诊」#2; updateRecord #2 → completed）
function summarizeToolCalls(toolCalls) {
  return toolCalls.map((t) => {
    const r = t.result && t.result.record;
    if (r) {
      const extras = [];
      if (t.tool === 'createRecord') extras.push(`「${r.title}」`);
      extras.push(`#${r.id}`);
      if (t.tool === 'updateRecord') extras.push(`→ ${r.status}`);
      if (t.tool === 'deleteRecord') extras.push('已删除');
      return `${t.tool} ${extras.join(' ')}`;
    }
    if (t.result && Array.isArray(t.result.records)) return `${t.tool} ${t.result.records.length} 条`;
    return t.tool;
  }).join('; ');
}

function llmConfig() {
  const baseURL = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
  return { baseURL, apiKey: process.env.LLM_API_KEY || '', model: process.env.LLM_MODEL || '' };
}

async function callLLM(messages, tools) {
  if (process.env.MOCK_LLM === '1') {
    return callMockLLM(messages, tools);
  }
  const { baseURL, apiKey, model } = llmConfig();
  if (!baseURL || !apiKey || !model) {
    throw new Error('LLM 未配置：请在 .env 中设置 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（或设 MOCK_LLM=1 使用 mock）');
  }
  const resp = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`LLM 请求失败 ${resp.status}: ${body.slice(0, 500)}`);
  }
  return resp.json();
}

// 对话主管线：用户消息 → LLM + function calling 循环 → 最终回复
async function chat(userText) {
  const messages = [{ role: 'system', content: buildSystemPrompt() }];
  messages.push(...db.loadRecentMessages(10));
  messages.push({ role: 'user', content: userText });

  const toolCalls = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await callLLM(messages, toolSchemas);
    const msg = resp.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = msg.content || '';
      db.saveMessage('user', userText);
      // 上下文里同时记录工具执行摘要，否则后续轮次模型看不到自己做过什么，会对历史状态产生困惑
      const note = toolCalls.length ? `\n\n[本轮已执行: ${summarizeToolCalls(toolCalls)}]` : '';
      db.saveMessage('assistant', reply + note);
      return { reply, toolCalls };
    }

    for (const call of msg.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      const result = executeTool(call.function.name, args);
      toolCalls.push({ tool: call.function.name, args, result });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return { reply: '处理步骤过多，请换个说法再试一次。', toolCalls };
}

module.exports = { chat };
