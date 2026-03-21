import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'

interface WeeklyPlan {
  id: string
  title: string
  content: string
  week_start: string
  week_end: string
  created_at: string
}

interface Evaluation {
  id: string
  student_id: string
  subject: string
  evaluation_type: string
  score: number
  feedback: string
  created_at: string
  student?: { name: string }
}

export default function CurriculumPage() {
  const [plans, setPlans] = useState<WeeklyPlan[]>([])
  const [evals, setEvals] = useState<Evaluation[]>([])
  const [activeTab, setActiveTab] = useState<'plans' | 'evals'>('plans')

  // Add plan modal
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [planTitle, setPlanTitle] = useState('')
  const [planContent, setPlanContent] = useState('')

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    try {
      const token = await getToken()
      const endpoint = activeTab === 'plans' ? 'weekly-plans' : 'evaluations'
      const res = await fetch(`http://localhost:5200/api/plugins/curriculum/${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (activeTab === 'plans') setPlans(data || [])
        else setEvals(data || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddPlan = async () => {
    if (!planTitle.trim()) { toast.warning('제목을 입력하세요'); return }
    try {
      const token = await getToken()
      const res = await fetch('http://localhost:5200/api/plugins/curriculum/weekly-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: planTitle,
          content: planContent,
          week_start: new Date().toISOString(),
          week_end: new Date(Date.now() + 7 * 86400000).toISOString()
        })
      })
      if (res.ok) {
        toast.success('주간학습안내가 등록되었습니다.')
        setShowAddPlan(false)
        setPlanTitle('')
        setPlanContent('')
        fetchData()
      } else {
        toast.error('등록에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <button
          onClick={() => setActiveTab('plans')}
          style={{
            padding: '10px 20px', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === 'plans' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'plans' ? 'white' : 'var(--text)'
          }}
        >
          주간학습안내
        </button>
        <button
          onClick={() => setActiveTab('evals')}
          style={{
            padding: '10px 20px', borderRadius: 8, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === 'evals' ? 'var(--primary)' : 'var(--surface)',
            color: activeTab === 'evals' ? 'white' : 'var(--text)'
          }}
        >
          수행·단원평가 기록
        </button>
      </div>

      <div style={{ background: 'white', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>
            {activeTab === 'plans' ? '주간학습안내 배포 내역' : '단원평가 성적 기록'}
          </h3>
          {activeTab === 'plans' && (
            <button onClick={() => setShowAddPlan(true)} style={{ background: '#10b981', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              + 새 주간학습 작성
            </button>
          )}
        </div>

        {activeTab === 'plans' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plans.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>등록된 주간학습안내가 없습니다.</div> : plans.map(p => (
              <div key={p.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 16 }}>{p.title}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(p.week_start).toLocaleDateString()} ~ {new Date(p.week_end).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)' }}>{p.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {evals.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>등록된 평가 기록이 없습니다.</div> : evals.map(e => (
              <div key={e.id} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, marginRight: 8 }}>{e.subject}</span>
                  <strong>{e.evaluation_type}</strong>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>피드백: {e.feedback}</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{e.score}점</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddPlan && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 500 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>새 주간학습안내 작성</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>제목</label>
                <input
                  value={planTitle}
                  onChange={e => setPlanTitle(e.target.value)}
                  placeholder="예: 5월 1주차"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>안내 내용</label>
                <textarea
                  rows={4}
                  value={planContent}
                  onChange={e => setPlanContent(e.target.value)}
                  placeholder="간략한 안내 내용을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowAddPlan(false); setPlanTitle(''); setPlanContent('') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleAddPlan} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', fontWeight: 600, cursor: 'pointer' }}>등록</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
