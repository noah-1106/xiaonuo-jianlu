import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { recordsApi } from '../api'
import type { RecordItem } from '../types'

interface RecordContextType {
  records: RecordItem[]
  isLoading: boolean
  viewMode: 'list' | 'card'
  setViewMode: (mode: 'list' | 'card') => void
  fetchRecords: () => Promise<void>
  updateRecord: (id: number, updates: Partial<RecordItem>) => Promise<void>
  deleteRecord: (id: number) => Promise<void>
}

const RecordContext = createContext<RecordContextType | undefined>(undefined)

export const RecordProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [records, setRecords] = useState<RecordItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'card'>('card')
  const fetchingRef = useRef(false)

  const fetchRecords = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setIsLoading(true)
    try {
      const data = await recordsApi.list(100)
      setRecords(data.records)
    } catch (error) {
      console.error('获取简录列表失败:', error)
    } finally {
      fetchingRef.current = false
      setIsLoading(false)
    }
  }, [])

  // 初始加载 + 5 秒轮询（替代原项目的 socket.io 实时推送）
  useEffect(() => {
    fetchRecords()
    const timer = setInterval(() => {
      if (!document.hidden) fetchRecords()
    }, 5000)
    return () => clearInterval(timer)
  }, [fetchRecords])

  const updateRecord = useCallback(async (id: number, updates: Partial<RecordItem>) => {
    try {
      const data = await recordsApi.update(id, updates)
      setRecords(prev => prev.map(r => (r.id === id ? data.record : r)))
    } catch (error) {
      console.error('更新简录失败:', error)
    }
  }, [])

  const deleteRecord = useCallback(async (id: number) => {
    try {
      await recordsApi.remove(id)
      setRecords(prev => prev.filter(r => r.id !== id))
    } catch (error) {
      console.error('删除简录失败:', error)
    }
  }, [])

  const value = useMemo(
    () => ({ records, isLoading, viewMode, setViewMode, fetchRecords, updateRecord, deleteRecord }),
    [records, isLoading, viewMode, fetchRecords, updateRecord, deleteRecord]
  )

  return <RecordContext.Provider value={value}>{children}</RecordContext.Provider>
}

export const useRecord = () => {
  const context = useContext(RecordContext)
  if (context === undefined) {
    throw new Error('useRecord must be used within a RecordProvider')
  }
  return context
}
