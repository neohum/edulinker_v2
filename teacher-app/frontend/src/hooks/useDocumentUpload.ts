import { useState } from 'react'
import { toast } from 'sonner'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface DocumentUploadProps {
  setPageImages: (images: string[]) => void
  setCurrentPageIdx: (idx: number) => void
  setBackgroundUrl: (url: string | null) => void
  setServerBgUrl: (url: string | null) => void
  setStrokes: (strokes: any[]) => void
  setViewMode: (mode: any) => void
  fullCanvasRef: React.RefObject<HTMLCanvasElement>
  title: string
  setTitle: (title: string) => void
}

export function useDocumentUpload({
  setPageImages,
  setCurrentPageIdx,
  setBackgroundUrl,
  setServerBgUrl,
  setStrokes,
  setViewMode,
  fullCanvasRef,
  setTitle
}: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [convertProgress, setConvertProgress] = useState('')
  const [hancom, setHancom] = useState<{ installed: boolean, version: string } | null>(null)
  const [excelStatus, setExcelStatus] = useState<{ installed: boolean, version: string } | null>(null)

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('문서 용량은 10MB 이하만 가능합니다.')
        e.target.value = ''
        return
      }
      const name = file.name.toLowerCase()
      if (name.endsWith('.hwp') || name.endsWith('.hwpx') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.pdf')) {
        setSelectedFile(file)
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      } else {
        toast.error('HWP, HWPX, XLSX, PDF 파일만 가능합니다.')
        e.target.value = ''
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
        if (wailsApp.ConvertToPdfAndImages) {
          try {
            setConvertProgress('HWP 문서 처리 중...')
            const pdfRes = await wailsApp.ConvertToPdfAndImages(selectedFile.name, base64)

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
                  const viewport = page.getViewport({ scale: 1.5 })
                  const canvas = document.createElement('canvas')
                  canvas.width = viewport.width
                  canvas.height = viewport.height
                  const ctx = canvas.getContext('2d')!
                  await page.render({ canvasContext: ctx, viewport } as any).promise
                  localPages.push(canvas.toDataURL('image/png').split(',')[1])
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
              serverBg = JSON.stringify(pdfRes.pages.map((pg: string) => 'data:image/webp;base64,' + pg))
              const binaryStr = atob(pdfRes.pages[0])
              const bytes = new Uint8Array(binaryStr.length)
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
              bgBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
            }
          } catch {
            console.warn("multi-page extraction failed")
          }
        }

        if (pagesData.length === 0) {
          setConvertProgress('HWP 단일 이미지 변환 중...')
          const convRes = await wailsApp.ConvertHwp(selectedFile.name, base64, 'image')
          if (!convRes.success || !convRes.data) throw new Error(convRes.error || 'HWP 변환 실패')

          setConvertProgress('WebP 이미지 최적화 중...')
          const webpData = await convertBase64ToWebP(convRes.data)
          pagesData = [webpData]
          serverBg = 'data:image/webp;base64,' + webpData

          const binaryStr = atob(webpData)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
          bgBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
        }

      } else {
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

        serverBg = JSON.stringify(pagesData.map((pg: string) => 'data:image/webp;base64,' + pg))
        const binaryStr = atob(pagesData[0])
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
        bgBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }))
      }

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

  return {
    selectedFile,
    setSelectedFile,
    isConverting,
    convertProgress,
    hancom,
    checkHancom,
    excelStatus,
    checkExcel,
    handleFileSelect,
    handleProcessDocument
  }
}
