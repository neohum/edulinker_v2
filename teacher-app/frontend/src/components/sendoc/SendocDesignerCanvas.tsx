import React from 'react'
import type { DocField, RecipientStatus, Sendoc, PendingDoc, Stroke } from '../../types/sendoc'
import { VectorSignatureCanvas } from './VectorSignatureCanvas'

// Minimal page image — direct src, no blob conversion, with diagnostics
const LazyPageImage = React.memo(({ src }: { src: string }) => {
  const [imgSrc, setImgSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!src) { console.warn('[LazyPage] empty src'); return }
    console.log('[LazyPage] mount, src prefix:', src.substring(0, 40), 'len:', src.length)

    if (src.startsWith('sqlite:')) {
      const lastColon = src.lastIndexOf(':')
      const sessionId = src.substring(7, lastColon)
      const pageIdx = parseInt(src.substring(lastColon + 1), 10)
      const wailsApp = (window as any).go?.main?.App
      if (!wailsApp?.GetConvertedPage) { console.warn('[LazyPage] no GetConvertedPage'); return }
      wailsApp.GetConvertedPage(sessionId, pageIdx)
        .then((r: any) => {
          const b64 = r?.Base64 || r?.base64
          if ((r?.Success ?? r?.success) && b64) {
            console.log('[LazyPage] sqlite OK page', pageIdx, 'b64 len:', b64.length)
            setImgSrc(`data:image/webp;base64,${b64}`)
          } else { console.warn('[LazyPage] sqlite FAIL page', pageIdx) }
        })
        .catch((e: any) => console.error('[LazyPage] sqlite err', e))
      return
    }

    // Non-sqlite: data URI, blob URL, http, or raw base64
    const resolved = src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http') || src.startsWith('/')
      ? src : `data:image/webp;base64,${src}`
    console.log('[LazyPage] resolved prefix:', resolved.substring(0, 50))
    setImgSrc(resolved)
  }, [src])

  if (!imgSrc) return <div style={{ width: '100%', height: '100%', background: '#f1f5f9' }} />

  return (
    <img
      src={imgSrc}
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }}
      alt=""
      onLoad={() => console.log('[LazyPage] img LOADED ok')}
      onError={() => console.error('[LazyPage] img ERROR, src prefix:', imgSrc.substring(0, 60))}
    />
  )
})

