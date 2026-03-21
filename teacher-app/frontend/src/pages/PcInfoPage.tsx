import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getToken } from '../api'
import { GetAIBenchmark } from '../../wailsjs/go/main/App'
import type { UserInfo } from '../App'

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
  grade: number
  class_num: number
  department: string
  user_name: string
  printers: string
  monitors: string
  last_seen: string
}

interface ExtendedSpecs {
  ip_address: string
  mac_address: string
  cpu_name: string
  cpu_cores: number
  cpu_threads: number
  ram_total_gb: number
  ram_free_gb: number
  gpu_name: string
  gpu_memory_mb: number
  disk_free_gb: number
  grade: number
  grade_label: string
  grade_desc: string
  recomm_model: string
  printers?: string[]
  monitors?: string[]
}

export default function PcInfoPage({ user }: { user: UserInfo }) {
  const [records, setRecords] = useState<PCRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [mySpecs, setMySpecs] = useState<ExtendedSpecs | null>(null)
  const [loadingSpecs, setLoadingSpecs] = useState(true)

  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const [formData, setFormData] = useState({
    id: '',
    hostname: '',
    ip_address: '',
    mac_address: '',
    os: '',
    cpu: '',
    ram: '',
    location: '',
    label: '',
    grade: 0,
    class_num: 0,
    department: '',
    user_name: '',
    printers: '',
    monitors: ''
  })

  useEffect(() => {
    fetchRecords()
    fetchMySpecs()
  }, [])

  const fetchMySpecs = async () => {
    try {
      setLoadingSpecs(true)
      const specs = await GetAIBenchmark() as any
      setMySpecs(specs)
    } catch (e) {
      console.error('Failed to get system specs:', e)
    } finally {
      setLoadingSpecs(false)
    }
  }

  const fetchRecords = async () => {
    try {
      setLoading(true)
      const token = await getToken()
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

  const openEditModal = (record: PCRecord) => {
    setFormData({
      id: record.id,
      hostname: record.hostname || '',
      ip_address: record.ip_address || '',
      mac_address: record.mac_address || '',
      os: record.os || '',
      cpu: record.cpu || '',
      ram: record.ram || '',
      location: record.location || '',
      label: record.label || '',
      grade: record.grade || 0,
      class_num: record.class_num || 0,
      department: record.department || '',
      user_name: record.user_name || '',
      printers: record.printers || '',
      monitors: record.monitors || ''
    })
    setShowEditModal(true)
  }

  const handleUpdatePC = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/pcinfo/${formData.id}/label`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        toast.success('정보가 수정되었습니다.')
        setShowEditModal(false)
        fetchRecords()
      } else {
        const err = await res.json()
        toast.error('수정 실패: ' + (err.error || '알 수 없는 오류'))
      }
    } catch (e) {
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleRegisterPC = async () => {
    if (!formData.mac_address || !formData.hostname) {
      toast.error('호스트명과 MAC 주소는 필수입니다.')
      return
    }

    const payload = { ...formData }
    if (!payload.id) delete (payload as any).id

    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/pcinfo/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        toast.success('자산이 등록되었습니다.')
        setShowAddModal(false)
        fetchRecords()
      } else {
        const err = await res.json()
        toast.error('등록 실패: ' + (err.error || '알 수 없는 오류'))
      }
    } catch (e) {
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const handleDeletePC = async (id: string) => {
    if (!confirm('정말로 이 PC 자산을 삭제하시겠습니까?')) return

    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/pcinfo/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        toast.success('자산이 삭제되었습니다.')
        fetchRecords()
      } else {
        toast.error('삭제에 실패했습니다.')
      }
    } catch (e) {
      toast.error('서버에 연결할 수 없습니다.')
    }
  }

  const fillWithCurrentPC = () => {
    if (!mySpecs) return
    setFormData({
      id: '',
      hostname: '현재 PC (교사)',
      ip_address: mySpecs.ip_address || '',
      mac_address: mySpecs.mac_address || '',
      os: 'Windows 10/11',
      cpu: mySpecs.cpu_name,
      ram: `${mySpecs.ram_total_gb.toFixed(0)} GB`,
      location: user.grade && user.classNum ? `${user.grade}학년 ${user.classNum}반` : user.department || '',
      label: '',
      grade: user.grade || 0,
      class_num: user.classNum || 0,
      department: user.department || '',
      user_name: user.name || '',
      printers: mySpecs.printers?.join(', ') || '',
      monitors: mySpecs.monitors?.join(', ') || ''
    })
    setShowAddModal(true)
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Local PC Specs */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fi fi-rr-info" style={{ color: '#2563eb' }} />
            내 PC 상세 정보 (H/W 사양)
          </h3>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={fillWithCurrentPC} disabled={loadingSpecs || !mySpecs}
              style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              자산 등록하기
            </button>
            <button onClick={fetchMySpecs} disabled={loadingSpecs}
              style={{ background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {loadingSpecs ? '갱신 중...' : '다시 측정'}
            </button>
          </div>
        </div>

        {loadingSpecs ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid var(--border)' }}>
            <p style={{ color: 'var(--text-secondary)' }}>시스템을 분석하고 있습니다...</p>
          </div>
        ) : mySpecs ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <SpecCard icon="fi fi-rr-processor" label="CPU" value={mySpecs.cpu_name} subValue={`${mySpecs.cpu_cores}C / ${mySpecs.cpu_threads}T`} />
              <SpecCard icon="fi fi-rr-microchip" label="메모리" value={`${mySpecs.ram_total_gb.toFixed(1)} GB`} subValue={`여유: ${mySpecs.ram_free_gb.toFixed(1)} GB`} />
              <SpecCard icon="fi fi-rr-display-code" label="GPU" value={mySpecs.gpu_name || '내장 그래픽'} subValue={mySpecs.gpu_memory_mb > 0 ? `${mySpecs.gpu_memory_mb} MB` : 'VRAM 없음'} />
              <SpecCard icon="fi fi-rr-globe" label="네트워크" value={mySpecs.ip_address} subValue={mySpecs.mac_address} />
              <SpecCard icon="fi fi-rr-database" label="디스크" value={`${mySpecs.disk_free_gb.toFixed(1)} GB`} subValue="C: 여유 공간" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'white', padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#475569' }}>
                  <i className="fi fi-rr-print" style={{ marginRight: 8 }} /> 실제 프린터 목록
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {mySpecs.printers && mySpecs.printers.length > 0 ? (
                    mySpecs.printers.map((p, i) => <span key={i} style={{ fontSize: 12, padding: '4px 10px', background: '#f1f5f9', borderRadius: 6, color: '#334155' }}>{p}</span>)
                  ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>연결된 실물 프린터 없음</div>}
                </div>
              </div>
              <div style={{ background: 'white', padding: 20, borderRadius: 16, border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#475569' }}>
                  <i className="fi fi-rr-screen" style={{ marginRight: 8 }} /> 연결된 모니터
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {mySpecs.monitors && mySpecs.monitors.length > 0 ? (
                    mySpecs.monitors.map((m, i) => <span key={i} style={{ fontSize: 12, padding: '4px 10px', background: '#f1f5f9', borderRadius: 6, color: '#334155' }}>{m}</span>)
                  ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>모니터 정보 없음</div>}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* Network PC List */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fi fi-rr-computer" />
            교내 PC 자산 관리 현황
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setFormData({ id: '', hostname: '', ip_address: '', mac_address: '', os: '', cpu: '', ram: '', location: '', label: '', grade: 0, class_num: 0, department: '', user_name: '', printers: '', monitors: '' }); setShowAddModal(true); }} 
              style={{ background: 'white', color: '#2563eb', padding: '8px 16px', borderRadius: 8, border: '1px solid #2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              수동 등록
            </button>
            <button onClick={fetchRecords} style={{ background: 'white', color: '#475569', padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
              새로고침
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px' }}>학년/반/부서</th>
                <th style={{ padding: '12px 16px' }}>사용자</th>
                <th style={{ padding: '12px 16px' }}>장치 정보 (프린터/모니터)</th>
                <th style={{ padding: '12px 16px' }}>IP/MAC</th>
                <th style={{ padding: '12px 16px' }}>위치/라벨</th>
                <th style={{ padding: '12px 16px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: r.grade > 0 ? '#4f46e5' : '#475569' }}>
                      {r.grade > 0 ? `${r.grade}학년 ${r.class_num}반` : r.department || '—'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.user_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>🖨️ {r.printers || '없음'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>🖥️ {r.monitors || '없음'}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <div>{r.ip_address}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{r.mac_address}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div>{r.location || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.label}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openEditModal(r)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>편집</button>
                      <button onClick={() => handleDeletePC(r.id)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '100%', maxWidth: 550, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{showEditModal ? '자산 정보 수정' : '새 자산 등록'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1e293b' }}>👤 담당자 정보</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={{ fontSize: 12, fontWeight: 600 }}>교사 성함</label>
                  <input value={formData.user_name} onChange={e => setFormData({ ...formData, user_name: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600 }}>소속 부서</label>
                  <input value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={{ fontSize: 12, fontWeight: 600 }}>담당 학년</label>
                  <input type="number" value={formData.grade || ''} onChange={e => setFormData({ ...formData, grade: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600 }}>담당 반</label>
                  <input type="number" value={formData.class_num || ''} onChange={e => setFormData({ ...formData, class_num: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                </div>
              </div>

              <div style={{ background: '#f0f9ff', padding: 16, borderRadius: 12, border: '1px solid #bae6fd' }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#0369a1' }}>📠 연결 장치 정보</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>프린터 모델명</label>
                    <input value={formData.printers} onChange={e => setFormData({ ...formData, printers: e.target.value })} placeholder="예: HP OfficeJet 8710 (쉼표로 구분)" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>모니터 정보 (인치)</label>
                    <input value={formData.monitors} onChange={e => setFormData({ ...formData, monitors: e.target.value })} placeholder="예: 27인치 모니터 (쉼표로 구분)" style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} />
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>💻 기기 정보</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div><label style={{ fontSize: 12, fontWeight: 600 }}>호스트명 *</label>
                  <input value={formData.hostname} onChange={e => setFormData({ ...formData, hostname: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600 }}>IP 주소</label>
                  <input value={formData.ip_address} onChange={e => setFormData({ ...formData, ip_address: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                </div>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>MAC 주소 *</label>
                <input value={formData.mac_address} disabled={showEditModal} onChange={e => setFormData({ ...formData, mac_address: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)', background: showEditModal ? '#f1f5f9' : 'white' }} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>설치 위치</label>
                <input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
                <div><label style={{ fontSize: 12, fontWeight: 600 }}>관리 라벨</label>
                <input value={formData.label} onChange={e => setFormData({ ...formData, label: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid var(--border)' }} /></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button onClick={() => { setShowAddModal(false); setShowEditModal(false); }} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: 'pointer' }}>취소</button>
                <button onClick={showEditModal ? handleUpdatePC : handleRegisterPC} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                  {showEditModal ? '수정 완료' : '등록 완료'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SpecCard({ icon, label, value, subValue }: { icon: string; label: string; value: string; subValue: string }) {
  return (
    <div style={{ background: 'white', padding: 16, borderRadius: 16, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <i className={icon} style={{ color: '#64748b', fontSize: 14 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{subValue}</div>
    </div>
  )
}
