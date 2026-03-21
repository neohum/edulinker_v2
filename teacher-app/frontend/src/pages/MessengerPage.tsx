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

interface Message {
  id: string
  sender_id: string
  sender_name?: string
  content: string
  is_urgent: boolean
  created_at: string
  read_count: number
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
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set())
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
      fetchChatsRef.current()
    }, 5000)
    return () => clearInterval(chatListInterval)
  }, [])

  useEffect(() => {
    if (!selectedChat) return
    const msgInterval = setInterval(() => {
      fetchMessagesRef.current(selectedChat.id)
    }, 3000)
    return () => clearInterval(msgInterval)
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
      const res = await fetch(`http://localhost:5200/api/core/users?page_size=500`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        const userList = data.users || []
        // Filter out students and current user
        const teachers = userList.filter((u: UserEntry) =>
          u.role !== 'student' && u.id !== user?.id
        )
        setAllUsers(teachers)
      }
    } catch (e) {
      console.error(e)
      toast.error('사용자 목록을 불러올 수 없습니다.')
    }
  }

  const [isSending, setIsSending] = useState(false)

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChat || !newMessage.trim() || isSending) return

    const msgContent = newMessage
    setNewMessage('')
    setIsSending(true)

    try {
      const token = await getToken()
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
    } catch (e) {
      console.error(e)
      setNewMessage(msgContent) // restore on failure
    } finally {
      setIsSending(false)
    }
  }

  const handleOpenCreateChat = () => {
    setShowCreateChat(true)
    setSelectedUserIds(new Set())
    setChatName('')
    setCollapsedDepts(new Set())
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

  // Group users by department for tree view
  const userTree = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase()
    const filtered = query
      ? allUsers.filter(u =>
        u.name.toLowerCase().includes(query) ||
        (u.department || '').toLowerCase().includes(query) ||
        (u.task_name || '').toLowerCase().includes(query)
      )
      : allUsers

    const groups: Record<string, UserEntry[]> = {}
    for (const u of filtered) {
      const dept = u.department || '부서 미지정'
      if (!groups[dept]) groups[dept] = []
      groups[dept].push(u)
    }

    // Sort departments alphabetically, but put '부서 미지정' last
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === '부서 미지정') return 1
      if (b === '부서 미지정') return -1
      return a.localeCompare(b, 'ko')
    })

    return sortedKeys.map(dept => ({ dept, users: groups[dept] }))
  }, [allUsers, userSearchQuery])

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleDept = (dept: string) => {
    setCollapsedDepts(prev => {
      const next = new Set(prev)
      if (next.has(dept)) next.delete(dept)
      else next.add(dept)
      return next
    })
  }

  const toggleDeptAll = (dept: string, users: UserEntry[]) => {
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
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
                        padding: '10px 14px',
                        borderRadius: isMine ? '12px 12px 0 12px' : '12px 12px 12px 0',
                        border: isMine ? 'none' : '1px solid var(--border-color)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}>
                        {msg.content}
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
            <div style={{ padding: 16, background: 'white', borderTop: '1px solid var(--border-color)' }}>
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 12 }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="메시지를 입력하세요..."
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid var(--border-color)', outline: 'none', fontSize: 14, background: 'var(--bg-primary)' }}
                />
                <button type="submit" style={{ background: 'var(--accent-blue)', color: 'white', border: 'none', borderRadius: 24, padding: '0 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                  전송
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
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>대화할 사람을 선택하세요. 부서별로 정리되어 있습니다.</p>
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
                placeholder="이름 또는 부서로 검색..."
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
                userTree.map(({ dept, users }) => {
                  const isCollapsed = collapsedDepts.has(dept)
                  const allChecked = users.every(u => selectedUserIds.has(u.id))
                  const someChecked = !allChecked && users.some(u => selectedUserIds.has(u.id))

                  return (
                    <div key={dept} style={{ marginBottom: 4 }}>
                      {/* Department Header */}
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px',
                          cursor: 'pointer', userSelect: 'none', borderRadius: 6,
                          transition: 'background 150ms'
                        }}
                        onClick={() => toggleDept(dept)}
                        onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* Expand/Collapse Arrow */}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 16, textAlign: 'center', transition: 'transform 150ms', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                          ▼
                        </span>

                        {/* Department Checkbox */}
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked }}
                          onChange={(e) => { e.stopPropagation(); toggleDeptAll(dept, users) }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
                        />

                        {/* Department name + count */}
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
                          {dept}
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
                                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{u.name}</div>
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
