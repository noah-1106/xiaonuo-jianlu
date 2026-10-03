'use strict';

const app = require('./app');

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`小诺简录中枢已启动: http://localhost:${port}`);
  if (process.env.MOCK_LLM === '1') console.log('（MOCK_LLM=1，使用内置 mock 模型）');

  // mDNS 广播：让卡片在局域网内自动发现中枢（_xiaonuo._tcp）
  if (process.env.DISABLE_MDNS !== '1') {
    try {
      const { Bonjour } = require('bonjour-service');
      const bonjour = new Bonjour();
      bonjour.publish({ name: 'xiaonuo-hub', type: 'xiaonuo', protocol: 'tcp', port });
      console.log(`mDNS 已广播: _xiaonuo._tcp 端口 ${port}`);
    } catch (err) {
      console.warn(`mDNS 广播失败（不影响 HTTP 服务）: ${err.message}`);
    }
  }
});
