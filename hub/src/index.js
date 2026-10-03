'use strict';

const app = require('./app');

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`小诺简录中枢已启动: http://localhost:${port}`);
  if (process.env.MOCK_LLM === '1') console.log('（MOCK_LLM=1，使用内置 mock 模型）');
});
