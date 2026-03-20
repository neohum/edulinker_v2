import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Chat {
  id: string
  name: string
  type: 'direct' | 'group' | 'channel'
  updated_at: string
}

interface Message {
  id: string
  sender_id: string
  content: string
  is_urgent: boolean
  created_at: string
}

export default function MessengerPage({ user }: { user: any }) {
  const [chats, setChats] = useState<Chat[]>([])
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')

  // Create chat modal
  const [showCreateChat, setShowCreateChat] = useState(false)
  const [chatName, setChatName] = useState('')

  useEffect(() => {
    fetchChats()
  }, [])

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id)
    }
  }, [selectedChat])

  const fetchChats = async () => {
    try {
      const token = localStorage.getItem('token')
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

  const fetchMessages = async (chatId: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats/${chatId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMessages((data || []).reverse())
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedChat || !newMessage.trim()) return

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/messenger/chats/${selectedChat.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: newMessage, message_type: 'text', is_urgent: false })
      })
      if (res.ok) {
        setNewMessage('')
        fetchMessages(selectedChat.id)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateChat = async () => {
    if (!chatName.trim()) { toast.warning('채팅방 이름을 입력하세요'); return }
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/messenger/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: 'group', name: chatName, members: [] })
      })
      if (res.ok) {
        toast.success('채팅방이 생성되었습니다.')
        setShowCreateChat(false)
        setChatName('')
        fetchChats()
      } else {
        toast.error('채팅방 생성에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {/* Chat List Sidebar */}
      <div style={{ width: 300, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>대화 목록</h3>
          <button onClick={() => setShowCreateChat(true)} style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
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
                  padding: 16, borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: selectedChat?.id === chat.id ? '#eff6ff' : 'white'
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}><i className="fi fi-rr-users" style={{ marginRight: 8, color: 'var(--text-secondary)' }} /> {chat.name || '새 대화방'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>최근 업데이트: {new Date(chat.updated_at).toLocaleDateString()}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        {selectedChat ? (
          <>
            <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{selectedChat.name}</h3>
            </div>
            <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>메시지가 없습니다. 대화를 시작해 보세요!</div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} style={{ alignSelf: 'flex-start', maxWidth: '70%' }}>
                    <div style={{ background: 'white', padding: '10px 14px', borderRadius: '12px 12px 12px 0', border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      {msg.content}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, marginLeft: 4 }}>
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: 16, background: 'white', borderTop: '1px solid var(--border)' }}>
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 12 }}>
                <input
                  type="text"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  placeholder="메시지를 입력하세요..."
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid var(--border)', outline: 'none' }}
                />
                <button type="submit" style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: 24, padding: '0 24px', fontWeight: 600, cursor: 'pointer' }}>
                  전송
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <i className="fi fi-rr-comment-alt" style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }} />
            <div>왼쪽에서 대화방을 선택하거나 새 채팅을 시작하세요.</div>
          </div>
        )}
      </div>

      {/* Create Chat Modal */}
      {showCreateChat && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>새 채팅방 만들기</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>채팅방 이름</label>
                <input
                  value={chatName}
                  onChange={e => setChatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateChat() }}
                  placeholder="채팅방 이름을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowCreateChat(false); setChatName('') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleCreateChat} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 600, cursor: 'pointer' }}>생성</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
