import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'
import type { UserInfo } from '../App'

interface ProfilePageProps {
  user: UserInfo
}

export default function ProfilePage({ user }: ProfilePageProps) {
  const [name, setName] = useState(user.name)
  const [school, setSchool] = useState(user.school)
  const [grade, setGrade] = useState(user.grade ? String(user.grade) : '')
  const [classNum, setClassNum] = useState(user.classNum ? String(user.classNum) : '')
  const [taskName, setTaskName] = useState(user.taskName || '')
  const [department, setDepartment] = useState(user.department || '')
  const [phone, setPhone] = useState(user.classPhone || '')
  const [loading, setLoading] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const resp = await apiFetch(`/api/core/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          class_phone: phone,
          department,
          task_name: taskName,
          grade: grade ? parseInt(grade) : undefined,
          class_num: classNum ? parseInt(classNum) : undefined
        })
      })

      if (resp.ok) {
        toast.success('프로필 정보가 성공적으로 수정되었습니다.')
      } else {
        const errData = await resp.json().catch(() => ({}))
        toast.error(errData.error || '프로필 수정에 실패했습니다.')
      }
    } catch (err) {
      toast.error('서버 연결 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        <i className="fi fi-rr-user" style={{ marginRight: 8 }} />내 프로필 수정
      </h3>

      <form onSubmit={handleSave} style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-md)' }}>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>이름</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="form-input"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>소속 학교</label>
            <input
              type="text"
              value={school}
              onChange={e => setSchool(e.target.value)}
              required
              className="form-input"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>소속 부서 (선택)</label>
            <input
              type="text"
              value={department}
              onChange={e => setDepartment(e.target.value)}
              placeholder="예: 1학년부, 교무기획부 등"
              className="form-input"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 업무 (선택)</label>
            <input
              type="text"
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              placeholder="예: 정보부장, 1학년 부장 등"
              className="form-input"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 학년</label>
            <select
              value={grade}
              onChange={e => setGrade(e.target.value)}
              className="form-input"
              style={{ width: '100%', appearance: 'auto' }}
            >
              <option value="">선택 안함</option>
              {[1, 2, 3, 4, 5, 6].map(g => (
                <option key={g} value={g}>{g}학년</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 반</label>
            <input
              type="number"
              value={classNum}
              onChange={e => setClassNum(e.target.value)}
              placeholder="예: 1"
              className="form-input"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>교실(내선) 전화번호</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="예: 02-123-4567"
              className="form-input"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }} />
        </div>

        <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', fontSize: 16, padding: '14px', textAlign: 'center' }}>
          {loading ? '저장 중...' : '프로필 저장'}
        </button>
      </form>
    </div>
  )
}
