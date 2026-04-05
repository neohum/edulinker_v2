import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getToken, apiFetch } from '../api'
import type { UserInfo } from '../App'
import { useSendocAPI } from '../hooks/useSendocAPI'
import { useDocumentUpload } from '../hooks/useDocumentUpload'
import { SendocDesignerCanvas } from '../components/sendoc/SendocDesignerCanvas'
import { SendocRecipientModal } from '../components/sendoc/SendocRecipientModal'
import { SendocResultViewer } from '../components/sendoc/SendocResultViewer'
import type { DocField, Stroke, Sendoc, PendingDoc, RecipientStatus, Point } from '../types/sendoc'

interface SendocPageProps {
  user: UserInfo
}

export default function SendocPage({ user }: SendocPageProps) {
  const isTeacher = user.role === 'teacher' || user.role === 'admin'


  // Unified Search & Dual Pagination States
  const [searchQuery, setSearchQuery] = useState('')
  const [sentPage, setSentPage] = useState(1)
  const [receivedPage, setReceivedPage] = useState(1)
  const [draftsPage, setDraftsPage] = useState(1)
  const ITEMS_PER_PAGE = 8

  // View Modes: list -> selector -> designer -> signer/viewer
  const [viewMode, setViewMode] = useState<'list' | 'selector' | 'designer' | 'signer' | 'viewer'>('list')

  // Designer States
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [activeDoc, setActiveDoc] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [serverBgUrl, setServerBgUrl] = useState<string | null>(null)
  const [fields, setFields] = useState<DocField[]>([])
  const [resultViewerData, setResultViewerData] = useState<{ doc: Sendoc, fields: DocField[], bgUrl: string, bulkMode?: boolean, bulkRecipients?: { recipient: RecipientStatus, fields: DocField[] }[] } | null>(null)

  // File Selector States (from HwpConverterPage)
  const [isDragging, setIsDragging] = useState(false)
  const [pageImages, setPageImages] = useState<string[]>([])   // base64 per page
  const [currentPageIdx, setCurrentPageIdx] = useState(0)      // which page is shown
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Status/Recipient states
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [recipients, setRecipients] = useState<RecipientStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null)
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)

  // Signature states
  const [activeSignField, setActiveSignField] = useState<string | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingField = useRef(false)
  const [draftCanvasData, setDraftCanvasData] = useState<string | null>(null)

  // Zoom & Full Canvas Drawing
  const [zoom, setZoom] = useState(1)
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const fullCanvasRef = useRef<HTMLCanvasElement>(null)
  const isFullDrawingRef = useRef(false)
  const [penSize, setPenSize] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const currentStrokeRef = useRef<Stroke | null>(null)
  const totalDrawnRef = useRef(0)
  const [activeCharPicker, setActiveCharPicker] = useState<string | null>(null)
  const specialChars = ['✓', 'O', 'X', '※', '★', '☆', '■', '□', '●']

  // Draft Feedback State
  const [isDraftSaved, setIsDraftSaved] = useState(false)
  const [strokeRedrawTrigger, setStrokeRedrawTrigger] = useState(0)

  const { docs, pendingDocs, allUsers, loading, setLoading, fetchDocs, fetchPendingDocs } = useSendocAPI(isTeacher)
  const { selectedFile, setSelectedFile, isConverting, convertProgress, hancom, excelStatus, handleFileSelect, handleProcessDocument } = useDocumentUpload({
    setPageImages, setCurrentPageIdx, setBackgroundUrl, setServerBgUrl, setStrokes, setViewMode, fullCanvasRef, title, setTitle
  })

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

  // Auto-Save / Draft Logic
  const handleSaveDraft = async (isAuto = false) => {
    if (!activeDoc || viewMode !== 'signer') return
    try {
      const wailsApp = (window as any).go?.main?.App
      if (isTeacher && wailsApp?.SaveSendocDraft) {
        await wailsApp.SaveSendocDraft(activeDoc.id, JSON.stringify(fields), JSON.stringify(strokes))
      } else {
        localStorage.setItem(`sendoc_draft_${activeDoc.id}`, JSON.stringify({ fields, strokes }))
      }
      setIsDraftSaved(true)
      setStrokeRedrawTrigger(n => n + 1)
      setTimeout(() => { setIsDraftSaved(false); setStrokeRedrawTrigger(n => n + 1) }, 2000)
      // Update cache for list view badge
      if (isTeacher) {
        (window as any).__sendocDraftCache = { ...((window as any).__sendocDraftCache || {}), [activeDoc.id]: true }
      }
      if (!isAuto) toast.success(`임시 저장이 완료되었습니다. (선 ${strokes.length}개)`)
    } catch {
      toast.error('임시 저장에 실패했습니다.')
    }
  }

  // Wails WebView2 Safe Print — opens external browser to completely avoid WebView2 Error 1412 crash
  const handleSafePrint = async () => {
    const printContent = document.getElementById('sendoc-viewer-container') || document.getElementById('sendoc-print-area')
    if (!printContent) { toast.error('출력할 내용이 없습니다.'); return }

    const clone = printContent.cloneNode(true) as HTMLElement
    const originalCanvases = printContent.getElementsByTagName('canvas')
    const clonedCanvases = clone.getElementsByTagName('canvas')
    for (let i = originalCanvases.length - 1; i >= 0; i--) {
      try {
        const dataUrl = originalCanvases[i].toDataURL('image/png')
        const img = document.createElement('img')
        img.src = dataUrl
        img.style.cssText = (clonedCanvases[i] as HTMLElement).style.cssText
        clonedCanvases[i].parentNode?.replaceChild(img, clonedCanvases[i])
      } catch (e) { console.warn('Canvas clone failed', e) }
    }

    const title = activeDoc?.title || resultViewerData?.doc?.title || '문서 출력'
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>' +
      'body{margin:0;padding:0;background:white;display:flex;flex-direction:column;align-items:center}' +
      'img{max-width:100%}' +
      '.sendoc-print-page{position:relative!important;display:block!important;width:800px!important;box-shadow:none!important;page-break-after:always;break-after:page;margin:0 auto!important}' +
      '.sendoc-print-page:last-child{page-break-after:auto;break-after:auto}' +
      '.no-print{display:none!important}' +
      '@page{margin:0}' +
      '@media print{body{margin:0}.sendoc-print-page{width:100%!important}}' +
      '</style></head><body>' + clone.outerHTML +
      '<script>window.onload=function(){window.print()}</script>' +
      '</body></html>'

    try {
      await (window as any).go.main.App.OpenPrintHTML(html)
      toast.success('기본 브라우저에서 출력 화면이 열립니다.')
    } catch (e: any) {
      toast.error('출력 열기 실패: ' + (e?.message || e))
    }
  }


  // Redraw strokes intelligently
  useEffect(() => {
    const handleRedraw = () => {
      const currentCanvas = fullCanvasRef.current
      const currentCtx = currentCanvas?.getContext('2d')
      if (!currentCanvas || !currentCtx) return

      // Always completely clear and rebuild from scratch when switching docs, resetting, or loading drafts
      currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height)

      strokes.forEach(stroke => {
        if (!stroke || !stroke.points || stroke.points.length === 0) return

        let effectivePen = stroke.size === 1 ? 1 : (stroke.size || 3) * 1.5
        let lw = effectivePen * 2
        if (lw < 2) lw = 2

        currentCtx.lineWidth = lw
        currentCtx.lineCap = 'round'
        currentCtx.lineJoin = 'round'

        if (stroke.isEraser) {
          currentCtx.globalCompositeOperation = 'destination-out'
          currentCtx.strokeStyle = 'rgba(0,0,0,1)'
        } else {
          currentCtx.globalCompositeOperation = 'source-over'
          currentCtx.strokeStyle = '#000'
        }

        currentCtx.beginPath()
        if (stroke.points.length === 1) {
          currentCtx.arc(stroke.points[0].x, stroke.points[0].y, lw / 2, 0, Math.PI * 2)
          currentCtx.fill()
        } else if (stroke.points.length > 1) {
          currentCtx.moveTo(Number(stroke.points[0].x), Number(stroke.points[0].y))
          for (let i = 1; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i]
            const p2 = stroke.points[i + 1]
            if (!p1 || !p2 || isNaN(Number(p1.x)) || isNaN(Number(p1.y)) || isNaN(Number(p2.x)) || isNaN(Number(p2.y))) continue;
            const xc = (Number(p1.x) + Number(p2.x)) / 2
            const yc = (Number(p1.y) + Number(p2.y)) / 2
            currentCtx.quadraticCurveTo(Number(p1.x), Number(p1.y), xc, yc)
          }
          currentCtx.lineTo(Number(stroke.points[stroke.points.length - 1].x), Number(stroke.points[stroke.points.length - 1].y))
          currentCtx.stroke()
        }
      })

      // Reset back to normal
      currentCtx.globalCompositeOperation = 'source-over'
    }

    // Atomic Double-Redraw Engine:
    // 1) Instant synchronous paint to immediately reflect react state
    // 2) 200ms delayed paint to restore drops caused by WebView2 texture swapping on DOM reflows (like clicking "Save").
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(handleRedraw)
    const timeoutId = setTimeout(() => {
      raf2 = requestAnimationFrame(handleRedraw)
    }, 200)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(timeoutId)
    }
  }, [strokes, viewMode, pageImages.length, strokeRedrawTrigger])


  const resumeDraft = async (d: Sendoc) => {
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${d.id}`)
      if (!res.ok) throw new Error()
      const doc = await res.json()

      setEditingDraftId(doc.id)
      setTitle(doc.title)
      setFields(JSON.parse(doc.fields_json || '[]'))

      if (doc.recipients) {
        setSelectedUsers(doc.recipients.map((r: any) => r.user_id))
      }

      if (doc.background_url && doc.background_url.startsWith('[')) {
        try {
          const arr = JSON.parse(doc.background_url);
          if (Array.isArray(arr) && arr.length > 0) {
            setPageImages(arr.map((src: string) => src.replace(/^data:image\/[^;]+;base64,/, '')));
          }
        } catch { }
        setServerBgUrl(doc.background_url);
        setBackgroundUrl(null);
      } else {
        setPageImages([]);
        setBackgroundUrl(doc.background_url);
        setServerBgUrl(doc.background_url);
      }
      setStrokes([])
      fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10)
      setViewMode('designer')
    } catch {
      toast.error('임시저장 문서를 불러오지 못했습니다.')
    }
  }

  // Hydrate draft cache for teacher list view (sync badge check)
  useEffect(() => {
    if (!isTeacher || pendingDocs.length === 0) return
    const wailsApp = (window as any).go?.main?.App
    if (!wailsApp?.HasSendocDraft) return
    const cache: Record<string, boolean> = {};
    (async () => {
      for (const d of pendingDocs) {
        if (!d.is_signed) {
          try {
            cache[d.id] = await wailsApp.HasSendocDraft(d.id)
          } catch { cache[d.id] = false }
        }
      }
      (window as any).__sendocDraftCache = cache
    })()
  }, [pendingDocs, isTeacher])

  const fetchStatus = async (doc: Sendoc) => {
    setActiveDoc(doc); setLoadingStatus(true); setShowStatusModal(true)
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${doc.id}/signatures`)
      if (res.ok) setRecipients(await res.json() || [])
    } catch { toast.error('상태 조회 실패') }
    finally { setLoadingStatus(false) }
  }

  // --- Designer/Signer Tools ---
  const addField = (type: 'text' | 'signature') => {
    let spawnX = 20;
    let spawnY = 20;

    if (scrollContainerRef.current && containerRef.current) {
      const scrollRect = scrollContainerRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const viewportCenterX = scrollRect.left + scrollRect.width / 2;
      const viewportCenterY = scrollRect.top + scrollRect.height / 2;

      const unscaledPixelX = (viewportCenterX - containerRect.left) / zoom;
      const unscaledPixelY = (viewportCenterY - containerRect.top) / zoom;

      spawnX = (unscaledPixelX / containerRef.current.offsetWidth) * 100;
      spawnY = (unscaledPixelY / containerRef.current.offsetHeight) * 100;

      const offset = (fields.length % 5) * 2;
      spawnX = Math.max(0, Math.min(90, spawnX - offset));
      spawnY = Math.max(0, Math.min(95, spawnY - offset));
    }

    const newField: DocField = {
      id: Math.random().toString(36).substr(2, 9),
      type, x: spawnX, y: spawnY, width: type === 'signature' ? 120 : 150, height: type === 'signature' ? 60 : 32,
      label: type === 'signature' ? '서명란' : '내용 입력'
    }
    setFields(prev => [...prev, newField])
  }

  const handleFieldDrag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMode === 'viewer' || id.includes('canvas_overlay')) return
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startX = e.clientX; const startY = e.clientY
    const field = fields.find(f => f.id === id)
    if (!field) return
    const initialX = (field.x / 100) * rect.width; const initialY = (field.y / 100) * rect.height
    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX; const dy = me.clientY - startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingField.current = true
      setFields(prev => prev.map(f => f.id === id ? { ...f, x: Math.min(90, Math.max(0, ((initialX + dx) / rect.width) * 100)), y: Math.min(95, Math.max(0, ((initialY + dy) / rect.height) * 100)) } : f))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); setTimeout(() => { isDraggingField.current = false }, 50) }
    document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
  }

  const handleFieldResize = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMode === 'viewer' || id.includes('canvas_overlay')) return
    const startX = e.clientX; const startY = e.clientY
    const field = fields.find(f => f.id === id)
    if (!field) return
    const initialWidth = field.width; const initialHeight = field.height

    const onMouseMove = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / zoom;
      const dy = (me.clientY - startY) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingField.current = true
      setFields(prev => prev.map(f => f.id === id ? { ...f, width: Math.max(30, initialWidth + dx), height: Math.max(30, initialHeight + dy) } : f))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); setTimeout(() => { isDraggingField.current = false }, 50) }
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

  // --- Full Canvas Drawing (Vectorized) ---
  const startFullDrawing = (e: any) => {
    if (!isDrawingMode || !fullCanvasRef.current) return
    const rect = fullCanvasRef.current.getBoundingClientRect()
    const scaleFactor = 2
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0)
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0)
    const x = ((clientX - rect.left) / zoom) * scaleFactor
    const y = ((clientY - rect.top) / zoom) * scaleFactor

    currentStrokeRef.current = { points: [{ x, y }], size: penSize, isEraser }
    isFullDrawingRef.current = true
  }
  const stopFullDrawing = () => {
    if (isFullDrawingRef.current && currentStrokeRef.current) {
      const finishedStroke = currentStrokeRef.current
      setStrokes(prev => [...prev, finishedStroke])
      currentStrokeRef.current = null
    }
    isFullDrawingRef.current = false
  }
  const drawFull = (e: any) => {
    if (!isDrawingMode || !isFullDrawingRef.current || !fullCanvasRef.current || !currentStrokeRef.current) return
    const canvas = fullCanvasRef.current; const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const scaleFactor = 2
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0)
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0)
    const x = ((clientX - rect.left) / zoom) * scaleFactor
    const y = ((clientY - rect.top) / zoom) * scaleFactor

    // Add to ongoing stroke
    currentStrokeRef.current.points.push({ x, y })

    // Draw incrementally
    let effectivePen = currentStrokeRef.current.size === 1 ? 1 : currentStrokeRef.current.size * 1.5
    let lw = effectivePen * scaleFactor
    if (lw < 2) lw = 2

    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (currentStrokeRef.current.isEraser) {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'
    } else {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = '#000'
    }
    const pts = currentStrokeRef.current.points
    ctx.beginPath()
    if (pts.length < 3) {
      ctx.moveTo(Number(pts[0].x), Number(pts[0].y))
      ctx.lineTo(Number(x), Number(y))
    } else {
      const p1 = pts[pts.length - 3]
      const p2 = pts[pts.length - 2]
      const p3 = pts[pts.length - 1]
      if (!p1 || !p2 || !p3 || isNaN(Number(p1.x)) || isNaN(Number(p1.y)) || isNaN(Number(p2.x)) || isNaN(Number(p2.y)) || isNaN(Number(p3.x)) || isNaN(Number(p3.y))) {
        ctx.moveTo(Number(pts[pts.length - 2].x), Number(pts[pts.length - 2].y))
        ctx.lineTo(Number(x), Number(y))
      } else {
        const xc1 = (Number(p1.x) + Number(p2.x)) / 2
        const yc1 = (Number(p1.y) + Number(p2.y)) / 2
        const xc2 = (Number(p2.x) + Number(p3.x)) / 2
        const yc2 = (Number(p2.y) + Number(p3.y)) / 2
        ctx.moveTo(xc1, yc1)
        ctx.quadraticCurveTo(Number(p2.x), Number(p2.y), xc2, yc2)
      }
    }
    ctx.stroke()
  }

  const fetchImageAsBlob = async (url: string): Promise<string> => {
    const apiPath = url.replace(/^https?:\/\/[^/]+/, '')
    const res = await apiFetch(apiPath)
    if (!res.ok) throw new Error('이미지 로드 실패')
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  }

  const openSignView = async (baseDoc: PendingDoc) => {
    setActiveDoc(baseDoc); setTitle(baseDoc.title); setBackgroundUrl(null); setStrokes([])
    try {
      const res = await apiFetch(`/api/plugins/sendoc/sign/${baseDoc.id}`)
      if (!res.ok) throw new Error('문서를 불러오지 못했습니다.')
      const doc = await res.json()

      try {
        let f = JSON.parse(doc.fields_json || '[]')
        let hasDraft = false

        if (doc.is_signed && doc.form_data_json && doc.form_data_json !== '{}' && doc.form_data_json !== '[]') {
          try {
            const recFields = JSON.parse(doc.form_data_json)
            if (Array.isArray(recFields) && recFields.length > 0) f = recFields
          } catch { }
        } else if (!doc.is_signed) {
          // Load draft from SQLite (teacher) or localStorage (student/parent)
          const wailsApp = (window as any).go?.main?.App
          if (isTeacher && wailsApp?.LoadSendocDraft) {
            try {
              const draft = await wailsApp.LoadSendocDraft(doc.id)
              if (draft?.found) {
                const draftFields = JSON.parse(draft.fields_json || '[]')
                const draftStrokes = JSON.parse(draft.strokes_json || '[]')
                if (draftFields.length > 0) f = draftFields
                if (Array.isArray(draftStrokes) && draftStrokes.length > 0) {
                  setStrokes(draftStrokes)
                  hasDraft = true
                }
              }
            } catch { }
          } else {
            const draftStr = localStorage.getItem(`sendoc_draft_${doc.id}`)
            if (draftStr) {
              try {
                const draft = JSON.parse(draftStr)
                if (draft.fields) f = draft.fields
                if (draft.strokes && Array.isArray(draft.strokes)) {
                  setStrokes(draft.strokes)
                  hasDraft = true
                }
              } catch (e) { }
            }
          }
        }

        if (doc.is_signed && doc.signature_image_url) {
          const hasFullCanvas = f.some((field: any) => field.id === 'full_canvas_overlay')
          f = f.map((field: any) => {
            if (hasFullCanvas && field.id === 'full_canvas_overlay') {
              return { ...field, signatureData: field.signatureData || doc.signature_image_url }
            } else if (!hasFullCanvas && field.type === 'signature') {
              return { ...field, signatureData: field.signatureData || doc.signature_image_url }
            }
            return field
          })
        }

        setFields(f)
        // Only clear the canvas if we did NOT just load draft strokes
        // (the useEffect redraw hook will handle clearing + redrawing strokes)
        if (!hasDraft) {
          fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262)
        }
      } catch { setFields([]) }
      setViewMode('signer')
      // Force a delayed redraw trigger to ensure the canvas has mounted
      setTimeout(() => setStrokeRedrawTrigger(n => n + 1), 100)
      try {
        let isMultiPage = false;
        if (doc.background_url && doc.background_url.startsWith('[')) {
          try {
            const arr = JSON.parse(doc.background_url);
            if (Array.isArray(arr) && arr.length > 0) {
              setPageImages(arr.map((src: string) => src.replace(/^data:image\/[^;]+;base64,/, '')));
              isMultiPage = true;
            }
          } catch { }
        }

        if (!isMultiPage) {
          setPageImages([]);
          const blobUrl = await fetchImageAsBlob(doc.background_url).catch(() => doc.background_url)
          setBackgroundUrl(blobUrl)
        }
      } catch {
        toast.error('문서를 불러올 수 없습니다.')
      }
    } catch {
      toast.error('문서 상세 정보를 불러오지 못했습니다.')
    }
  }

  const openResultViewer = async (baseDoc: Sendoc, recipient: RecipientStatus) => {
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${baseDoc.id}`)
      if (!res.ok) throw new Error('문서를 불러오지 못했습니다.')
      const doc = await res.json()

      const baseFields: DocField[] = JSON.parse(doc.fields_json || '[]')
      let finalFields = baseFields
      if (recipient.form_data_json && recipient.form_data_json !== '{}' && recipient.form_data_json !== '[]') {
        try {
          const recFields = JSON.parse(recipient.form_data_json)
          if (Array.isArray(recFields) && recFields.length > 0) finalFields = recFields
        } catch { }
      }
      const hasFullCanvas = finalFields.some(f => f.id === 'full_canvas_overlay')

      finalFields = finalFields.map(f => {
        if (hasFullCanvas && f.id === 'full_canvas_overlay') {
          return { ...f, signatureData: recipient.signature_image_url }
        } else if (!hasFullCanvas && f.type === 'signature' && recipient.signature_image_url && f.id !== 'teacher_canvas_overlay') {
          return { ...f, signatureData: recipient.signature_image_url }
        }
        return f
      })

      let isMultiPage = false;
      if (doc.background_url && doc.background_url.startsWith('[')) {
        try {
          const arr = JSON.parse(doc.background_url);
          if (Array.isArray(arr) && arr.length > 0) {
            setPageImages(arr.map((src: string) => src.replace(/^data:image\/[^;]+;base64,/, '')));
            isMultiPage = true;
          }
        } catch { }
      }

      if (!isMultiPage) {
        setPageImages([]);
        const blobUrl = await fetchImageAsBlob(doc.background_url).catch(() => doc.background_url)
        setResultViewerData({ doc, fields: finalFields, bgUrl: blobUrl })
      } else {
        setResultViewerData({ doc, fields: finalFields, bgUrl: '' })
      }
    } catch {
      toast.error('문서 상세 정보를 불러오지 못했습니다.')
    }
  }

  const openBulkPrintViewer = async (baseDoc: Sendoc, allRecipients: RecipientStatus[]) => {
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${baseDoc.id}`)
      if (!res.ok) throw new Error('문서를 불러오지 못했습니다.')
      const doc = await res.json()

      const baseFields: DocField[] = JSON.parse(doc.fields_json || '[]')

      const bulkRecipients = allRecipients.map(recipient => {
        let finalFields = [...baseFields]
        if (recipient.form_data_json && recipient.form_data_json !== '{}' && recipient.form_data_json !== '[]') {
          try {
            const recFields = JSON.parse(recipient.form_data_json)
            if (Array.isArray(recFields) && recFields.length > 0) finalFields = recFields
          } catch { }
        }
        const hasOverlay = finalFields.some(f => f.id === 'full_canvas_overlay')

        finalFields = finalFields.map(f => {
          if (hasOverlay && f.id === 'full_canvas_overlay') {
            return { ...f, signatureData: recipient.signature_image_url }
          } else if (!hasOverlay && f.type === 'signature' && recipient.signature_image_url && f.id !== 'teacher_canvas_overlay') {
            return { ...f, signatureData: recipient.signature_image_url }
          }
          return f
        })
        return { recipient, fields: finalFields }
      })

      let isMultiPage = false;
      if (doc.background_url && doc.background_url.startsWith('[')) {
        try {
          const arr = JSON.parse(doc.background_url);
          if (Array.isArray(arr) && arr.length > 0) {
            setPageImages(arr.map((src: string) => src.replace(/^data:image\/[^;]+;base64,/, '')));
            isMultiPage = true;
          }
        } catch { }
      }

      if (!isMultiPage) {
        setPageImages([]);
        const blobUrl = await fetchImageAsBlob(doc.background_url).catch(() => doc.background_url)
        setResultViewerData({ doc, fields: [], bgUrl: blobUrl, bulkMode: true, bulkRecipients })
      } else {
        setResultViewerData({ doc, fields: [], bgUrl: '', bulkMode: true, bulkRecipients })
      }
    } catch {
      toast.error('전체 출력 문서를 불러오지 못했습니다.')
    }
  }

  const handleSend = (isDraft: boolean = false, shouldExit: boolean = false) => {
    if (!title.trim()) return toast.error('제목을 입력하세요.')
    if (!isDraft && selectedUsers.length === 0) return toast.error('수신자를 선택하세요.')

    // EXPORT STROKES AS PURE VECTOR JSON INSTEAD OF LOSSY/UNSTABLE BASE64
    let sigData = ''
    if (fullCanvasRef.current && strokes.length > 0) {
      sigData = JSON.stringify(strokes)
    }

    if (!isDraft) {
      toast.info('문서를 서버로 전송하고 있습니다...')
      setViewMode('list')
      setShowRecipientModal(false)
      setIsSending(true)
    } else {
      toast.info('문서를 임시저장하고 있습니다...')
      setIsSending(true)
    }

    const sendData = async () => {
      try {
        let finalFields = [...fields];
        if (sigData !== '') {
          finalFields.push({
            id: 'teacher_canvas_overlay',
            type: 'signature',
            x: 0,
            y: 0,
            width: 800,
            height: 1131 * Math.max(1, pageImages.length),
            label: '선생님 펜선',
            signatureData: sigData
          } as any);
        }

        const payload = {
          title,
          content: 'Doc',
          background_url: serverBgUrl || backgroundUrl || '',
          fields_json: JSON.stringify(finalFields),
          requires_signature: finalFields.some(f => f.type === 'signature' && !f.id.includes('canvas_overlay')),
          target_user_ids: selectedUsers,
          is_draft: isDraft
        }

        let res;
        if (editingDraftId) {
          res = await apiFetch(`/api/plugins/sendoc/${editingDraftId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          })
        } else {
          res = await apiFetch('/api/plugins/sendoc', {
            method: 'POST',
            body: JSON.stringify(payload)
          })
        }

        if (res.ok) {
          const resDoc = await res.json()
          if (isDraft) {
            setEditingDraftId(resDoc.id)
            toast.success(`'${title}' 임시저장이 완료되었습니다!`)
            if (viewMode === 'designer' && !shouldExit) fetchDocs()
            if (shouldExit) {
              setStrokes([]); setEditingDraftId(null); fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10); setViewMode('list');
            }
          } else {
            toast.success(`'${title}' 문서 발송이 완료되었습니다!`)
            setEditingDraftId(null)
            fetchDocs()
            fetchPendingDocs()
          }
          window.dispatchEvent(new Event('sendoc_updated'))
        } else {
          const errorData = await res.json().catch(() => ({}))
          toast.error(`'${title}' 처리 실패: ` + (errorData.error || res.statusText))
        }
      } catch (e: any) {
        toast.error(`'${title}' 오류: ` + (e.message || '알 수 없는 오류'))
      } finally {
        setIsSending(false)
      }
    }

    sendData()
  }

  const handleSubmitSignature = async () => {
    if (!activeDoc) return

    // EXPORT STROKES AS PURE VECTOR JSON INSTEAD OF LOSSY/UNSTABLE BASE64
    let capturedSig = ''
    if (fullCanvasRef.current && strokes.length > 0) {
      capturedSig = JSON.stringify(strokes)
    }

    setConfirmDialog({
      message: '다시 수정할 수 없습니다. 신중하게 확인 후 제출해주세요.',
      onConfirm: async () => {
        try {
          let sigData = capturedSig
          let finalFields = [...fields];
          if (sigData !== '') {
            finalFields.push({
              id: 'full_canvas_overlay',
              type: 'signature',
              x: 0,
              y: 0,
              width: 800,
              height: 1131 * Math.max(1, pageImages.length),
              label: '전체 화면 펜선',
              signatureData: sigData
            } as any);
          } else {
            sigData = fields.find(f => f.type === 'signature')?.signatureData || ''
          }

          const res = await apiFetch(`/api/plugins/sendoc/sign/${activeDoc.id}/submit`, {
            method: 'POST',
            body: JSON.stringify({ signature_image_url: sigData, form_data_json: JSON.stringify(finalFields) })
          })
          if (res.ok) {
            // Delete draft from SQLite (teacher) or localStorage (student/parent)
            const wailsApp = (window as any).go?.main?.App
            if (isTeacher && wailsApp?.DeleteSendocDraft) {
              wailsApp.DeleteSendocDraft(activeDoc.id).catch(() => { })
              if ((window as any).__sendocDraftCache) delete (window as any).__sendocDraftCache[activeDoc.id]
            } else {
              localStorage.removeItem(`sendoc_draft_${activeDoc.id}`)
            }
            toast.success('제출 완료!'); setViewMode('list'); fetchPendingDocs()
          } else {
            const errorData = await res.json().catch(() => ({}));
            toast.error('제출 실패: ' + (errorData.error || res.statusText));
          }
        } catch (e: any) {
          toast.error('제출 중 오류 발생: ' + (e.message || '알 수 없는 오류'))
        }
      }
    });
  }

  const handleDeleteDoc = async (id: string, forTeacher: boolean) => {
    setConfirmDialog({
      message: '정말 이 문서를 삭제하시겠습니까?',
      onConfirm: async () => {
        try {
          const endpoint = forTeacher ? `/api/plugins/sendoc/${id}` : `/api/plugins/sendoc/sign/${id}`
          const res = await apiFetch(endpoint, { method: 'DELETE' })
          if (res.ok) {
            toast.success('삭제되었습니다.')
            if (forTeacher) fetchDocs()
            else fetchPendingDocs()
          } else {
            toast.error('삭제 실패')
          }
        } catch {
          toast.error('삭제 중 오류 발생')
        }
      }
    });
  }

  const handleRecallDoc = async (id: string) => {
    setConfirmDialog({
      message: '문서를 회수하시겠습니까? 수신자가 더 이상 서명할 수 없게 됩니다.',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/plugins/sendoc/${id}/recall`, { method: 'PUT' })
          if (res.ok) {
            toast.success('문서가 회수되었습니다.')
            fetchDocs()
          } else {
            const errorData = await res.json().catch(() => ({}));
            toast.error('회수 실패: ' + (errorData.error || '이미 회수된 문서일 수 있습니다.'))
          }
        } catch {
          toast.error('회수 중 오류 발생')
        }
      }
    });
  }

  const handleResendDoc = async (doc: any) => {
    toast.info('문서를 임시저장함으로 복사하는 중...')
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${doc.id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()

      const now = new Date()
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
      const cleanTitle = data.title.replace(/\s*\(\d{4}\.\d{2}\.\d{2} 발송\)$/, '').replace(/\s*\(복사본\)$/, '')
      const newTitle = `${cleanTitle} (${dateStr} 발송)`

      // Clean up fields to remove old signature data only
      const parsedFields = JSON.parse(data.fields_json || '[]').map((f: any) => {
        const nf = { ...f };
        delete nf.signatureData;
        return nf;
      })

      const payload = {
        title: newTitle,
        content: data.content || 'Doc',
        background_url: data.background_url || '',
        fields_json: JSON.stringify(parsedFields),
        requires_signature: parsedFields.some((f: any) => f.type === 'signature' && !f.id.includes('canvas_overlay')),
        target_user_ids: [],
        is_draft: true
      }

      const postRes = await apiFetch('/api/plugins/sendoc', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      if (postRes.ok) {
        toast.success(`'${newTitle}' 문서가 발송 전 문서(임시저장)에 복사되었습니다!`)
        fetchDocs()
        window.scrollTo(0, 0)
      } else {
        toast.error('복사본을 저장하지 못했습니다.')
      }
    } catch {
      toast.error('문서 정보를 불러오지 못했습니다.')
    }
  }

  if (viewMode === 'selector') {
    return (
      <div style={{ padding: 40, maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <button onClick={() => setViewMode('list')} className="btn-secondary" style={{ padding: '8px 12px' }}><i className="fi fi-rr-arrow-left" /></button>
          <h3 style={{ fontSize: 22, fontWeight: 700 }}>새 문서 작성 - 파일 선택</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {hancom && (
            <div style={{ padding: '12px 20px', borderRadius: 12, background: hancom.installed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${hancom.installed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
              <i className={`fi ${hancom.installed ? 'fi-rr-check-circle' : 'fi-rr-exclamation'}`} style={{ color: hancom.installed ? '#22c55e' : '#ef4444', fontSize: 18 }} />
              <div>{hancom.installed ? <span>한컴오피스 <strong>{hancom.version}</strong> 감지됨 — HWP 변환이 가능합니다.</span> : <span style={{ color: '#ef4444' }}>한컴오피스가 감지되지 않았습니다. HWP 문서는 변환이 불가합니다.</span>}</div>
            </div>
          )}
          {excelStatus && (
            <div style={{ padding: '12px 20px', borderRadius: 12, background: excelStatus.installed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${excelStatus.installed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
              <i className={`fi ${excelStatus.installed ? 'fi-rr-check-circle' : 'fi-rr-exclamation'}`} style={{ color: excelStatus.installed ? '#22c55e' : '#ef4444', fontSize: 18 }} />
              <div>{excelStatus.installed ? <span>MS 엑셀 <strong>{excelStatus.version}</strong> 감지됨 — 엑셀 파일(XLSX) 변환이 가능합니다.</span> : <span style={{ color: '#ef4444' }}>MS 엑셀이 감지되지 않았습니다. 엑셀 파일은 변환이 불가합니다.</span>}</div>
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) { setSelectedFile(f); setTitle(f.name.replace(/\.[^/.]+$/, '')); } }}
          style={{ background: isDragging ? '#eff6ff' : 'white', padding: 60, borderRadius: 24, border: isDragging ? '2px solid #3b82f6' : '2px dashed #e2e8f0', textAlign: 'center', cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
        >
          {!selectedFile ? (
            <div>
              <i className="fi fi-rr-upload" style={{ fontSize: 48, color: '#94a3b8', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, fontSize: 18 }}>문서를 드래그하거나 클릭하여 선택</p>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>지원 형식: .hwp, .hwpx, .xlsx, .xls, .pdf</p>
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              <i className="fi fi-rr-document" style={{ fontSize: 48, color: '#3b82f6', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, fontSize: 18 }}>{selectedFile.name}</p>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexDirection: 'column', alignItems: 'center' }}>
                <button onClick={handleProcessDocument} disabled={isConverting} className="btn-primary" style={{ padding: '12px 32px' }}>
                  {isConverting ? (convertProgress || '변환 중...') : '이 파일로 문서 작성하기'}
                </button>
                {isConverting && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6366f1', fontSize: 13 }}>
                    <div style={{ width: 16, height: 16, border: '2px solid #c7d2fe', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    {convertProgress}
                  </div>
                )}
                {!isConverting && <button onClick={() => setSelectedFile(null)} className="btn-secondary">파일 변경</button>}
              </div>
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".hwp,.hwpx,.xlsx,.xls,.pdf" style={{ display: 'none' }} />
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
            <button onClick={() => {
              if (!isSigner && !isViewer) {
                setShowBackConfirm(true);
              } else {
                setStrokes([]); setEditingDraftId(null); fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10); setViewMode('list');
              }
            }} className="btn-secondary" style={{ padding: '8px 12px' }}><i className="fi fi-rr-arrow-left" /></button>
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
            {!isSigner && !isViewer && <button onClick={() => handleSend(true)} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>임시저장</button>}
            {!isSigner && !isViewer && <button onClick={() => setShowRecipientModal(true)} className="btn-primary" style={{ padding: '8px 24px' }}>발송하기</button>}
            {isSigner && !activeDoc?.is_signed && <button onClick={() => handleSaveDraft(false)} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, background: isDraftSaved ? '#f0fdf4' : undefined, color: isDraftSaved ? '#16a34a' : undefined, borderColor: isDraftSaved ? '#86efac' : undefined }}>{isDraftSaved ? <><i className="fi fi-rr-check-circle" /> 임시 저장됨</> : '임시 저장'}</button>}
            {isSigner && activeDoc?.is_signed && <button onClick={handleSafePrint} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}><i className="fi fi-rr-print" /> 출력하기</button>}
            {isSigner && <button onClick={handleSubmitSignature} className="btn-primary" style={{ padding: '8px 24px' }} disabled={activeDoc?.is_signed}>{activeDoc?.is_signed ? '제출 완료됨' : '작성 완료 및 제출'}</button>}
          </div>
        </div>

        <SendocDesignerCanvas
          viewMode={viewMode} isTeacher={isTeacher} isSigner={isSigner} isViewer={isViewer} activeDoc={activeDoc} resultViewerData={resultViewerData}
          pageImages={pageImages} currentPageIdx={currentPageIdx} setCurrentPageIdx={setCurrentPageIdx} backgroundUrl={backgroundUrl} zoom={zoom}
          isDrawingMode={isDrawingMode} setIsDrawingMode={setIsDrawingMode} isEraser={isEraser} setIsEraser={setIsEraser} penSize={penSize} setPenSize={setPenSize}
          strokes={strokes} setStrokes={setStrokes} fields={fields} setFields={setFields} addField={addField} handleFieldDrag={handleFieldDrag} handleFieldResize={handleFieldResize}
          activeSignField={activeSignField} setActiveSignField={setActiveSignField} activeCharPicker={activeCharPicker} setActiveCharPicker={setActiveCharPicker} specialChars={specialChars}
          scrollContainerRef={scrollContainerRef} containerRef={containerRef} fullCanvasRef={fullCanvasRef} signatureCanvasRef={signatureCanvasRef}
          handlePanStart={handlePanStart} handlePanMove={handlePanMove} handlePanEnd={handlePanEnd}
          startFullDrawing={startFullDrawing} drawFull={drawFull} stopFullDrawing={stopFullDrawing}
          startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} saveSignature={saveSignature}
        />
        {showRecipientModal && (
          <SendocRecipientModal
            allUsers={allUsers}
            selectedUsers={selectedUsers}
            setSelectedUsers={setSelectedUsers}
            setShowRecipientModal={setShowRecipientModal}
            handleSend={handleSend}
            isSending={isSending}
          />
        )}

        {/* Confirm Dialog */}
        {confirmDialog && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <i className="fi fi-rr-info" style={{ fontSize: 24 }} />
              </div>
              <h4 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>확인창</h4>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>{confirmDialog.message}</p>
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <button onClick={() => setConfirmDialog(null)} className="btn-secondary" style={{ flex: 1, padding: '12px 0' }}>취소</button>
                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="btn-primary" style={{ flex: 1, padding: '12px 0', background: '#ef4444' }}>확인</button>
              </div>
            </div>
          </div>
        )}

        {/* Back Confirm Dialog */}
        {showBackConfirm && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <i className="fi fi-rr-exclamation" style={{ fontSize: 24 }} />
              </div>
              <h4 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>저장되지 않은 변경사항</h4>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>임시저장을 하지 않으면 작성하신 데이터가 모두 날아갑니다.</p>
              <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                <button onClick={() => setShowBackConfirm(false)} className="btn-secondary" style={{ flex: 1, padding: '12px 0' }}>취소</button>
                <button onClick={() => { setShowBackConfirm(false); handleSend(true, true); }} className="btn-secondary" style={{ flex: 1, padding: '12px 0', borderColor: '#fbbf24', color: '#d97706', background: '#fef3c7' }}>임시저장</button>
                <button onClick={() => { setShowBackConfirm(false); setStrokes([]); setEditingDraftId(null); fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10); setViewMode('list'); }} className="btn-primary" style={{ flex: 1, padding: '12px 0', background: '#ef4444' }}>확인</button>
              </div>
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
            <input type="text" placeholder="모든 문서 제목 통합 검색..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSentPage(1); setReceivedPage(1); setDraftsPage(1); }} style={{ width: '100%', padding: '10px 16px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
          </div>
          {isTeacher && <button onClick={() => { setViewMode('selector'); setSelectedFile(null); setFields([]); setBackgroundUrl(null); setServerBgUrl(null); setEditingDraftId(null); }} className="btn-primary" style={{ padding: '12px 24px' }}>새 문서 작성</button>}
        </div>
      </div>

      <div style={{ marginBottom: 24 }} />

      {loading ? <div className="spinner" style={{ margin: '40px auto' }} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: isTeacher ? '1fr 1fr' : '1fr', gap: 40, alignItems: 'start' }}>

          {/* Left Panel: Documents */}
          {isTeacher && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

              {/* Draft Documents Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fi fi-rr-edit" style={{ color: '#d97706' }} /> 발송 전 문서
                  </h4>
                </div>
                {docs.filter(d => d.status === 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14, background: 'rgba(255,255,255,0.5)', borderRadius: 16, border: '1px dashed #e2e8f0' }}>임시저장된 문서가 없습니다.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                      {docs.filter(d => d.status === 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((draftsPage - 1) * ITEMS_PER_PAGE, draftsPage * ITEMS_PER_PAGE).map(d => (
                        <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #fde68a', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 11, padding: '3px 10px', background: '#fef3c7', color: '#d97706', borderRadius: 20 }}>임시저장</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
                          <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.title}</h4>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => resumeDraft(d)} className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: '8px 0', margin: 0, color: '#d97706', borderColor: '#fbbf24', background: '#fffbeb' }}>이어서 작성하기</button>
                            <button onClick={() => handleDeleteDoc(d.id, true)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#ef4444' }}>삭제</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Drafts Pagination */}
                    {docs.filter(d => d.status === 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                        <button onClick={() => setDraftsPage(p => Math.max(1, p - 1))} disabled={draftsPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
                        <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{draftsPage} / {Math.ceil(docs.filter(d => d.status === 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
                        <button onClick={() => setDraftsPage(p => Math.min(Math.ceil(docs.filter(d => d.status === 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={draftsPage === Math.ceil(docs.filter(d => d.status === 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Sent Documents Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fi fi-rr-paper-plane" style={{ color: '#4f46e5' }} /> 발송한 문서
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                  {docs.filter(d => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((sentPage - 1) * ITEMS_PER_PAGE, sentPage * ITEMS_PER_PAGE).map(d => (
                    <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', background: d.status === 'recalled' ? '#fee2e2' : '#f1f5f9', color: d.status === 'recalled' ? '#ef4444' : '#475569', borderRadius: 20 }}>{d.status === 'recalled' ? '회수됨' : d.status}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                      </div>
                      <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.title}</h4>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => fetchStatus(d)} className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: '8px 0', margin: 0 }}>진행현황 보기</button>
                        <button onClick={() => handleResendDoc(d)} className="btn-primary" style={{ flex: 1, fontSize: 12, padding: '8px 0', margin: 0 }}>재발송</button>
                        {d.status === 'recalled' ? (
                          <button disabled className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#94a3b8', opacity: 0.7 }}>회수 완료</button>
                        ) : (
                          <button onClick={() => handleRecallDoc(d.id)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#f59e0b' }}>회수</button>
                        )}
                        <button onClick={() => handleDeleteDoc(d.id, true)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#ef4444' }}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Sent Pagination */}
                {docs.filter(d => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                    <button onClick={() => setSentPage(p => Math.max(1, p - 1))} disabled={sentPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
                    <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{sentPage} / {Math.ceil(docs.filter(d => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
                    <button onClick={() => setSentPage(p => Math.min(Math.ceil(docs.filter(d => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={sentPage === Math.ceil(docs.filter(d => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Panel: Pending/Received Documents */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fi fi-rr-download" style={{ color: '#0ea5e9' }} /> 받은 문서
              </h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
              {pendingDocs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((receivedPage - 1) * ITEMS_PER_PAGE, receivedPage * ITEMS_PER_PAGE).map(d => {
                const hasDraft = !d.is_signed && (isTeacher
                  ? !!((window as any).go?.main?.App?.HasSendocDraft && (window as any).__sendocDraftCache?.[d.id])
                  : !!localStorage.getItem(`sendoc_draft_${d.id}`));
                return (
                  <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', opacity: d.status === 'recalled' ? 0.7 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', background: d.status === 'recalled' ? '#e5e7eb' : (d.is_signed ? '#f1f5f9' : '#fee2e2'), color: d.status === 'recalled' ? '#6b7280' : (d.is_signed ? '#475569' : '#ef4444'), borderRadius: 20 }}>{d.status === 'recalled' ? '발신자 회수' : (d.is_signed ? '서명완료' : '서명필요')}</span>
                        {hasDraft && <span style={{ fontSize: 11, padding: '3px 10px', background: '#fef3c7', color: '#d97706', borderRadius: 20 }}>임시 저장됨</span>}
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{d.title}</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => {
                        if (d.status === 'recalled') return toast.error('발신자가 회수한 문서입니다.');
                        openSignView(d);
                      }} className={d.status === 'recalled' ? "btn-secondary" : (hasDraft ? "btn-secondary" : "btn-primary")} style={{ flex: 1, fontSize: 12, padding: '8px 0', borderColor: hasDraft ? '#fbbf24' : undefined, color: hasDraft ? '#d97706' : undefined, background: hasDraft ? '#fef3c7' : undefined }}>{d.status === 'recalled' ? '회수됨' : (d.is_signed ? '작성 내용 확인' : (hasDraft ? '이어서 작성하기' : '문서 확인 및 서명'))}</button>
                      <button onClick={() => handleDeleteDoc(d.id, false)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', color: '#ef4444' }}>삭제</button>
                    </div>
                  </div>
                );
              })}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
              <h4 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>전송 및 서명 현황</h4>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {recipients.length > 0 && recipients.every(r => r.is_signed) && (
                  <button onClick={() => openBulkPrintViewer(activeDoc, recipients)} className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <i className="fi fi-rr-print" /> 전체 출력하기
                  </button>
                )}
                <button onClick={() => setShowStatusModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 0 }}>✕</button>
              </div>
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

      {resultViewerData && (
        <SendocResultViewer
          resultViewerData={resultViewerData}
          setResultViewerData={setResultViewerData}
          pageImages={pageImages}
          handleSafePrint={handleSafePrint}
        />
      )}
      {/* Confirm Dialog */}
      {confirmDialog && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <i className="fi fi-rr-info" style={{ fontSize: 24 }} />
            </div>
            <h4 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>확인창</h4>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 12, width: '100%' }}>
              <button onClick={() => setConfirmDialog(null)} className="btn-secondary" style={{ flex: 1, padding: '12px 0' }}>취소</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="btn-primary" style={{ flex: 1, padding: '12px 0', background: '#ef4444' }}>확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
