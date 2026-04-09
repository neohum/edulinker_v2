import { useEffect, useRef } from 'react'
import type { Stroke } from '../../types/sendoc'

interface VectorSignatureCanvasProps {
  strokesJSON: string
  width: number
  height: number
  isOverlay?: boolean
}

export const VectorSignatureCanvas = ({ strokesJSON, width, height, isOverlay = false }: VectorSignatureCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()

    try {
      let parsed = JSON.parse(strokesJSON)
      let strokes: Stroke[] = []
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (Array.isArray(parsed[0])) { strokes = parsed[0] } else { strokes = parsed }
      }

      if (!isOverlay && strokes.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidPoints = false;
        strokes.forEach(stroke => {
          if (!stroke || !stroke.points) return;
          stroke.points.forEach((p: any) => {
            if (!isNaN(p.x) && !isNaN(p.y)) {
               minX = Math.min(minX, Number(p.x)); maxX = Math.max(maxX, Number(p.x));
               minY = Math.min(minY, Number(p.y)); maxY = Math.max(maxY, Number(p.y));
               hasValidPoints = true;
            }
          });
        });

        if (hasValidPoints) {
           const bw = Math.max(1, maxX - minX);
           const bh = Math.max(1, maxY - minY);
           // Native device scaling for sharper crisp canvas
           const dps = 2; // pixel ratio multiplier
           
           // Calculate dynamic scaling ratio to exactly fit the vector boundaries to the container size
           const scale = Math.min((width * dps) / bw, (height * dps) / bh) * 0.9;
           
           const cx = (width * dps) / 2;
           const cy = (height * dps) / 2;
           const bcx = minX + bw / 2;
           const bcy = minY + bh / 2;
           
           ctx.translate(cx, cy);
           ctx.scale(scale, scale);
           ctx.translate(-bcx, -bcy);
           
           // We must temporarily adjust strokes size so that when auto-scaled up/down they preserve original weight visually
           strokes.forEach(stroke => {
              if (stroke.size) stroke.size = (stroke.size < 1 ? 1 : stroke.size) / scale * 2;
           });
        } else {
           ctx.scale(2, 2)
        }
      } else {
        ctx.scale(2, 2)
      }

      strokes.forEach(stroke => {
        if (!stroke || !stroke.points || stroke.points.length === 0) return

        let lw = (stroke.size === 1 ? 0.5 : stroke.size * 1.5) * 2
        if (lw < 1) lw = 1

        ctx.lineWidth = lw
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over'
        ctx.strokeStyle = stroke.isEraser ? 'rgba(0,0,0,1)' : '#000'

        ctx.beginPath()
        if (stroke.points.length === 1) {
          ctx.arc(Number(stroke.points[0].x), Number(stroke.points[0].y), lw / 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (stroke.points.length > 1) {
          ctx.moveTo(Number(stroke.points[0].x), Number(stroke.points[0].y))
          for (let i = 1; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i]; const p2 = stroke.points[i + 1]
            if (!p1 || !p2 || isNaN(Number(p1.x)) || isNaN(Number(p1.y)) || isNaN(Number(p2.x)) || isNaN(Number(p2.y))) continue;
            const xc = (Number(p1.x) + Number(p2.x)) / 2
            const yc = (Number(p1.y) + Number(p2.y)) / 2
            ctx.quadraticCurveTo(Number(p1.x), Number(p1.y), xc, yc)
          }
          ctx.lineTo(Number(stroke.points[stroke.points.length - 1].x), Number(stroke.points[stroke.points.length - 1].y))
          ctx.stroke()
        }
      })
    } catch { }
    ctx.restore()
  }, [strokesJSON, width, height, isOverlay])

  return <canvas ref={canvasRef} width={width * 2} height={height * 2} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
}
