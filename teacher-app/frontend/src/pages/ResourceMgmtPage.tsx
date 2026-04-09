import React, { useState, useEffect } from 'react'
import { apiFetch } from '../api'
import { toast } from 'sonner'

interface Facility {
  id: string
  name: string
  location: string
  description: string
  base_timetable: string
  is_active: boolean
}

interface Reservation {
  id: string
  facility_id: string
  facility?: Facility
  teacher_id: string
  target_teacher_id?: string
  date: string
  period: number
  purpose: string
  status: string
}

const DAYS = ['월', '화', '수', '목', '금']

export default function ResourceMgmtPage() {
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [pendingReservations, setPendingReservations] = useState<Reservation[]>([])
  
  const [isAddingFacility, setIsAddingFacility] = useState(false)
  const [isReserving, setIsReserving] = useState(false)
  const [isShowingPending, setIsShowingPending] = useState(false)

  // New Facility Form
  const [newFacility, setNewFacility] = useState({ name: '', location: '', description: '' })
  const [newMaxPeriod, setNewMaxPeriod] = useState(6)
  const [newTimetable, setNewTimetable] = useState<Record<string, Record<number, string>>>({})

  // Edit Facility Form
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(null)
  const [viewingFacilityId, setViewingFacilityId] = useState<string | null>(null)
  const [editFacility, setEditFacility] = useState({ name: '', location: '', description: '' })
  const [editMaxPeriod, setEditMaxPeriod] = useState(6)
  const [editTimetable, setEditTimetable] = useState<Record<string, Record<number, string>>>({})

  // New Reservation Form
  const [newRes, setNewRes] = useState({ facility_id: '', date: new Date().toISOString().split('T')[0], period: 1, purpose: '' })

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: keyof Reservation | 'facility_name', direction: 'asc' | 'desc' } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [facRes, resRes, pendingRes] = await Promise.all([
        apiFetch('/api/plugins/resourcemgmt/facilities'),
        apiFetch('/api/plugins/resourcemgmt/reservations'),
        apiFetch('/api/plugins/resourcemgmt/reservations/pending')
      ])
      if (facRes.ok) setFacilities(await facRes.json())
      if (resRes.ok) setReservations(await resRes.json())
      if (pendingRes.ok) setPendingReservations(await pendingRes.json())
    } catch (e) {
      console.error(e)
    }
  }

  const handleTimetableChange = (isAdd: boolean, day: string, period: number, value: string) => {
     let formattedValue = value;
     // 숫자만 입력한 경우 자동 하이픈 추가 (예: 12 -> 1-2, 112 -> 1-12)
     if (/^[0-9]{2}$/.test(value)) {
       formattedValue = `${value[0]}-${value[1]}`;
     } else if (/^[0-9]{3,4}$/.test(value)) {
       formattedValue = `${value[0]}-${value.slice(1)}`;
     }

     if (isAdd) {
       setNewTimetable(prev => ({ ...prev, [day]: { ...(prev[day] || {}), [period]: formattedValue } }))
     } else {
       setEditTimetable(prev => ({ ...prev, [day]: { ...(prev[day] || {}), [period]: formattedValue } }))
     }
  }

  const handleAddFacility = async () => {
    if (!newFacility.name) return toast.error('시설 이름을 입력해주세요.')
    try {
      const res = await apiFetch('/api/plugins/resourcemgmt/facilities', {
        method: 'POST',
        body: JSON.stringify({ ...newFacility, base_timetable: JSON.stringify(newTimetable) })
      })
      if (res.ok) {
        toast.success('시설이 등록되었습니다.')
        setIsAddingFacility(false)
        setNewFacility({ name: '', location: '', description: '' })
        setNewTimetable({})
        setNewMaxPeriod(6)
        fetchData()
      }
    } catch (e) { toast.error('등록 실패') }
  }

  const handleUpdateFacility = async () => {
    if (!editFacility.name) return toast.error('시설 이름을 입력해주세요.')
    try {
      const res = await apiFetch(`/api/plugins/resourcemgmt/facilities/${editingFacilityId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editFacility, base_timetable: JSON.stringify(editTimetable) })
      })
      if (res.ok) {
        toast.success('시설이 수정되었습니다.')
        setEditingFacilityId(null)
        fetchData()
      } else {
        toast.error('수정 실패')
      }
    } catch (e) { toast.error('오류 발생') }
  }

  const handleDeleteFacility = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('정말 삭제하시겠습니까? 관련 예약 데이터에 영향을 줄 수 있습니다.')) return;
    try {
      const res = await apiFetch(`/api/plugins/resourcemgmt/facilities/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success('시설이 삭제되었습니다.')
        fetchData()
      } else {
        toast.error('삭제 실패')
      }
    } catch (e) { toast.error('오류 발생') }
  }

  const handleReserve = async () => {
    if (!newRes.facility_id || !newRes.date || !newRes.purpose) return toast.error('필수 데이터를 모두 입력해주세요.')
    try {
      const res = await apiFetch('/api/plugins/resourcemgmt/reservations', {
        method: 'POST',
        body: JSON.stringify(newRes)
      })
      if (res.ok) {
        const result = await res.json()
        if (result.status === 'pending') {
          window.alert('해당 시간에 정해진 기존 일정이 있습니다.\n\n해당 학급(담당 교사)에게 시설 사용 협조 요청을 발송했으며, 승인을 받아야 예약이 최종 확정됩니다.');
        } else {
          toast.success('예약이 바로 확정되었습니다.')
        }
        setIsReserving(false)
        setNewRes({ facility_id: '', date: new Date().toISOString().split('T')[0], period: 1, purpose: '' })
        fetchData()
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || '예약 실패 (시간표 충돌 및 특정 불가)')
      }
    } catch (e) { toast.error('통신 오류로 예약을 실패했습니다.') }
  }

  const handleReply = async (id: string, reply: 'approve' | 'reject') => {
    try {
      const res = await apiFetch(`/api/plugins/resourcemgmt/reservations/${id}/reply`, {
        method: 'PUT',
        body: JSON.stringify({ reply })
      })
      if (res.ok) {
        toast.success(reply === 'approve' ? '협조 요청을 승인했습니다.' : '협조 요청을 거절했습니다.')
        fetchData()
      } else {
        toast.error('처리 실패')
      }
    } catch (e) {
      toast.error('오류 발생')
    }
  }

  const sortedReservations = React.useMemo(() => {
    let sortableItems = reservations.filter(r => r.status !== 'yielded') // Hide yielded reservations
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Reservation]
        let bValue: any = b[sortConfig.key as keyof Reservation]
        
        if (sortConfig.key === 'facility_name') {
           aValue = a.facility?.name || ''
           bValue = b.facility?.name || ''
        } else if (sortConfig.key === 'date') {
           aValue = a.date + String(a.period).padStart(2, '0')
           bValue = b.date + String(b.period).padStart(2, '0')
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1
        }
        return 0
      })
    }
    return sortableItems
  }, [reservations, sortConfig])

  const requestSort = (key: keyof Reservation | 'facility_name') => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#dbeafe', color: '#1e40af', padding: '4px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 700, gap: 4 }}><i className="fi fi-rr-check-circle" style={{ fontSize: 13 }}/> 예약 확정</span>
      case 'pending':
        return <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 700, gap: 4 }}><i className="fi fi-rr-time-fast" style={{ fontSize: 13 }}/> 협조 대기중</span>
      case 'rejected':
        return <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 700, gap: 4 }}><i className="fi fi-rr-cross-circle" style={{ fontSize: 13 }}/> 거절됨</span>
      default:
        return null
    }
  }

  const selectedFacility = facilities.find(f => f.id === newRes.facility_id)
  let modalMaxPeriod = 6
  if (selectedFacility && selectedFacility.base_timetable) {
    try {
      const tt = JSON.parse(selectedFacility.base_timetable)
      Object.values(tt).forEach((dayData: any) => {
        Object.keys(dayData).forEach(k => {
          if (Number(k) > modalMaxPeriod) modalMaxPeriod = Number(k)
        })
      })
    } catch (e) {}
  }

  const viewingFacility = facilities.find(f => f.id === viewingFacilityId)
  let viewingMaxPeriod = 6
  let viewingTimetable: any = {}
  if (viewingFacility && viewingFacility.base_timetable) {
    try {
      viewingTimetable = JSON.parse(viewingFacility.base_timetable)
      Object.values(viewingTimetable).forEach((dayData: any) => {
        Object.keys(dayData).forEach(k => {
          if (Number(k) > viewingMaxPeriod) viewingMaxPeriod = Number(k)
        })
      })
    } catch(e) {}
  }

  return (
    <div className="page-container">
      {pendingReservations.length > 0 && (
        <div onClick={() => setIsShowingPending(true)} style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.1), 0 2px 4px -1px rgba(245, 158, 11, 0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#fef3c7', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fi fi-rr-bell-ring" style={{ color: '#d97706', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ color: '#92400e', fontWeight: 700, fontSize: 15 }}>새로운 특별실 예약 협조 요청이 있습니다!</div>
              <div style={{ color: '#b45309', fontSize: 13, marginTop: 2 }}>{pendingReservations.length}건의 예약 요청을 확인하고 승인 여부를 결정해주세요.</div>
            </div>
          </div>
          <span style={{ backgroundColor: '#d97706', color: 'white', fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 9999, transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(217, 119, 6, 0.2)' }}>확인하기</span>
        </div>
      )}

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>특별실 및 공용 자원 관리</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>학교 내 시설 예약 현황을 확인하고 새로운 예약을 등록합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setIsAddingFacility(true); setNewTimetable({}); setNewMaxPeriod(6); }}
            style={{ background: 'white', color: '#334155', padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <i className="fi fi-rr-building" />
            시설 등록
          </button>
          <button onClick={() => setIsReserving(true)}
            style={{ background: '#2563eb', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>
            <i className="fi fi-rr-calendar-plus" />
            예약 및 사용 협조 받기
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 24 }}>
        <div className="card" style={{ padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
          <h4 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>보유 시설 현황 <span style={{ color: '#64748b', fontSize: 13, fontWeight: 500, marginLeft: 4 }}>({facilities.length})</span></h4>
          <div className="facility-list" style={{ display: 'flex', flexDirection: 'row', overflowX: 'auto', gap: 16, paddingBottom: 8, scrollbarWidth: 'thin' }}>
            {facilities.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 14 }}>등록된 시설이 없습니다.</div>
            ) : (
              facilities.map(f => {
                let assignmentCount = 0;
                try {
                  const tt = JSON.parse(f.base_timetable || '{}');
                  Object.values(tt).forEach((dayData: any) => {
                    Object.values(dayData).forEach((val: any) => {
                      if (val && val.trim() !== '') assignmentCount++;
                    })
                  });
                } catch(e) {}
                return (
                  <div key={f.id} className="card" onClick={() => setViewingFacilityId(f.id)} style={{ cursor: 'pointer', minWidth: 260, padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'transform 0.2s, box-shadow 0.2s' }} onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 6px -1px rgba(0,0,0,0.1)' }} onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>{f.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <i className="fi fi-rr-marker" style={{ marginRight: 4, color: '#94a3b8' }} />
                          {f.location}
                        </div>
                        <span style={{ backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <i className="fi fi-rr-calendar" />
                          기본 {assignmentCount}건 배정
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setEditingFacilityId(f.id);
                        setEditFacility({ name: f.name, location: f.location, description: f.description });
                        let parsedTt: any = {};
                        let maxP = 6;
                        try { 
                          parsedTt = JSON.parse(f.base_timetable || '{}');
                          Object.values(parsedTt).forEach((dayData: any) => {
                            Object.keys(dayData).forEach(k => {
                              if(Number(k) > maxP) maxP = Number(k);
                            })
                          })
                        } catch (e) {}
                        setEditTimetable(parsedTt);
                        setEditMaxPeriod(maxP);
                      }} style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', color: '#475569', transition: 'all 0.15s' }}>수정</button>
                      <button onClick={(e) => handleDeleteFacility(f.id, e)} style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#dc2626', transition: 'all 0.15s' }}>삭제</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="card" style={{ padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
          <h4 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>실시간 예약 현황</h4>
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'white', overflow: 'hidden' }}>
              <thead style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: 13, textTransform: 'uppercase' }}>
                <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none', fontWeight: 600 }} onClick={() => requestSort('facility_name')}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      시설명 <i className={`fi fi-rr-sort-${sortConfig?.key === 'facility_name' ? (sortConfig.direction === 'asc' ? 'amount-up' : 'amount-down') : 'alt'}`} style={{ marginLeft: 6, fontSize: 14, opacity: sortConfig?.key === 'facility_name' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none', fontWeight: 600 }} onClick={() => requestSort('date')}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      예약 일정 <i className={`fi fi-rr-sort-${sortConfig?.key === 'date' ? (sortConfig.direction === 'asc' ? 'amount-up' : 'amount-down') : 'alt'}`} style={{ marginLeft: 6, fontSize: 14, opacity: sortConfig?.key === 'date' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th style={{ padding: '14px 16px', cursor: 'pointer', userSelect: 'none', fontWeight: 600 }} onClick={() => requestSort('purpose')}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      사용 목적 <i className={`fi fi-rr-sort-${sortConfig?.key === 'purpose' ? (sortConfig.direction === 'asc' ? 'amount-up' : 'amount-down') : 'alt'}`} style={{ marginLeft: 6, fontSize: 14, opacity: sortConfig?.key === 'purpose' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th style={{ padding: '14px 16px', fontWeight: 600 }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {sortedReservations.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', fontSize: 14 }}>현재 예약 내역이 없습니다. 새로운 예약을 추가해보세요.</td></tr>
                ) : (
                  sortedReservations.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background-color 0.15s ease' }}>
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1e293b', verticalAlign: 'middle' }}>{r.facility?.name || '알 수 없음'}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fi fi-rr-calendar" style={{ color: '#94a3b8' }}/>
                          <span style={{ fontWeight: 500, color: '#1e293b' }}>{r.date}</span>
                          <span style={{ fontWeight: 700, color: '#3b82f6', marginLeft: 4 }}>
                            {r.period}교시
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 500, verticalAlign: 'middle' }}>{r.purpose}</td>
                      <td style={{ padding: '14px 16px', verticalAlign: 'middle' }}>
                        {getStatusBadge(r.status)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 협조 요청 승인/거절 모달 */}
      {isShowingPending && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'white', maxWidth: 600, width: '100%', borderRadius: 16, padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <i className="fi fi-rr-envelope-open" style={{ fontSize: 24, color: '#d97706' }} />
                <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>예약 협조 요청 내역</h4>
              </div>
              <button onClick={() => setIsShowingPending(false)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b', transition: 'color 0.2s' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {pendingReservations.map(r => (
                <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#f8fafc', position: 'relative' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 8 }}>{r.facility?.name}</div>
                  <div style={{ color: '#475569', fontSize: 14, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>요청 시간:</span> {r.date} <span style={{ color: '#2563eb', fontWeight: 700 }}>{r.period}교시</span>
                  </div>
                  <div style={{ color: '#475569', fontSize: 14, marginBottom: 16 }}>
                    <span style={{ fontWeight: 600 }}>사용 목적:</span> {r.purpose}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleReply(r.id, 'approve')} style={{ flex: 1, backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '10px 0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>요청 승인하기</button>
                    <button onClick={() => handleReply(r.id, 'reject')} style={{ flex: 1, backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', padding: '10px 0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>사용 불가 거절</button>
                  </div>
                </div>
              ))}
              {pendingReservations.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>대기 중인 협조 요청이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 시설 추가 모달 (생략 불가능하므로 그대로 유지) */}
      {isAddingFacility && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'white', maxWidth: 800, width: '100%', borderRadius: 16, padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>신규 시설 등록</h4>
              <button onClick={() => setIsAddingFacility(false)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>시설 이름</label>
                <input className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} placeholder="예: 제1컴퓨터실" value={newFacility.name} onChange={e => setNewFacility({ ...newFacility, name: e.target.value })} />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>위치</label>
                <input className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} placeholder="예: 본관 3층" value={newFacility.location} onChange={e => setNewFacility({ ...newFacility, location: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 24, padding: 20, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h5 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>기본 사용 시간표</h5>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>이 시설이 고정적으로 사용되는 학급이나 목적을 입력하세요.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setNewMaxPeriod(p => Math.max(1, p - 1))} style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>- 삭제</button>
                  <button onClick={() => setNewMaxPeriod(p => p + 1)} style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ 교시 추가</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', minWidth: 600 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '10px 8px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', width: 60, fontWeight: 700, color: '#475569', fontSize: 13 }}>교시</th>
                      {DAYS.map(d => <th key={d} style={{ padding: '10px 8px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', fontWeight: 700, color: '#475569', fontSize: 13, width: `${100/5}%` }}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: newMaxPeriod }, (_, i) => i + 1).map(p => (
                      <tr key={p}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 700, color: '#64748b', background: '#f8fafc', fontSize: 13 }}>{p}교시</td>
                        {DAYS.map(d => (
                          <td key={d} style={{ padding: 6, borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                            <input type="text" 
                              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid transparent', padding: '6px 8px', outline: 'none', textAlign: 'center', fontSize: 13, borderRadius: 6, background: newTimetable?.[d]?.[p] ? '#f0fdf4' : 'transparent', color: newTimetable?.[d]?.[p] ? '#166534' : '#334155', fontWeight: newTimetable?.[d]?.[p] ? 600 : 400 }} 
                              placeholder="예) 1-2" value={newTimetable?.[d]?.[p] || ''} onChange={e => handleTimetableChange(true, d, p, e.target.value)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
              <button onClick={() => setIsAddingFacility(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>취소</button>
              <button className="btn btn-primary" onClick={handleAddFacility} style={{ padding: '10px 28px', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>등록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 시설 수정 모달 */}
      {editingFacilityId && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'white', maxWidth: 800, width: '100%', borderRadius: 16, padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>시설 수정</h4>
              <button onClick={() => setEditingFacilityId(null)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>시설 이름</label>
                <input className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} value={editFacility.name} onChange={e => setEditFacility({ ...editFacility, name: e.target.value })} />
              </div>
              <div>
                <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>위치</label>
                <input className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} value={editFacility.location} onChange={e => setEditFacility({ ...editFacility, location: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 24, padding: 20, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h5 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>기본 사용 시간표</h5>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditMaxPeriod(p => Math.max(1, p - 1))} style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>- 삭제</button>
                  <button onClick={() => setEditMaxPeriod(p => p + 1)} style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ 교시 추가</button>
                </div>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', minWidth: 600 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '10px 8px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', width: 60, fontWeight: 700, color: '#475569', fontSize: 13 }}>교시</th>
                      {DAYS.map(d => <th key={d} style={{ padding: '10px 8px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', fontWeight: 700, color: '#475569', fontSize: 13, width: `${100/5}%` }}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: editMaxPeriod }, (_, i) => i + 1).map(p => (
                      <tr key={p}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 700, color: '#64748b', background: '#f8fafc', fontSize: 13 }}>{p}교시</td>
                        {DAYS.map(d => (
                          <td key={d} style={{ padding: 6, borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0' }}>
                            <input type="text" 
                              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid transparent', padding: '6px 8px', outline: 'none', textAlign: 'center', fontSize: 13, borderRadius: 6, background: editTimetable?.[d]?.[p] ? '#f0fdf4' : 'transparent', color: editTimetable?.[d]?.[p] ? '#166534' : '#334155', fontWeight: editTimetable?.[d]?.[p] ? 600 : 400 }} 
                              placeholder="예) 1-2" value={editTimetable?.[d]?.[p] || ''} onChange={e => handleTimetableChange(false, d, p, e.target.value)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
              <button onClick={() => setEditingFacilityId(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>취소</button>
              <button className="btn btn-primary" onClick={handleUpdateFacility} style={{ padding: '10px 28px', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>수정 완료</button>
            </div>
          </div>
        </div>
      )}

      {/* 시설 예약 신청 모달 */}
      {isReserving && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'white', maxWidth: 460, width: '100%', borderRadius: 16, padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>시설 예약 신청</h4>
              <button onClick={() => setIsReserving(false)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>시설 선택</label>
                <select className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: 'white' }} value={newRes.facility_id} onChange={e => setNewRes({ ...newRes, facility_id: e.target.value })}>
                  <option value="">시설을 선택하세요</option>
                  {facilities.map(f => <option key={f.id} value={f.id}>{f.name} ({f.location})</option>)}
                </select>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>작업 일자</label>
                  <input type="date" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} value={newRes.date} onChange={e => setNewRes({ ...newRes, date: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>예약 시간 (교시)</label>
                  <select className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: 'white' }} value={newRes.period} onChange={e => setNewRes({ ...newRes, period: Number(e.target.value) })}>
                    {Array.from({ length: modalMaxPeriod }, (_, i) => i + 1).map(p => (
                      <option key={p} value={p}>{p}교시</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600, color: '#334155', marginBottom: 8, display: 'block' }}>사용 목적</label>
                <input className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }} placeholder="예: 3학년 2반 정보 수업" value={newRes.purpose} onChange={e => setNewRes({ ...newRes, purpose: e.target.value })} />
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
              <button onClick={() => setIsReserving(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>취소</button>
              <button className="btn-primary" onClick={handleReserve} style={{ padding: '10px 28px', borderRadius: 8, background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}>예약 요청</button>
            </div>
          </div>
        </div>
      )}

      {/* 시설 조회 모달 */}
      {viewingFacility && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'white', maxWidth: 800, width: '100%', borderRadius: 16, padding: '28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h4 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{viewingFacility.name} 기본 시간표</h4>
              <button onClick={() => setViewingFacilityId(null)} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>

            <div style={{ padding: 20, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 }}>
              <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', minWidth: 600 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '10px 8px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', width: 60, fontWeight: 700, color: '#475569', fontSize: 13 }}>교시</th>
                      {DAYS.map(d => <th key={d} style={{ padding: '10px 8px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', fontWeight: 700, color: '#475569', fontSize: 13, width: `${100/5}%` }}>{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: viewingMaxPeriod }, (_, i) => i + 1).map(p => (
                      <tr key={p}>
                        <td style={{ padding: 8, borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontWeight: 700, color: '#64748b', background: '#f8fafc', fontSize: 13 }}>{p}교시</td>
                        {DAYS.map(d => (
                          <td key={d} style={{ padding: 8, borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', fontSize: 13, fontWeight: viewingTimetable?.[d]?.[p] ? 600 : 400, color: viewingTimetable?.[d]?.[p] ? '#166534' : '#94a3b8', background: viewingTimetable?.[d]?.[p] ? '#f0fdf4' : 'transparent' }}>
                            {viewingTimetable?.[d]?.[p] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
              <button onClick={() => setViewingFacilityId(null)} style={{ padding: '10px 28px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: 600 }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
