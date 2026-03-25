import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'

interface Chat {
  id: string
  name: string
  type: 'direct' | 'group' | 'channel'
  updated_at: string
  participants?: string[]
  participant_ids?: string[]
  last_message?: string
  last_sender_name?: string
  last_message_time?: string
  unread_count?: number
}

interface FileInfo {
  id: string
  file_name: string
  content_type: string
  size: number
}

interface Message {
  id: string
  sender_id: string
  sender_name?: string
  content: string
  message_type?: string
  file_id?: string
  file_info?: FileInfo
  is_urgent: boolean
  created_at: string
  read_count: number
}

interface PendingFile {
  file?: File           // from drag-drop or HTML file input
  id: string            // temporary client-side id
  uploaded?: FileInfo   // already uploaded via Wails native dialog
  name: string          // display name
  size: number          // display size
  type: string          // mime type
}

interface UserEntry {
  id: string
  name: string
  role: string
  department?: string
  task_name?: string
  grade?: number
  class_num?: number
}

export default function MessengerPage({ user, isActive = true, onUnreadChange }: { user: any, isActive?: boolean, onUnreadChange?: (count: number) => void }) {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const selectedChatRef = useRef<Chat | null>(null)
  const isActiveRef = useRef(isActive)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Request native OS notification permission on load
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Create chat modal
  const [showCreateChat, setShowCreateChat] = useState(false)
  const [chatName, setChatName] = useState('')
  const [allUsers, setAllUsers] = useState<UserEntry[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [userSearchQuery, setUserSearchQuery] = useState('')

  const userRef = useRef(user)
  const fetchChatsRef = useRef<() => void>(() => { })
  const fetchMessagesRef = useRef<(chatId: string) => void>(() => { })
  const markChatReadRef = useRef<(chatId: string) => void>(() => { })
  const notifiedMsgIds = useRef<Set<string>>(new Set())

  // Keep refs in sync for WS callback
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { selectedChatRef.current = selectedChat }, [selectedChat])
  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  // Derive total unread from server-side chat list data
  useEffect(() => {
    const total = chats.reduce((sum, c) => sum + (c.unread_count || 0), 0)
    if (onUnreadChange) onUnreadChange(total)
  }, [chats, onUnreadChange])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // WebSocket connection
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const token = await getToken()
      if (!token || cancelled) return

      const connect = () => {
        const ws = new WebSocket(`ws://localhost:5200/ws/connect?token=${token}`)

        ws.onopen = () => {
          console.log('[Messenger] WebSocket connected')
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'chat' && data.plugin_id === 'messenger') {
              const payload = data.payload
              if (payload.action === 'new_message') {
                const myId = userRef.current?.id

                // Skip messages sent by myself (already added via HTTP response)
                if (myId && payload.sender_id === myId) {
                  fetchChatsRef.current()
                  return
                }

                const incomingMsg: Message = {
                  id: payload.message_id,
                  sender_id: payload.sender_id,
                  sender_name: payload.sender_name,
                  content: payload.content,
                  message_type: payload.message_type,
                  file_id: payload.file_id,
                  file_info: payload.file_info,
                  is_urgent: payload.is_urgent,
                  created_at: payload.created_at,
                  read_count: 0,
                }

                const currentChat = selectedChatRef.current

                // Always append to state if it's the selected chat (even if hidden)
                if (currentChat && currentChat.id === payload.chat_id) {
                  setMessages(prev => {
                    if (prev.some(m => m.id === incomingMsg.id)) return prev
                    return [...prev, incomingMsg]
                  })

                  // Only mark as read if the user is actually looking at the chat
                  if (isActiveRef.current) {
                    markChatReadRef.current(payload.chat_id)
                  }
                }

                // Show toast/OS notification (once per message)
                if (!notifiedMsgIds.current.has(payload.message_id)) {
                  notifiedMsgIds.current.add(payload.message_id)
                  if (notifiedMsgIds.current.size > 200) {
                    const arr = Array.from(notifiedMsgIds.current)
                    notifiedMsgIds.current = new Set(arr.slice(-100))
                  }
                  const senderName = payload.sender_name || '알 수 없음'
                  const preview = payload.content.length > 30 ? payload.content.slice(0, 30) + '...' : payload.content
                  if (!isActiveRef.current || !currentChat || currentChat.id !== payload.chat_id) {
                    toast.info(`${senderName}: ${preview}`, { duration: 4000 })
                  }
                  if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('EduLinker 메신저', { body: `${senderName}: ${preview}` })
                  }
                }

                fetchChatsRef.current()
              } else if (payload.action === 'read_receipt') {
                const currentChat = selectedChatRef.current
                if (currentChat && currentChat.id === payload.chat_id) {
                  fetchMessagesRef.current(payload.chat_id)
                }
              }
            }
          } catch (e) {
            console.error('[Messenger] WS parse error:', e)
          }
        }

        ws.onclose = () => {
          console.log('[Messenger] WebSocket disconnected, reconnecting in 3s...')
          setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }

        wsRef.current = ws
      }

      connect()
    }

    init()

    return () => {
      cancelled = true
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on cleanup
        wsRef.current.close()
      }
    }
  }, [])

  const markChatRead = async (chatId: string) => {
    try {
      const token = await getToken()
      await fetch(`http://localhost:5200/api/plugins/messenger/chats/${chatId}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (e) {
      // silent
    }
  }
  markChatReadRef.current = markChatRead

  const handleDeleteChat = (chatId: string, chatName: string) => {
    toast(`"${chatName || '대화방'}"을(를) 삭제하시겠습니까? 모든 메시지가 삭제됩니다.`, {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const token = await getToken()
            const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats/${chatId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
              toast.success('채팅방이 삭제되었습니다.')
              if (selectedChat?.id === chatId) {
                setSelectedChat(null)
                setMessages([])
              }
              fetchChats()
            } else {
              toast.error('삭제에 실패했습니다.')
            }
          } catch (e) {
            console.error(e)
            toast.error('서버에 연결할 수 없습니다.')
          }
        }
      },
      duration: 8000,
    })
  }

  useEffect(() => {
    fetchChats()
  }, [])

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id)
      if (isActive) markChatRead(selectedChat.id)
    }
  }, [selectedChat])

  // Mark as read when returning to the tab if a chat is selected
  useEffect(() => {
    if (isActive && selectedChat) {
      markChatRead(selectedChat.id)
      fetchChats() // Refresh chat list to clear unread badges
    }
  }, [isActive, selectedChat])

  // Polling: refresh chat list every 5s, messages every 3s when a chat is open
  useEffect(() => {
    const chatListInterval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        fetchChatsRef.current()
      }
    }, 5000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchChatsRef.current()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(chatListInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!selectedChat) return
    const msgInterval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        fetchMessagesRef.current(selectedChat.id)
      }
    }, 3000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMessagesRef.current(selectedChat.id)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(msgInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [selectedChat])

  const fetchChats = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setChats(data || [])
      }
    } catch (e) {
      console.error(e)
    }
  }
  fetchChatsRef.current = fetchChats

  const fetchMessages = async (chatId: string) => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats/${chatId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data: Message[] = (await res.json()) || []
        const serverMsgs = data.reverse()
        setMessages(prev => {
          // Build a map of server messages for quick lookup
          const serverMap = new Map(serverMsgs.map(m => [m.id, m]))
          // Find messages in prev that aren't on the server yet (just sent via HTTP, not yet in next poll)
          const localOnly = prev.filter(m => !serverMap.has(m.id))
          // Use server data as base, append any local-only messages at the end
          return [...serverMsgs, ...localOnly]
        })
      }
    } catch (e) {
      console.error(e)
    }
  }
  fetchMessagesRef.current = fetchMessages

  const fetchAllUsers = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/core/users?page_size=1000&role=teacher,admin`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const teachers = data.users || []
        setAllUsers(teachers)
      }
    } catch (e) {
      console.error(e)
      toast.error('사용자 목록을 불러올 수 없습니다.')
    }
  }

  const [isSending, setIsSending] = useState(false)

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        // Remove "data:...;base64," prefix
        const base64 = dataUrl.split(',')[1] || ''
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const uploadFile = async (file: File): Promise<FileInfo | null> => {
    // Try Wails Go binding first (bypasses WebView fetch restrictions)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.UploadFileFromBytes) {
        const base64Data = await fileToBase64(file)
        const result = await wailsApp.UploadFileFromBytes(file.name, base64Data)
        if (result.error) {
          console.error('[Messenger] Wails upload error:', result.error)
          toast.error(`파일 업로드 실패: ${file.name}`)
          return null
        }
        return {
          id: result.id,
          file_name: result.file_name,
          content_type: result.content_type,
          size: result.size,
        }
      }
    } catch (e) {
      console.error('[Messenger] Wails upload fallback:', e)
    }

    // Fallback: fetch (for browser dev mode)
    try {
      const token = await getToken()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('plugin_id', 'messenger')
      formData.append('storage', 'auto')

      const res = await fetch('http://localhost:5200/api/core/files/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      if (res.ok) {
        const record = await res.json()
        return {
          id: record.id,
          file_name: record.file_name,
          content_type: record.content_type,
          size: record.size,
        }
      }
      const errBody = await res.text().catch(() => '')
      console.error(`[Messenger] File upload failed (${res.status}): ${errBody}`)
      toast.error(`파일 업로드 실패: ${file.name} (${res.status})`)
      return null
    } catch (e) {
      console.error('[Messenger] File upload error:', e)
      toast.error(`파일 업로드 오류: ${file.name}`)
      return null
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChat || isSending) return
    if (!newMessage.trim() && pendingFiles.length === 0) return

    const msgContent = newMessage
    const filesToSend = [...pendingFiles]
    setNewMessage('')
    setPendingFiles([])
    setIsSending(true)

    try {
      const token = await getToken()

      if (filesToSend.length > 0) {
        // Upload files that aren't already uploaded
        setIsUploading(true)
        const uploadedFileInfos: FileInfo[] = []
        for (const pf of filesToSend) {
          if (pf.uploaded) {
            // Already uploaded via Wails native dialog
            uploadedFileInfos.push(pf.uploaded)
          } else if (pf.file) {
            // Need to upload (drag-drop or HTML input)
            const info = await uploadFile(pf.file)
            if (info) uploadedFileInfos.push(info)
          }
        }
        setIsUploading(false)

        if (uploadedFileInfos.length === 0) {
          toast.error('파일 업로드에 실패했습니다.')
          setNewMessage(msgContent)
          setPendingFiles(filesToSend)
          setIsSending(false)
          return
        }

        // Determine message type based on files
        const allImages = uploadedFileInfos.every(f => f.content_type.startsWith('image/'))
        const messageType = allImages ? 'image' : 'file'

        const msgBody = {
          content: msgContent,
          message_type: messageType,
          file_ids: uploadedFileInfos.map(f => f.id),
          is_urgent: false
        }
        console.log('[Messenger] Sending file message:', msgBody)

        const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats/${selectedChat.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(msgBody)
        })
        if (res.ok) {
          const sentData = await res.json()
          console.log('[Messenger] File message sent:', sentData)
          const sentMsgs: Message[] = Array.isArray(sentData) ? sentData : [sentData]
          setMessages(prev => {
            const newMsgs = sentMsgs.filter(sm => !prev.some(m => m.id === sm.id))
            return [...prev, ...newMsgs.map(m => ({ ...m, read_count: 0 }))]
          })
        } else {
          const errBody = await res.text().catch(() => '')
          console.error(`[Messenger] Send message failed (${res.status}):`, errBody)
          toast.error('메시지 전송에 실패했습니다.')
        }
      } else {
        // Text-only message
        const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats/${selectedChat.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ content: msgContent, message_type: 'text', is_urgent: false })
        })
        if (res.ok) {
          const sentMsg = await res.json()
          setMessages(prev => {
            if (prev.some(m => m.id === sentMsg.id)) return prev
            return [...prev, { ...sentMsg, read_count: 0 }]
          })
        }
      }
    } catch (e) {
      console.error(e)
      setNewMessage(msgContent)
      setPendingFiles(filesToSend)
    } finally {
      setIsSending(false)
      setIsUploading(false)
    }
  }

  const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const accepted: PendingFile[] = []
    const rejected: string[] = []
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_SIZE) {
        rejected.push(f.name)
      } else {
        accepted.push({
          file: f,
          id: Math.random().toString(36).slice(2) + Date.now().toString(36),
          name: f.name,
          size: f.size,
          type: f.type,
        })
      }
    }
    if (rejected.length > 0) {
      toast.error(`허용 용량(1GB)을 초과한 파일: ${rejected.join(', ')}`)
    }
    if (accepted.length > 0) {
      setPendingFiles(prev => [...prev, ...accepted])
    }
  }

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id))
  }

  const handleNativeFileSelect = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.SelectAndUploadFiles) {
        const results = await wailsApp.SelectAndUploadFiles()
        if (!results || results.length === 0) return
        const newFiles: PendingFile[] = results
          .filter((r: any) => !r.error && r.id)
          .map((r: any) => ({
            id: r.id,
            uploaded: { id: r.id, file_name: r.file_name, content_type: r.content_type, size: r.size },
            name: r.file_name,
            size: r.size,
            type: r.content_type,
          }))
        if (newFiles.length > 0) {
          setPendingFiles(prev => [...prev, ...newFiles])
        }
        const failed = results.filter((r: any) => r.error)
        if (failed.length > 0) {
          toast.error(`${failed.length}개 파일 업로드 실패`)
        }
        return
      }
    } catch (e) {
      console.error('[Messenger] Native file select error:', e)
    }
    // Fallback to HTML file input
    fileInputRef.current?.click()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isImageType = (contentType: string): boolean => {
    return contentType.startsWith('image/')
  }

  const getFileIcon = (contentType: string): string => {
    if (contentType.startsWith('image/')) return 'fi-rr-picture'
    if (contentType.includes('pdf')) return 'fi-rr-document'
    if (contentType.includes('word') || contentType.includes('document')) return 'fi-rr-document'
    if (contentType.includes('sheet') || contentType.includes('excel')) return 'fi-rr-document'
    if (contentType.includes('presentation') || contentType.includes('powerpoint')) return 'fi-rr-document'
    if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('tar')) return 'fi-rr-folder'
    return 'fi-rr-file'
  }

  // Cache for authenticated file URLs (data URLs or object URLs)
  const fileUrlCache = useRef<Map<string, string>>(new Map())

  const getAuthenticatedFileUrl = useCallback(async (fileId: string): Promise<string> => {
    const cached = fileUrlCache.current.get(fileId)
    if (cached) return cached

    // Try Wails Go binding first (returns data URL)
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.GetFileDataURL) {
        const dataUrl = await wailsApp.GetFileDataURL(fileId)
        if (dataUrl) {
          fileUrlCache.current.set(fileId, dataUrl)
          return dataUrl
        }
      }
    } catch { }

    // Fallback: fetch via JS
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/core/files/${fileId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        fileUrlCache.current.set(fileId, url)
        return url
      }
    } catch { }
    return ''
  }, [])

  const handleFileDownload = async (fileId: string, fileName: string) => {
    try {
      // Try Wails native file save dialog first
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.DownloadFile) {
        const result = await wailsApp.DownloadFile(fileId, fileName)
        if (result.success) {
          toast.success(`파일이 저장되었습니다: ${result.file_path}`)
          return
        }
        // User cancelled — no error
        if (result.error === '') return
        if (result.error) {
          toast.error(result.error)
          return
        }
      }

      // Fallback: fetch and download via browser
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/core/files/${fileId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        console.error(`[Messenger] Download failed (${res.status}):`, errText)
        toast.error(`파일 다운로드 실패 (${res.status})`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      console.error('[Messenger] Download error:', e)
      toast.error('파일 다운로드 중 오류가 발생했습니다.')
    }
  }

  // Component for authenticated image loading
  function AuthImage({ fileId, alt, style }: { fileId: string, alt: string, style: React.CSSProperties }) {
    const [src, setSrc] = useState('')

    useEffect(() => {
      let cancelled = false
      getAuthenticatedFileUrl(fileId).then(url => {
        if (!cancelled && url) setSrc(url)
      })
      return () => { cancelled = true }
    }, [fileId])

    if (!src) {
      return (
        <div style={{ ...style, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fi fi-rr-picture" style={{ fontSize: 24, color: 'var(--text-muted)' }} />
        </div>
      )
    }

    return <img src={src} alt={alt} style={style} />
  }

  const handleOpenCreateChat = () => {
    setShowCreateChat(true)
    setSelectedUserIds(new Set())
    setChatName('')
    setCollapsedGroups(new Set())
    setUserSearchQuery('')
    fetchAllUsers()
  }

  const handleCreateChat = async () => {
    if (selectedUserIds.size === 0) {
      toast.warning('대화할 사람을 1명 이상 선택하세요.')
      return
    }

    const chatType = selectedUserIds.size === 1 ? 'direct' : 'group'

    // Auto-generate name if empty: selected user names
    let finalName = chatName.trim()
    if (!finalName && chatType !== 'direct') {
      const names = allUsers
        .filter(u => selectedUserIds.has(u.id))
        .map(u => u.name)
      finalName = names.length <= 3
        ? names.join(', ')
        : `${names.slice(0, 3).join(', ')} 외 ${names.length - 3}명`
    }

    try {
      const token = await getToken()
      const res = await fetch('http://localhost:5200/api/plugins/messenger/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: chatType,
          name: finalName,
          members: Array.from(selectedUserIds)
        })
      })
      if (res.ok) {
        const chatData = await res.json()
        // 201 = new chat created, 200 = existing chat returned
        if (res.status === 201) {
          toast.success('채팅방이 생성되었습니다.')
        } else {
          toast.info('이미 존재하는 대화방으로 이동합니다.')
        }
        setShowCreateChat(false)
        setChatName('')
        setSelectedUserIds(new Set())
        await fetchChats()
        // Auto-select the chat — use the returned chat data with correct id
        const chatToSelect: Chat = {
          id: chatData.id,
          name: chatData.name,
          type: chatData.type,
          updated_at: chatData.updated_at,
          participants: chatData.participants,
          participant_ids: chatData.participant_ids,
        }
        setSelectedChat(chatToSelect)
      } else {
        toast.error('채팅방 생성에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  // Group users by grade for tree view
  const userTree = useMemo(() => {
    const teachersOnly = allUsers.filter(u => u.role === 'teacher' || u.role === 'admin')
    const query = userSearchQuery.trim().toLowerCase()
    const filtered = query
      ? teachersOnly.filter(u =>
        u.name.toLowerCase().includes(query) ||
        (u.department || '').toLowerCase().includes(query) ||
        (u.task_name || '').toLowerCase().includes(query) ||
        (u.grade ? `${u.grade}학년`.includes(query) : false)
      )
      : teachersOnly

    const groups: Record<string, UserEntry[]> = {}
    for (const u of filtered) {
      const groupName = u.grade ? `${u.grade}학년` : '학년 미배정'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(u)
    }

    // Sort grades numerically, but put '학년 미배정' last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === '학년 미배정') return 1
      if (b === '학년 미배정') return -1
      const numA = parseInt(a) || 0
      const numB = parseInt(b) || 0
      return numA - numB
    })

    return sortedKeys.map(groupName => ({ groupName, users: groups[groupName] }))
  }, [allUsers, userSearchQuery])

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }

  const toggleGroupAll = (groupName: string, users: UserEntry[]) => {
    const allSelected = users.every(u => selectedUserIds.has(u.id))
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        users.forEach(u => next.delete(u.id))
      } else {
        users.forEach(u => next.add(u.id))
      }
      return next
    })
  }

  const getChatDisplayName = (chat: Chat) => {
    if (chat.type === 'direct' || !chat.name) {
      // Filter out current user by ID (reliable), then get corresponding names
      if (chat.participant_ids && chat.participants && chat.participant_ids.length === chat.participants.length) {
        const otherNames = chat.participants.filter((_, idx) => chat.participant_ids![idx] !== user?.id)
        if (otherNames.length > 0) return otherNames.join(', ')
      }
      // Fallback: filter by name
      const others = chat.participants?.filter(p => p !== user?.name)
      if (others && others.length > 0) return others.join(', ')
      return '나와의 채팅'
    }
    return chat.name
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      {/* Chat List Sidebar */}
      <div style={{ width: 300, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>대화 목록</h3>
          <button onClick={handleOpenCreateChat} style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 150ms' }}>
            + 새 채팅
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chats.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>참여 중인 채팅방이 없습니다.</div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                style={{
                  padding: '14px 16px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
                  background: selectedChat?.id === chat.id ? 'var(--bg-active)' : 'white',
                  transition: 'background 150ms',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
                    <i className="fi fi-rr-users" style={{ marginRight: 8, color: 'var(--text-muted)', fontSize: 12 }} />
                    {getChatDisplayName(chat)}
                  </div>
                  {chat.last_message && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chat.last_sender_name && <span style={{ fontWeight: 600 }}>{chat.last_sender_name}: </span>}
                      {chat.last_message.length > 25 ? chat.last_message.slice(0, 25) + '...' : chat.last_message}
                    </div>
                  )}
                  {!chat.last_message && chat.participants && chat.participants.length > 0 && chat.type !== 'direct' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(chat.participant_ids && chat.participants && chat.participant_ids.length === chat.participants.length
                        ? chat.participants.filter((_, idx) => chat.participant_ids![idx] !== user?.id)
                        : chat.participants.filter(p => p !== user?.name)
                      ).join(', ') || chat.participants[0]}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {chat.last_message_time
                      ? new Date(chat.last_message_time).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : new Date(chat.updated_at).toLocaleDateString()
                    }
                  </div>
                </div>
                {chat.unread_count && chat.unread_count > 0 ? (
                  <span style={{
                    background: 'var(--accent-blue)', color: 'white', fontSize: 11, fontWeight: 700,
                    borderRadius: 10, padding: '2px 7px', minWidth: 20, textAlign: 'center', flexShrink: 0,
                  }}>
                    {chat.unread_count > 99 ? '99+' : chat.unread_count}
                  </span>
                ) : null}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id, chat.name) }}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: 13, padding: '6px',
                    borderRadius: 6, flexShrink: 0, transition: 'color 150ms',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseOut={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title="채팅방 삭제"
                >
                  <i className="fi fi-rr-trash" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc', position: 'relative' }}
        onDragOver={selectedChat ? handleDragOver : undefined}
        onDragLeave={selectedChat ? handleDragLeave : undefined}
        onDrop={selectedChat ? handleDrop : undefined}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(59,130,246,0.1)', border: '3px dashed var(--accent-blue)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none'
          }}>
            <div style={{ background: 'white', padding: '24px 40px', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', textAlign: 'center' }}>
              <i className="fi fi-rr-cloud-upload" style={{ fontSize: 36, color: 'var(--accent-blue)', display: 'block', marginBottom: 8 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>파일을 여기에 놓으세요</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>여러 파일을 동시에 첨부할 수 있습니다</div>
            </div>
          </div>
        )}

        {selectedChat ? (
          <>
            <div style={{ padding: '14px 24px', background: 'white', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{getChatDisplayName(selectedChat)}</h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 12 }}>
                {selectedChat.type === 'direct' ? '1:1' : selectedChat.type === 'group' ? '그룹' : '채널'}
              </span>
            </div>
            <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>메시지가 없습니다. 대화를 시작해 보세요!</div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = String(msg.sender_id).toLowerCase() === String(user?.id).toLowerCase()
                  const hasFile = msg.file_info || msg.file_id
                  const isImage = msg.file_info && isImageType(msg.file_info.content_type)

                  return (
                    <div key={msg.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      {!isMine && msg.sender_name && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, paddingLeft: 4 }}>
                          {msg.sender_name}
                        </div>
                      )}
                      <div style={{
                        background: isMine ? 'var(--accent-blue)' : 'white',
                        color: isMine ? 'white' : 'var(--text-primary)',
                        padding: hasFile ? '8px' : '10px 14px',
                        borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                        border: isMine ? 'none' : '1px solid var(--border-color)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        overflow: 'hidden'
                      }}>
                        {/* Image preview */}
                        {isImage && msg.file_info && (
                          <div
                            onClick={() => handleFileDownload(msg.file_info!.id, msg.file_info!.file_name)}
                            style={{ display: 'block', marginBottom: msg.content && msg.message_type !== 'image' ? 8 : 0, cursor: 'pointer' }}
                          >
                            <AuthImage
                              fileId={msg.file_info.id}
                              alt={msg.file_info.file_name}
                              style={{
                                maxWidth: 280, maxHeight: 200, borderRadius: 8,
                                display: 'block', objectFit: 'cover'
                              }}
                            />
                          </div>
                        )}

                        {/* File attachment (non-image) */}
                        {hasFile && msg.file_info && !isImage && (
                          <div
                            onClick={() => handleFileDownload(msg.file_info!.id, msg.file_info!.file_name)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 10px', borderRadius: 8,
                              background: isMine ? 'rgba(255,255,255,0.15)' : 'var(--bg-primary)',
                              textDecoration: 'none', color: 'inherit',
                              cursor: 'pointer', marginBottom: msg.content && msg.content !== msg.file_info.file_name ? 6 : 0,
                              transition: 'background 150ms'
                            }}
                          >
                            <div style={{
                              width: 36, height: 36, borderRadius: 8,
                              background: isMine ? 'rgba(255,255,255,0.2)' : 'rgba(59,130,246,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <i className={`fi ${getFileIcon(msg.file_info.content_type)}`} style={{ fontSize: 16, color: isMine ? 'white' : 'var(--accent-blue)' }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {msg.file_info.file_name}
                              </div>
                              <div style={{ fontSize: 11, opacity: 0.7 }}>
                                {formatFileSize(msg.file_info.size)}
                              </div>
                            </div>
                            <i className="fi fi-rr-download" style={{ fontSize: 14, opacity: 0.6, flexShrink: 0 }} />
                          </div>
                        )}

                        {/* Text content (hide if it's just the filename) */}
                        {msg.content && (!hasFile || msg.content !== msg.file_info?.file_name) && (
                          <div style={{ padding: hasFile ? '4px 6px 2px' : 0 }}>{msg.content}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: isMine ? 'right' : 'left', padding: '0 4px', display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'center' }}>
                        <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                        {isMine && (
                          <span style={{ color: msg.read_count > 0 ? 'var(--accent-blue)' : 'var(--text-muted)', fontWeight: msg.read_count > 0 ? 600 : 400 }}>
                            {msg.read_count > 0 ? `읽음 ${msg.read_count}` : '안읽음'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Pending files preview */}
            {pendingFiles.length > 0 && (
              <div style={{
                padding: '8px 16px', background: 'white', borderTop: '1px solid var(--border-color)',
                display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap'
              }}>
                {pendingFiles.map(pf => {
                  const isImg = pf.type.startsWith('image/')
                  return (
                    <div key={pf.id} style={{
                      position: 'relative', flexShrink: 0,
                      border: '1px solid var(--border-color)', borderRadius: 10,
                      padding: 6, display: 'flex', alignItems: 'center', gap: 8,
                      background: pf.uploaded ? 'rgba(34,197,94,0.06)' : 'var(--bg-primary)', maxWidth: 200
                    }}>
                      {isImg && pf.file ? (
                        <img
                          src={URL.createObjectURL(pf.file)}
                          alt={pf.name}
                          style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: 40, height: 40, borderRadius: 6,
                          background: pf.uploaded ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          <i className={`fi ${pf.uploaded ? 'fi-rr-check' : getFileIcon(pf.type)}`} style={{ fontSize: 16, color: pf.uploaded ? '#22c55e' : 'var(--accent-blue)' }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pf.name}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {formatFileSize(pf.size)}{pf.uploaded ? ' ✓' : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => removePendingFile(pf.id)}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 20, height: 20, borderRadius: '50%',
                          background: '#ef4444', color: 'white', border: 'none',
                          fontSize: 11, cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                          padding: 0
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ padding: 16, background: 'white', borderTop: pendingFiles.length > 0 ? 'none' : '1px solid var(--border-color)' }}>
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }}
                />
                {/* File attach button */}
                <button
                  type="button"
                  onClick={handleNativeFileSelect}
                  style={{
                    background: 'transparent', border: '1px solid var(--border-color)',
                    borderRadius: 24, width: 42, height: 42, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, color: 'var(--text-muted)', fontSize: 16,
                    transition: 'all 150ms'
                  }}
                  onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)' }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                  title="파일 첨부"
                >
                  <i className="fi fi-rr-clip" />
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder={pendingFiles.length > 0 ? '메시지를 추가하거나 바로 전송하세요...' : '메시지를 입력하세요...'}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid var(--border-color)', outline: 'none', fontSize: 14, background: 'var(--bg-primary)' }}
                />
                <button
                  type="submit"
                  disabled={isSending}
                  style={{
                    background: isSending ? 'var(--text-muted)' : 'var(--accent-blue)',
                    color: 'white', border: 'none', borderRadius: 24,
                    padding: '0 24px', height: 42, fontWeight: 600, cursor: isSending ? 'default' : 'pointer',
                    fontSize: 14, flexShrink: 0, transition: 'all 150ms'
                  }}
                >
                  {isUploading ? '업로드 중...' : isSending ? '전송 중...' : '전송'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <i className="fi fi-rr-comment-alt" style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }} />
            <div style={{ fontSize: 14 }}>왼쪽에서 대화방을 선택하거나 새 채팅을 시작하세요.</div>
          </div>
        )}
      </div>

      {/* Create Chat Modal — Tree View */}
      {showCreateChat && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, backdropFilter: 'blur(4px)'
        }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>새 채팅 시작하기</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>대화할 사람을 선택하세요. 학년별로 정리되어 있습니다.</p>
            </div>

            {/* Chat Name */}
            <div style={{ padding: '12px 24px 0' }}>
              <input
                value={chatName}
                onChange={e => setChatName(e.target.value)}
                placeholder="채팅방 이름 (비우면 자동 생성)"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', boxSizing: 'border-box', fontSize: 14, outline: 'none' }}
              />
            </div>

            {/* Search */}
            <div style={{ padding: '12px 24px 0' }}>
              <input
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
                placeholder="이름, 학년, 또는 부서로 검색..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', boxSizing: 'border-box', fontSize: 13, outline: 'none', background: 'var(--bg-primary)' }}
              />
            </div>

            {/* Selected count */}
            {selectedUserIds.size > 0 && (
              <div style={{ padding: '8px 24px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-blue)', background: 'rgba(59,130,246,0.1)', padding: '4px 10px', borderRadius: 12 }}>
                  {selectedUserIds.size}명 선택됨
                </span>
                <button
                  onClick={() => setSelectedUserIds(new Set())}
                  style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  전체 해제
                </button>
              </div>
            )}

            {/* Tree View */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px', minHeight: 0 }}>
              {userTree.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
                  {allUsers.length === 0 ? '등록된 교직원이 없습니다.' : '검색 결과가 없습니다.'}
                </div>
              ) : (
                userTree.map(({ groupName, users }) => {
                  const isCollapsed = collapsedGroups.has(groupName)
                  const allChecked = users.every(u => selectedUserIds.has(u.id))
                  const someChecked = !allChecked && users.some(u => selectedUserIds.has(u.id))

                  return (
                    <div key={groupName} style={{ marginBottom: 4 }}>
                      {/* Group Header */}
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px',
                          cursor: 'pointer', userSelect: 'none', borderRadius: 6,
                          transition: 'background 150ms'
                        }}
                        onClick={() => toggleGroup(groupName)}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Expand/Collapse Arrow */}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 16, textAlign: 'center', transition: 'transform 150ms', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                          ▼
                        </span>

                        {/* Group Checkbox */}
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked }}
                          onChange={(e) => { e.stopPropagation(); toggleGroupAll(groupName, users) }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                        />

                        {/* Group name + count */}
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                          {groupName}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 10 }}>
                          {users.length}명
                        </span>
                      </div>

                      {/* User List */}
                      {!isCollapsed && (
                        <div style={{ paddingLeft: 24 }}>
                          {users.map(u => {
                            const isChecked = selectedUserIds.has(u.id)
                            return (
                              <label
                                key={u.id}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
                                  cursor: 'pointer', borderRadius: 6, transition: 'background 150ms',
                                  background: isChecked ? 'rgba(59,130,246,0.06)' : 'transparent'
                                }}
                                onMouseOver={e => { if (!isChecked) e.currentTarget.style.background = 'var(--bg-hover)' }}
                                onMouseOut={e => { e.currentTarget.style.background = isChecked ? 'rgba(59,130,246,0.06)' : 'transparent' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleUser(u.id)}
                                  style={{ width: 16, height: 16, accentColor: 'var(--accent-blue)', cursor: 'pointer', flexShrink: 0 }}
                                />
                                {/* Avatar */}
                                <div style={{
                                  width: 28, height: 28, borderRadius: '50%',
                                  background: isChecked ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                                  color: isChecked ? 'white' : 'var(--text-muted)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 12, fontWeight: 600, flexShrink: 0, transition: 'all 150ms'
                                }}>
                                  {u.name.charAt(0)}
                                </div>
                                {/* Name & Role */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {u.name}
                                    {u.grade && u.class_num ? (
                                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                                        ({u.grade}학년 {u.class_num}반)
                                      </span>
                                    ) : null}
                                  </div>
                                  {u.task_name && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.task_name}</div>
                                  )}
                                </div>
                                {/* Role badge */}
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6,
                                  background: u.role === 'admin' ? 'rgba(168,85,247,0.15)' : 'rgba(59,130,246,0.1)',
                                  color: u.role === 'admin' ? 'var(--accent-purple)' : 'var(--accent-blue)'
                                }}>
                                  {u.role === 'admin' ? '관리자' : '교사'}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => { setShowCreateChat(false); setChatName(''); setSelectedUserIds(new Set()) }}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
              >
                취소
              </button>
              <button
                onClick={handleCreateChat}
                disabled={selectedUserIds.size === 0}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: selectedUserIds.size > 0 ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                  color: selectedUserIds.size > 0 ? 'white' : 'var(--text-muted)',
                  fontWeight: 600, cursor: selectedUserIds.size > 0 ? 'pointer' : 'default', fontSize: 14,
                  transition: 'all 150ms'
                }}
              >
                대화 시작 ({selectedUserIds.size}명)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
