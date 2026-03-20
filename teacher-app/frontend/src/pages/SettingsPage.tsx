import { useState, useEffect } from 'react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const [className, setClassName] = useState('')
  const [servicesStr, setServicesStr] = useState('[]')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/teacher-screen`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setClassName(data.class_name || '')
        setServicesStr(data.services || '[]')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/teacher-screen', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          class_name: className,
          services: servicesStr
        })
      })
      if (res.ok) {
        toast.success('설정이 저장되었습니다.')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const toggleService = (svc: string) => {
    try {
      let arr = JSON.parse(servicesStr || '[]')
      if (arr.includes(svc)) {
        arr = arr.filter((s: string) => s !== svc)
      } else {
        arr.push(svc)
      }
      setServicesStr(JSON.stringify(arr))
    } catch {
      setServicesStr(JSON.stringify([svc]))
    }
  }

  const isEnabled = (svc: string) => {
    try {
      const arr = JSON.parse(servicesStr || '[]')
      return arr.includes(svc)
    } catch {
      return false
    }
  }

  const availableServices = [
    { id: 'todo', name: '학생 투두리스트' },
    { id: 'attendance', name: '출결 현황 전광판' },
    { id: 'events', name: '행사 투표 및 결과' },
    { id: 'curriculum', name: '주간학습 및 식단표' },
    { id: 'gatong', name: '가정통신문 회신율' }
  ]

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}><i className="fi fi-rr-settings" style={{ marginRight: 8 }} />교실 환경 모니터 설정</h3>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : (
        <form onSubmit={handleSave} style={{ background: 'white', padding: 32, borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>담당 학급 명칭</label>
            <input
              type="text"
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="예: 3학년 1반"
              style={{ width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 16 }}
            />
          </div>

          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>교실 학생용 TV 활성화 위젯 여부</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {availableServices.map(svc => (
                <label key={svc.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', borderRadius: 8, border: isEnabled(svc.id) ? '2px solid #4f46e5' : '1px solid var(--border)', background: isEnabled(svc.id) ? '#eff6ff' : 'transparent', cursor: 'pointer', transition: 'all 0.2s' }}>
                  <input
                    type="checkbox"
                    checked={isEnabled(svc.id)}
                    onChange={() => toggleService(svc.id)}
                    style={{ width: 20, height: 20, marginRight: 16 }}
                  />
                  <span style={{ fontSize: 16, fontWeight: isEnabled(svc.id) ? 700 : 500, color: isEnabled(svc.id) ? '#1e293b' : 'var(--text-secondary)' }}>
                    {svc.name}
                  </span>
                </label>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>* 체크된 항목만 교실 전면 TV 화면에 로테이션 디스플레이됩니다.</p>
          </div>

          <button type="submit" style={{ width: '100%', background: '#4f46e5', color: 'white', padding: 16, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
            적용 및 새로고침
          </button>
        </form>
      )}
    </div>
  )
}
