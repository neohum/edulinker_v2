import React from 'react'
import type { DocField, RecipientStatus, Sendoc, PendingDoc, Stroke } from '../../types/sendoc'
import { VectorSignatureCanvas } from './VectorSignatureCanvas'

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

  return (
    <>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#e2e8f0', position: 'relative' }}>
        {/* Sidebar for Designer */}
        {viewMode === 'designer' && (
          <div style={{ width: 280, background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: 16 }}>
            <div style={{ padding: 16, borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>도구 박스 요소</div>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>추가할 요소를 클릭한 후, 우측 캔버스에서 드래그하여 위치와 크기를 조절하세요.</p>
            </div>
            <div style={{ padding: 16 }}>
              {/* Page Thumbnails (if multi-page) */}
              {pageImages.length > 1 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>페이지 네비게이션</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                    {pageImages.map((pg, idx) => {
                      const isCurrent = currentPageIdx === idx
                      return (
                        <div key={idx} onClick={() => {
                          setCurrentPageIdx(idx)
                          if (scrollContainerRef.current) {
                            const targetScroll = (idx / pageImages.length) * scrollContainerRef.current.scrollHeight
                            scrollContainerRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' })
                          }
                          if (viewMode === 'designer' && backgroundUrl && backgroundUrl.startsWith('blob:')) {
                            const binaryStr = atob(pg)
                            const bytes = new Uint8Array(binaryStr.length)
                            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
                            // setLocalBackgroundImage - ignored for now as pageImages renders it entirely
                          }
                        }}
                          style={{ cursor: 'pointer', border: isCurrent ? '2px solid #6366f1' : '2px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', opacity: isCurrent ? 1 : 0.7 }}>
                          <img src={`data:image/png;base64,${pg}`} alt={`${idx + 1}페이지`} style={{ width: '100%', display: 'block' }} />
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
            <div style={{ display: 'grid', gap: 8, padding: '0 16px' }}>
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
                  {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                    <div key={'div' + i} style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: 0, width: '100%', height: 4, background: '#94a3b8', borderTop: '1px dashed #475569', borderBottom: '1px dashed #475569', zIndex: 15, pointerEvents: 'none' }} />
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
                      <div onClick={() => { if (!isViewer && !activeDoc?.is_signed && !f.id.includes('canvas_overlay')) setActiveSignField(f.id); }} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !isViewer && !f.id.includes('canvas_overlay') ? 'pointer' : 'default' }}>
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
