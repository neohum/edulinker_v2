import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface TodoItem {
  id: string
  title: string
  description: string
  scope: 'personal' | 'school'
  priority: number
  is_completed: boolean
  due_date?: string
}

export default function TodoPage() {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterScope, setFilterScope] = useState<'all' | 'personal' | 'school'>('all')
  const [filterStatus, setFilterStatus] = useState<'active' | 'completed' | 'all'>('active')

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [todoTitle, setTodoTitle] = useState('')
  const [todoScope, setTodoScope] = useState<'personal' | 'school'>('personal')

  useEffect(() => {
    fetchTodos()
  }, [filterScope, filterStatus])

  const fetchTodos = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/todo?scope=${filterScope}&status=${filterStatus}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setTodos(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleAddTodo = async () => {
    if (!todoTitle.trim()) { toast.warning('제목을 입력하세요'); return }

    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/todo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: todoTitle,
          description: '',
          scope: todoScope,
          priority: 0
        })
      })
      if (res.ok) {
        toast.success('할 일이 추가되었습니다.')
        setShowAddModal(false)
        setTodoTitle('')
        setTodoScope('personal')
        fetchTodos()
      } else {
        toast.error('추가에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleToggle = async (id: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/todo/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) fetchTodos()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-checkbox" style={{ marginRight: 8 }} />투두리스트</h3>
        <button onClick={() => setShowAddModal(true)} style={{ background: '#4f46e5', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          + 새 할 일 추가
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <select value={filterScope} onChange={(e) => setFilterScope(e.target.value as any)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <option value="all">모든 업무</option>
          <option value="personal">내 개인업무</option>
          <option value="school">학교 공용업무</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
          <option value="active">진행 중</option>
          <option value="completed">완료됨</option>
          <option value="all">전체 상태</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : todos.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>등록된 할 일이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {todos.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
              <input
                type="checkbox"
                checked={t.is_completed}
                onChange={() => handleToggle(t.id)}
                style={{ width: 20, height: 20, marginRight: 16, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, textDecoration: t.is_completed ? 'line-through' : 'none', opacity: t.is_completed ? 0.5 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{t.title}</span>
                  {t.scope === 'school' && <span style={{ fontSize: 11, background: '#fef08a', color: '#a16207', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>학교업무</span>}
                </div>
              </div>
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
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>새 할 일 추가</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>제목</label>
                <input
                  value={todoTitle}
                  onChange={e => setTodoTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddTodo() }}
                  placeholder="할 일 제목을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>업무 범위</label>
                <select
                  value={todoScope}
                  onChange={e => setTodoScope(e.target.value as 'personal' | 'school')}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                >
                  <option value="personal">개인 업무</option>
                  <option value="school">학교 공용 업무 (School Scope)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setShowAddModal(false); setTodoTitle(''); setTodoScope('personal') }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleAddTodo} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 600, cursor: 'pointer' }}>추가</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
