'use strict';

// ASR 适配器：OpenAI Audio 格式（POST {ASR_BASE_URL}/audio/transcriptions）
// 任何兼容该格式的服务（OpenAI Whisper / Groq / 硅基流动 / 阿里百炼兼容模式…）改配置即可接入

async function transcribe(audioBuffer, filename = 'audio.wav', mime = 'audio/wav') {
  if (process.env.MOCK_ASR === '1') {
    return '记一下明天要交季度报告';
  }
  const baseURL = (process.env.ASR_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = process.env.ASR_API_KEY || '';
  const model = process.env.ASR_MODEL || 'whisper-1';
  // 端点路径可配：OpenAI 系默认 /audio/transcriptions，MiniMax 用 /speech_to_text
  const path = process.env.ASR_PATH || '/audio/transcriptions';
  if (!baseURL || !apiKey) {
    throw new Error('ASR 未配置：请在 .env 中设置 ASR_BASE_URL / ASR_API_KEY / ASR_MODEL（或设 MOCK_ASR=1 使用 mock）');
  }

  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mime }), filename);
  form.append('model', model);

  const resp = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ASR 请求失败 ${resp.status}: ${body.slice(0, 500)}`);
  }
  const data = await resp.json();
  const text = (data.text || '').trim();
  if (!text) throw new Error('没听清，请靠近一点大声些再试');
  return text;
}

module.exports = { transcribe };
