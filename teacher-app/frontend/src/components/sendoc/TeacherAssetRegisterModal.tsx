import React, { useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { Stroke } from '../../types/sendoc'
import { VectorSignatureCanvas } from './VectorSignatureCanvas'

interface TeacherAssetRegisterModalProps {
  assetType: 'signature' | 'stamp'
  onClose: () => void
}

export function TeacherAssetRegisterModal({ assetType, onClose }: TeacherAssetRegisterModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const strokesRef = useRef<Stroke[]>([])
  const [existingSignatures, setExistingSignatures] = useState<Stroke[][]>([])
  
  // For Stamp Generation
  const [stampName, setStampName] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<string>('circle-gothic')
  const [existingStamps, setExistingStamps] = useState<string[]>([])
  
  const width = 600
  const height = assetType === 'signature' ? 300 : 400

  const renderCanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, allStrokes: Stroke[], activeStroke: Stroke | null) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    const drawStroke = (stroke: Stroke) => {
      if (!stroke || !stroke.points || stroke.points.length === 0) return
      let effectivePen = stroke.size === 1 ? 1 : (stroke.size || 3) * 1.5
      let lw = effectivePen * 2
      if (lw < 2) lw = 2

      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over'
      ctx.strokeStyle = stroke.isEraser ? 'rgba(0,0,0,1)' : (assetType === 'stamp' ? '#ef4444' : '#000')

      ctx.beginPath()
      if (stroke.points.length === 1) {
        ctx.arc(stroke.points[0].x, stroke.points[0].y, lw / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (stroke.points.length > 1) {
        ctx.moveTo(Number(stroke.points[0].x), Number(stroke.points[0].y))
        for (let i = 1; i < stroke.points.length - 1; i++) {
          const p1 = stroke.points[i]
          const p2 = stroke.points[i + 1]
          const xc = (Number(p1.x) + Number(p2.x)) / 2
          const yc = (Number(p1.y) + Number(p2.y)) / 2
          ctx.quadraticCurveTo(Number(p1.x), Number(p1.y), xc, yc)
        }
        ctx.lineTo(Number(stroke.points[stroke.points.length - 1].x), Number(stroke.points[stroke.points.length - 1].y))
        ctx.stroke()
      }
    }

    allStrokes.forEach(drawStroke)
    if (activeStroke) drawStroke(activeStroke)
    ctx.globalCompositeOperation = 'source-over'
  }
  
  // Load existing asset
  useEffect(() => {
    const wailsApp = (window as any).go?.main?.App
    if (wailsApp?.LoadTeacherAsset) {
      wailsApp.LoadTeacherAsset(assetType).then((data: string) => {
        if (data && data.length > 0 && data !== '[]') {
          if (data.startsWith('["data:image')) {
            try {
              setExistingStamps(JSON.parse(data))
            } catch(e) {}
          } else if (data.startsWith('[')) {
            try {
              const parsed = JSON.parse(data)
              if (parsed.length > 0 && Array.isArray(parsed[0])) {
                setExistingSignatures(parsed)
              } else if (parsed.length > 0) {
                setExistingSignatures([parsed])
              }
            } catch(e) {}
          } else if (data.startsWith('data:image')) {
            setExistingStamps([data])
          }
        }
      }).catch(() => {})
    }
  }, [assetType])

  const generateStamp = (name: string, formatId: string): string => {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 120
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    ctx.clearRect(0, 0, 120, 120)

    ctx.strokeStyle = '#ef4444' // red
    ctx.fillStyle = '#ef4444'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const isCircle = formatId.startsWith('circle')
    const isGungsuh = formatId.endsWith('gungsuh')
    const fontFamily = isGungsuh ? '"Gungsuh", "궁서", "Batang", "바탕", serif' : '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif'

    if (isCircle) {
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(60, 60, 54, 0, Math.PI * 2)
      ctx.stroke()

      const len = name.length
      if (len <= 2) {
        ctx.font = `bold 36px ${fontFamily}`
        ctx.fillText(name, 60, 60)
      } else {
        ctx.font = `bold 32px ${fontFamily}`
        const chars = name.length === 3 ? name + '인' : name.substring(0, 4)
        ctx.fillText(chars.substring(0, 2), 60, 40)
        ctx.fillText(chars.substring(2, 4), 60, 80)
      }
    } else {
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.rect(6, 6, 108, 108)
      ctx.stroke()
      
      ctx.font = `bold 38px ${fontFamily}`
      if (name.length <= 2) {
         ctx.fillText(name, 60, 60)
      } else {
         const t = name.length === 3 ? name + '인' : name.padEnd(4, '인').substring(0, 4)
         ctx.fillText(t[0], 36, 38)
         ctx.fillText(t[1], 84, 38)
         ctx.fillText(t[2], 36, 84)
         ctx.fillText(t[3], 84, 84)
      }
    }
    return canvas.toDataURL('image/png')
  }

  // Redraw logic
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    renderCanvas(canvas, ctx, strokes, null)
  }, [strokes, assetType])

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return
    if (e.target && (e.target as HTMLCanvasElement).setPointerCapture) {
      try { (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId) } catch (err) {}
    }
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    currentStrokeRef.current = { points: [{ x, y }], size: 3, isEraser: false }
    isDrawingRef.current = true
    renderCanvas(canvasRef.current, canvasRef.current.getContext('2d')!, strokesRef.current, currentStrokeRef.current)
  }

  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e && e.target && (e.target as HTMLCanvasElement).releasePointerCapture) {
      try { (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId) } catch (err) {}
    }
    if (isDrawingRef.current && currentStrokeRef.current) {
      const newStrokes = [...strokesRef.current, currentStrokeRef.current]
      strokesRef.current = newStrokes // immediately update ref
      setStrokes(newStrokes) // trigger react render asynchronously
      currentStrokeRef.current = null
    }
    isDrawingRef.current = false
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current || !currentStrokeRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    currentStrokeRef.current.points.push({ x, y })
    renderCanvas(canvas, ctx, strokesRef.current, currentStrokeRef.current)
  }

  const saveAsset = async () => {
    let payload = ''
    if (assetType === 'stamp') {
      if (!stampName.trim()) {
        toast.error('사용할 이름을 입력해주세요.')
        return
      }
      const newStamp = generateStamp(stampName.trim(), selectedFormat)
      // 최대 2개까지만 유지 (가장 오래된 것 밀어내기)
      const updated = [...existingStamps, newStamp].slice(-2)
      payload = JSON.stringify(updated)
    } else {
      if (strokes.length === 0) {
        toast.error('내용을 그려주세요.')
        return
      }
      payload = JSON.stringify(strokes)
    }

    const wailsApp = (window as any).go?.main?.App
    if (!wailsApp?.SaveTeacherAsset) {
      toast.error('선생님 에셋 저장 API를 찾을 수 없습니다.')
      return
    }
    
    try {
      await wailsApp.SaveTeacherAsset(assetType, payload)
      toast.success(`${assetType === 'signature' ? '서명' : '도장'}이 등록되었습니다.`)
      if (assetType === 'stamp') {
        setExistingStamps([...existingStamps, generateStamp(stampName.trim(), selectedFormat)].slice(-2))
      } else {
        setExistingSignatures([...existingSignatures, strokes].slice(-3))
        setStrokes([])
        strokesRef.current = [] // clear canvas
      }
    } catch (e: any) {
      toast.error('에셋 저장 실패: ' + (e?.message || e))
    }
  }

  const deleteStamp = async (idx: number) => {
    if (!window.confirm('선택하신 도장을 삭제하시겠습니까?')) return
    const wailsApp = (window as any).go?.main?.App
    if (!wailsApp?.SaveTeacherAsset) return
    
    const updated = existingStamps.filter((_, i) => i !== idx)
    const payload = updated.length > 0 ? JSON.stringify(updated) : ''

    try {
      await wailsApp.SaveTeacherAsset('stamp', payload)
      toast.success('도장이 삭제되었습니다.')
      setExistingStamps(updated)
    } catch (e: any) {
      toast.error('삭제 처리 중 오류가 발생했습니다.')
    }
  }

  const setMainStamp = async (idx: number) => {
    const wailsApp = (window as any).go?.main?.App
    if (!wailsApp?.SaveTeacherAsset) return
    
    // 선택된 항목을 배열의 맨 앞으로 이동
    const updated = [existingStamps[idx], ...existingStamps.filter((_, i) => i !== idx)]
    const payload = JSON.stringify(updated)

    try {
      await wailsApp.SaveTeacherAsset('stamp', payload)
      toast.success('대표 도장으로 설정되었습니다.')
      setExistingStamps(updated)
    } catch (e: any) {
      toast.error('설정 중 오류가 발생했습니다.')
    }
  }

  const deleteSignature = async (idx: number) => {
    if (!window.confirm('선택하신 서명을 삭제하시겠습니까?')) return
    const wailsApp = (window as any).go?.main?.App
    if (!wailsApp?.SaveTeacherAsset) return
    
    const updated = existingSignatures.filter((_, i) => i !== idx)
    const payload = updated.length > 0 ? JSON.stringify(updated) : ''
    
    try {
      await wailsApp.SaveTeacherAsset('signature', payload)
      toast.success('서명이 삭제되었습니다.')
      setExistingSignatures(updated)
    } catch (e: any) {
      toast.error('삭제 처리 중 오류가 발생했습니다.')
    }
  }

  const setMainSignature = async (idx: number) => {
    const wailsApp = (window as any).go?.main?.App
    if (!wailsApp?.SaveTeacherAsset) return
    
    const updated = [existingSignatures[idx], ...existingSignatures.filter((_, i) => i !== idx)]
    const payload = JSON.stringify(updated)

    try {
      await wailsApp.SaveTeacherAsset('signature', payload)
      toast.success('대표 서명으로 설정되었습니다.')
      setExistingSignatures(updated)
    } catch (e: any) {
      toast.error('설정 중 오류가 발생했습니다.')
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 700, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 24, right: 24, background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, color: '#94a3b8', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', width: 40, height: 40, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>&times;</button>
        <h4 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{assetType === 'signature' ? '서명 등록' : '도장 등록'}</h4>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
          {assetType === 'signature' ? (
            <>아래 영역에 서명을 그려주세요.<br/>(선 데이터로 저장되어 품질 저하가 없습니다.)</>
          ) : (
            <>도장에 들어갈 이름을 입력하고 형식을 선택하세요.<br/>(빨간 선을 제외한 투명한 이미지로 생성됩니다.)</>
          )}
        </p>

        {assetType === 'stamp' ? (
          <div style={{ width: '100%' }}>
            <div style={{ marginBottom: 24, width: '100%' }}>
               <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 8 }}>사용할 이름 (최대 4자)</label>
               <input 
                 type="text" 
                 value={stampName} 
                 onChange={e => setStampName(e.target.value.slice(0, 4))} 
                 placeholder="예: 홍길동"
                 style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 16, outline: 'none' }}
               />
            </div>
            
            <div style={{ marginBottom: 12 }}>
               <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12 }}>도장 형식 선택</label>
               <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {['circle-gothic', 'square-gothic', 'circle-gungsuh', 'square-gungsuh'].map(format => (
                     <div 
                       key={format} 
                       onClick={() => setSelectedFormat(format)}
                       style={{ 
                         border: selectedFormat === format ? '2px solid #ef4444' : '2px solid #e2e8f0', 
                         borderRadius: 12, 
                         padding: 20, 
                         cursor: 'pointer', 
                         background: selectedFormat === format ? '#fef2f2' : 'white',
                         transition: 'all 0.2s',
                         display: 'flex', alignItems: 'center', justifyContent: 'center'
                       }}
                     >
                        <img 
                          src={generateStamp(stampName || '홍길동', format)} 
                          alt="도장 미리보기" 
                          style={{ width: 70, height: 70, opacity: stampName ? 1 : 0.4 }} 
                        />
                     </div>
                  ))}
               </div>
               {!stampName && <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 12 }}>이름을 입력하면 미리보기가 활성화됩니다.</p>}
            </div>

            {existingStamps.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12 }}>현재 등록된 도장 (최대 2개)</span>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                  {existingStamps.map((stampImg, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                      {idx === 0 && (
                        <div style={{ position: 'absolute', top: -10, left: 10, background: '#3b82f6', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 'bold', zIndex: 10 }}>
                          기본 도장
                        </div>
                      )}
                      <div style={{ border: idx === 0 ? '2px solid #3b82f6' : '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#f8fafc', marginBottom: 8 }}>
                        <img src={stampImg} alt={`기존 도장 ${idx + 1}`} style={{ width: 80, height: 80 }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {idx !== 0 && (
                          <button onClick={() => setMainStamp(idx)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="fi fi-rr-star" /> <span>메인 설정</span>
                          </button>
                        )}
                        <button onClick={() => deleteStamp(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <i className="fi fi-rr-trash" /> <span>삭제</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ position: 'relative', width, height, border: '2px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc', overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerOut={stopDrawing}
              onPointerCancel={stopDrawing}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 24, width: '100%' }}>
          {assetType === 'signature' && (
            <button onClick={() => {
              setStrokes([]); strokesRef.current = [];
            }} className="btn-secondary" style={{ flex: 1 }}>초기화</button>
          )}
          <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>{assetType === 'signature' && existingSignatures.length > 0 ? '닫기' : '취소'}</button>
          <button onClick={saveAsset} className="btn-primary" style={{ flex: 2 }}>{assetType === 'signature' ? '서명 등록' : '도장 등록'}</button>
        </div>

        {assetType === 'signature' && existingSignatures.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 12 }}>현재 등록된 서명 (최대 3개)</span>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              {existingSignatures.map((sig, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  {idx === 0 && (
                    <div style={{ position: 'absolute', top: -10, left: 10, background: '#3b82f6', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 'bold', zIndex: 10 }}>
                      기본 서명
                    </div>
                  )}
                  <div style={{ border: idx === 0 ? '2px solid #3b82f6' : '1px solid #e2e8f0', borderRadius: 12, padding: 8, background: '#f8fafc', height: 75, width: 140, position: 'relative', overflow: 'hidden', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '100%', height: '100%', transform: 'scale(1.3)', transformOrigin: 'center' }}>
                      <VectorSignatureCanvas strokesJSON={JSON.stringify(sig)} width={600} height={300} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {idx !== 0 && (
                      <button onClick={() => setMainSignature(idx)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="fi fi-rr-star" /> <span>메인 설정</span>
                      </button>
                    )}
                    <button onClick={() => deleteSignature(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fi fi-rr-trash" /> <span>삭제</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
