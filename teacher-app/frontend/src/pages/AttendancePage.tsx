import { useState, useEffect } from 'react'

interface AttendanceRecord {
  id: string
  student_id: string
  type: 'late' | 'absent' | 'leave'
  reason: string
  is_confirmed: boolean
  date: string
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchToday()
  }, [])

  const fetchToday = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/attendance/today`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setRecords(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (id: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/attendance/${id}/confirm`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) fetchToday()
    } catch (e) {
      console.error(e)
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'late': return <span style={{ background: '#fef9c3', color: '#a16207', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>지각</span>
      case 'absent': return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>결석</span>
      case 'leave': return <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>조퇴</span>
      default: return null
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-alarm-clock" style={{ marginRight: 8 }} />오늘의 지각·결석 접수 내역</h3>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : records.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>
          오늘 접수된 근태 신고가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {records.map(r => (
            <div key={r.id} style={{ padding: '20px', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                {getTypeLabel(r.type)}
                {r.is_confirmed ? (
                  <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 'bold' }}><i className="fi fi-rr-check-circle" /> 확인완료</span>
                ) : (
                  <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 'bold' }}><i className="fi fi-rr-exclamation" /> 미확인</span>
                )}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>학생 ID: {r.student_id.substring(0, 8)}...</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>사유: {r.reason}</div>

              {!r.is_confirmed && (
                <button onClick={() => handleConfirm(r.id)} style={{ width: '100%', background: '#10b981', color: 'white', padding: '8px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                  확인(승인) 처리하기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
