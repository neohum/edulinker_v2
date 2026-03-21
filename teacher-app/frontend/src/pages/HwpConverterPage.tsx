import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'

interface HancomStatus {
  installed: boolean
  version: string
  path: string
}

export default function HwpConverterPage() {
  const [file, setFile] = useState<File | null>(null)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState<{ type: string, url: string, fileName: string, size: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hancom, setHancom] = useState<HancomStatus | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    checkHancom()
  }, [])

  const checkHancom = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      // GetHancomStatus returns cached result from startup (instant)
      if (wailsApp?.GetHancomStatus) {
        const status = await wailsApp.GetHancomStatus()
        setHancom(status)
      } else if (wailsApp?.CheckHancom) {
        const status = await wailsApp.CheckHancom()
        setHancom(status)
      }
    } catch {}
  }

  const fileToBase64 = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        resolve(dataUrl.split(',')[1] || '')
      }
      reader.onerror = reject
      reader.readAsDataURL(f)
    })
  }

  const processFile = (selectedFile: File) => {
    const name = selectedFile.name.toLowerCase()
    if (name.endsWith('.hwp') || name.endsWith('.hwpx')) {
      setFile(selectedFile)
      setResult(null)
    } else {
      toast.error('HWP 또는 HWPX 파일만 선택 가능합니다.')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) processFile(selectedFile)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) processFile(droppedFile)
  }

  const handleConvert = async (type: 'pdf' | 'image') => {
    if (!file) return

    setConverting(true)
    setResult(null)

    try {
      const wailsApp = (window as any).go?.main?.App

      // Fast path: use ConvertHwpDirect if file has a local path (Wails can access)
      // For drag-drop files, fall back to base64 method
      if (wailsApp?.ConvertHwp) {
        const base64Data = await fileToBase64(file)
        const res = await wailsApp.ConvertHwp(file.name, base64Data, type)

        if (res.success) {
          if (res.data) {
            // base64 result — decode to blob
            const binaryStr = atob(res.data)
            const bytes = new Uint8Array(binaryStr.length)
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i)
            }
            const mimeType = type === 'pdf' ? 'application/pdf' : 'image/png'
            const blob = new Blob([bytes], { type: mimeType })
            const url = URL.createObjectURL(blob)
            setResult({ type, url, fileName: res.file_name, size: res.size })
          } else {
            // Native save — file already saved, no blob needed
            setResult({ type, url: '', fileName: res.file_name, size: res.size })
          }
          toast.success(`${file.name} 변환 완료!`)
        } else {
          if (res.error) toast.error(res.error)
        }
      } else {
        toast.error('변환 기능을 사용할 수 없습니다. (Wails 환경에서만 지원)')
      }
    } catch (e) {
      console.error('[HWP] Convert error:', e)
      toast.error('변환 중 오류가 발생했습니다.')
    } finally {
      setConverting(false)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.info(`${result.fileName} 다운로드를 시작합니다.`)
  }

  const handleNativeFileSelect = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.SelectFile) {
        // Fallback to HTML input if no native dialog
      }
    } catch {}
    fileInputRef.current?.click()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          <i className="fi fi-rr-file-pdf" style={{ marginRight: 12, color: 'var(--accent-blue)' }} />
          HWP 문서 변환
        </h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          한글(HWP) 문서를 PDF나 이미지 파일로 변환하여 어디서든 편리하게 확인하세요.
        </p>
      </div>

      {/* Hancom Status */}
      {hancom && (
        <div style={{
          marginBottom: 20, padding: '12px 20px', borderRadius: 12,
          background: hancom.installed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${hancom.installed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          display: 'flex', alignItems: 'center', gap: 12, fontSize: 14
        }}>
          <i className={`fi ${hancom.installed ? 'fi-rr-check-circle' : 'fi-rr-exclamation'}`}
            style={{ color: hancom.installed ? '#22c55e' : '#ef4444', fontSize: 18 }} />
          <div>
            {hancom.installed ? (
              <span>한컴오피스 <strong>{hancom.version}</strong> 감지됨 — 실제 변환이 가능합니다.</span>
            ) : (
              <span style={{ color: '#ef4444' }}>한컴오피스가 감지되지 않았습니다. 변환 기능을 사용하려면 한컴오피스를 설치해주세요.</span>
            )}
          </div>
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          background: isDragging ? 'rgba(37, 99, 235, 0.05)' : 'white',
          padding: 60,
          borderRadius: 24,
          border: isDragging ? '2px solid #2563eb' : '2px dashed var(--border-color)',
          textAlign: 'center',
          marginBottom: 24,
          transition: 'all 0.2s ease',
          cursor: !file ? 'pointer' : 'default',
          position: 'relative'
        }}
        onClick={() => !file && handleNativeFileSelect()}
      >
        {!file ? (
          <div>
            <div style={{ fontSize: 56, color: isDragging ? '#2563eb' : 'var(--text-muted)', marginBottom: 20 }}>
              <i className={isDragging ? "fi fi-rr-cloud-download" : "fi fi-rr-upload"} />
            </div>
            <p style={{ marginBottom: 12, fontWeight: 700, fontSize: 18 }}>
              {isDragging ? '여기에 놓으세요!' : 'HWP 파일을 드래그하거나 클릭하여 선택'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>한글 문서 지원 (.hwp, .hwpx)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".hwp,.hwpx"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        ) : (
          <div onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 48, color: '#2563eb', marginBottom: 16 }}>
              <i className="fi fi-rr-file" />
            </div>
            <p style={{ marginBottom: 8, fontWeight: 600, fontSize: 18 }}>{file.name}</p>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
              {formatSize(file.size)}
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => handleConvert('pdf')}
                disabled={converting || !(hancom?.installed)}
                style={{
                  background: '#dc2626', color: 'white', padding: '12px 24px',
                  borderRadius: 12, border: 'none', fontWeight: 600,
                  cursor: (converting || !hancom?.installed) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: (converting || !hancom?.installed) ? 0.7 : 1
                }}
              >
                <i className="fi fi-rr-document" />
                PDF로 변환
              </button>
              <button
                onClick={() => handleConvert('image')}
                disabled={converting || !(hancom?.installed)}
                style={{
                  background: 'var(--accent-blue)', color: 'white', padding: '12px 24px',
                  borderRadius: 12, border: 'none', fontWeight: 600,
                  cursor: (converting || !hancom?.installed) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: (converting || !hancom?.installed) ? 0.7 : 1
                }}
              >
                <i className="fi fi-rr-picture" />
                이미지로 변환
              </button>
              <button
                onClick={() => { setFile(null); setResult(null) }}
                disabled={converting}
                style={{
                  background: 'transparent', color: 'var(--text-secondary)',
                  padding: '12px 24px', borderRadius: 12, border: '1px solid var(--border-color)',
                  cursor: converting ? 'not-allowed' : 'pointer', fontWeight: 600
                }}
              >
                다른 파일 선택
              </button>
            </div>
          </div>
        )}

        {converting && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(255,255,255,0.9)', borderRadius: 24,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 10
          }}>
            <div className="spinner" style={{ marginBottom: 16 }} />
            <p style={{ color: '#2563eb', fontWeight: 700, fontSize: 16 }}>한컴워드로 문서를 변환하고 있습니다...</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>잠시만 기다려주세요</p>
          </div>
        )}

        {result && (
          <div style={{
            marginTop: 32, padding: 24, background: '#f0f9ff',
            borderRadius: 20, border: '1px solid #bae6fd',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: '#dcfce7', color: '#16a34a',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <i className="fi fi-rr-check" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 18 }}>변환 완료!</span>
            </div>
            <p style={{ color: '#0369a1', marginBottom: 8, fontSize: 15 }}>
              파일: <b>{result.fileName}</b>
            </p>
            <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
              크기: {formatSize(result.size)}
            </p>
            <button
              style={{
                background: '#0369a1', color: 'white', padding: '12px 28px',
                borderRadius: 12, border: 'none', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                margin: '0 auto', boxShadow: '0 4px 12px rgba(3, 105, 161, 0.2)'
              }}
              onClick={handleDownload}
            >
              <i className="fi fi-rr-download" />
              변환된 파일 다운로드
            </button>
          </div>
        )}
      </div>

      <div style={{
        padding: 24, borderRadius: 20, background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)', fontSize: 14,
        color: 'var(--text-secondary)', lineHeight: 1.6
      }}>
        <h4 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fi fi-rr-info" style={{ color: '#2563eb' }} />
          도움말 및 안내
        </h4>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
          <li>로컬에 설치된 <b>한컴오피스</b>를 이용하여 문서를 변환합니다.</li>
          <li><b>PDF 변환</b>: 모든 기기에서 동일한 레이아웃으로 문서를 확인할 수 있습니다.</li>
          <li><b>이미지 변환</b>: 문서 내용을 이미지(PNG)로 추출하여 메신저 등에 바로 공유할 수 있습니다.</li>
          <li>변환에는 한컴오피스(한컴워드)가 PC에 설치되어 있어야 합니다.</li>
        </ul>
      </div>
    </div>
  )
}
