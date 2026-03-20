import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Sendoc {
  id: string
  title: string
  content: string
  status: string
  requires_signature: boolean
  created_at: string
}

export default function SendocPage() {
  const [docs, setDocs] = useState<Sendoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDocs()
  }, [])

  const fetchDocs = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:5200/api/plugins/sendoc', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setDocs(data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async (id: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:5200/api/plugins/sendoc/${id}/pdf`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('PDF 다운로드 실패')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `document_${id}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      toast.error('오류 발생: ' + (e as Error).message)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600 }}>전자문서·서명 내역</h3>
        <button style={{
          background: 'var(--primary)', color: 'white', padding: '8px 16px',
          borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600
        }}>
          새 문서/서명 요청전송
        </button>
      </div>

      {loading ? (
        <div>문서 불러오는 중...</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          기록된 전자문서가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: 'white', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, padding: '2px 8px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 4, fontWeight: 600 }}>
                    상태: {d.status}
                  </span>
                  {d.requires_signature && <span style={{ fontSize: 12, color: '#e11d48', fontWeight: 600 }}>서명 필수 📝</span>}
                </div>
                <h4 style={{ fontSize: 16, fontWeight: 600 }}>{d.title}</h4>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>생성일: {new Date(d.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toast.info('서명 상태를 불러오는 로직(Phase 1.5 연결 필요)')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'white', cursor: 'pointer', fontSize: 13 }}>
                  진행상황
                </button>
                <button onClick={() => handleDownloadPDF(d.id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  최종 PDF 다운로드
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
