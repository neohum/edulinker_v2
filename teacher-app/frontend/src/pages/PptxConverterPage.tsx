import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'

export default function PptxConverterPage() {
  const [file, setFile] = useState<File | null>(null)
  const [converting, setConverting] = useState(false)
  const [result, setResult] = useState<{ type: string, url: string, fileName: string, size: number } | null>(null)
  const [officeStatus, setOfficeStatus] = useState<{ excel: boolean, powerpoint: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    checkOffice()
  }, [])

  const checkOffice = async () => {
    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.CheckOfficeStatus) {
        const status = await wailsApp.CheckOfficeStatus()
        setOfficeStatus(status)
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
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
      setFile(selectedFile)
      setResult(null)
    } else {
      toast.error('PPT 파일(.pptx, .ppt)만 선택 가능합니다.')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) processFile(selectedFile)
  }

  const handleConvert = async () => {
    if (!file) return
    setConverting(true)
    setResult(null)

    try {
      const wailsApp = (window as any).go?.main?.App
      if (wailsApp?.ConvertPptToPdf) {
        const base64Data = await fileToBase64(file)
        const res = await wailsApp.ConvertPptToPdf(file.name, base64Data)

        if (res.success) {
          const binaryStr = atob(res.data)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i)
          }
          const blob = new Blob([bytes], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          setResult({ type: 'pdf', url, fileName: res.file_name, size: res.size })
          toast.success('PDF 변환 완료!')
        } else {
          toast.error(res.error || '변환에 실패했습니다.')
        }
      }
    } catch (e) {
      toast.error('오류 발생: ' + (e as Error).message)
    } finally {
      setConverting(false)
    }
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
          <i className="fi fi-rr-file-powerpoint" style={{ marginRight: 12, color: '#dc2626' }} />
          PPT to PDF 변환
        </h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          파워포인트 파일을 PDF 문서로 변환합니다. (MS PowerPoint 설치 필요)
        </p>
      </div>

      {officeStatus && !officeStatus.powerpoint && (
        <div style={{ marginBottom: 20, padding: 16, background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, color: '#991b1b', fontSize: 14 }}>
          <i className="fi fi-rr-exclamation" style={{ marginRight: 8 }} />
          PC에 Microsoft PowerPoint가 설치되어 있지 않거나 실행할 수 없습니다.
        </div>
      )}

      <div
        style={{
          background: 'white', padding: 60, borderRadius: 24, border: '2px dashed #cbd5e1', textAlign: 'center', cursor: !file ? 'pointer' : 'default', position: 'relative'
        }}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        {!file ? (
          <div>
            <div style={{ fontSize: 56, color: '#94a3b8', marginBottom: 20 }}><i className="fi fi-rr-upload" /></div>
            <p style={{ fontWeight: 700, fontSize: 18 }}>PPT 파일을 클릭하여 선택</p>
            <input ref={fileInputRef} type="file" accept=".pptx,.ppt" onChange={handleFileChange} style={{ display: 'none' }} />
          </div>
        ) : (
          <div onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 48, color: '#dc2626', marginBottom: 16 }}><i className="fi fi-rr-file" /></div>
            <p style={{ fontWeight: 600, fontSize: 18 }}>{file.name}</p>
            <p style={{ color: '#64748b', marginBottom: 24 }}>{formatSize(file.size)}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button onClick={handleConvert} disabled={converting || !officeStatus?.powerpoint} style={{ background: '#dc2626', color: 'white', padding: '12px 24px', borderRadius: 12, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                {converting ? '변환 중...' : 'PDF로 변환하기'}
              </button>
              <button onClick={() => { setFile(null); setResult(null); }} style={{ background: 'white', padding: '12px 24px', borderRadius: 12, border: '1px solid #cbd5e1', fontWeight: 600, cursor: 'pointer' }}>다른 파일</button>
            </div>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 32, padding: 20, background: '#f0fdf4', borderRadius: 16, border: '1px solid #bbf7d0' }}>
            <p style={{ fontWeight: 700, color: '#166534', marginBottom: 12 }}>변환 성공: {result.fileName}</p>
            <a href={result.url} download={result.fileName} style={{ background: '#166534', color: 'white', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>결과 다운로드</a>
          </div>
        )}
      </div>
    </div>
  )
}