const LiveStrokeOverlay = React.memo(({ pageImagesLength }: { pageImagesLength: number }) => {
  const [activeStroke, setActiveStroke] = React.useState<Stroke | null>(null)

  React.useEffect(() => {
    const handleStroke = (e: any) => setActiveStroke(e.detail ? { ...e.detail } : null)
    const handleStop = () => setActiveStroke(null)
    
    window.addEventListener('live-stroke', handleStroke)
    window.addEventListener('stop-live-stroke', handleStop)
    return () => {
      window.removeEventListener('live-stroke', handleStroke)
      window.removeEventListener('stop-live-stroke', handleStop)
    }
  }, [])

  if (!activeStroke || activeStroke.points.length < 2) return null

  let effectivePen = activeStroke.size === 1 ? 1 : activeStroke.size * 1.5
  let lw = effectivePen * 2
  if (lw < 2) lw = 2
  
  const d = activeStroke.points.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`
    if (i === 1) return acc + `L${p.x},${p.y}`
    const prev = activeStroke.points[i - 1]
    const cx = (prev.x + p.x) / 2
    const cy = (prev.y + p.y) / 2
    return acc + `Q${prev.x},${prev.y},${cx},${cy}`
  }, '')

  const color = activeStroke.isEraser ? '#ffffff' : '#000000'

  return (
    <svg
      viewBox={`0 0 1600 ${2262 * Math.max(1, pageImagesLength)}`}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 40, pointerEvents: 'none' }}
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke={color} strokeWidth={lw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
})


interface SendocDesignerCanvasProps {
  viewMode: string
  isTeacher: boolean
  isSigner: boolean
  isViewer: boolean
  activeDoc: any
  resultViewerData: any
  pageImages: string[]
  currentPageIdx: number
  setCurrentPageIdx: (idx: number) => void
  backgroundUrl: string | null
  zoom: number
  isDrawingMode: boolean
  setIsDrawingMode: (val: boolean) => void
  isEraser: boolean
  setIsEraser: (val: boolean) => void
  penSize: number
  setPenSize: (val: number) => void
  strokes: Stroke[]
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>
  fields: DocField[]
  setFields: React.Dispatch<React.SetStateAction<DocField[]>>
  addField: (type: 'text' | 'signature') => void
  handleFieldDrag: (id: string, e: React.MouseEvent) => void
  handleFieldResize: (id: string, e: React.MouseEvent) => void
  activeSignField: string | null
  setActiveSignField: (id: string | null) => void
  activeCharPicker: string | null
  setActiveCharPicker: (id: string | null) => void
  specialChars: string[]
  scrollContainerRef: React.RefObject<HTMLDivElement>
  containerRef: React.RefObject<HTMLDivElement>
  fullCanvasRef: React.RefObject<HTMLCanvasElement>
  signatureCanvasRef: React.RefObject<HTMLCanvasElement>
  handlePanStart: (e: React.MouseEvent) => void
  handlePanMove: (e: React.MouseEvent) => void
  handlePanEnd: () => void
  startFullDrawing: (e: any) => void
  drawFull: (e: any) => void
  stopFullDrawing: () => void
  startDrawing: (e: any) => void
  draw: (e: any) => void
  stopDrawing: () => void
  saveSignature: () => void
}

export function SendocDesignerCanvas({
  viewMode, isTeacher, isSigner, isViewer, activeDoc, resultViewerData,
  pageImages, currentPageIdx, setCurrentPageIdx, backgroundUrl, zoom,
  isDrawingMode, setIsDrawingMode, isEraser, setIsEraser, penSize, setPenSize,
  strokes, setStrokes, fields, setFields, addField, handleFieldDrag, handleFieldResize,
  activeSignField, setActiveSignField, activeCharPicker, setActiveCharPicker, specialChars,
  scrollContainerRef, containerRef, fullCanvasRef, signatureCanvasRef,
  handlePanStart, handlePanMove, handlePanEnd,
  startFullDrawing, drawFull, stopFullDrawing,
  startDrawing, draw, stopDrawing, saveSignature
}: SendocDesignerCanvasProps) {
  const [floatingMenuPos, setFloatingMenuPos] = React.useState({ x: 0, y: 0 })



  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#e2e8f0', position: 'relative' }}>
        {/* Top Horizontal Toolbar */}
        {viewMode === 'designer' && (
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', borderBottom: '1px solid #e2e8f0', padding: '8px 24px', gap: 12, zIndex: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginRight: 8 }}>도구:</span>
            
            <button onClick={() => setIsDrawingMode(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, border: `2px solid ${!isDrawingMode ? '#3b82f6' : 'transparent'}`, background: !isDrawingMode ? '#eff6ff' : '#f8fafc', cursor: 'pointer', color: !isDrawingMode ? '#3b82f6' : '#64748b', transition: 'all 0.2s' }}>
              <i className="fi fi-rr-mouse" /> <span style={{ fontSize: 13, fontWeight: !isDrawingMode ? 700 : 500 }}>마우스</span>
            </button>
            <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
            
            <button onClick={() => { setIsDrawingMode(false); addField('text') }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
              <i className="fi fi-rr-text-input" style={{ color: '#3b82f6' }} /> <span style={{ fontSize: 13 }}>텍스트 영역 추가</span>
            </button>
            <button onClick={() => { setIsDrawingMode(false); addField('signature') }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
              <i className="fi fi-rr-edit" style={{ color: '#ef4444' }} /> <span style={{ fontSize: 13 }}>서명 영역 추가</span>
            </button>

            <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

            <button
              onClick={() => setIsDrawingMode(!isDrawingMode)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, border: `2px solid ${isDrawingMode ? '#4f46e5' : 'transparent'}`, background: isDrawingMode ? '#e0e7ff' : '#f8fafc', cursor: 'pointer', color: isDrawingMode ? '#4f46e5' : '#64748b', transition: 'all 0.2s' }}
            >
              <i className="fi fi-rr-pencil" /> <span style={{ fontSize: 13, fontWeight: isDrawingMode ? 700 : 500 }}>전체 영역 그리기</span>
            </button>

            {isDrawingMode && (
              <>
                <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
                
                <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 100 }}>
                  <button title="펜" onClick={() => setIsEraser(false)} style={{ padding: '6px 12px', borderRadius: 100, border: 'none', background: !isEraser ? 'white' : 'transparent', cursor: 'pointer', fontSize: 15, fontWeight: !isEraser ? 700 : 500, color: !isEraser ? '#4f46e5' : '#64748b', boxShadow: !isEraser ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}><i className="fi fi-rr-pencil" /></button>
                  <button title="지우개" onClick={() => setIsEraser(true)} style={{ padding: '6px 12px', borderRadius: 100, border: 'none', background: isEraser ? 'white' : 'transparent', cursor: 'pointer', fontSize: 15, fontWeight: isEraser ? 700 : 500, color: isEraser ? '#4f46e5' : '#64748b', boxShadow: isEraser ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}><i className="fi fi-rr-eraser" /></button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                  <input title="굵기" type="number" min="1" max="50" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} style={{ width: 44, padding: '4px', textAlign: 'center', borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none' }} />
                  <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', borderRadius: '50%', background: '#f8fafc' }}>
                    <div style={{ width: Math.min(30, penSize), height: Math.min(30, penSize), borderRadius: '50%', background: isEraser ? '#eff6ff' : '#475569', border: isEraser ? '1px dashed #94a3b8' : 'none' }} />
                  </div>
                </div>

                <div style={{ flex: 1 }} />

                <button title="초기화" onClick={() => { if (window.confirm('그린 내용을 모두 초기화 하시겠습니까?')) { setStrokes([]); } }} style={{ padding: '6px 12px', borderRadius: 100, border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#fecaca'} onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}><i className="fi fi-rr-trash" /></button>
              </>
            )}
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
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'white' }}>
                  {pageImages.map((pg, i) => (
                    <div key={i} style={{ width: '100%', height: `${100 / pageImages.length}%`, position: 'relative', flexShrink: 0 }}>
                      <LazyPageImage src={pg} />
                    </div>
                  ))}
                  {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                    <div key={'div' + i} style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: -40, width: 'calc(100% + 80px)', height: 32, marginTop: -16, background: '#e2e8f0', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', zIndex: 2, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                      <span style={{background: '#cbd5e1', padding: '2px 10px', borderRadius: 12, fontSize: 11, color: '#475569', fontWeight: 700, letterSpacing: 1}}>PAGE {i + 2}</span>
                    </div>
                  ))}
                </div>
              ) : (
                backgroundUrl || resultViewerData?.bgUrl ? (
                  <img src={backgroundUrl || resultViewerData?.bgUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="문서 배경" />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <div className="spinner" style={{ marginBottom: 16 }} />
                    <p>문서를 불러오는 중...</p>
                  </div>
                )
              )}

              {/* Hidden tiny canvas - keeps fullCanvasRef alive for drawing coordinate capture.
                  The original 1600×83694 canvas used ~535MB GPU memory, exceeding Chromium's limit
                  and causing ALL image textures to be evicted (the root cause of white pages). */}
              <canvas
                ref={fullCanvasRef}
                width={1} height={1}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 40, pointerEvents: isDrawingMode ? 'auto' : 'none', cursor: isDrawingMode ? 'crosshair' : 'default', touchAction: 'none', opacity: 0 }}
                onPointerDown={startFullDrawing} onPointerMove={drawFull} onPointerUp={stopFullDrawing} onPointerOut={stopFullDrawing} onPointerCancel={stopFullDrawing}
              />

              {/* SVG stroke overlay - zero GPU memory, renders all strokes as vector paths */}
              {strokes.length > 0 && (
                <svg
                  viewBox={`0 0 1600 ${2262 * Math.max(1, pageImages.length)}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 39, pointerEvents: 'none' }}
                  preserveAspectRatio="none"
                >
                  {strokes.map((stroke, si) => {
                    if (stroke.points.length < 2) return null
                    let effectivePen = stroke.size === 1 ? 1 : stroke.size * 1.5
                    let lw = effectivePen * 2
                    if (lw < 2) lw = 2
                    const d = stroke.points.reduce((acc, p, i) => {
                      if (i === 0) return `M${p.x},${p.y}`
                      if (i === 1) return acc + `L${p.x},${p.y}`
                      const prev = stroke.points[i - 1]
                      const cx = (prev.x + p.x) / 2
                      const cy = (prev.y + p.y) / 2
                      return acc + `Q${prev.x},${prev.y},${cx},${cy}`
                    }, '')
                    // For erasings in SVG over images, we can't easily mask the base image, but we can draw white lines
                    // Since the background of pages is white, drawing white lines effectively "erases" the pen strokes and the white background.
                    const color = stroke.isEraser ? '#ffffff' : '#000000'
                    return <path key={si} d={d} fill="none" stroke={color} strokeWidth={lw} strokeLinecap="round" strokeLinejoin="round" />
                  })}
                </svg>
              )}

              {/* Real-time Live Stroke Overlay */}
              <LiveStrokeOverlay pageImagesLength={pageImages.length} />

              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 30, pointerEvents: isDrawingMode ? 'none' : 'auto' }}>
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
                      <div onClick={() => { const isLockedAsset = f.isAsset || f.label === '내 사인' || f.label === '내 도장'; if (!isViewer && !activeDoc?.is_signed && !f.id.includes('canvas_overlay') && !isLockedAsset) setActiveSignField(f.id); }} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !isViewer && !f.id.includes('canvas_overlay') && !(f.isAsset || f.label === '내 사인' || f.label === '내 도장') ? 'pointer' : 'default' }}>
                        {f.signatureData && f.signatureData.startsWith('[') ? (
                          <VectorSignatureCanvas strokesJSON={f.signatureData} width={typeof f.width === 'number' ? f.width : 800} height={typeof f.height === 'number' ? f.height : 1131} />
                        ) : f.signatureData ? (
                          <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <><i className="fi fi-rr-edit" style={{ marginRight: 6 }} /> {!isViewer ? '서명하기' : '서명란'}</>
                        )}
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
    </>
  )
}
