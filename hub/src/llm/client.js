'use strict';

const db = require('../db');
const { buildSystemPrompt } = require('./prompt');
const { toolSchemas, executeTool } = require('./tools');
const { callMockLLM } = require('./mock');

const MAX_TOOL_ROUNDS = 5;

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
      db.saveMessage('assistant', reply);
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
