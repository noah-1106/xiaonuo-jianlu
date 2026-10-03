import React, { useState, useRef, useEffect } from 'react'
import { Tag, Typography } from 'antd'
import MessageInput from './MessageInput'
import { chatApi } from '../../api'
import { useRecord } from '../../contexts/RecordContext'
import type { ChatMessage } from '../../types'

const { Text } = Typography

// 精简版聊天面板：消息列表 + 输入框，发送后刷新简录列表（替代 socket.io）
const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { fetchRecords } = useRecord()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (text: string) => {
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    try {
      const result = await chatApi.send(text)
      const botMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        role: 'bot',
        content: result.reply,
        toolCalls: result.toolCalls
      }
      setMessages(prev => [...prev, botMsg])
      // AI 可能通过工具调用创建/修改了简录，重新拉取列表
      if (result.toolCalls && result.toolCalls.length > 0) {
        fetchRecords()
      }
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'bot', content: `发送失败：${(error as Error).message}` }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '12px', gap: '12px' }}>
      {/* 消息列表 */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '4px'
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#999', textAlign: 'center', marginTop: '40px', fontSize: '14px', lineHeight: 1.8 }}>
            我是小诺，可以直接对我说：<br />
            “记一下周五前交方案”<br />
            “我最近有什么待办？”
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%'
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '14px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: msg.role === 'user' ? 'rgba(var(--theme-primary-rgb), 0.9)' : '#f5f5f5',
                color: msg.role === 'user' ? '#ffffff' : 'var(--theme-text)'
              }}
            >
              {msg.content}
            </div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                {msg.toolCalls.map((tc, i) => (
                  <Tag key={i} style={{ fontSize: '11px' }} color="blue">
                    工具: {tc.tool}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <Text style={{ color: '#999', fontSize: '13px', alignSelf: 'flex-start' }}>小诺思考中...</Text>
        )}
      </div>

      {/* 输入框 */}
      <MessageInput onSend={handleSend} isLoading={isLoading} />
    </div>
  )
}

export default ChatPanel
