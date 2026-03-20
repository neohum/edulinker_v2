import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Voting {
  id: string
  title: string
  content: string
  options: string
  ends_at: string
  created_at: string
}

export default function SchoolEventsPage() {
  const [votings, setVotings] = useState<Voting[]>([])
  const [loading, setLoading] = useState(true)

  // Create voting modal
  const [showModal, setShowModal] = useState(false)
  const [votingTitle, setVotingTitle] = useState('')
  const [votingOptions, setVotingOptions] = useState('')

  useEffect(() => {
    fetchVotings()
  }, [])

  const fetchVotings = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/schoolevents/votings', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setVotings(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateVoting = async () => {
    if (!votingTitle.trim()) { toast.warning('제목을 입력하세요'); return }
    if (!votingOptions.trim()) { toast.warning('선택지를 입력하세요'); return }

    try {
      const token = localStorage.getItem('token')
      let ends = new Date()
      ends.setDate(ends.getDate() + 3)

      const res = await fetch('http://localhost:5200/api/plugins/schoolevents/votings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: votingTitle,
          content: '학부모/학생 여러분의 의견을 수렴합니다.',
          options: JSON.stringify(votingOptions.split(',').map(o => o.trim())),
          ends_at: ends.toISOString()
        })
      })
      if (res.ok) {
        toast.success('투표가 개설되었습니다.')
        setShowModal(false)
        setVotingTitle('')
        setVotingOptions('')
        fetchVotings()
      } else {
        toast.error('투표 개설에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>진행 중인 학교·학급 투표</h3>
        <button onClick={() => setShowModal(true)} style={{
          background: 'var(--primary)', color: 'white', padding: '8px 16px',
          borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600
        }}>
          새 투표 개설
        </button>
      </div>

      {loading ? (
        <div>투표목록 불러오는 중...</div>
      ) : votings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          개설된 투표가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {votings.map((v) => {
            const opts = JSON.parse(v.options || '[]')
            const isEnded = new Date(v.ends_at) < new Date()

            return (
              <div key={v.id} style={{ background: 'white', padding: 20, borderRadius: 12, border: '1px solid var(--border)', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 20, right: 20 }}>
                  {isEnded ? (
                    <span style={{ fontSize: 12, padding: '4px 8px', background: '#f1f5f9', color: '#64748b', borderRadius: 4, fontWeight: 600 }}>마감됨</span>
                  ) : (
                    <span style={{ fontSize: 12, padding: '4px 8px', background: '#dcfce3', color: '#16a34a', borderRadius: 4, fontWeight: 600 }}>진행중</span>
                  )}
                </div>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, paddingRight: 60 }}>{v.title}</h4>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  마감: {new Date(v.ends_at).toLocaleString()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {opts.map((opt: string, idx: number) => (
                    <div key={idx} style={{ padding: '10px', background: 'var(--surface)', borderRadius: 6, fontSize: 14 }}>
                      <i className="fi fi-rr-checkbox" style={{ marginRight: 8, color: 'var(--text-muted)' }} />
                      {opt}
                    </div>
                  ))}
                </div>
                {!isEnded && (
                  <button style={{ width: '100%', marginTop: 16, padding: '10px', background: 'var(--primary)', color: 'white', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                    투표 통계 보기
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
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>새 투표 개설</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>투표 제목</label>
                <input
                  value={votingTitle}
                  onChange={e => setVotingTitle(e.target.value)}
                  placeholder="예: 체험학습 장소 선정"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>선택지 (쉼표로 구분)</label>
                <input
                  value={votingOptions}
                  onChange={e => setVotingOptions(e.target.value)}
                  placeholder="예: 에버랜드,롯데월드,박물관"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowModal(false); setVotingTitle(''); setVotingOptions('') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleCreateVoting} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 600, cursor: 'pointer' }}>개설</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
