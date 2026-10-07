'use strict';

// BLE 直连同步引擎:拉起原生中继(xiaonuo-ble-relay),实现与卡片的同步协议。
// 中继只做"蓝牙字节 ⇄ stdio";协议与 HTTP 都在这里(单一实现)。
// 协议语义与卡片端 jianlu_dlink_codec 对应,与 hub REST API 一致。

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const NUS_CHUNK_RECORDS = 2;   // 每块推 2 条简录
const REQUEST_TIMEOUT = 10000;
const VOICE_TIMEOUT = 300000;  // 语音槽 535 块 ≈ 75s,给足余量

const state = {
  relay: null,          // 子进程
  connected: false,     // 卡片已连接(收到 ready)
  syncing: false,
  lastSync: null,
  lastError: null,
  restartTimer: null,
};

// ---------- 平台二进制 ----------
function relayBinary() {
  const map = {
    'darwin_arm64': 'xiaonuo-ble-relay-darwin-arm64',
    'darwin_x64': 'xiaonuo-ble-relay-darwin-x64',
    'linux_x64': 'xiaonuo-ble-relay-linux-x64',
    'linux_arm64': 'xiaonuo-ble-relay-linux-arm64',
    'win32_x64': 'xiaonuo-ble-relay-win-x64.exe',
  };
  const key = `${process.platform}_${process.arch}`;
  const name = map[key];
  if (!name) return null;
  const p = path.join(__dirname, '..', 'bin', name);
  return fs.existsSync(p) ? p : null;
}

// ---------- 协议层 ----------
const lineBuf = Buffer.alloc(0);
const waiters = [];      // {want, resolve, reject, timer}
const feeders = [];      // (msg) => bool,语音分块收集

function send(obj) {
  if (!state.relay || !state.relay.stdin.writable) return;
  state.relay.stdin.write(JSON.stringify(obj) + '\n');
}

function request(line, want = null, timeout = REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const w = { want, resolve, reject };
    w.timer = setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) waiters.splice(i, 1);
      reject(new Error(`请求超时: ${JSON.stringify(line).slice(0, 60)}`));
    }, timeout);
    waiters.push(w);
    send(line);
  });
}

function onMessage(msg) {
  for (const f of feeders) {
    if (f(msg)) return;
  }
  for (let i = 0; i < waiters.length; i++) {
    const w = waiters[i];
    if (!w.want || msg[w.want[0]] === w.want[1]) {
      waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(msg);
      return;
    }
  }
  // 未请求的通知
  if (msg.r === 'ready') onCardReady(msg);
  else if (msg.c === 'sync') {
    console.log('[桥] 卡片请求同步');
    runSync();
  }
  else console.log(`[桥] 未请求的通知: ${JSON.stringify(msg).slice(0, 100)}`);
}

