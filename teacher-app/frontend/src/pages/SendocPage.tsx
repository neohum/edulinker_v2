import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getToken, apiFetch } from '../api'
import type { UserInfo } from '../App'

interface Sendoc {
  id: string
  title: string
  status: string
  background_url: string
  fields_json: string
  created_at: string
  author?: { name: string }
}

interface PendingDoc extends Sendoc {
  is_signed: boolean
  signed_at?: string
  signature_image_url?: string
  form_data_json?: string
}

interface DocField {
  id: string
  type: 'text' | 'signature'
  x: number
  y: number
  width: number
  height: number
  label: string
  value?: string
  signatureData?: string
  fontSize?: number
}

interface RecipientStatus {
  id: string
  user: { name: string; role: string; grade: number; class_num: number; number: number }
  is_signed: boolean
  signed_at: string
  signature_image_url: string
  form_data_json?: string
}

interface SendocPageProps {
  user: UserInfo
}

export default function SendocPage({ user }: SendocPageProps) {
  const isTeacher = user.role === 'teacher' || user.role === 'admin'

  const [docs, setDocs] = useState<Sendoc[]>([])
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([])
  const [loading, setLoading] = useState(true)

  // Unified Search & Dual Pagination States
  const [searchQuery, setSearchQuery] = useState('')
  const [sentPage, setSentPage] = useState(1)
  const [receivedPage, setReceivedPage] = useState(1)
  const ITEMS_PER_PAGE = 8

  // View Modes: list -> selector -> designer -> signer/viewer
  const [viewMode, setViewMode] = useState<'list' | 'selector' | 'designer' | 'signer' | 'viewer'>('list')

  // Designer States
  const [activeDoc, setActiveDoc] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [serverBgUrl, setServerBgUrl] = useState<string | null>(null)
  const [fields, setFields] = useState<DocField[]>([])

  // File Selector States (from HwpConverterPage)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [hancom, setHancom] = useState<{ installed: boolean, version: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Status/Recipient states
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [recipients, setRecipients] = useState<RecipientStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showRecipientModal, setShowRecipientModal] = useState(false)

  // Signature states
  const [activeSignField, setActiveSignField] = useState<string | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Zoom & Full Canvas Drawing
  const [zoom, setZoom] = useState(1)
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const fullCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isFullDrawing, setIsFullDrawing] = useState(false)
  const [penSize, setPenSize] = useState(3)
  const [isEraser, setIsEraser] = useState(false)

  // Document Panning
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const handlePanStart = (e: React.MouseEvent) => {
    if (e.button !== 0 || isDrawingMode) return;
    isPanningRef.current = true;
    if (scrollContainerRef.current) {
      panStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: scrollContainerRef.current.scrollLeft, scrollTop: scrollContainerRef.current.scrollTop };
      scrollContainerRef.current.style.cursor = 'grabbing';
      scrollContainerRef.current.style.userSelect = 'none';
    }
  }

  const handlePanMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current || !scrollContainerRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    scrollContainerRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    scrollContainerRef.current.scrollTop = panStartRef.current.scrollTop - dy;
  }

  const handlePanEnd = () => {
    isPanningRef.current = false;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.cursor = isDrawingMode ? 'default' : (zoom > 1 ? 'grab' : 'default');
      scrollContainerRef.current.style.removeProperty('user-select');
    }
  }

  useEffect(() => {
    if (isTeacher) fetchDocs()
    fetchPendingDocs()
    fetchUsers()
    checkHancom()
  }, [])

  const checkHancom = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.CheckHancom) setHancom(await wailsApp.CheckHancom())
    } catch { }
  }

  const fetchDocs = async () => {
    try {
      const res = await apiFetch('/api/plugins/sendoc')
      if (res.ok) setDocs(await res.json() || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const fetchPendingDocs = async () => {
    try {
      const res = await apiFetch('/api/plugins/sendoc/sign')
      if (res.ok) {
        const data = await res.json()
        setPendingDocs(data || [])
      }
    } catch (e) { console.error(e) } finally { if (!isTeacher) setLoading(false) }
  }

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/core/users')
      if (res.ok) {
        const data = await res.json()
        setAllUsers(data.users || [])
      }
    } catch (e) { console.error(e) }
  }

  const fetchStatus = async (doc: Sendoc) => {
    setActiveDoc(doc); setLoadingStatus(true); setShowStatusModal(true)
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${doc.id}/signatures`)
      if (res.ok) setRecipients(await res.json() || [])
    } catch { toast.error('상태 조회 실패') }
    finally { setLoadingStatus(false) }
  }

  // --- File Selection Logic ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const name = file.name.toLowerCase()
      if (name.endsWith('.hwp') || name.endsWith('.hwpx')) {
        setSelectedFile(file)
      } else {
        toast.error('HWP 또는 HWPX 파일만 가능합니다.')
      }
    }
  }

  const handleProcessDocument = async () => {
    if (!selectedFile) return
    setIsConverting(true)
    try {
      const wailsApp = (window as any).go?.main?.App
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
        reader.onerror = () => reject(new Error('파일 읽기 실패'))
        reader.readAsDataURL(selectedFile)
      })

      const fileName = selectedFile.name
      const lowerName = fileName.toLowerCase()

      // Convert HWP → image (PNG)
      if (!lowerName.endsWith('.hwp') && !lowerName.endsWith('.hwpx')) {
        throw new Error('HWP/HWPX 파일만 지원됩니다.')
      }
      const convRes = await wailsApp.ConvertHwp(fileName, base64, 'image')
      if (!convRes.success || !convRes.data) throw new Error(convRes.error || 'HWP 변환 실패')
      const imgBase64 = convRes.data

      // 2. Upload image to server
      const imgName = fileName.replace(/\.[^/.]+$/, '') + '.png'
      const uploadRes = await wailsApp.UploadFileFromBytes(imgName, imgBase64)
      if (!uploadRes.url) throw new Error(uploadRes.error || '서버 업로드 실패')

      // 3. Local blob URL for immediate preview
      const binaryStr = atob(imgBase64)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'image/png' })
      const blobUrl = URL.createObjectURL(blob)

      setBackgroundUrl(blobUrl)
      setServerBgUrl(uploadRes.url)
      setViewMode('designer')
      toast.success('문서가 준비되었습니다.')
    } catch (err: any) {
      toast.error(err.message || '처리 오류')
    } finally {
      setIsConverting(false)
    }
  }

  // --- Designer/Signer Tools ---
  const addField = (type: 'text' | 'signature') => {
    const newField: DocField = {
      id: Math.random().toString(36).substr(2, 9),
      type, x: 20, y: 20, width: type === 'signature' ? 120 : 150, height: type === 'signature' ? 60 : 32,
      label: type === 'signature' ? '서명란' : '내용 입력'
    }
    setFields(prev => [...prev, newField])
  }

  const handleFieldDrag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMode === 'viewer') return
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startX = e.clientX; const startY = e.clientY
    const field = fields.find(f => f.id === id)
    if (!field) return
    const initialX = (field.x / 100) * rect.width; const initialY = (field.y / 100) * rect.height
    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX; const dy = me.clientY - startY
      setFields(prev => prev.map(f => f.id === id ? { ...f, x: Math.min(90, Math.max(0, ((initialX + dx) / rect.width) * 100)), y: Math.min(95, Math.max(0, ((initialY + dy) / rect.height) * 100)) } : f))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
  }

  const handleFieldResize = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMode === 'viewer') return
    const startX = e.clientX; const startY = e.clientY
    const field = fields.find(f => f.id === id)
    if (!field) return
    const initialWidth = field.width; const initialHeight = field.height

    const onMouseMove = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / zoom;
      const dy = (me.clientY - startY) / zoom;
      setFields(prev => prev.map(f => f.id === id ? { ...f, width: Math.max(30, initialWidth + dx), height: Math.max(30, initialHeight + dy) } : f))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }
    document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
  }

  // --- Signature Pad (Box) ---
  const startDrawing = (e: any) => { setIsDrawing(true); draw(e); }
  const stopDrawing = () => { setIsDrawing(false); signatureCanvasRef.current?.getContext('2d')?.beginPath(); }
  const draw = (e: any) => {
    if (!isDrawing || !signatureCanvasRef.current) return
    const canvas = signatureCanvasRef.current; const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left; const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y)
  }
  const saveSignature = () => {
    if (activeSignField && signatureCanvasRef.current) {
      const data = signatureCanvasRef.current.toDataURL()
      setFields(prev => prev.map(f => f.id === activeSignField ? { ...f, signatureData: data } : f))
      setActiveSignField(null)
    }
  }

  // --- Full Canvas Drawing ---
  const startFullDrawing = (e: any) => {
    if (!isDrawingMode || !fullCanvasRef.current) return
    const canvas = fullCanvasRef.current; const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const scaleFactor = 2
    const x = (((e.clientX || e.touches?.[0]?.clientX) - rect.left) / zoom) * scaleFactor
    const y = (((e.clientY || e.touches?.[0]?.clientY) - rect.top) / zoom) * scaleFactor
    ctx.beginPath(); ctx.moveTo(x, y)
    setIsFullDrawing(true); drawFull(e);
  }
  const stopFullDrawing = () => {
    setIsFullDrawing(false); fullCanvasRef.current?.getContext('2d')?.beginPath();
  }
  const drawFull = (e: any) => {
    if (!isDrawingMode || !isFullDrawing || !fullCanvasRef.current) return
    const canvas = fullCanvasRef.current; const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const scaleFactor = 2
    const x = (((e.clientX || e.touches?.[0]?.clientX) - rect.left) / zoom) * scaleFactor
    const y = (((e.clientY || e.touches?.[0]?.clientY) - rect.top) / zoom) * scaleFactor

    let effectivePen = penSize === 1 ? 1 : penSize * 1.5
    let lw = (effectivePen * scaleFactor) / zoom
    if (lw < 2) lw = 2 // Prevents sub-pixel anti-aliasing which looks like translucency

    ctx.lineWidth = lw; ctx.lineCap = 'round'
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#000'
    }
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y)
  }

  const fetchImageAsBlob = async (url: string): Promise<string> => {
    const apiPath = url.replace(/^https?:\/\/[^/]+/, '')
    const res = await apiFetch(apiPath)
    if (!res.ok) throw new Error('이미지 로드 실패')
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }

  const openSignView = async (doc: PendingDoc) => {
    setActiveDoc(doc); setTitle(doc.title); setBackgroundUrl(null)
    try {
      let f = JSON.parse(doc.fields_json || '[]')
      if (doc.is_signed && doc.form_data_json && doc.form_data_json !== '{}' && doc.form_data_json !== '[]') {
        try {
          const recFields = JSON.parse(doc.form_data_json)
          if (Array.isArray(recFields) && recFields.length > 0) f = recFields
        } catch { }
      }
      setFields(f)
    } catch { setFields([]) }
    setViewMode('signer')
    try {
      const blobUrl = await fetchImageAsBlob(doc.background_url)
      setBackgroundUrl(blobUrl)
    } catch {
      toast.error('문서를 불러올 수 없습니다.')
    }
  }

  const openResultViewer = async (doc: Sendoc, recipient: RecipientStatus) => {
    setActiveDoc(doc); setTitle(`${doc.title} - ${recipient.user.name}의 응답`); setBackgroundUrl(null)
    try {
      const baseFields: DocField[] = JSON.parse(doc.fields_json || '[]')
      let finalFields = baseFields
      if (recipient.form_data_json && recipient.form_data_json !== '{}' && recipient.form_data_json !== '[]') {
        try {
          const recFields = JSON.parse(recipient.form_data_json)
          if (Array.isArray(recFields) && recFields.length > 0) finalFields = recFields
        } catch { }
      }
      finalFields = finalFields.map(f => {
        if (f.type === 'signature' && recipient.signature_image_url) {
          return { ...f, signatureData: recipient.signature_image_url }
        }
        return f
      })
      setFields(finalFields)
    } catch { setFields([]) }
    setShowStatusModal(false); setViewMode('viewer')
    try {
      const blobUrl = await fetchImageAsBlob(doc.background_url)
      setBackgroundUrl(blobUrl)
    } catch {
      toast.error('문서를 불러올 수 없습니다.')
    }
  }

  const handleSend = async () => {
    if (!title) return toast.error('제목을 입력하세요.')
    if (selectedUsers.length === 0) return toast.error('수신자를 선택하세요.')
    try {
      const res = await apiFetch('/api/plugins/sendoc', {
        method: 'POST',
        body: JSON.stringify({ title, content: 'Doc', background_url: serverBgUrl || backgroundUrl, fields_json: JSON.stringify(fields), requires_signature: fields.some(f => f.type === 'signature'), target_user_ids: selectedUsers })
      })
      if (res.ok) { toast.success('발송 완료!'); setViewMode('list'); fetchDocs() }
    } catch { toast.error('발송 실패') }
  }

  const handleSubmitSignature = async () => {
    if (!activeDoc) return
    try {
      const isCanvasBlank = (cvs: HTMLCanvasElement) => {
        const blank = document.createElement('canvas'); blank.width = cvs.width; blank.height = cvs.height;
        return cvs.toDataURL() === blank.toDataURL();
      }
      let sigData = ''
      if (fullCanvasRef.current && !isCanvasBlank(fullCanvasRef.current)) {
        sigData = fullCanvasRef.current.toDataURL()
      } else {
        sigData = fields.find(f => f.type === 'signature')?.signatureData || ''
      }

      const res = await apiFetch(`/api/plugins/sendoc/sign/${activeDoc.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ signature_image_url: sigData, form_data_json: JSON.stringify(fields) })
      })
      if (res.ok) {
        toast.success('제출 완료!'); setViewMode('list'); fetchPendingDocs()
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error('제출 실패: ' + (errorData.error || res.statusText));
      }
    } catch (e: any) {
      toast.error('제출 중 오류 발생: ' + (e.message || '알 수 없는 오류'))
    }
  }

  if (viewMode === 'selector') {
    return (
      <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <button onClick={() => setViewMode('list')} className="btn-secondary" style={{ padding: '8px 12px' }}><i className="fi fi-rr-arrow-left" /></button>
          <h3 style={{ fontSize: 22, fontWeight: 700 }}>새 문서 작성 - 파일 선택</h3>
        </div>

        {hancom && (
          <div style={{ marginBottom: 20, padding: '12px 20px', borderRadius: 12, background: hancom.installed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${hancom.installed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
            <i className={`fi ${hancom.installed ? 'fi-rr-check-circle' : 'fi-rr-exclamation'}`} style={{ color: hancom.installed ? '#22c55e' : '#ef4444', fontSize: 18 }} />
            <div>{hancom.installed ? <span>한컴오피스 <strong>{hancom.version}</strong> 감지됨 — HWP 변환이 가능합니다.</span> : <span style={{ color: '#ef4444' }}>한컴오피스가 감지되지 않았습니다. PDF 파일만 사용 가능합니다.</span>}</div>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) setSelectedFile(f); }}
          style={{ background: isDragging ? '#eff6ff' : 'white', padding: 60, borderRadius: 24, border: isDragging ? '2px solid #3b82f6' : '2px dashed #e2e8f0', textAlign: 'center', cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
        >
          {!selectedFile ? (
            <div>
              <i className="fi fi-rr-upload" style={{ fontSize: 48, color: '#94a3b8', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, fontSize: 18 }}>문서를 드래그하거나 클릭하여 선택</p>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>지원 형식: .hwp, .hwpx</p>
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              <i className="fi fi-rr-document" style={{ fontSize: 48, color: '#3b82f6', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, fontSize: 18 }}>{selectedFile.name}</p>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
                <button onClick={handleProcessDocument} disabled={isConverting} className="btn-primary" style={{ padding: '12px 32px' }}>
                  {isConverting ? '변환 및 업로드 중...' : '이 파일로 문서 작성하기'}
                </button>
                <button onClick={() => setSelectedFile(null)} className="btn-secondary">파일 변경</button>
              </div>
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".hwp,.hwpx" style={{ display: 'none' }} />
        </div>
      </div>
    )
  }

  if (viewMode === 'designer' || viewMode === 'signer' || viewMode === 'viewer') {
    const isSigner = viewMode === 'signer'; const isViewer = viewMode === 'viewer'
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9' }}>
        <div style={{ padding: '12px 24px', background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setViewMode('list')} className="btn-secondary" style={{ padding: '8px 12px' }}><i className="fi fi-rr-arrow-left" /></button>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="문서 제목을 입력하세요" style={{ fontSize: 16, fontWeight: 700, border: 'none', outline: 'none', background: 'transparent', width: 300 }} disabled={isSigner || isViewer} />
              {(isSigner || isViewer) && activeDoc && <div style={{ fontSize: 11, color: '#64748b' }}>발신: {activeDoc.author?.name || '교사'} · {new Date(activeDoc.created_at).toLocaleString()}</div>}
            </div>
            <div style={{ display: 'flex', background: '#f8fafc', borderRadius: 8, padding: 2, marginLeft: 24, border: '1px solid #e2e8f0', alignItems: 'center' }}>
              <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="btn-secondary" style={{ border: 'none', outline: 'none', background: 'transparent', padding: '4px 12px', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
              <div style={{ padding: '0 4px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', width: 50, justifyContent: 'center', color: '#475569' }}>{Math.round(zoom * 100)}%</div>
              <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="btn-secondary" style={{ border: 'none', outline: 'none', background: 'transparent', padding: '4px 12px', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isSigner && !isViewer && <button onClick={() => setShowRecipientModal(true)} className="btn-primary" style={{ padding: '8px 24px' }}>발송하기</button>}
            {isSigner && <button onClick={handleSubmitSignature} className="btn-primary" style={{ padding: '8px 24px' }} disabled={activeDoc?.is_signed}>{activeDoc?.is_signed ? '이미 제출됨' : '작성 완료 및 제출'}</button>}
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {!isViewer && (
            <div style={{ width: 240, background: 'white', borderRight: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>도구 상자</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <button onClick={() => { setIsDrawingMode(false); addField('text') }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 10, border: '1px solid #eee', background: 'white', cursor: 'pointer' }}>
                  <i className="fi fi-rr-text-input" style={{ color: '#3b82f6' }} /> <span style={{ fontSize: 14 }}>텍스트 추가</span>
                </button>
                <button onClick={() => { setIsDrawingMode(false); addField('signature') }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 10, border: '1px solid #eee', background: 'white', cursor: 'pointer' }}>
                  <i className="fi fi-rr-edit" style={{ color: '#ef4444' }} /> <span style={{ fontSize: 14 }}>서명 영역 추가</span>
                </button>
                {(isSigner || viewMode === 'designer') && (
                  <>
                    <div style={{ height: 1, background: '#f1f5f9', margin: '8px 0' }} />
                    <button
                      onClick={() => setIsDrawingMode(!isDrawingMode)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 10, border: `2px solid ${isDrawingMode ? '#4f46e5' : 'transparent'}`, background: isDrawingMode ? '#e0e7ff' : '#f8fafc', outline: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      <i className="fi fi-rr-pencil" style={{ color: isDrawingMode ? '#4f46e5' : '#64748b' }} />
                      <span style={{ fontSize: 14, fontWeight: isDrawingMode ? 700 : 500, color: isDrawingMode ? '#4f46e5' : '#475569' }}>전체 영역 그리기</span>
                    </button>
                    {isDrawingMode && (
                      <div style={{ marginTop: 4, padding: '12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                          <button onClick={() => setIsEraser(false)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${!isEraser ? '#4f46e5' : '#cbd5e1'}`, background: !isEraser ? '#e0e7ff' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: !isEraser ? 700 : 500, color: !isEraser ? '#4f46e5' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><i className="fi fi-rr-pencil" /> 펜</button>
                          <button onClick={() => setIsEraser(true)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${isEraser ? '#4f46e5' : '#cbd5e1'}`, background: isEraser ? '#e0e7ff' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: isEraser ? 700 : 500, color: isEraser ? '#4f46e5' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><i className="fi fi-rr-eraser" /> 지우개</button>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>펜/지우개 굵기</span> <strong>{penSize}px</strong></div>
                          <input type="range" min="1" max="30" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} style={{ width: '100%', cursor: 'pointer', accentColor: '#4f46e5' }} />
                        </div>
                        <button onClick={() => { if (window.confirm('그린 내용을 모두 초기화 하시겠습니까?')) { fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 800, 1131) } }} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><i className="fi fi-rr-trash" /> 캔버스 초기화</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div
            ref={scrollContainerRef}
            onMouseDown={handlePanStart} onMouseMove={handlePanMove} onMouseUp={handlePanEnd} onMouseLeave={handlePanEnd}
            style={{ flex: 1, overflow: 'auto', padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', cursor: isDrawingMode ? 'default' : (zoom > 1 ? 'grab' : 'default') }}
          >
            <div style={{ position: 'relative', width: 800 * zoom, height: 1131 * zoom }}>
              <div ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: 800, height: 1131, transform: `scale(${zoom})`, transformOrigin: 'top left', background: 'white', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                {backgroundUrl ? (
                  <img src={backgroundUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="문서 배경" />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <div className="spinner" style={{ marginBottom: 16 }} />
                    <p>문서를 불러오는 중...</p>
                  </div>
                )}

                {/* Free Drawing Canvas Layer */}
                <canvas
                  ref={fullCanvasRef}
                  width={1600} height={2262}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: isDrawingMode ? 'auto' : 'none', cursor: isDrawingMode ? 'crosshair' : 'default' }}
                  onMouseDown={startFullDrawing} onMouseMove={drawFull} onMouseUp={stopFullDrawing} onMouseLeave={stopFullDrawing}
                />

                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: isDrawingMode ? 'none' : 'auto' }}>
                  {fields.map(f => (
                    <div key={f.id} onMouseDown={(e) => handleFieldDrag(f.id, e)} style={{
                      position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: f.width, height: f.height,
                      background: f.signatureData ? 'white' : (f.type === 'signature' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'),
                      border: f.signatureData ? '1px solid #eee' : `2px dashed ${f.type === 'signature' ? '#ef4444' : '#3b82f6'}`,
                      borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isViewer ? 'default' : 'move'
                    }}>
                      {f.type === 'text' ? (
                        <>
                          <input placeholder="내용 입력..." value={f.value || ''} disabled={isViewer} onChange={(e) => setFields(prev => prev.map(field => field.id === f.id ? { ...field, value: e.target.value } : field))} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', padding: '0 8px', fontSize: f.fontSize || 13, pointerEvents: isViewer ? 'none' : 'auto' }} />
                          {!isViewer && (
                            <div style={{ position: 'absolute', top: -32, right: 16, display: 'flex', gap: 4, background: '#1e293b', padding: '4px 6px', borderRadius: 6, zIndex: 100, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} onMouseDown={(e) => e.stopPropagation()}>
                              <button onClick={() => setFields(prev => prev.map(field => field.id === f.id ? { ...field, fontSize: Math.max(8, (field.fontSize || 13) - 1) } : field))} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '0 4px', display: 'flex', alignItems: 'center' }}>-</button>
                              <span style={{ color: 'white', fontSize: 11, alignSelf: 'center', minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{f.fontSize || 13}</span>
                              <button onClick={() => setFields(prev => prev.map(field => field.id === f.id ? { ...field, fontSize: Math.min(72, (field.fontSize || 13) + 1) } : field))} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '0 4px', display: 'flex', alignItems: 'center' }}>+</button>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div onClick={() => !isViewer && !activeDoc?.is_signed && setActiveSignField(f.id)} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !isViewer ? 'pointer' : 'default' }}>
                            {f.signatureData ? <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <><i className="fi fi-rr-edit" style={{ marginRight: 6 }} /> {!isViewer ? '서명하기' : '서명란'}</>}
                          </div>
                          {!isViewer && (
                            <div onMouseDown={(e) => handleFieldResize(f.id, e)} style={{ position: 'absolute', bottom: -6, right: -6, width: 14, height: 14, background: '#ef4444', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid white', zIndex: 50, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                          )}
                        </>
                      )}
                      {!isViewer && <button onClick={(e) => { e.stopPropagation(); setFields(prev => prev.filter(field => field.id !== f.id)); }} style={{ position: 'absolute', top: -10, right: -10, background: '#475569', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>✕</button>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {activeSignField && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
            <div style={{ background: 'white', padding: 24, borderRadius: 20 }}>
              <canvas ref={signatureCanvasRef} width={400} height={200} style={{ border: '1px solid #ddd', borderRadius: 8, background: '#fcfcfc' }} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} />
              <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <button onClick={() => setActiveSignField(null)} className="btn-secondary">취소</button>
                <button onClick={() => signatureCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 400, 200)} className="btn-secondary">지우기</button>
                <button onClick={saveSignature} className="btn-primary">서명 완료</button>
              </div>
            </div>
          </div>
        )}

        {showRecipientModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 500, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              <h4 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>수신자 선택 ({selectedUsers.length}명)</h4>
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {allUsers.map(u => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', border: '1px solid #eee', borderRadius: 12, cursor: 'pointer', background: selectedUsers.includes(u.id) ? '#f0f9ff' : 'white' }}>
                    <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={(e) => e.target.checked ? setSelectedUsers([...selectedUsers, u.id]) : setSelectedUsers(selectedUsers.filter(id => id !== u.id))} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{u.name} <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>{u.role}</span></div><div style={{ fontSize: 12, color: '#64748b' }}>{u.grade > 0 ? `${u.grade}학년 ${u.class_num}반` : '소속 정보 없음'}</div></div>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10 }}><button onClick={() => setShowRecipientModal(false)} className="btn-secondary" style={{ flex: 1 }}>취소</button><button onClick={handleSend} className="btn-primary" style={{ flex: 2 }}>발송하기</button></div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div><h3 style={{ fontSize: 22, fontWeight: 700 }}>전자문서 및 서명</h3><p style={{ color: '#64748b', fontSize: 14 }}>문서를 발송하고 수집하세요.</p></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 280 }}>
            <i className="fi fi-rr-search" style={{ position: 'absolute', left: 14, top: 12, color: '#94a3b8', fontSize: 15 }} />
            <input type="text" placeholder="모든 문서 제목 통합 검색..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSentPage(1); setReceivedPage(1); }} style={{ width: '100%', padding: '10px 16px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
          </div>
          {isTeacher && <button onClick={() => { setViewMode('selector'); setSelectedFile(null); setFields([]); setBackgroundUrl(null); setServerBgUrl(null); }} className="btn-primary" style={{ padding: '12px 24px' }}>새 문서 작성</button>}
        </div>
      </div>

      <div style={{ marginBottom: 24 }} />

      {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isTeacher ? '1fr 1fr' : '1fr', gap: 40, alignItems: 'start' }}>

          {/* Left Panel: Sent Documents */}
          {isTeacher && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fi fi-rr-paper-plane" style={{ color: '#4f46e5' }} /> 발송한 문서
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                {docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((sentPage - 1) * ITEMS_PER_PAGE, sentPage * ITEMS_PER_PAGE).map(d => (
                  <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', background: '#f1f5f9', borderRadius: 20 }}>{d.status}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.title}</h4>
                    <button onClick={() => fetchStatus(d)} className="btn-secondary" style={{ width: '100%', fontSize: 12, padding: '8px 0' }}>진행현황 보기</button>
                  </div>
                ))}
              </div>
              {/* Sent Pagination */}
              {docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setSentPage(p => Math.max(1, p - 1))} disabled={sentPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{sentPage} / {Math.ceil(docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
                  <button onClick={() => setSentPage(p => Math.min(Math.ceil(docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={sentPage === Math.ceil(docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
                </div>
              )}
            </div>
          )}

          {/* Right Panel: Pending/Received Documents */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fi fi-rr-download" style={{ color: '#0ea5e9' }} /> 받은 문서
              </h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {pendingDocs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((receivedPage - 1) * ITEMS_PER_PAGE, receivedPage * ITEMS_PER_PAGE).map(d => (
                <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, padding: '3px 10px', background: d.is_signed ? '#f1f5f9' : '#fee2e2', color: d.is_signed ? '#475569' : '#ef4444', borderRadius: 20 }}>{d.is_signed ? '서명완료' : '서명필요'}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.title}</h4>
                  <button onClick={() => openSignView(d)} className="btn-primary" style={{ width: '100%', fontSize: 12, padding: '8px 0' }}>{d.is_signed ? '작성 내용 확인' : '문서 확인 및 서명'}</button>
                </div>
              ))}
            </div>
            {/* Received Pagination */}
            {pendingDocs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                <button onClick={() => setReceivedPage(p => Math.max(1, p - 1))} disabled={receivedPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
                <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{receivedPage} / {Math.ceil(pendingDocs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
                <button onClick={() => setReceivedPage(p => Math.min(Math.ceil(pendingDocs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={receivedPage === Math.ceil(pendingDocs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showStatusModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h4 style={{ fontSize: 20, fontWeight: 700 }}>전송 및 서명 현황</h4>
              <button onClick={() => setShowStatusModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {loadingStatus ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recipients.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #eee', borderRadius: 12, background: r.is_signed ? '#f0fdf4' : 'white' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{r.user.name} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>({r.user.role})</span></div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{r.is_signed ? `서명 완료: ${new Date(r.signed_at).toLocaleString()}` : '서명 대기 중'}</div>
                    </div>
                    {r.is_signed && <button onClick={() => openResultViewer(activeDoc, r)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>결과 확인</button>}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowStatusModal(false)} className="btn-secondary" style={{ marginTop: 24, width: '100%' }}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
