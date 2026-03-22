import { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { toast } from 'sonner'

interface Facility {
  id: string
  name: string
  location: string
  description: string
  is_active: boolean
}

interface Reservation {
  id: string
  facility_id: string
  facility?: Facility
  teacher_id: string
  start_time: string
  end_time: string
  purpose: string
}

export default function ResourceMgmtPage() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [isAddingFacility, setIsAddingFacility] = useState(false)
  const [isReserving, setIsReserving] = useState(false)
  
  // New Facility Form
  const [newFacility, setNewFacility] = useState({ name: '', location: '', description: '' })
  
  // New Reservation Form
  const [newRes, setNewRes] = useState({ facility_id: '', start_time: '', end_time: '', purpose: '' })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [facRes, resRes] = await Promise.all([
        apiFetch('/api/plugins/resourcemgmt/facilities'),
        apiFetch('/api/plugins/resourcemgmt/reservations')
      ])
      if (facRes.ok) setFacilities(await facRes.json())
      if (resRes.ok) setReservations(await resRes.json())
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddFacility = async () => {
    if (!newFacility.name) return toast.error('시설 이름을 입력해주세요.')
    try {
      const res = await apiFetch('/api/plugins/resourcemgmt/facilities', {
        method: 'POST',
        body: JSON.stringify(newFacility)
      })
      if (res.ok) {
        toast.success('시설이 등록되었습니다.')
        setIsAddingFacility(false)
        setNewFacility({ name: '', location: '', description: '' })
        fetchData()
      }
    } catch (e) { toast.error('등록 실패') }
  }

  const handleReserve = async () => {
    if (!newRes.facility_id || !newRes.start_time) return toast.error('시설과 시간을 선택해주세요.')
    try {
      const res = await apiFetch('/api/plugins/resourcemgmt/reservations', {
        method: 'POST',
        body: JSON.stringify(newRes)
      })
      if (res.ok) {
        toast.success('예약이 완료되었습니다.')
        setIsReserving(false)
        fetchData()
      }
    } catch (e) { toast.error('예약 실패') }
  }

  return (
    <div className="page-container">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>특별실 및 공용 자원 관리</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>학교 내 시설 예약 현황을 확인하고 새로운 예약을 등록합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setIsAddingFacility(true)}>시설 등록</button>
          <button className="btn btn-primary" onClick={() => setIsReserving(true)}>
            <i className="fi fi-rr-calendar-plus" style={{ marginRight: 8 }} />
            예약하기
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        {/* 시설 목록 */}
        <div className="card">
          <h4 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>보유 시설 ({facilities.length})</h4>
          <div className="facility-list">
            {facilities.map(f => (
              <div key={f.id} className="card" style={{ marginBottom: 10, padding: 12, background: 'var(--bg-light)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  <i className="fi fi-rr-marker" style={{ marginRight: 4 }} />
                  {f.location}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 예약 현황 */}
        <div className="card">
          <h4 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600 }}>실시간 예약 현황</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>시설명</th>
                <th>시간</th>
                <th>목적</th>
                <th>예약자</th>
              </tr>
            </thead>
            <tbody>
              {reservations.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>현재 예약 내역이 없습니다.</td></tr>
              ) : (
                reservations.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.facility?.name || '알 수 없음'}</td>
                    <td style={{ fontSize: 12 }}>
                      {new Date(r.start_time).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{r.purpose}</td>
                    <td><span className="badge badge-info">확인됨</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 시설 추가 모달 */}
      {isAddingFacility && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <h4>신규 시설 등록</h4>
            <div style={{ marginTop: 16 }}>
              <label className="form-label">시설 이름</label>
              <input className="form-input" placeholder="예: 제1컴퓨터실" value={newFacility.name} onChange={e => setNewFacility({...newFacility, name: e.target.value})} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">위치</label>
              <input className="form-input" placeholder="예: 본관 3층" value={newFacility.location} onChange={e => setNewFacility({...newFacility, location: e.target.value})} />
            </div>
            <div className="modal-footer" style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setIsAddingFacility(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleAddFacility}>등록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 예약 신청 모달 */}
      {isReserving && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <h4>시설 예약 신청</h4>
            <div style={{ marginTop: 16 }}>
              <label className="form-label">시설 선택</label>
              <select className="form-input" value={newRes.facility_id} onChange={e => setNewRes({...newRes, facility_id: e.target.value})}>
                <option value="">시설을 선택하세요</option>
                {facilities.map(f => <option key={f.id} value={f.id}>{f.name} ({f.location})</option>)}
              </select>
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">시작 시간</label>
              <input type="datetime-local" className="form-input" value={newRes.start_time} onChange={e => setNewRes({...newRes, start_time: e.target.value})} />
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label">사용 목적</label>
              <input className="form-input" placeholder="예: 3학년 2반 정보 수업" value={newRes.purpose} onChange={e => setNewRes({...newRes, purpose: e.target.value})} />
            </div>
            <div className="modal-footer" style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setIsReserving(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleReserve}>예약 확정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
