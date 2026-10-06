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

export interface Profile {
  nickname: string
  signature: string
  hasAvatar: boolean
  hasQrcode: boolean
}

async function uploadImage(kind: 'avatar' | 'qrcode', file: File): Promise<void> {
  const form = new FormData()
  form.append('image', file)
  const res = await fetch(`${BASE}/profile/${kind}`, { method: 'POST', body: form })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || `上传失败: ${res.status}`)
  }
}

export const profileApi = {
  get: () => request<Profile>('/profile'),
  update: (data: { nickname?: string; signature?: string }) =>
    request<{ profile: Profile }>('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  uploadAvatar: (file: File) => uploadImage('avatar', file),
  uploadQrcode: (file: File) => uploadImage('qrcode', file),
  // 图片预览：后端存的是 RGB565 原始像素，预览用原件缓存 bust 参数标记即可（此处直接不传预览，保持简单）
}
