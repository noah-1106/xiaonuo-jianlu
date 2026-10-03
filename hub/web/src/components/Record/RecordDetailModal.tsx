import React, { useState, useEffect, useRef } from 'react'
import { Modal, Button, Tag, Typography, Divider, Input, message, Dropdown } from 'antd'
import { EditOutlined, DeleteOutlined, CheckOutlined, CopyOutlined, ClockCircleOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons'
import { useRecord } from '../../contexts/RecordContext'
import { useRecordType } from '../../contexts/RecordTypeContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { RecordItem } from '../../types'

const { Text } = Typography

interface RecordDetailModalProps {
  visible: boolean
  onCancel: () => void
  record: RecordItem | null
  records: RecordItem[] // 所有记录的数组
  onRecordChange?: (record: RecordItem) => void // 简录切换回调
  currentCardHeap?: {
    type?: string // 卡片堆类型
    status?: string // 卡片堆状态
    records: RecordItem[] // 当前卡片堆的记录数组
  }
}

// 精简版详情浮窗（移植自原项目 RecordDetailModal）：
// 砍掉文件附件上传、发送邮件/短信、发送到聊天输入框
const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ visible, onCancel, record, records, onRecordChange, currentCardHeap }) => {
  const { updateRecord, deleteRecord } = useRecord()
  const { getRecordTypeLabel, recordTypes } = useRecordType()
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [link, setLink] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInputValue, setTagInputValue] = useState('')
  const [startTime, setStartTime] = useState<Date | undefined>(undefined)
  const [endTime, setEndTime] = useState<Date | undefined>(undefined)
  const [recordType, setRecordType] = useState('')
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const [messageApi, contextHolder] = message.useMessage()

  // 当记录变化时更新内容
  useEffect(() => {
    if (record) {
      const fallbackTitle = record.title || record.summary || record.content.substring(0, 60) + '...'
      setTitle(fallbackTitle)
      setContent(record.content)
      setLink(record.link || '')
      setTags(record.tags || [])
      setTagInputValue('')
      setStartTime(record.startTime ? new Date(record.startTime) : undefined)
      setEndTime(record.endTime ? new Date(record.endTime) : undefined)
      setRecordType(record.type || 'inspiration')
      setIsEditing(false)
    }
  }, [record])

  if (!record) return null

  // 保存编辑内容
  const handleSave = async () => {
    const updates: any = {
      title: title || '',
      content: content || '',
      tags: tags || [],
      type: recordType || 'other',
      status: record.status || 'pending'
    }

    if (link && link.trim()) {
      updates.link = link.startsWith('http://') || link.startsWith('https://') ? link : `http://${link}`
    } else {
      updates.link = ''
    }

    if (startTime) {
      updates.startTime = startTime.toISOString()
    }
    if (endTime) {
      updates.endTime = endTime.toISOString()
    }

    await updateRecord(record.id, updates)
    setIsEditing(false)
  }

  // 自定义Markdown渲染组件
  const MarkdownRenderer = ({ text }: { text: string }) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1890ff', textDecoration: 'underline', cursor: 'pointer' }}
              {...props}
            >
              {children}
            </a>
          ),
          p: ({ children }) => <p style={{ margin: '8px 0', lineHeight: '1.6' }}>{children}</p>,
          h1: ({ children }) => <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '12px 0' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '10px 0' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '8px 0' }}>{children}</h3>,
          ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <pre style={{
                padding: '12px',
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                borderRadius: '4px',
                overflow: 'auto',
                margin: '8px 0'
              }}>
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code style={{
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                padding: '2px 4px',
                borderRadius: '3px',
                fontSize: '0.9em'
              }} {...props}>
                {children}
              </code>
            )
          },
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: '4px solid #1890ff',
              paddingLeft: '12px',
              margin: '8px 0',
              fontStyle: 'italic'
            }}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th style={{
              border: '1px solid rgba(0, 0, 0, 0.2)',
              padding: '6px 12px',
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              fontWeight: 'bold'
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ border: '1px solid rgba(0, 0, 0, 0.2)', padding: '6px 12px' }}>
              {children}
            </td>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    )
  }

  // 卡片类型颜色映射
  const colorMap: { [key: string]: string } = {
    article: '#667eea',
    todo: '#f5576c',
    inspiration: '#4facfe',
    other: '#43e97b'
  }

  const typeLabel = getRecordTypeLabel(record.type)
  const typeColor = colorMap[record.type] || colorMap.other
  const isPending = record.status === 'pending'

  // 当前使用的记录数组（卡片堆内切换）
  const currentRecords = currentCardHeap?.records || records

  const goToPreviousRecord = () => {
    if (!record || !currentRecords.length) return
    const currentIndex = currentRecords.findIndex(r => r.id === record.id)
    if (currentIndex > 0) {
      onRecordChange?.(currentRecords[currentIndex - 1])
    }
  }

  const goToNextRecord = () => {
    if (!record || !currentRecords.length) return
    const currentIndex = currentRecords.findIndex(r => r.id === record.id)
    if (currentIndex < currentRecords.length - 1) {
      onRecordChange?.(currentRecords[currentIndex + 1])
    }
  }

  const hasPreviousRecord = () => {
    if (!record || !currentRecords.length) return false
    return currentRecords.findIndex(r => r.id === record.id) > 0
  }

  const hasNextRecord = () => {
    if (!record || !currentRecords.length) return false
    return currentRecords.findIndex(r => r.id === record.id) < currentRecords.length - 1
  }

  return (
    <Modal
      open={visible}
      onCancel={onCancel}
      width={850}
      footer={null}
      centered={true}
      title={null}
      className="record-detail-modal"
      maskClosable={false}
      styles={{
        mask: {
          backgroundColor: 'rgba(0, 0, 0, 0.1)'
        }
      }}
    >
      {contextHolder}
      <div style={{ padding: '32px', backgroundColor: '#fff', borderRadius: '16px', position: 'relative' }}>
        {/* 导航按钮 */}
        {!isEditing && currentRecords.length > 1 && (
          <>
            {hasPreviousRecord() && (
              <Button
                type="text"
                icon={<LeftOutlined />}
                onClick={goToPreviousRecord}
                style={{
                  position: 'fixed',
                  left: 'calc(50% - 425px - 75px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  zIndex: 99999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  border: 'none'
                }}
              />
            )}
            {hasNextRecord() && (
              <Button
                type="text"
                icon={<RightOutlined />}
                onClick={goToNextRecord}
                style={{
                  position: 'fixed',
                  left: 'calc(50% + 425px + 15px)',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  zIndex: 99999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  border: 'none'
                }}
              />
            )}
          </>
        )}

        {/* 简录类型和日期 */}
        <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {isEditing ? (
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                style={{
                  fontSize: '13px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  width: 'auto',
                  maxWidth: '120px',
                  backgroundColor: '#fff',
                  cursor: 'pointer'
                }}
              >
                {Array.from(
                  new Map<string, { id: string; name: string }>([
                    ['article', { id: 'article', name: '文章' }],
                    ['todo', { id: 'todo', name: '待办事项' }],
                    ['inspiration', { id: 'inspiration', name: '灵感闪现' }],
                    ['other', { id: 'other', name: '其他' }],
                    ...recordTypes.map(type => [type.id, { id: type.id, name: type.name }] as const)
                  ]).values()
                ).map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            ) : (
              <Tag color={typeColor} style={{ fontSize: '13px', padding: '4px 12px', fontWeight: '600', borderRadius: '6px' }}>
                {typeLabel}
              </Tag>
            )}
            <Text style={{ fontSize: '13px', color: '#6b7280' }}>
              创建于{new Date(record.createdAt).toLocaleString()}{record.updatedAt !== record.createdAt ? `，上次更新于${new Date(record.updatedAt).toLocaleString()}` : ''}
            </Text>
          </div>
        </div>

        {/* 简录标题 */}
        <div style={{ marginBottom: '24px' }}>
          {isEditing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                fontSize: '20px',
                fontWeight: '600',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '12px 16px'
              }}
              placeholder="请输入标题"
            />
          ) : (
            <h1 style={{
              margin: '0 0 8px 0',
              color: '#111827',
              fontSize: '24px',
              fontWeight: '600',
              lineHeight: '1.3'
            }}>
              {record.title || record.summary || record.content.substring(0, 60) + '...'}
            </h1>
          )}
        </div>

        {/* 简录内容 */}
        <div style={{ marginBottom: '16px' }}>
          {isEditing ? (
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                  e.preventDefault()
                  contentRef.current?.select()
                }
              }}
              style={{
                width: '100%',
                minHeight: '240px',
                padding: '16px',
                fontSize: '15px',
                lineHeight: 1.7,
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                resize: 'vertical',
                fontFamily: 'inherit',
                whiteSpace: 'pre-wrap'
              }}
              placeholder="请输入内容，支持完整的Markdown格式：**粗体**、*斜体*、[链接](https://example.com)、`代码`、> 引用、标题、列表、表格等"
            />
          ) : (
            <div
              style={{
                fontSize: '15px',
                lineHeight: 1.7,
                color: '#374151',
                padding: '20px',
                backgroundColor: '#fcfcfd',
                borderRadius: '10px',
                border: '1px solid #f3f4f6',
                minHeight: '200px'
              }}
            >
              <MarkdownRenderer text={content} />
            </div>
          )}
        </div>

        {/* 简录标签 */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: '14px', minWidth: '80px', color: '#6b7280' }}>简录标签:</Text>
          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {tags.map((tag, index) => (
                  <Tag key={tag} closable onClose={() => setTags(tags.filter((_, i) => i !== index))} style={{ fontSize: '13px', borderRadius: '6px', padding: '4px 10px' }}>
                    {tag}
                  </Tag>
                ))}
              </div>
              {tags.length < 5 && (
                <Input
                  value={tagInputValue}
                  onChange={(e) => {
                    const inputValue = e.target.value
                    if (/,|，/.test(inputValue)) {
                      const lastCommaIndex = Math.max(inputValue.lastIndexOf(','), inputValue.lastIndexOf('，'))
                      const newTag = inputValue.substring(0, lastCommaIndex).trim()
                      if (newTag && !tags.includes(newTag) && tags.length < 5) {
                        setTags([...tags, newTag])
                      }
                      setTagInputValue(inputValue.substring(lastCommaIndex + 1).trim())
                    } else {
                      setTagInputValue(inputValue)
                    }
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const inputValue = tagInputValue.trim()
                      if (inputValue && !tags.includes(inputValue) && tags.length < 5) {
                        setTags([...tags, inputValue])
                        setTagInputValue('')
                      }
                    }
                  }}
                  style={{
                    flex: tags.length > 0 ? '0 1 auto' : 1,
                    minWidth: '200px',
                    maxWidth: '300px',
                    fontSize: '14px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px 16px'
                  }}
                  placeholder="请输入标签，按回车键或逗号创建"
                />
              )}
              {tags.length >= 5 && (
                <Text style={{ fontSize: '13px', color: '#9ca3af' }}>最多添加5个标签</Text>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <Tag key={tag} style={{ fontSize: '13px', padding: '4px 12px', borderRadius: '6px', backgroundColor: '#f3f4f6', color: '#4b5563', border: 'none' }}>
                    {tag}
                  </Tag>
                ))
              ) : (
                <Text style={{ color: '#9ca3af', fontSize: '14px', padding: '8px 0' }}>无</Text>
              )}
            </div>
          )}
        </div>

        {/* 预计时间 */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Text strong style={{ fontSize: '14px', minWidth: '80px', color: '#6b7280' }}>预计开始:</Text>
            {isEditing ? (
              <Input
                type="datetime-local"
                value={startTime ? startTime.toISOString().slice(0, 16) : ''}
                onChange={(e) => setStartTime(e.target.value ? new Date(e.target.value + 'Z') : undefined)}
                style={{
                  fontSize: '14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  minWidth: '200px',
                  height: '36px'
                }}
              />
            ) : (
              <Text style={{ fontSize: '14px', color: '#374151', padding: '8px 0' }}>
                {startTime ? new Date(startTime).toLocaleString() : '无'}
              </Text>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Text strong style={{ fontSize: '14px', minWidth: '80px', color: '#6b7280' }}>预计完成:</Text>
            {isEditing ? (
              <Input
                type="datetime-local"
                value={endTime ? endTime.toISOString().slice(0, 16) : ''}
                onChange={(e) => setEndTime(e.target.value ? new Date(e.target.value + 'Z') : undefined)}
                style={{
                  fontSize: '14px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  minWidth: '200px',
                  height: '36px'
                }}
              />
            ) : (
              <Text style={{ fontSize: '14px', color: '#374151', padding: '8px 0' }}>
                {endTime ? new Date(endTime).toLocaleString() : '无'}
              </Text>
            )}
          </div>
        </div>

        {/* 参考链接 */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: '14px', minWidth: '80px', color: '#6b7280' }}>参考链接:</Text>
          {isEditing ? (
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              style={{
                flex: 1,
                minWidth: '200px',
                fontSize: '14px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 16px',
                height: '36px'
              }}
              placeholder="请输入链接"
            />
          ) : link ? (
            <a
              href={link.startsWith('http://') || link.startsWith('https://') ? link : `http://${link}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '14px', color: '#3b82f6', wordBreak: 'break-all', flex: 1, textDecoration: 'none', borderBottom: '1px solid #e5e7eb', padding: '8px 0' }}
            >
              {link}
            </a>
          ) : (
            <Text style={{ fontSize: '14px', color: '#9ca3af', flex: 1, padding: '8px 0' }}>无</Text>
          )}
        </div>

        <Divider />

        {/* 操作按钮 */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginTop: '8px' }}>
          {/* 左侧按钮：完成/待处理、删除 */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {!isEditing && isPending && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => {
                  updateRecord(record.id, { status: 'completed' })
                }}
                style={{ fontSize: '14px', padding: '6px 16px', borderRadius: '6px' }}
              >
                标记为已完成
              </Button>
            )}
            {!isEditing && !isPending && (
              <Button
                icon={<ClockCircleOutlined />}
                onClick={() => {
                  updateRecord(record.id, { status: 'pending' })
                }}
                style={{
                  fontSize: '14px',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  borderColor: '#d9d9d9',
                  color: '#666'
                }}
              >
                标记为待处理
              </Button>
            )}
            <Button
              icon={<DeleteOutlined />}
              onClick={() => {
                deleteRecord(record.id)
                onCancel()
              }}
              style={{
                fontSize: '14px',
                padding: '6px 16px',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                borderColor: '#ff4d4f',
                color: '#ff4d4f'
              }}
            >
              删除
            </Button>
          </div>

          {/* 右侧按钮：复制、编辑、保存/取消 */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {!isEditing && (
              <>
                <Dropdown
                  menu={{
                    items: [
                      {
                        label: '文本格式',
                        key: 'rich',
                        onClick: async () => {
                          try {
                            const richText = `标题: ${record.title || record.summary || record.content.substring(0, 60) + '...'}\n\n` +
                              `内容: ${record.content}\n\n` +
                              `${record.summary ? `摘要: ${record.summary}\n\n` : ''}` +
                              `${record.link ? `链接: ${record.link}\n\n` : ''}` +
                              `${record.tags && record.tags.length > 0 ? `标签: ${record.tags.join(', ')}\n\n` : ''}` +
                              `${record.type ? `类型: ${getRecordTypeLabel(record.type)}\n\n` : ''}` +
                              `${record.status ? `状态: ${record.status === 'completed' ? '已完成' : '待处理'}\n\n` : ''}` +
                              `${record.startTime ? `开始时间: ${new Date(record.startTime).toLocaleString()}\n\n` : ''}` +
                              `${record.endTime ? `结束时间: ${new Date(record.endTime).toLocaleString()}\n\n` : ''}` +
                              `创建时间: ${new Date(record.createdAt).toLocaleString()}\n` +
                              `${record.updatedAt !== record.createdAt ? `更新时间: ${new Date(record.updatedAt).toLocaleString()}` : ''}`
                            await navigator.clipboard.writeText(richText)
                            messageApi.success('文本格式已复制')
                          } catch (error) {
                            messageApi.error('复制失败，请重试')
                          }
                        }
                      },
                      {
                        label: 'Markdown格式',
                        key: 'md',
                        onClick: async () => {
                          try {
                            const mdText = `# ${record.title || record.summary || record.content.substring(0, 60) + '...'}\n\n` +
                              `## 内容\n${record.content}\n\n` +
                              `${record.summary ? `## 摘要\n${record.summary}\n\n` : ''}` +
                              `${record.link ? `## 链接\n[链接](${record.link})\n\n` : ''}` +
                              `${record.tags && record.tags.length > 0 ? `## 标签\n${record.tags.map(tag => `#${tag}`).join(' ')}\n\n` : ''}` +
                              `${record.type ? `## 类型\n${getRecordTypeLabel(record.type)}\n\n` : ''}` +
                              `${record.status ? `## 状态\n${record.status === 'completed' ? '已完成' : '待处理'}\n\n` : ''}` +
                              `${record.startTime ? `## 开始时间\n${new Date(record.startTime).toLocaleString()}\n\n` : ''}` +
                              `${record.endTime ? `## 结束时间\n${new Date(record.endTime).toLocaleString()}\n\n` : ''}` +
                              `## 时间信息\n` +
                              `- 创建时间: ${new Date(record.createdAt).toLocaleString()}\n` +
                              `${record.updatedAt !== record.createdAt ? `- 更新时间: ${new Date(record.updatedAt).toLocaleString()}` : ''}`
                            await navigator.clipboard.writeText(mdText)
                            messageApi.success('Markdown格式已复制')
                          } catch (error) {
                            messageApi.error('复制失败，请重试')
                          }
                        }
                      }
                    ]
                  }}
                  placement="bottom"
                  getPopupContainer={(trigger) => trigger.parentElement as HTMLElement}
                >
                  <Button
                    icon={<CopyOutlined />}
                    style={{
                      fontSize: '14px',
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#fff'
                    }}
                  >
                    复制
                  </Button>
                </Dropdown>

                <Button
                  icon={<EditOutlined />}
                  onClick={() => {
                    setIsEditing(true)
                    const fallbackTitle = record.title || record.summary || record.content.substring(0, 60) + '...'
                    setTitle(fallbackTitle)
                  }}
                  style={{
                    fontSize: '14px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff'
                  }}
                >
                  编辑
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button
                  type="primary"
                  onClick={handleSave}
                  style={{
                    fontSize: '14px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    backgroundColor: '#3b82f6',
                    borderColor: '#3b82f6'
                  }}
                >
                  保存
                </Button>
                <Button
                  onClick={() => {
                    setIsEditing(false)
                    if (record) {
                      const fallbackTitle = record.title || record.summary || record.content.substring(0, 60) + '...'
                      setTitle(fallbackTitle)
                      setContent(record.content)
                      setLink(record.link || '')
                      setTags(record.tags || [])
                      setTagInputValue('')
                      setStartTime(record.startTime ? new Date(record.startTime) : undefined)
                      setEndTime(record.endTime ? new Date(record.endTime) : undefined)
                    }
                  }}
                  style={{
                    fontSize: '14px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff'
                  }}
                >
                  取消
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default RecordDetailModal
