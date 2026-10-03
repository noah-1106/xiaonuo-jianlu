'use strict';

// MCP（Model Context Protocol）端点：把 7 个简录工具暴露给任何 MCP 客户端。
// 复用 llm/tools.js 的 schema 与 executeTool，协议层仅此一处。

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { toolSchemas, executeTool } = require('./llm/tools');

// OpenAI tools schema → MCP inputSchema（结构本就同构，剥掉外壳即可）
const mcpTools = toolSchemas.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  inputSchema: t.function.parameters,
}));

function createMcpServer() {
  const server = new Server(
    { name: 'xiaonuo-jianlu', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = executeTool(name, args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: result.ok === false,
    };
  });

  return server;
}

// 挂载到 Express：无状态模式（每请求一个新 transport，适合中枢这种单进程服务）
function mountMcp(app, path = '/mcp') {
  app.post(path, async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.get(path, (req, res) => {
    res.status(405).json({ error: '无状态 MCP 端点，请用 POST' });
  });
}

module.exports = { mountMcp };