// ---------- 同步流程(与原 ble-bridge.py 等价) ----------
async function runSync() {
  if (state.syncing) return;
  state.syncing = true;
  const hub = `http://localhost:${process.env.PORT || 3000}`;
  try {
    // 1) 推清单
    const data = await fetch(`${hub}/api/records?status=pending&pageSize=20`).then((r) => r.json());
    const records = data.records || [];
    const total = Math.max(1, Math.ceil(records.length / NUS_CHUNK_RECORDS));
    if (!records.length) await request({ c: 'reset' });
    for (let seq = 0; seq < total; seq++) {
      const chunk = records.slice(seq * NUS_CHUNK_RECORDS, (seq + 1) * NUS_CHUNK_RECORDS);
      await request({ c: 'records', total, seq, records: chunk }, ['r', 'ok']);
    }
    console.log(`[桥] 清单推送完成: ${records.length} 条 / ${total} 块`);

    // 2) 勾选同步
    const plist = await request({ c: 'plist' });
    for (const id of plist.ids || []) {
      await fetch(`${hub}/api/records/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      await request({ c: 'pdone', id: String(id) });
      console.log(`[桥] 勾选已同步: ${id}`);
    }

    // 3) 离线语音:逐槽收集分块 → WAV → 中枢 → vdel
    const vlist = await request({ c: 'vlist' });
    for (const slot of vlist.slots || []) {
      const pcm = await collectVoice(slot);
      const wav = wavFromPcm(pcm);
      const resp = await fetch(`${hub}/api/device/capture`, {
        method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav,
      });
      if (!resp.ok) {
        // 中枢已应答=内容被判定无效(如静音),重试无意义,删除槽位
        // (与 Wi-Fi 路径语义一致);仅网络层失败(fetch 抛异常)才保留重试
        console.log(`[桥] 槽 ${slot} 中枢 ${resp.status}(内容被拒),删除槽位`);
        await request({ c: 'vdel', slot }, ['r', 'ok']);
        continue;
      }
      const result = await resp.json().catch(() => ({}));
      console.log(`[桥] 语音槽 ${slot}: ${pcm.length}B → ${JSON.stringify(result).slice(0, 80)}`);
      await request({ c: 'vdel', slot }, ['r', 'ok']);
    }
    state.lastSync = new Date().toISOString();
    console.log('[桥] 同步完成');
  } catch (e) {
    state.lastError = String(e.message);
    console.log(`[桥] 同步中断: ${e.message}`);
  } finally {
    state.syncing = false;
  }
}

function collectVoice(slot) {
  return new Promise((resolve, reject) => {
    let last = -1;
    const chunks = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`语音槽 ${slot} 收集超时`));
    }, VOICE_TIMEOUT);
    const feed = (msg) => {
      if (msg.r !== 'vc' || msg.slot !== slot) return false;
      if (msg.seq === last + 1) {
        chunks.push(Buffer.from(msg.data, 'base64'));
        last = msg.seq;
      }
      if (last + 1 >= msg.total) {
        cleanup();
        resolve(Buffer.concat(chunks));
      }
      return true;
    };
    function cleanup() {
      clearTimeout(timer);
      const i = feeders.indexOf(feed);
      if (i >= 0) feeders.splice(i, 1);
    }
    feeders.push(feed);
    send({ c: 'vget', slot });
  });
}

function wavFromPcm(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);        // PCM
  header.writeUInt16LE(1, 22);        // mono
  header.writeUInt32LE(16000, 24);    // 采样率
  header.writeUInt32LE(32000, 28);    // 字节率
  header.writeUInt16LE(2, 32);        // 块对齐
  header.writeUInt16LE(16, 34);       // 位深
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function onCardReady(msg) {
  state.connected = true;
  console.log(`[桥] 卡片就绪: 清单 ${msg.cnt} 条`);
  runSync();
}

// ---------- 中继生命周期 ----------
function startBridge(app) {
  if (process.env.DISABLE_BLE_BRIDGE === '1') return;
  const bin = relayBinary();
  if (!bin) {
    console.log('[桥] 本平台无原生中继二进制,蓝牙直连不可用(Wi-Fi 不受影响)');
    return;
  }
  spawnRelay(bin);
  // 状态端点
  app.get('/api/bridge/status', (req, res) => {
    res.json({ running: !!state.relay, connected: state.connected,
               syncing: state.syncing, lastSync: state.lastSync, lastError: state.lastError });
  });
}

function spawnRelay(bin) {
  console.log('[桥] 启动原生中继');
  const relay = spawn(bin, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  state.relay = relay;
  state.connected = false;

  let buf = Buffer.alloc(0);
  relay.stdout.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    let pos;
    while ((pos = buf.indexOf(10)) >= 0) {
      const line = buf.slice(0, pos);
      buf = buf.slice(pos + 1);
      if (!line.length) continue;
      try {
        onMessage(JSON.parse(line.toString('utf8')));
      } catch {
        console.log(`[桥] 无法解析: ${line.toString('utf8').slice(0, 80)}`);
      }
    }
  });
  relay.on('exit', (code) => {
    state.relay = null;
    state.connected = false;
    waiters.forEach((w) => { clearTimeout(w.timer); w.reject(new Error('中继退出')); });
    waiters.length = 0;
    feeders.length = 0;
    console.log(`[桥] 中继退出(code=${code}),5s 后重启`);
    state.restartTimer = setTimeout(() => spawnRelay(bin), 5000);
  });
}

module.exports = { startBridge };
