import React, { useState, useRef } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

export function useDocGeneration({
  isTeacher,
  setFields, setViewMode, setBackgroundUrl, setServerBgUrl, setPageImages, setCurrentPageIdx, setZoom, setStrokes
}: any) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [convertProgress, setConvertProgress] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/haansofthwp']
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    const allowedExts = ['.pdf', '.hwp', '.hwpx', '.xlsx', '.xls']

    if (!allowed.includes(file.type) && !allowedExts.includes(ext)) {
      toast.error('지원하지 않는 파일 형식입니다. (PDF, HWP, HWPX, XLSX 가능)')
      return;
    }
    setSelectedFile(file)
  }

  const handleProcessDocument = async () => {
    if (!selectedFile) return
    setIsConverting(true); setConvertProgress('파일 준비 중...')
    toast.info('문서를 변환하고 있습니다. 잠시만 기다려주세요.')
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase()

    try {
      const wailsApp = (window as any).go?.main?.App

      const fileBuffer = await selectedFile.arrayBuffer()
      const uint8Array = new Uint8Array(fileBuffer)

      let base64String = ''
      for (let i = 0; i < uint8Array.length; i += 32768) {
        const chunk = uint8Array.subarray(i, Math.min(i + 32768, uint8Array.length))
        if (typeof window !== 'undefined' && (window as any).SystemBuffer) {
          base64String += String.fromCharCode.apply(null, chunk as unknown as number[])
        } else {
          base64String += Array.from(chunk).map(c => String.fromCharCode(c)).join('')
        }
      }
      const b64Data = btoa(base64String)

      let res: any

      if (wailsApp && wailsApp.ConvertDocumentToWebPBase64) {
        setConvertProgress('Wails 네이티브 변환 중...')
        res = await wailsApp.ConvertDocumentToWebPBase64(selectedFile.name, b64Data)
        if (res && res.error) throw new Error(res.error)

        if (res && res.images && res.images.length > 0) {
          setConvertProgress('화면 전환 준비 중...');

          const sessionId = "doc_" + Date.now();
          let savedUris: string[] = [];

          if (wailsApp.SaveConvertedPage) {
            if (wailsApp.ClearConvertedPages) {
              try { await wailsApp.ClearConvertedPages('prev'); } catch (e) { }
            }
            for (let i = 0; i < res.images.length; i++) {
              setConvertProgress(`저장 중 (${i + 1}/${res.images.length})...`);
              await wailsApp.SaveConvertedPage(sessionId, i, res.images[i]);
            }
            savedUris = res.images.map((_: any, i: number) => `sqlite:${sessionId}:${i}`);
          } else {
            savedUris = res.images.map((b: string) => `data:image/webp;base64,${b}`);
          }

          setPageImages(savedUris);
          let bgs = res.images.map((b: string) => `data:image/webp;base64,${b}`);
          setServerBgUrl(JSON.stringify(bgs));
          setBackgroundUrl(savedUris[0]);

          if (res.images.length > 1) {
            setFields((prev: any[]) => {
              const arr = [...prev];
              const existing = arr.find(f => f.id === 'canvas_overlay_meta');
              if (!existing) arr.push({ id: 'canvas_overlay_meta', type: 'text', x: -1, y: -1, width: 0, height: 0, label: 'meta', value: JSON.stringify({ mergeSignatures: true }) });
              return arr;
            });
          }

          setIsConverting(false); setConvertProgress('');
          setFields([]); setStrokes([]); setCurrentPageIdx(0); setZoom(1); setViewMode('designer');
          toast.success('변환 완료!');
          return;
        }
      }

      // Fallback
      toast.info('로컬 변환을 건너뛰고 서버 변환을 시도합니다.')
      setConvertProgress('서버로 업로드 중...')
      const formData = new FormData()
      formData.append('file', selectedFile)

      const serverRes = await apiFetch(`/api/plugins/sendoc/convert?filename=${encodeURIComponent(selectedFile.name)}`, {
        method: 'POST', body: formData
      })
      if (!serverRes.ok) {
        const errorData = await serverRes.json().catch(() => ({}))
        throw new Error(errorData.error || 'Server conversion failed')
      }

      setConvertProgress('서버 결과 처리 중...')
      const data = await serverRes.json()

      let finalBgs: string[] = []
      if (data.converted_base64) { finalBgs = [`data:image/webp;base64,${data.converted_base64}`] }
      else if (data.converted_base64s && data.converted_base64s.length > 0) { finalBgs = data.converted_base64s.map((b: string) => `data:image/webp;base64,${b}`) }
      else throw new Error('변환된 이미지가 없습니다.')

      setPageImages(finalBgs)
      setServerBgUrl(JSON.stringify(finalBgs))
      setBackgroundUrl(finalBgs[0])

      setIsConverting(false); setConvertProgress('')
      setFields([]); setStrokes([]); setCurrentPageIdx(0); setZoom(1); setViewMode('designer')
      toast.success('변환 완료!')

    } catch (err: any) {
      setIsConverting(false); setConvertProgress(''); toast.error(`변환 오류: ${err.message || '알 수 없는 오류'}`)
    }
  }

  return { selectedFile, setSelectedFile, isConverting, convertProgress, fileInputRef, handleFileSelect, handleProcessDocument }
}
