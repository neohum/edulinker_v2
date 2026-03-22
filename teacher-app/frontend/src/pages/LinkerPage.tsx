import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

interface Bookmark {
  id: string
  title: string
  url: string
  student_url: string
  category: string
  is_shared: boolean
  is_own: boolean
  sort_order: number
}

export default function LinkerPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addUrl, setAddUrl] = useState('')
  const [addStudentUrl, setAddStudentUrl] = useState('')
  const [addShared, setAddShared] = useState(false)

  useEffect(() => { fetchBookmarks() }, [])

  const fetchBookmarks = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/plugins/linker')
      if (res.ok) { const data = await res.json(); setBookmarks(data || []) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleAdd = async () => {
    if (!addTitle.trim()) { toast.warning('이름을 입력하세요'); return }
    if (!addUrl.trim()) { toast.warning('URL을 입력하세요'); return }
    try {
      const res = await apiFetch('/api/plugins/linker', {
        method: 'POST',
        body: JSON.stringify({
          title: addTitle, url: addUrl, student_url: addStudentUrl,
          category: 'general', sort_order: bookmarks.length, is_shared: addShared
        })
      })
      if (res.ok) {
        toast.success('링크가 추가되었습니다.')
        setShowAddModal(false); setAddTitle(''); setAddUrl(''); setAddStudentUrl(''); setAddShared(false)
        fetchBookmarks()
      } else { toast.error('링크 추가에 실패했습니다.') }
    } catch (e) { console.error(e); toast.error('서버에 연결할 수 없습니다.') }
  }

  const handleDelete = (id: string) => {
    toast('이 링크를 삭제하시겠습니까?', {
      action: {
        label: '삭제',
        onClick: async () => {
          try {
            const res = await apiFetch(`/api/plugins/linker/${id}`, { method: 'DELETE' })
            if (res.ok) { toast.success('삭제되었습니다.'); fetchBookmarks() }
          } catch (e) { console.error(e) }
        }
      },
      duration: 5000,
    })
  }

  const own = bookmarks.filter(b => b.is_own)
  const others = bookmarks.filter(b => !b.is_own && b.is_shared)

  const BookmarkCard = ({ bm }: { bm: Bookmark }) => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: 18, background: 'white', borderRadius: 12, border: '1px solid var(--border)', width: 280, gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{bm.title}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {bm.is_shared && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>학생공유</span>}
          {!bm.is_own && <span style={{ background: '#fef9c3', color: '#92400e', fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>타교사</span>}
        </div>
      </div>

      {/* Teacher URL */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>교사용 링크</div>
        <a href={bm.url} target="_blank" rel="noreferrer"
          style={{ fontSize: 12, color: '#4f46e5', textDecoration: 'none', wordBreak: 'break-all', display: 'block' }}>
          {bm.url}
        </a>
      </div>

      {/* Student URL (only when shared) */}
      {bm.is_shared && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>학생용 링크</div>
          {bm.student_url ? (
            <a href={bm.student_url} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: '#0891b2', textDecoration: 'none', wordBreak: 'break-all', display: 'block' }}>
              {bm.student_url}
            </a>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>위 링크와 동일</span>
          )}
        </div>
      )}

      {bm.is_own && (
        <button onClick={() => handleDelete(bm.id)}
          style={{ alignSelf: 'flex-end', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: 12, marginTop: 4 }}>
          삭제
        </button>
      )}
    </div>
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-link" style={{ marginRight: 8 }} />빠른 링크 관리</h3>
        <button onClick={() => setShowAddModal(true)}
          style={{ background: '#4f46e5', color: 'white', padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          + 새 링크 추가
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>로딩 중...</div>
      ) : (
        <>
          {/* My links */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fi fi-rr-user" /> 내 링크 ({own.length}개)
            </div>
            {own.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 14 }}>
                아직 추가한 링크가 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {own.map(bm => <BookmarkCard key={bm.id} bm={bm} />)}
              </div>
            )}
          </div>

          {/* Others' shared links */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fi fi-rr-users" /> 다른 선생님 공유 링크 ({others.length}개)
            </div>
            {others.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 14 }}>
                다른 선생님이 공유한 링크가 없습니다.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {others.map(bm => <BookmarkCard key={bm.id} bm={bm} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', padding: 28, borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>새 링크 추가</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>링크 이름</label>
                <input value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder="즐겨찾기 이름을 입력하세요"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: 14 }} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>교사용 URL</label>
                <input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box', fontSize: 14 }} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={addShared} onChange={e => setAddShared(e.target.checked)} />
                학생 웹 대시보드에도 이 링크를 공유
              </label>

              {addShared && (
                <div style={{ padding: 14, background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd' }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#0369a1' }}>학생용 URL (선택)</label>
                  <input value={addStudentUrl} onChange={e => setAddStudentUrl(e.target.value)} placeholder="비워두면 교사용 URL과 동일하게 공유됩니다"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #bae6fd', boxSizing: 'border-box', fontSize: 14, background: 'white' }} />
                  <div style={{ fontSize: 11, color: '#0369a1', marginTop: 6 }}>학생에게 다른 URL을 보여주려면 입력하세요 (예: 학생 전용 뷰어 링크)</div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowAddModal(false); setAddTitle(''); setAddUrl(''); setAddStudentUrl(''); setAddShared(false) }}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontWeight: 600 }}>취소</button>
                <button onClick={handleAdd}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 700, cursor: 'pointer' }}>추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
