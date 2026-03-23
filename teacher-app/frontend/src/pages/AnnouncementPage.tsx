import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'

interface Announcement {
  id: string
  title: string
  content: string
  type: 'simple' | 'confirm' | 'apply' | 'todo'
  is_urgent: boolean
  created_at: string
  due_date?: string
}

export default function AnnouncementPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formType, setFormType] = useState('simple')
  const [formFiles, setFormFiles] = useState<File[]>([])

  useEffect(() => {
    fetchAnnouncements()
  }, [filterType])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const url = filterType ? `http://localhost:5200/api/plugins/announcement?type=${filterType}` : `http://localhost:5200/api/plugins/announcement`
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setAnnouncements(data.announcements || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!formTitle.trim()) { toast.warning('제목을 입력하세요'); return }
    try {
      const token = await getToken()
      let body: any;
      let headers: HeadersInit = {
        'Authorization': `Bearer ${token}`
      };

      if (formFiles.length > 0) {
        const formData = new FormData()
        formData.append('title', formTitle)
        formData.append('content', formContent)
        formData.append('type', formType)
        formData.append('is_urgent', 'false')
        formFiles.forEach(f => formData.append('files', f))
        body = formData
      } else {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({
          title: formTitle, content: formContent, type: formType, is_urgent: false
        })
      }

      const res = await fetch('http://localhost:5200/api/plugins/announcement', {
        method: 'POST',
        headers,
        body
      })
      if (res.ok) {
        toast.success('공문이 등록되었습니다.')
        setShowModal(false)
        setFormTitle('')
        setFormContent('')
        setFormType('simple')
        setFormFiles([])
        fetchAnnouncements()
      } else {
        toast.error('공문 등록에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'confirm': return { bg: '#e0e7ff', color: '#4338ca', label: '열람확인' }
      case 'apply': return { bg: '#dcfce3', color: '#15803d', label: '신청필요' }
      case 'todo': return { bg: '#fef3c7', color: '#b45309', label: '업무이관' }
      default: return { bg: '#f1f5f9', color: '#475569', label: '단순전달' }
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-document" style={{ marginRight: 8 }} />교내 공문 전달망</h3>
        <button onClick={() => setShowModal(true)} style={{ background: '#4f46e5', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          + 공문 공유
        </button>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
        {['', 'simple', 'confirm', 'apply'].map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              padding: '6px 12px', borderRadius: 20, border: filterType === t ? '1px solid var(--primary)' : '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: filterType === t ? '#eef2ff' : 'white',
              color: filterType === t ? 'var(--primary)' : 'var(--text-secondary)'
            }}
          >
            {t === '' ? '전체보기' : getTypeStyle(t).label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : announcements.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>수신된 공문이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {announcements.map(a => {
            const styleInfo = getTypeStyle(a.type)
            return (
              <div key={a.id} style={{ padding: '20px', background: 'white', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {a.is_urgent && <span style={{ background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 'bold' }}>긴급</span>}
                  <span style={{ background: styleInfo.bg, color: styleInfo.color, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold' }}>{styleInfo.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{a.title}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{a.content}</div>
                {a.type === 'confirm' && (
                  <button style={{ alignSelf: 'flex-start', background: '#f8fafc', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginTop: 8 }}>
                    ✅ 확인했습니다
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 500 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>공문 공유</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>공문 형식</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                >
                  <option value="simple">단순전달</option>
                  <option value="confirm">열람확인</option>
                  <option value="apply">신청필요</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>제목</label>
                <input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="공문 제목을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>내용</label>
                <textarea
                  rows={4}
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  placeholder="전달할 내용을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>첨부파일 (선택)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{
                    cursor: 'pointer',
                    background: '#f8fafc',
                    border: '1px solid var(--border)',
                    padding: '8px 16px',
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#475569',
                    width: 'fit-content'
                  }}>
                    <i className="fi fi-rr-clip" /> {formFiles.length > 0 ? '파일 추가' : '파일 선택'}
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files) {
                          setFormFiles(prev => [...prev, ...Array.from(e.target.files!)])
                        }
                      }}
                    />
                  </label>
                  {formFiles.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {formFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f1f5f9', borderRadius: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f172a' }}>
                            <i className="fi fi-rr-document" style={{ color: '#64748b' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px' }}>{f.name}</span>
                            <span style={{ color: '#94a3b8', fontSize: 11 }}>({Math.round(f.size / 1024)}KB)</span>
                          </div>
                          <button type="button" onClick={() => setFormFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fi fi-rr-cross-circle" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>선택된 파일이 없습니다</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => { setShowModal(false); setFormTitle(''); setFormContent(''); setFormType('simple'); setFormFiles([]); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button type="button" onClick={handleCreate} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>등록</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
