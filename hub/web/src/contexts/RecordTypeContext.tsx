import React, { createContext, useContext, useCallback } from 'react'
import type { ReactNode } from 'react'

interface RecordTypeItem {
  id: string
  name: string
}

interface RecordTypeContextType {
  recordTypes: RecordTypeItem[]
  getRecordTypeLabel: (typeId: string) => string
}

const DEFAULT_TYPES: RecordTypeItem[] = [
  { id: 'article', name: '文章' },
  { id: 'todo', name: '待办事项' },
  { id: 'inspiration', name: '灵感闪现' },
  { id: 'other', name: '其他' }
]

const RecordTypeContext = createContext<RecordTypeContextType>({
  recordTypes: DEFAULT_TYPES,
  getRecordTypeLabel: (typeId) => DEFAULT_TYPES.find(t => t.id === typeId)?.name || typeId
})

// 精简版：类型列表固定为四种基本类型，不再从后端拉取
export const RecordTypeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const getRecordTypeLabel = useCallback(
    (typeId: string) => DEFAULT_TYPES.find(t => t.id === typeId)?.name || typeId,
    []
  )
  return (
    <RecordTypeContext.Provider value={{ recordTypes: DEFAULT_TYPES, getRecordTypeLabel }}>
      {children}
    </RecordTypeContext.Provider>
  )
}

export const useRecordType = () => useContext(RecordTypeContext)
