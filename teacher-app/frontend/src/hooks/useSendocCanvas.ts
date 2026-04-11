import { useState, useRef, useEffect } from 'react'
import type { Stroke, DocField } from '../types/sendoc'

interface UseSendocCanvasProps {
  viewMode: string;
  pageImagesLength: number;
  strokeRedrawTrigger: number;
  initialStrokes?: Stroke[];
  setFields: React.Dispatch<React.SetStateAction<DocField[]>>;
  fields: DocField[];
  activeSignField: string | null;
  setActiveSignField: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useSendocCanvas({
  viewMode,
  pageImagesLength,
  strokeRedrawTrigger,
  initialStrokes = [],
  setFields,
  fields,
  activeSignField,
  setActiveSignField
}: UseSendocCanvasProps) {
  // Zoom & Modes
  const [zoom, setZoom] = useState(1)
  const [isDrawingMode, setIsDrawingMode] = useState(false)

  // Refs
  const fullCanvasRef = useRef<HTMLCanvasElement>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Drawing States
  const [penSize, setPenSize] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const isFullDrawingRef = useRef(false)
  const [isDrawing, setIsDrawing] = useState(false)

  // Document Panning
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const handlePanStart = (e: React.MouseEvent) => {
    if (e.button !== 0 || isDrawingMode) return;
    isPanningRef.current = true;
    if (scrollContainerRef.current) {
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: scrollContainerRef.current.scrollLeft,
        scrollTop: scrollContainerRef.current.scrollTop
      };
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

  // Redraw Hook
  useEffect(() => {
    const handleRedraw = () => {
      const currentCanvas = fullCanvasRef.current
      const currentCtx = currentCanvas?.getContext('2d')
      if (!currentCanvas || !currentCtx) return

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

      currentCtx.globalCompositeOperation = 'source-over'
    }

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
  }, [strokes, viewMode, pageImagesLength, strokeRedrawTrigger])

  // Box Drawing
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

  // Full Drawing
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
    window.dispatchEvent(new CustomEvent('live-stroke', { detail: currentStrokeRef.current }))
  }

  const stopFullDrawing = () => {
    if (isFullDrawingRef.current && currentStrokeRef.current) {
      const finishedStroke = currentStrokeRef.current
      setStrokes(prev => [...prev, finishedStroke])
      currentStrokeRef.current = null
    }
    isFullDrawingRef.current = false
    window.dispatchEvent(new Event('stop-live-stroke'))
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

    currentStrokeRef.current.points.push({ x, y })
    window.dispatchEvent(new CustomEvent('live-stroke', { detail: currentStrokeRef.current }))

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

  // Special dragging actions
  const isDraggingField = useRef(false)
  const handleFieldDrag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (viewMode === 'viewer' || id.includes('canvas_overlay')) return
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const startX = e.clientX; const startY = e.clientY
    const field = fields.find((f: DocField) => f.id === id)
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
    const field = fields.find((f: DocField) => f.id === id)
    if (!field) return
    const initialWidth = field.width; const initialHeight = field.height

    const onMouseMove = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / zoom;
      const dy = (me.clientY - startY) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDraggingField.current = true
      setFields((prev) => prev.map((f) => f.id === id ? { ...f, width: Math.max(30, initialWidth + dx), height: Math.max(30, initialHeight + dy) } : f))
    }
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); setTimeout(() => { isDraggingField.current = false }, 50) }
    document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp)
  }

  return {
    zoom, setZoom,
    isDrawingMode, setIsDrawingMode,
    penSize, setPenSize,
    isEraser, setIsEraser,
    strokes, setStrokes,

    // Refs
    fullCanvasRef,
    signatureCanvasRef,
    containerRef,
    scrollContainerRef,

    // Handlers
    handlePanStart, handlePanMove, handlePanEnd,
    startDrawing, draw, stopDrawing, saveSignature,
    startFullDrawing, drawFull, stopFullDrawing,
    handleFieldDrag, handleFieldResize
  }
}
