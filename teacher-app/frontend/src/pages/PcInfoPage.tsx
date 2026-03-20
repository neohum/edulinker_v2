import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface PCRecord {
  id: string
  hostname: string
  ip_address: string
  mac_address: string
  os: string
  cpu: string
  ram: string
  location: string
  label: string
  last_seen: string
}

export default function PcInfoPage() {
  const [records, setRecords] = useState<PCRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editId, setEditId] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [editLocation, setEditLocation] = useState('')

  useEffect(() => {
    fetchRecords()
  }, [])

  const fetchRecords = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/pcinfo`, {
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

  const openEditModal = (id: string, currentLabel: string, currentLocation: string) => {
    setEditId(id)
    setEditLabel(currentLabel)
    setEditLocation(currentLocation)
    setShowEditModal(true)
  }

  const handleUpdateLabel = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/pcinfo/${editId}/label`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ label: editLabel, location: editLocation })
      })
      if (res.ok) {
        toast.success('PC 정보가 업데이트되었습니다.')
        setShowEditModal(false)
        fetchRecords()
      } else {
        toast.error('업데이트에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-computer" style={{ marginRight: 8 }} />교내 PC 자산 관리</h3>
        <button onClick={fetchRecords} style={{ background: 'white', color: '#475569', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}>
          <i className="fi fi-rr-refresh" /> 새로고침
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : records.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>
          등록/수집된 PC 정보가 없습니다. (에이전트를 통해 PC 상태가 보고되어야 합니다)
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>위치 / 라벨</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>호스트명</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>IP / MAC</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>H/W 스펙</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>최근 접속</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{r.location || '위치미정'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.label || '라벨없음'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 500 }}>{r.hostname}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <div>{r.ip_address}</div>
                    <div>{r.mac_address}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <div>{r.os}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{r.cpu} / {r.ram}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {new Date(r.last_seen).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => openEditModal(r.id, r.label, r.location)}
                      style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
                    >
                      편집
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showEditModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 400 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>PC 정보 편집</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>라벨</label>
                <input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  placeholder="PC 라벨을 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>위치</label>
                <input
                  value={editLocation}
                  onChange={e => setEditLocation(e.target.value)}
                  placeholder="PC 위치를 입력하세요"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={handleUpdateLabel} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontWeight: 600, cursor: 'pointer' }}>저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
