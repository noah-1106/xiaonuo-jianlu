import type { RecordItem } from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || `请求失败: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export interface RecordListResult {
  total: number
  page: number
  pageSize: number
  records: RecordItem[]
}

export const recordsApi = {
  list: (pageSize = 100) => request<RecordListResult>(`/records?pageSize=${pageSize}`),
  update: (id: number, updates: Partial<RecordItem>) =>
    request<{ record: RecordItem }>(`/records/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  remove: (id: number) => request<{ ok: boolean }>(`/records/${id}`, { method: 'DELETE' }),
  create: (data: Partial<RecordItem>) =>
    request<{ record: RecordItem }>('/records', { method: 'POST', body: JSON.stringify(data) })
}

export interface ChatSendResult {
  reply: string
  toolCalls?: Array<{ tool: string; args: unknown; result: unknown }>
}

export const chatApi = {
  send: (message: string) =>
    request<ChatSendResult>('/chat/send', { method: 'POST', body: JSON.stringify({ message }) })
}
