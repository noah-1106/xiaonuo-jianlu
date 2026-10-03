import React, { useState } from 'react'
import { Input, Button, Tooltip } from 'antd'
import { SendOutlined } from '@ant-design/icons'

const { TextArea } = Input

interface MessageInputProps {
  onSend: (text: string) => void
  isLoading: boolean
}

// 精简版聊天输入（移植自原项目 MessageInput，去掉文件上传/粘贴/预览）
const MessageInput: React.FC<MessageInputProps> = ({ onSend, isLoading }) => {
  const [inputValue, setInputValue] = useState('')

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || isLoading) return
    onSend(text)
    setInputValue('')
  }

  // Enter 发送，Ctrl+Enter / Cmd+Enter 换行
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--theme-border)'
        }}
      >
        <TextArea
          placeholder="和小诺说点什么，例如：记一下明天要交报告（Enter 发送，Shift+Enter 换行）"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleKeyPress}
          disabled={isLoading}
          style={{
            width: '100%',
            borderRadius: '16px',
            padding: '16px 20px 56px 20px',
            border: 'none',
            outline: 'none',
            margin: 0
          }}
          autoSize={{ minRows: 3, maxRows: 6 }}
          showCount={false}
        />
        <Tooltip title="发送消息">
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            loading={isLoading}
            size="large"
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              borderRadius: '50%',
              width: 40,
              height: 40,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              backgroundColor: 'rgba(var(--theme-primary-rgb), 0.9)',
              zIndex: 10,
              color: '#ffffff'
            }}
          />
        </Tooltip>
      </div>
    </div>
  )
}

export default MessageInput
