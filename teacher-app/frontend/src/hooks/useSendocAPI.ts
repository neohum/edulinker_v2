import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'
import type { Sendoc, PendingDoc, RecipientStatus } from '../types/sendoc'

export function useSendocAPI(isTeacher: boolean) {
  const [docs, setDocs] = useState<Sendoc[]>([])
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [allUsers, setAllUsers] = useState<any[]>([])

  const fetchDocs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/plugins/sendoc')
      if (res.ok) setDocs(await res.json() || [])
    } catch (e) {
      console.error(e)
    } finally {
      if (isTeacher) setLoading(false)
    }
  }, [isTeacher])

  const fetchPendingDocs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/plugins/sendoc/sign')
      if (res.ok) {
        const data = await res.json()
        const mapped = (data || []).map((d: any) => ({
          ...d,
          id: d.id,
          recipient_id: d.id,
          title: d.title || '(제목 없음)',
          status: d.status || 'draft',
          created_at: d.created_at || new Date().toISOString()
        }))
        setPendingDocs(mapped)
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (!isTeacher) setLoading(false)
    }
  }, [isTeacher])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/core/users?page_size=1000')
      if (res.ok) {
        const data = await res.json()
        setAllUsers(data.users || [])
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  const fetchStatus = async (docId: string): Promise<RecipientStatus[]> => {
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${docId}/signatures`)
      if (res.ok) {
        return await res.json() || []
      }
    } catch (e) {
      console.error(e)
    }
    return []
  }

  // Initial Fetch & Websocket Synchronization
  useEffect(() => {
    if (isTeacher) fetchDocs()
    fetchPendingDocs()
    fetchUsers()

    const handleUpdate = () => {
      if (isTeacher) fetchDocs()
      fetchPendingDocs()
    }
    window.addEventListener('sendoc_updated', handleUpdate)
    return () => window.removeEventListener('sendoc_updated', handleUpdate)
  }, [fetchDocs, fetchPendingDocs, fetchUsers, isTeacher])

  return {
    docs,
    pendingDocs,
    allUsers,
    loading,
    setLoading,
    fetchDocs,
    fetchPendingDocs,
    fetchStatus
  }
}
