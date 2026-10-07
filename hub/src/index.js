'use strict';

const net = require('net');

const app = require('./app');

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
  console.log(`小诺简录中枢已启动: http://localhost:${port}`);
  if (process.env.MOCK_LLM === '1') console.log('（MOCK_LLM=1，使用内置 mock 模型）');

  // BLE 直连桥:自动拉起原生中继,卡片蓝牙直连同步(无二进制时优雅降级)
  require('./bridge').startBridge(app);

  // mDNS 广播：让卡片在局域网内自动发现中枢（_xiaonuo._tcp）
  // 优先用系统级 responder（完整实现 RFC 6762 §8.1 单播直答，ESP32 在部分路由器下收不到组播应答）：
  // macOS 用 dns-sd，Linux 用 avahi-publish-service；都没有则退回 Node 的 bonjour-service
  if (process.env.DISABLE_MDNS !== '1') {
    advertiseMdns(port);
  }
});

function advertiseMdns(port) {
  const { spawn, spawnSync } = require('child_process');
  const systems = {
    darwin: ['dns-sd', ['-R', 'xiaonuo-hub', '_xiaonuo._tcp', 'local.', String(port)]],
    linux: ['avahi-publish-service', ['xiaonuo-hub', '_xiaonuo._tcp', String(port)]],
  };
  const cmd = systems[process.platform];
  if (cmd) {
    try {
      const child = spawn(cmd[0], cmd[1], { stdio: 'ignore' });
      child.on('error', () => advertiseWithNode(port));
      child.on('exit', (code) => {
        if (code !== null && code !== 0) advertiseWithNode(port);
      });
      process.on('exit', () => child.kill());
      console.log(`mDNS 已广播（系统 ${cmd[0]}）: _xiaonuo._tcp 端口 ${port}`);
      return;
    } catch {
      // 落到 Node 实现
    }
  }
  advertiseWithNode(port);
}

function advertiseWithNode(port) {
  try {
    const { Bonjour } = require('bonjour-service');
    const bonjour = new Bonjour();
    bonjour.publish({ name: 'xiaonuo-hub', type: 'xiaonuo', protocol: 'tcp', port });
    console.log(`mDNS 已广播（bonjour-service）: _xiaonuo._tcp 端口 ${port}`);
  } catch (err) {
    console.warn(`mDNS 广播失败（不影响 HTTP 服务）: ${err.message}`);
  }
}
