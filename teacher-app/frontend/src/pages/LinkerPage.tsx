import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Bookmark {
  id: string
  title: string
  url: string
  category: string
  is_shared: boolean
  sort_order: number
}

export default function LinkerPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addShared, setAddShared] = useState(false)

  useEffect(() => {
    fetchBookmarks()
  }, [])

  const fetchBookmarks = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/linker`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setBookmarks(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!addTitle.trim()) { toast.warning('이름을 입력하세요'); return }
    if (!addUrl.trim()) { toast.warning('URL을 입력하세요'); return }

    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/linker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: addTitle, url: addUrl, category: 'general', sort_order: bookmarks.length, is_shared: addShared
        })
      })
      if (res.ok) {
        toast.success('링크가 추가되었습니다.')
        setShowAddModal(false)
        setAddTitle('')
        setAddUrl('')
        setAddShared(false)
        fetchBookmarks()
      } else {
        toast.error('링크 추가에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleDelete = (id: string) => {
    toast('이 링크를 삭제하시겠습니까?', {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const token = localStorage.getItem('token')
            const res = await fetch(`http://localhost:5200/api/plugins/linker/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
              toast.success('삭제되었습니다.')
              fetchBookmarks()
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
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-link" style={{ marginRight: 8 }} />빠른 링크 관리 (Linker)</h3>
        <button onClick={() => setShowAddModal(true)} style={{ background: '#4f46e5', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          + 새 링크 추가
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : bookmarks.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>등록된 바로가기 링크가 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {bookmarks.map(bm => (
            <div key={bm.id} style={{ display: 'flex', flexDirection: 'column', padding: 20, background: 'white', borderRadius: 12, border: '1px solid var(--border)', width: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bm.title}</span>
                {bm.is_shared && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>학생공유</span>}
              </div>
              <a href={bm.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none', marginBottom: 20, wordBreak: 'break-all' }}>
                {bm.url}
              </a>
              <button onClick={() => handleDelete(bm.id)} style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 450 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>새 링크 추가</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>즐겨찾기 이름</label>
                <input
                  value={addTitle}
                  onChange={e => setAddTitle(e.target.value)}
                  placeholder="즐겨찾기 이름을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>URL 주소</label>
                <input
                  value={addUrl}
                  onChange={e => setAddUrl(e.target.value)}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={addShared} onChange={e => setAddShared(e.target.checked)} />
                학생 웹 대시보드에도 이 링크를 공유
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowAddModal(false); setAddTitle(''); setAddUrl(''); setAddShared(false) }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleAdd} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 600, cursor: 'pointer' }}>추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
