import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Gatong {
  id: string
  title: string
  content: string
  type: string
  is_required: boolean
  created_at: string
}

export default function GatongPage() {
  const [gatongs, setGatongs] = useState<Gatong[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Form states
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState('notice')
  const [isRequired, setIsRequired] = useState(false)

  useEffect(() => {
    fetchGatongs()
  }, [])

  const fetchGatongs = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/gatong', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setGatongs(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/gatong', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title,
          content,
          type,
          is_required: isRequired,
          targets: [] // Send to all for simplicity
        })
      })

      if (res.ok) {
        setShowModal(false)
        fetchGatongs()
        setTitle('')
        setContent('')
      } else {
        toast.error('발송 실패')
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>발송 내역</h3>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          + 새 가정통신문 작성
        </button>
      </div>

      {loading ? (
        <div>로딩 중...</div>
      ) : gatongs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          발송된 가정통신문이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {gatongs.map((g) => (
            <div key={g.id} style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, padding: '2px 8px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 4, fontWeight: 600 }}>
                    {g.type === 'notice' ? '공지' : g.type === 'survey' ? '설문' : '통신문'}
                  </span>
                  {g.is_required && (
                    <span style={{ fontSize: 12, padding: '2px 8px', background: '#ffe4e6', color: '#e11d48', borderRadius: 4, fontWeight: 600 }}>
                      제출 필수
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(g.created_at).toLocaleDateString()}
                </span>
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{g.title}</h4>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{g.content}</p>
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
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>새 가정통신문 작성</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>유형</label>
                <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <option value="notice">일반 공지</option>
                  <option value="survey">설문조사</option>
                  <option value="consent">동의서</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>제목</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>내용</label>
                <textarea required rows={5} value={content} onChange={e => setContent(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} />
                학부모/학생 응답 필수
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>발송하기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
