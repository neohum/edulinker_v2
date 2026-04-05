import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getToken, apiFetch } from '../api'
import type { UserInfo } from '../App'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

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

interface Stroke {
  points: { x: number, y: number }[]
  size: number
  isEraser: boolean
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
  const [resultViewerData, setResultViewerData] = useState<{ doc: Sendoc, fields: DocField[], bgUrl: string, bulkMode?: boolean, bulkRecipients?: { recipient: RecipientStatus, fields: DocField[] }[] } | null>(null)

  // File Selector States (from HwpConverterPage)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [convertProgress, setConvertProgress] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [hancom, setHancom] = useState<{ installed: boolean, version: string } | null>(null)
  const [excelStatus, setExcelStatus] = useState<{ installed: boolean, version: string } | null>(null)
  const [pageImages, setPageImages] = useState<string[]>([])   // base64 per page
  const [currentPageIdx, setCurrentPageIdx] = useState(0)      // which page is shown
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Status/Recipient states
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [recipients, setRecipients] = useState<RecipientStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null)
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
          currentCtx.moveTo(stroke.points[0].x, stroke.points[0].y)
          for (let i = 1; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i]
            const p2 = stroke.points[i + 1]
            if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) continue;
            const xc = (p1.x + p2.x) / 2
            const yc = (p1.y + p2.y) / 2
            currentCtx.quadraticCurveTo(p1.x, p1.y, xc, yc)
          }
          currentCtx.lineTo(stroke.points[stroke.points.length - 1].x, stroke.points[stroke.points.length - 1].y)
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

  useEffect(() => {
    if (isTeacher) fetchDocs()
    fetchPendingDocs()
    fetchUsers()
    checkHancom()
    checkExcel()
  }, [])

  const checkHancom = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.CheckHancom) setHancom(await wailsApp.CheckHancom())
    } catch { }
  }

  const checkExcel = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.CheckExcel) setExcelStatus(await wailsApp.CheckExcel())
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
        console.log('[DEBUG] fetchPendingDocs raw data:', data) // <-- DEBUG LOG
        const mapped = (data || []).map((d: any) => ({
          ...d,
          id: d.id,
          recipient_id: d.id, // Recipient/PendingDoc ID in backend is the Sendoc.ID
          title: d.title || '(제목 없음)',
          status: d.status || 'draft',
          created_at: d.created_at || new Date().toISOString()
        }))
        console.log('[DEBUG] fetchPendingDocs mapped:', mapped) // <-- DEBUG LOG
        setPendingDocs(mapped)
      } else {
        console.error('[DEBUG] fetchPendingDocs failed with status:', res.status)
      }
    } catch (e) { console.error('[DEBUG] fetchPendingDocs error:', e) } finally { if (!isTeacher) setLoading(false) }
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

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/core/users?page_size=1000')
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
      if (name.endsWith('.hwp') || name.endsWith('.hwpx') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.pdf')) {
        setSelectedFile(file)
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      } else {
        toast.error('HWP, HWPX, XLSX, PDF 파일만 가능합니다.')
      }
    }
  }

  const handleProcessDocument = async () => {
    if (!selectedFile) return
    setIsConverting(true)
    setConvertProgress('파일 읽는 중...')
    try {
      const wailsApp = (window as any).go?.main?.App
      if (!wailsApp) throw new Error('앱이 연결되지 않았습니다.')

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
        reader.onerror = () => reject(new Error('파일 읽기 실패'))
        reader.readAsDataURL(selectedFile)
      })

      const lowerName = selectedFile.name.toLowerCase()
      const isHwp = lowerName.endsWith('.hwp') || lowerName.endsWith('.hwpx')

      const convertBase64ToWebP = (base64Str: string): Promise<string> => {
        return new Promise((resolve) => {
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            if (ctx) ctx.drawImage(img, 0, 0)
            resolve(canvas.toDataURL('image/webp', 0.8).split(',')[1] || base64Str)
          }
          img.onerror = () => resolve(base64Str)
          img.src = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`
        })
      }

      let bgBlobUrl = ''
      let serverBg = ''
      let pagesData: string[] = []

      if (isHwp) {
        // ── HWP/HWPX: Try ConvertToPdfAndImages first for multi-page extraction ──
        if (wailsApp.ConvertToPdfAndImages) {
          try {
            setConvertProgress('HWP 문서 처리 중...')
            const pdfRes = await wailsApp.ConvertToPdfAndImages(selectedFile.name, base64)

            // If backend returned PDF, try rendering standard pages via PDF.js to fix HWP "Facing Pages" layout bugs
            if (pdfRes.success && pdfRes.pdf_base64) {
              setConvertProgress('PDF 클라이언트 병합 추출 중...')
              try {
                const binaryPdfStr = atob(pdfRes.pdf_base64)
                const pdfBytes = new Uint8Array(binaryPdfStr.length)
                for (let i = 0; i < binaryPdfStr.length; i++) pdfBytes[i] = binaryPdfStr.charCodeAt(i)

                const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise
                const numPages = pdfDoc.numPages
                const localPages: string[] = []

                for (let n = 1; n <= numPages; n++) {
                  const page = await pdfDoc.getPage(n)
                  const viewport = page.getViewport({ scale: 1.5 }) // 1.5 is a good balance for resolution
                  const canvas = document.createElement('canvas')
                  canvas.width = viewport.width
                  canvas.height = viewport.height
                  const ctx = canvas.getContext('2d')!
                  await page.render({ canvasContext: ctx, viewport } as any).promise
                  const dataUrl = canvas.toDataURL('image/png')
                  localPages.push(dataUrl.split(',')[1]) // extract base64 chunk
                }
                if (localPages.length > 0) {
                  pdfRes.pages = localPages
                }
              } catch (pdfErr) {
                console.warn('PDF.js client extraction failed', pdfErr)
              }
            }

            if (pdfRes.success && pdfRes.pages && pdfRes.pages.length > 0) {
              setConvertProgress('WebP 이미지 최적화 중...')
              for (let i = 0; i < pdfRes.pages.length; i++) {
                pdfRes.pages[i] = await convertBase64ToWebP(pdfRes.pages[i])
              }
              pagesData = pdfRes.pages
              // Save as Base64 to sync over the network
              serverBg = JSON.stringify(pdfRes.pages.map((pg: string) => 'data:image/webp;base64,' + pg))

              const binaryStr = atob(pdfRes.pages[0])
              const bytes = new Uint8Array(binaryStr.length)
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
              bgBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
            }
          } catch {
            // Fallback below
            console.warn("multi-page extraction failed, falling back to basic image mode")
          }
        }

        if (pagesData.length === 0) {
          // Fallback: use existing reliable single-image converter
          setConvertProgress('HWP 단일 이미지 변환 중...')
          const convRes = await wailsApp.ConvertHwp(selectedFile.name, base64, 'image')
          if (!convRes.success || !convRes.data) throw new Error(convRes.error || 'HWP 변환 실패')

          setConvertProgress('WebP 이미지 최적화 중...')
          const webpData = await convertBase64ToWebP(convRes.data)
          pagesData = [webpData]

          // Save as Base64 to sync over the network
          serverBg = 'data:image/webp;base64,' + webpData

          const binaryStr = atob(webpData)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
          bgBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
        }

      } else {
        // ── XLSX / PDF: convert to PDF + extract pages ──
        if (!wailsApp.ConvertToPdfAndImages) throw new Error('ConvertToPdfAndImages를 찾을 수 없습니다.')
        setConvertProgress('PDF 변환 중...')
        const result = await wailsApp.ConvertToPdfAndImages(selectedFile.name, base64)
        if (!result.success) throw new Error(result.error || '변환 실패')

        if (!result.pages || result.pages.length === 0) {
          throw new Error('페이지 이미지를 추출하지 못했습니다. 한컴오피스 또는 Excel이 필요합니다.')
        }

        pagesData = result.pages
        setConvertProgress(`이미지 WebP 최적화 처리 중... (${result.page_count}페이지)`)
        for (let i = 0; i < pagesData.length; i++) {
          pagesData[i] = await convertBase64ToWebP(pagesData[i])
        }

        // Save as Base64 to sync over the network
        serverBg = JSON.stringify(pagesData.map((pg: string) => 'data:image/webp;base64,' + pg))

        // Local blob from first page
        const binaryStr = atob(pagesData[0])
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        bgBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
      }

      // Apply to designer
      if (pagesData.length > 0) {
        setPageImages(pagesData)
        setCurrentPageIdx(0)
      } else {
        setPageImages([])
      }
      setBackgroundUrl(bgBlobUrl)
      setServerBgUrl(serverBg)
      setStrokes([])
      fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10)
      setViewMode('designer')
      toast.success(`문서가 준비되었습니다.${pagesData.length > 1 ? ` (${pagesData.length}페이지)` : ''}`)
    } catch (err: any) {
      toast.error(err.message || '처리 오류')
    } finally {
      setIsConverting(false)
      setConvertProgress('')
    }
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
      ctx.moveTo(pts[0].x, pts[0].y)
      ctx.lineTo(x, y)
    } else {
      const p1 = pts[pts.length - 3]
      const p2 = pts[pts.length - 2]
      const p3 = pts[pts.length - 1]
      if (!p1 || !p2 || !p3 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y) || isNaN(p3.x) || isNaN(p3.y)) {
        ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y)
        ctx.lineTo(x, y)
      } else {
        const xc1 = (p1.x + p2.x) / 2
        const yc1 = (p1.y + p2.y) / 2
        const xc2 = (p2.x + p3.x) / 2
        const yc2 = (p2.y + p3.y) / 2
        ctx.moveTo(xc1, yc1)
        ctx.quadraticCurveTo(p2.x, p2.y, xc2, yc2)
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
        } else if (!hasFullCanvas && f.type === 'signature' && recipient.signature_image_url) {
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
          } else if (!hasOverlay && f.type === 'signature' && recipient.signature_image_url) {
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

  const handleSend = () => {
    if (!title.trim()) return toast.error('제목을 입력하세요.')
    if (selectedUsers.length === 0) return toast.error('수신자를 선택하세요.')

    // 즉각적인 UI 전환 (백그라운드 비동기 처리)
    toast.info('문서를 서버로 전송하고 있습니다...')
    setViewMode('list')
    setShowRecipientModal(false)
    setIsSending(true)

    const sendData = async () => {
      try {
        let finalFields = [...fields];
        if (fullCanvasRef.current && strokes.length > 0) {
          const sigData = fullCanvasRef.current.toDataURL('image/webp', 0.8);
          finalFields.push({
            id: 'teacher_canvas_overlay',
            type: 'signature',
            x: 0,
            y: 0,
            width: 800,
            height: 1131 * Math.max(1, pageImages.length),
            label: '선생님 펜선'
          } as any);
          // Attach signatureData locally so payload gets it
          finalFields[finalFields.length - 1].signatureData = sigData;
        }

        const res = await apiFetch('/api/plugins/sendoc', {
          method: 'POST',
          body: JSON.stringify({ title, content: 'Doc', background_url: serverBgUrl || backgroundUrl || '', fields_json: JSON.stringify(finalFields), requires_signature: finalFields.some(f => f.type === 'signature' && !f.id.includes('canvas_overlay')), target_user_ids: selectedUsers })
        })
        if (res.ok) {
          toast.success(`'${title}' 문서 발송이 완료되었습니다!`)
          fetchDocs()
          fetchPendingDocs()
          window.dispatchEvent(new Event('sendoc_updated'))
        } else {
          const errorData = await res.json().catch(() => ({}))
          toast.error(`'${title}' 발송 실패: ` + (errorData.error || res.statusText))
        }
      } catch (e: any) {
        toast.error(`'${title}' 발송 오류: ` + (e.message || '알 수 없는 오류'))
      } finally {
        setIsSending(false)
      }
    }

    sendData()
  }

  const handleSubmitSignature = async () => {
    if (!activeDoc) return

    setConfirmDialog({
      message: '다시 수정할 수 없습니다. 신중하게 확인 후 제출해주세요.',
      onConfirm: async () => {
        try {
          let sigData = ''
          let finalFields = [...fields];
          if (fullCanvasRef.current && strokes.length > 0) {
            sigData = fullCanvasRef.current.toDataURL('image/webp', 0.6)
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
    toast.info('문서 정보를 불러오는 중...')
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${doc.id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()

      const now = new Date()
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
      const cleanTitle = data.title.replace(/\s*\(\d{4}\.\d{2}\.\d{2} 발송\)$/, '').replace(/\s*\(복사본\)$/, '')
      setTitle(`${cleanTitle} (${dateStr} 발송)`)

      // Clean up fields to remove old signature data only
      const parsedFields = JSON.parse(data.fields_json || '[]').map((f: any) => {
        const nf = { ...f };
        delete nf.signatureData;
        return nf;
      })
      setFields(parsedFields)

      let isMultiPage = false
      if (data.background_url && data.background_url.startsWith('[')) {
        try {
          const arr = JSON.parse(data.background_url)
          if (Array.isArray(arr) && arr.length > 0) {
            setPageImages(arr.map((src: string) => src.replace(/^data:image\/[^;]+;base64,/, '')))
            isMultiPage = true
          }
        } catch { }
      }

      if (!isMultiPage) {
        setPageImages([])
        setServerBgUrl(data.background_url)
        setBackgroundUrl(null)
      } else {
        setServerBgUrl(data.background_url)
        setBackgroundUrl(null)
      }

      setSelectedUsers([])
      setStrokes([])
      fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10)
      setViewMode('designer')
      setShowRecipientModal(true)
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
            <button onClick={() => { setStrokes([]); fullCanvasRef.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10); setViewMode('list'); }} className="btn-secondary" style={{ padding: '8px 12px' }}><i className="fi fi-rr-arrow-left" /></button>
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
            {isSigner && !activeDoc?.is_signed && <button onClick={() => handleSaveDraft(false)} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, background: isDraftSaved ? '#f0fdf4' : undefined, color: isDraftSaved ? '#16a34a' : undefined, borderColor: isDraftSaved ? '#86efac' : undefined }}>{isDraftSaved ? <><i className="fi fi-rr-check-circle" /> 임시 저장됨</> : '임시 저장'}</button>}
            {isSigner && activeDoc?.is_signed && <button onClick={handleSafePrint} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6 }}><i className="fi fi-rr-print" /> 출력하기</button>}
            {isSigner && <button onClick={handleSubmitSignature} className="btn-primary" style={{ padding: '8px 24px' }} disabled={activeDoc?.is_signed}>{activeDoc?.is_signed ? '제출 완료됨' : '작성 완료 및 제출'}</button>}
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {!isViewer && (
            <div style={{ width: 240, background: 'white', borderRight: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>도구 상자</div>

              {/* Hide Sidebar standard page navigation since we now scroll vertically */}
              <div style={{ display: 'none' }}>
                {/* Page navigation when multi-page document */}
                {pageImages.length > 1 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                      페이지 {currentPageIdx + 1} / {pageImages.length}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                      {pageImages.map((pg, idx) => {
                        const isCurrent = idx === currentPageIdx
                        return (
                          <div key={idx}
                            onClick={() => {
                              setCurrentPageIdx(idx)
                              const binaryStr = atob(pg)
                              const bytes = new Uint8Array(binaryStr.length)
                              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
                              const blob = new Blob([bytes], { type: 'image/png' })
                              setBackgroundUrl(URL.createObjectURL(blob))
                            }}
                            style={{ cursor: 'pointer', border: isCurrent ? '2px solid #6366f1' : '2px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', opacity: isCurrent ? 1 : 0.7 }}>
                            <img src={`data:image/png;base64,${pg}`} alt={`${idx + 1}페이지`}
                              style={{ width: '100%', display: 'block' }} />
                            <div style={{ textAlign: 'center', fontSize: 10, padding: '2px 0', background: isCurrent ? '#e0e7ff' : '#f8fafc', color: isCurrent ? '#4f46e5' : '#94a3b8', fontWeight: 600 }}>
                              {idx + 1}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ height: 1, background: '#f1f5f9', marginTop: 12 }} />
                  </div>
                )}
              </div>
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
                        <button onClick={() => { if (window.confirm('그린 내용을 모두 초기화 하시겠습니까?')) { setStrokes([]); } }} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><i className="fi fi-rr-trash" /> 캔버스 초기화</button>
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
            <style>{`
              @media print {
                body * { visibility: hidden; }
                #sendoc-print-area, #sendoc-print-area * { visibility: visible; }
                #sendoc-print-area { position: absolute; left: 0; top: 0; margin: 0; padding: 0; width: 100% !important; box-shadow: none !important; transform: none !important; }
                @page { size: auto; margin: 0mm; }
              }
            `}</style>
            <div style={{ position: 'relative', width: 800 * zoom, height: 1131 * Math.max(1, pageImages.length) * zoom }}>
              <div id={isSigner && activeDoc?.is_signed ? "sendoc-print-area" : ""} ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, width: 800, height: 1131 * Math.max(1, pageImages.length), transform: `scale(${zoom})`, transformOrigin: 'top left', background: 'white', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                {pageImages.length > 0 ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {pageImages.map((pg, i) => (
                      <img key={i} src={`data:image/webp;base64,${pg}`} style={{ width: '100%', height: `${100 / pageImages.length}%`, display: 'block', pointerEvents: 'none' }} alt={`문서 배경 ${i + 1}`} />
                    ))}
                    {/* Visual Page Dividers */}
                    {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                      <div key={'div' + i} style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: 0, width: '100%', height: 4, background: '#94a3b8', borderTop: '1px dashed #475569', borderBottom: '1px dashed #475569', zIndex: 15, pointerEvents: 'none' }} />
                    ))}
                  </div>
                ) : (
                  backgroundUrl || resultViewerData?.bgUrl ? (
                    <img src={backgroundUrl || resultViewerData?.bgUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="문서 배경" onError={(e) => { e.currentTarget.style.display = 'none'; toast.error('배경 이미지를 불러올 수 없습니다.') }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                      <div className="spinner" style={{ marginBottom: 16 }} />
                      <p>문서를 불러오는 중...</p>
                    </div>
                  )
                )}

                {/* Free Drawing Canvas Layer */}
                <canvas
                  ref={fullCanvasRef}
                  width={1600} height={2262 * Math.max(1, pageImages.length)}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: isDrawingMode ? 'auto' : 'none', cursor: isDrawingMode ? 'crosshair' : 'default', touchAction: 'none' }}
                  onPointerDown={startFullDrawing} onPointerMove={drawFull} onPointerUp={stopFullDrawing} onPointerOut={stopFullDrawing} onPointerCancel={stopFullDrawing}
                />

                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: isDrawingMode ? 'none' : 'auto' }}>
                  {fields.map(f => (
                    <div key={f.id} onMouseDown={(e) => handleFieldDrag(f.id, e)} style={{
                      position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: f.width, height: f.height,
                      background: f.signatureData ? 'transparent' : (f.type === 'signature' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'),
                      border: f.signatureData ? 'none' : `2px dashed ${f.type === 'signature' ? '#ef4444' : '#3b82f6'}`,
                      borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isViewer || f.id.includes('canvas_overlay') ? 'default' : 'move', pointerEvents: f.id.includes('canvas_overlay') ? 'none' : 'auto'
                    }}>
                      {f.type === 'text' ? (
                        <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: f.id.includes('canvas_overlay') ? 'none' : 'auto' }}>
                          <input placeholder="내용 입력..." value={f.value || ''} disabled={isViewer || f.id.includes('canvas_overlay')} onChange={(e) => setFields(prev => prev.map(field => field.id === f.id ? { ...field, value: e.target.value } : field))} style={{ width: '100%', height: '100%', border: 'none', background: 'transparent', padding: '0 8px', fontSize: f.fontSize || 13, pointerEvents: isViewer || f.id.includes('canvas_overlay') ? 'none' : 'auto' }} />
                          {!isViewer && !f.id.includes('canvas_overlay') && (
                            <div style={{ position: 'absolute', top: -32, right: 0, display: 'flex', gap: 4, background: '#1e293b', padding: '4px 6px', borderRadius: 6, zIndex: 100, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} onMouseDown={(e) => e.stopPropagation()}>
                              <button onClick={() => setActiveCharPicker(activeCharPicker === f.id ? null : f.id)} style={{ background: activeCharPicker === f.id ? '#475569' : 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center' }} title="특수문자 입력"><i className="fi fi-rr-apps" /></button>
                              <div style={{ width: 1, background: '#475569', margin: '2px 4px' }} />
                              <button onClick={() => setFields(prev => prev.map(field => field.id === f.id ? { ...field, fontSize: Math.max(8, (field.fontSize || 13) - 1) } : field))} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '0 4px', display: 'flex', alignItems: 'center' }}>-</button>
                              <span style={{ color: 'white', fontSize: 11, alignSelf: 'center', minWidth: 20, textAlign: 'center', fontWeight: 600 }}>{f.fontSize || 13}</span>
                              <button onClick={() => setFields(prev => prev.map(field => field.id === f.id ? { ...field, fontSize: Math.min(72, (field.fontSize || 13) + 1) } : field))} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 13, padding: '0 4px', display: 'flex', alignItems: 'center' }}>+</button>

                              {activeCharPicker === f.id && (
                                <div style={{ position: 'absolute', top: -46, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px', display: 'flex', gap: 4, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 110, whiteSpace: 'nowrap' }}>
                                  {specialChars.map(char => (
                                    <button key={char} onClick={() => setFields(prev => prev.map(field => field.id === f.id ? { ...field, value: `${field.value || ''}${char}` } : field))} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 14 }}>{char}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div onClick={() => { if (isDraggingField.current) return; if (!isViewer && !activeDoc?.is_signed && !f.id.includes('canvas_overlay')) setActiveSignField(f.id); }} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !isViewer && !f.id.includes('canvas_overlay') ? 'pointer' : 'default' }}>
                          {f.signatureData ? <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <><i className="fi fi-rr-edit" style={{ marginRight: 6 }} /> {!isViewer ? '서명하기' : '서명란'}</>}
                        </div>
                      )}
                      {!isViewer && !f.id.includes('canvas_overlay') && (
                        <div onMouseDown={(e) => handleFieldResize(f.id, e)} style={{ position: 'absolute', bottom: -6, right: -6, width: 14, height: 14, background: f.type === 'signature' ? '#ef4444' : '#3b82f6', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid white', zIndex: 50, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
                      )}
                      {!isViewer && !f.id.includes('canvas_overlay') && <button onClick={(e) => { e.stopPropagation(); setFields(prev => prev.filter(field => field.id !== f.id)); }} style={{ position: 'absolute', top: -10, right: -10, background: '#475569', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>✕</button>}
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

        {showRecipientModal && (() => {
          const roleLabel: Record<string, string> = { teacher: '교사', student: '학생', parent: '학부모', admin: '관리자' }
          const expandKey = (key: string) => expandedNodes.includes(key)
          const toggleExpand = (key: string) => setExpandedNodes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

          // Build tree: role → group → class → users
          const teachers = allUsers.filter(u => u.role === 'teacher' || u.role === 'admin')
          const students = allUsers.filter(u => u.role === 'student')
          const parents = allUsers.filter(u => u.role === 'parent')

          // Group teachers by department
          const teachersByDept: Record<string, any[]> = {}
          teachers.forEach(u => {
            const dept = u.department || '미배정'
            if (!teachersByDept[dept]) teachersByDept[dept] = []
            teachersByDept[dept].push(u)
          })

          // Group students/parents by grade → class
          const groupByGradeClass = (users: any[]) => {
            const byGrade: Record<number, Record<number, any[]>> = {}
            users.forEach(u => {
              const g = u.grade || 0
              const c = u.class_num || 0
              if (!byGrade[g]) byGrade[g] = {}
              if (!byGrade[g][c]) byGrade[g][c] = []
              byGrade[g][c].push(u)
            })
            return byGrade
          }
          const studentTree = groupByGradeClass(students)
          const parentTree = groupByGradeClass(parents)

          // Helpers
          const getUsersInGroup = (users: any[]) => users.map(u => u.id)
          const isAllSelected = (ids: string[]) => ids.length > 0 && ids.every(id => selectedUsers.includes(id))
          const isSomeSelected = (ids: string[]) => ids.some(id => selectedUsers.includes(id))
          const toggleGroup = (ids: string[]) => {
            if (isAllSelected(ids)) {
              setSelectedUsers(prev => prev.filter(id => !ids.includes(id)))
            } else {
              setSelectedUsers(prev => [...new Set([...prev, ...ids])])
            }
          }

          const renderUser = (u: any) => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', borderRadius: 8, background: selectedUsers.includes(u.id) ? '#eff6ff' : 'transparent', marginLeft: 8 }}>
              <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={e => e.target.checked ? setSelectedUsers(p => [...p, u.id]) : setSelectedUsers(p => p.filter(id => id !== u.id))} />
              <span style={{ fontSize: 13 }}>{u.name}</span>
              {u.number > 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>{u.number}번</span>}
            </label>
          )

          const renderGroupHeader = (key: string, label: string, userIds: string[], icon: string, depth: number) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderRadius: 10, background: expandKey(key) ? '#f8fafc' : 'transparent', marginLeft: depth * 16 }}
              onClick={() => toggleExpand(key)}>
              <i className={`fi ${expandKey(key) ? 'fi-rr-angle-down' : 'fi-rr-angle-right'}`} style={{ fontSize: 11, color: '#94a3b8', width: 14 }} />
              <input type="checkbox" checked={isAllSelected(userIds)} ref={el => { if (el) el.indeterminate = !isAllSelected(userIds) && isSomeSelected(userIds) }}
                onClick={e => e.stopPropagation()} onChange={() => toggleGroup(userIds)} style={{ accentColor: '#3b82f6' }} />
              <i className={`fi ${icon}`} style={{ fontSize: 13, color: '#64748b' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{userIds.length}명</span>
            </div>
          )

          // Collect all user IDs for a role tree
          const allTeacherIds = teachers.map(u => u.id)
          const allStudentIds = students.map(u => u.id)
          const allParentIds = parents.map(u => u.id)

          return (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ fontSize: 18, fontWeight: 700 }}>수신자 선택</h4>
                  <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 600 }}>{selectedUsers.length}명 선택됨</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 2 }}>

                  {/* ── 교사 ── */}
                  {teachers.length > 0 && (<>
                    {renderGroupHeader('teacher', '교사', allTeacherIds, 'fi-rr-chalkboard-user', 0)}
                    {expandKey('teacher') && Object.entries(teachersByDept).sort(([a], [b]) => a.localeCompare(b)).map(([dept, users]) => {
                      const deptKey = `teacher-${dept}`
                      const deptIds = getUsersInGroup(users)
                      return (<div key={deptKey}>
                        {renderGroupHeader(deptKey, dept, deptIds, 'fi-rr-building', 1)}
                        {expandKey(deptKey) && users.sort((a: any, b: any) => a.name.localeCompare(b.name)).map(renderUser)}
                      </div>)
                    })}
                  </>)}

                  {/* ── 학생 ── */}
                  {students.length > 0 && (<>
                    {renderGroupHeader('student', '학생', allStudentIds, 'fi-rr-graduation-cap', 0)}
                    {expandKey('student') && Object.entries(studentTree).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => {
                      const gradeKey = `student-${grade}`
                      const gradeIds = Object.values(classes).flat().map((u: any) => u.id)
                      return (<div key={gradeKey}>
                        {renderGroupHeader(gradeKey, Number(grade) > 0 ? `${grade}학년` : '미배정', gradeIds, 'fi-rr-layers', 1)}
                        {expandKey(gradeKey) && Object.entries(classes).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, users]) => {
                          const clsKey = `student-${grade}-${cls}`
                          const clsIds = getUsersInGroup(users)
                          return (<div key={clsKey}>
                            {renderGroupHeader(clsKey, Number(cls) > 0 ? `${cls}반` : '미배정', clsIds, 'fi-rr-users', 2)}
                            {expandKey(clsKey) && users.sort((a: any, b: any) => (a.number || 0) - (b.number || 0)).map(renderUser)}
                          </div>)
                        })}
                      </div>)
                    })}
                  </>)}

                  {/* ── 학부모 ── */}
                  {parents.length > 0 && (<>
                    {renderGroupHeader('parent', '학부모', allParentIds, 'fi-rr-users-alt', 0)}
                    {expandKey('parent') && Object.entries(parentTree).sort(([a], [b]) => Number(a) - Number(b)).map(([grade, classes]) => {
                      const gradeKey = `parent-${grade}`
                      const gradeIds = Object.values(classes).flat().map((u: any) => u.id)
                      return (<div key={gradeKey}>
                        {renderGroupHeader(gradeKey, Number(grade) > 0 ? `${grade}학년` : '미배정', gradeIds, 'fi-rr-layers', 1)}
                        {expandKey(gradeKey) && Object.entries(classes).sort(([a], [b]) => Number(a) - Number(b)).map(([cls, users]) => {
                          const clsKey = `parent-${grade}-${cls}`
                          const clsIds = getUsersInGroup(users)
                          return (<div key={clsKey}>
                            {renderGroupHeader(clsKey, Number(cls) > 0 ? `${cls}반` : '미배정', clsIds, 'fi-rr-users', 2)}
                            {expandKey(clsKey) && users.sort((a: any, b: any) => a.name.localeCompare(b.name)).map(renderUser)}
                          </div>)
                        })}
                      </div>)
                    })}
                  </>)}

                  {allUsers.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>사용자 목록이 없습니다.</div>}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setSelectedUsers(allUsers.map((u: any) => u.id))} className="btn-secondary" style={{ padding: '10px 16px', fontSize: 13 }}>전체선택</button>
                  <button onClick={() => setSelectedUsers([])} className="btn-secondary" style={{ padding: '10px 16px', fontSize: 13 }}>선택해제</button>
                  <button onClick={() => setShowRecipientModal(false)} className="btn-secondary" style={{ padding: '10px 20px' }} disabled={isSending}>취소</button>
                  <button onClick={handleSend} disabled={isSending} className="btn-primary" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 8, opacity: isSending ? 0.7 : 1 }}>
                    {isSending && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
                    {isSending ? '발송 중...' : '발송하기'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                {docs.filter(d => d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((sentPage - 1) * ITEMS_PER_PAGE, sentPage * ITEMS_PER_PAGE).map(d => (
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
        <div className="print-modal-root" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div className="print-modal-content" style={{ background: '#f1f5f9', borderRadius: 16, width: '90%', maxWidth: 1000, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="no-print" style={{ padding: '16px 24px', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>{resultViewerData.doc.title} - 결과 확인</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={handleSafePrint} className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}><i className="fi fi-rr-print" /> 출력하기</button>
                <button onClick={() => setResultViewerData(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div className="print-modal-body" style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .print-modal-root { position: absolute !important; background: none !important; align-items: flex-start !important; justify-content: stretch !important; top: 0 !important; left: 0 !important; z-index: 99999 !important; }
                  .print-modal-content { height: auto !important; max-height: none !important; width: 100% !important; max-width: none !important; overflow: visible !important; border-radius: 0 !important; background: none !important; }
                  .print-modal-body { overflow: visible !important; padding: 0 !important; gap: 0 !important; }
                  
                  #sendoc-viewer-container, #sendoc-viewer-container * { visibility: visible; }
                  #sendoc-viewer-container { display: block !important; width: 100% !important; }
                  .sendoc-print-page { position: relative !important; display: block !important; width: 100% !important; box-shadow: none !important; page-break-after: always; break-after: page; margin: 0 !important; }
                  .sendoc-print-page:last-child { page-break-after: auto; break-after: auto; }
                  .no-print { display: none !important; }
                  @page { margin: 0; }
                }
              `}</style>
              <div id="sendoc-viewer-container" style={{ display: 'flex', flexDirection: 'column', gap: 40, width: '100%', alignItems: 'center' }}>
                {resultViewerData.bulkMode && resultViewerData.bulkRecipients ? (
                  resultViewerData.bulkRecipients.map((br, idx) => (
                    <div key={idx} className="sendoc-print-page" style={{ position: 'relative', width: 800, height: 1131 * Math.max(1, pageImages.length), background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                      {pageImages.length > 0 ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                          {pageImages.map((pg, i) => (
                            <img key={i} src={`data:image/webp;base64,${pg}`} style={{ width: '100%', height: `${100 / pageImages.length}%`, display: 'block', pointerEvents: 'none' }} alt={`문서 배경 ${i + 1}`} />
                          ))}
                          {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                            <div key={'div' + i} className="no-print" style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: 0, width: '100%', height: 4, background: '#94a3b8', borderTop: '1px dashed #475569', borderBottom: '1px dashed #475569', zIndex: 15, pointerEvents: 'none' }} />
                          ))}
                        </div>
                      ) : (
                        <img src={resultViewerData.bgUrl} style={{ width: '100%', display: 'block' }} alt="문서 배경" onError={(e) => { e.currentTarget.style.display = 'none'; toast.error('배경 이미지를 불러올 수 없습니다.'); }} />
                      )}
                      {br.fields.map(f => (
                        <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}px`, height: `${f.height}px`, zIndex: 10 }}>
                          {f.type === 'text' ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: f.fontSize || 13, color: 'black' }}>{f.value || ''}</div>
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {f.signatureData && <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Name Badge for tracking */}
                      <div className="no-print" style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 20 }}>
                        작성자: {br.recipient.user.name} ({br.recipient.user.role})
                        <style>{`@media print { .no-print { display: none !important; } }`}</style>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sendoc-print-page" style={{ position: 'relative', width: 800, height: 1131 * Math.max(1, pageImages.length), background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    {pageImages.length > 0 ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {pageImages.map((pg, i) => (
                          <img key={i} src={`data:image/webp;base64,${pg}`} style={{ width: '100%', height: `${100 / pageImages.length}%`, display: 'block', pointerEvents: 'none' }} alt={`문서 배경 ${i + 1}`} />
                        ))}
                        {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                          <div key={'div' + i} className="no-print" style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: 0, width: '100%', height: 4, background: '#94a3b8', borderTop: '1px dashed #475569', borderBottom: '1px dashed #475569', zIndex: 15, pointerEvents: 'none' }} />
                        ))}
                      </div>
                    ) : (
                      <img src={resultViewerData.bgUrl} style={{ width: '100%', display: 'block' }} alt="문서 배경" onError={(e) => { e.currentTarget.style.display = 'none'; toast.error('배경 이미지를 불러올 수 없습니다.'); }} />
                    )}
                    {resultViewerData.fields.map(f => (
                      <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}px`, height: `${f.height}px`, zIndex: 10 }}>
                        {f.type === 'text' ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: f.fontSize || 13, color: 'black' }}>{f.value || ''}</div>
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                            {f.signatureData && <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                            {f.signatureData && <div style={{ position: 'absolute', bottom: 0, background: 'red', color: 'white', fontSize: 16, zIndex: 99 }}>DEBUG LEN: {f.signatureData.length} | HDR: {f.signatureData.substring(0, 30)}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
