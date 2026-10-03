// 简录类型定义（对齐中枢 API 返回格式）
export interface RecordItem {
  id: number
  title?: string
  content: string
  summary?: string
  type: 'article' | 'todo' | 'inspiration' | 'other'
  status: 'pending' | 'completed' | 'archived'
  tags: string[]
  link?: string
  createdAt: string
  updatedAt: string
  startTime?: string | null
  endTime?: string | null
}

// 聊天消息
export interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  toolCalls?: Array<{ tool: string; args: unknown; result: unknown }>
}
