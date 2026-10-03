'use strict';

const db = require('../db');

// OpenAI tools 格式的 7 个简录工具（移植自 xiaonuo-assistant 的 function calling 设计）
const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'createRecord',
      description: '创建一条简录。当用户想记录待办、灵感、文章或任何信息时使用。根据内容自动判断类型：todo（待办事项）、article（文章/链接）、inspiration（灵感想法）、other（其他）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '简录标题，简明扼要' },
          content: { type: 'string', description: '简录详细内容' },
          type: { type: 'string', enum: db.RECORD_TYPES, description: '简录类型' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
          link: { type: 'string', description: '相关链接（如有）' },
        },
        required: ['title', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecordList',
      description: '按条件查询简录列表，支持按类型、状态、标签过滤和分页。',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: db.RECORD_TYPES },
          status: { type: 'string', enum: db.RECORD_STATUS },
          tag: { type: 'string', description: '按单个标签过滤' },
          page: { type: 'integer', default: 1 },
          pageSize: { type: 'integer', default: 20 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecord',
      description: '获取单条简录的详情。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateRecord',
      description: '更新简录，可修改标题、内容、类型、状态（pending 待处理 / completed 已完成 / archived 已归档）、标签等。用户说"完成""归档""打标签"时使用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string', enum: db.RECORD_TYPES },
          status: { type: 'string', enum: db.RECORD_STATUS },
          tags: { type: 'array', items: { type: 'string' } },
          link: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteRecord',
      description: '删除一条简录。仅在用户明确要求删除时使用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecentRecords',
      description: '获取最近创建的简录。',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', default: 10 } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchRecords',
      description: '按关键词在标题、摘要、内容中搜索简录。',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' } },
        required: ['keyword'],
      },
    },
  },
];

function executeTool(name, args = {}) {
  switch (name) {
    case 'createRecord':
      return { ok: true, record: db.createRecord(args) };
    case 'getRecordList':
      return { ok: true, ...db.listRecords(args) };
    case 'getRecord': {
      const record = db.getRecord(args.id);
      return record ? { ok: true, record } : { ok: false, error: '简录不存在' };
    }
    case 'updateRecord': {
      const { id, ...fields } = args;
      const record = db.updateRecord(id, fields);
      return record ? { ok: true, record } : { ok: false, error: '简录不存在' };
    }
    case 'deleteRecord':
      return db.deleteRecord(args.id) ? { ok: true } : { ok: false, error: '简录不存在' };
    case 'getRecentRecords':
      return { ok: true, records: db.getRecentRecords(args.limit) };
    case 'searchRecords':
      return { ok: true, records: db.searchRecords(args.keyword) };
    default:
      return { ok: false, error: `未知工具: ${name}` };
  }
}

module.exports = { toolSchemas, executeTool };
