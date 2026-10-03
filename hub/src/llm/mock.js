'use strict';

// 内置 mock LLM：无 API key 时跑通"对话 → createRecord → 确认"全链路，供开发和测试使用。

function guessType(text) {
  if (/文章|链接|http/.test(text)) return 'article';
  if (/灵感|想法|点子/.test(text)) return 'inspiration';
  if (/待办|提醒|明天|下周|记得|要[去做]|别忘/.test(text)) return 'todo';
  return 'other';
}

// 返回与 OpenAI Chat Completions 相同结构的响应
function callMockLLM(messages, tools) {
  const last = messages[messages.length - 1];

  // 第二轮：工具已返回结果，生成确认文案
  if (last.role === 'tool') {
    const result = JSON.parse(last.content);
    const r = result.record;
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: r ? `已帮你记录【${r.type}】${r.title}` : '好的，已处理。',
        },
        finish_reason: 'stop',
      }],
    };
  }

  // 第一轮：固定调用 createRecord
  const text = String(last.content || '');
  const title = text.replace(/^(帮我|请|记一下|记录|别忘了|提醒我)[，,]?\s*/, '').slice(0, 30) || '未命名简录';
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: `mock_call_${Date.now()}`,
          type: 'function',
          function: {
            name: 'createRecord',
            arguments: JSON.stringify({ title, content: text, type: guessType(text) }),
          },
        }],
      },
      finish_reason: 'tool_calls',
    }],
  };
}

module.exports = { callMockLLM };
