import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'

interface Alert {
  id: string
  title: string
  content: string
  category: 'safety' | 'general' | 'event'
  is_active: boolean
  expires_at?: string
  created_at: string
}

export default function StudentAlertPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [alertTitle, setAlertTitle] = useState('')
  const [alertContent, setAlertContent] = useState('')
  const [alertCategory, setAlertCategory] = useState('general')

  useEffect(() => {
    fetchAlerts()
  }, [])

  const fetchAlerts = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/studentalert`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAlerts(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!alertTitle.trim()) { toast.warning('제목을 입력하세요'); return }

    try {
      const token = await getToken()
      let expires = new Date()
      expires.setDate(expires.getDate() + 1)

      const res = await fetch('http://localhost:5200/api/plugins/studentalert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: alertTitle, content: alertContent, category: alertCategory, expires_at: expires.toISOString()
        })
      })
      if (res.ok) {
        toast.success('알림이 발송되었습니다.')
        setShowModal(false)
        setAlertTitle('')
        setAlertContent('')
        setAlertCategory('general')
        fetchAlerts()
      } else {
        toast.error('알림 발송에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleDelete = (id: string) => {
    toast('알림을 삭제하시겠습니까?', {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const token = await getToken()
            const res = await fetch(`http://localhost:5200/api/plugins/studentalert/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
              toast.success('삭제되었습니다.')
              fetchAlerts()
            }
          } catch (e) {
            console.error(e)
          }
        }
      },
      duration: 5000,
    })
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-bell" style={{ marginRight: 8 }} />전체 학생 알림망</h3>
        <button onClick={() => setShowModal(true)} style={{ background: '#ef4444', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          + 긴급/공지 알림톡 발송
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : alerts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>발송된 앱 푸시 알림 내역이 없습니다.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {alerts.map(a => (
            <div key={a.id} style={{ padding: '20px', background: 'white', borderRadius: 12, border: '1px solid var(--border)', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{
                  background: a.category === 'safety' ? '#fee2e2' : '#f1f5f9',
                  color: a.category === 'safety' ? '#b91c1c' : '#475569',
                  padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold'
                }}>
                  {a.category.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(a.created_at).toLocaleDateString()}
                </span>
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{a.title}</h4>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, minHeight: 40 }}>{a.content}</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: a.is_active ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>
                  {a.is_active ? '활성 (학생웹 노출중)' : '마감됨'}
                </span>
                <button onClick={() => handleDelete(a.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 500 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>알림톡 발송</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>알림 제목</label>
                <input
                  value={alertTitle}
                  onChange={e => setAlertTitle(e.target.value)}
                  placeholder="예: 하교 시간 폭우 주의"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>상세 내용</label>
                <textarea
                  rows={3}
                  value={alertContent}
                  onChange={e => setAlertContent(e.target.value)}
                  placeholder="상세 알림 내용을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>분류</label>
                <select
                  value={alertCategory}
                  onChange={e => setAlertCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                >
                  <option value="general">일반 (general)</option>
                  <option value="safety">안전 (safety)</option>
                  <option value="event">행사 (event)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowModal(false); setAlertTitle(''); setAlertContent(''); setAlertCategory('general') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleCreate} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: 'white', fontWeight: 600, cursor: 'pointer' }}>발송</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
