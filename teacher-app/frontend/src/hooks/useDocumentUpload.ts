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
      let pageImagesBlobs: string[] = []

      // Helper to dynamically extract PDF base64 to WebP images via pdfjsLib
      const extractPdfToWebPImages = async (pdfBase64: string): Promise<string[]> => {
        const binaryPdfStr = atob(pdfBase64)
        const pdfBytes = new Uint8Array(binaryPdfStr.length)
        for (let i = 0; i < binaryPdfStr.length; i++) pdfBytes[i] = binaryPdfStr.charCodeAt(i)

        const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise
        const numPages = pdfDoc.numPages
        const webpPages: string[] = []

        for (let n = 1; n <= numPages; n++) {
          const page = await pdfDoc.getPage(n)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
             await page.render({ canvasContext: ctx, viewport } as any).promise
             webpPages.push(canvas.toDataURL('image/webp', 0.8).split(',')[1])
          }
        }
        return webpPages
      }

      const base64ToBlob = (base64Data: string, contentType: string = 'image/webp') => {
        const sliceSize = 1024;
        const byteCharacters = atob(base64Data);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
          const slice = byteCharacters.slice(offset, offset + sliceSize);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          byteArrays.push(byteArray);
        }

        return new Blob(byteArrays, { type: contentType });
      };

      const splitTallImageAndCreateBlobs = async (base64Array: string[]): Promise<{ blobs: string[], base64s: string[] }> => {
        const finalBlobs: string[] = [];
        const finalBase64s: string[] = [];

        // Tries to load base64 as an image, guessing PNG or WebP.
        // Returns a loaded HTMLImageElement or null on failure.
        const loadImage = (b64: string): Promise<HTMLImageElement | null> => {
          const mimes = b64.startsWith('data:') ? [b64] : [
            `data:image/png;base64,${b64}`,
            `data:image/webp;base64,${b64}`,
          ];

          const tryLoad = (src: string): Promise<HTMLImageElement | null> =>
            new Promise(resolve => {
              const img = new Image();
              img.onload = () => resolve(img.width > 0 ? img : null);
              img.onerror = () => resolve(null);
              img.src = src;
            });

          return mimes.reduce<Promise<HTMLImageElement | null>>(
            (prev, src) => prev.then(result => result ? result : tryLoad(src)),
            Promise.resolve(null)
          );
        };

        for (const b64 of base64Array) {
          const img = await loadImage(b64);
          if (!img || !img.width || !img.height) {
            console.warn('[splitTallImageAndCreateBlobs] Could not decode image, skipping.');
            continue;
          }

          // Standard A4 aspect is ~1.414. Merged tall images have higher aspect ratio.
          const aspect = img.height / img.width;
          if (aspect > 1.9) {
            const numPages = Math.round(aspect / 1.414);
            const pageHeight = img.height / numPages;
            for (let i = 0; i < numPages; i++) {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = pageHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, i * pageHeight, img.width, pageHeight, 0, 0, canvas.width, pageHeight);
                const webpData = canvas.toDataURL('image/webp', 0.85);
                const rawB64 = webpData.split(',')[1];
                finalBase64s.push(rawB64);
                finalBlobs.push(URL.createObjectURL(base64ToBlob(rawB64, 'image/webp')));
              }
            }
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
            }
            const webpData = canvas.toDataURL('image/webp', 0.85);
            const rawB64 = webpData.split(',')[1];
            finalBase64s.push(rawB64);
            finalBlobs.push(URL.createObjectURL(base64ToBlob(rawB64, 'image/webp')));
          }
        }
        return { blobs: finalBlobs, base64s: finalBase64s };
      };

      if (isHwp) {
        if (wailsApp.ConvertToPdfAndImages) {
          try {
            setConvertProgress('HWP 변환 중...')
            const pdfRes = await wailsApp.ConvertToPdfAndImages(selectedFile.name, base64)
            if (pdfRes.success && pdfRes.pdf_base64) {
              setConvertProgress('클라이언트에서 이미지 변환 중...')
              try {
                pagesData = await extractPdfToWebPImages(pdfRes.pdf_base64)
              } catch (pdfErr) {
                console.warn('PDF.js client extraction failed for HWP', pdfErr)
                if (pdfRes.pages && pdfRes.pages.length > 0) pagesData = pdfRes.pages;
              }
            } else if (pdfRes.success && pdfRes.pages && pdfRes.pages.length > 0) {
              pagesData = pdfRes.pages
            }
          } catch (e) {
            console.warn("multi-page extraction failed", e)
          }
        }

        if (pagesData.length === 0) {
          setConvertProgress('HWP 단일 이미지 변환 중...')
          const convRes = await wailsApp.ConvertHwp(selectedFile.name, base64, 'image')
          if (!convRes.success || !convRes.data) throw new Error(convRes.error || 'HWP 변환 실패')
          pagesData = [convRes.data]
        }
        
      } else if (lowerName.endsWith('.pdf')) {
        setConvertProgress('클라이언트에서 PDF 분석 및 변환 중...')
        try {
          pagesData = await extractPdfToWebPImages(base64)
        } catch (err: any) {
          console.warn('PDF.js client extraction failed for native PDF, falling back to Wails', err)
          if (!wailsApp.ConvertToPdfAndImages) throw new Error('PDF 변환 오류 (서버 백엔드 없음): ' + (err.message || '알 수 없는 오류'))
          setConvertProgress('서버 백엔드에서 PDF 변환 중...')
          const result = await wailsApp.ConvertToPdfAndImages(selectedFile.name, base64)
          if (!result.success || !result.pages || result.pages.length === 0) {
             throw new Error('PDF 변환 오류: ' + (result.error || '알 수 없는 오류'))
          }
          pagesData = result.pages;
        }
      } else {
        if (!wailsApp.ConvertToPdfAndImages) throw new Error('ConvertToPdfAndImages를 찾을 수 없습니다.')
        setConvertProgress('XLSX 서버/COM 변환 중...')
        const result = await wailsApp.ConvertToPdfAndImages(selectedFile.name, base64)
        if (!result.success) throw new Error(result.error || '변환 실패')

        if (result.pdf_base64) {
          setConvertProgress('클라이언트에서 이미지 변환 중...')
          try {
             pagesData = await extractPdfToWebPImages(result.pdf_base64)
          } catch (e) {
             console.warn('PDF.js client extraction for XLSX failed', e)
          }
        }
        
        if (pagesData.length === 0) {
          if (!result.pages || result.pages.length === 0) {
            throw new Error('페이지 이미지를 추출하지 못했습니다.')
          }
          pagesData = result.pages
        }
      }

      setConvertProgress(`문서 페이지 분할 및 최적화 중...`);
      const processed = await splitTallImageAndCreateBlobs(pagesData);
      pagesData = processed.base64s;
      pageImagesBlobs = processed.blobs;

      if (pagesData.length > 0) {
        serverBg = JSON.stringify(pagesData.map(pg => 'data:image/webp;base64,' + pg))
        bgBlobUrl = pageImagesBlobs[0];
      }

      if (pageImagesBlobs.length > 0) {
        setPageImages(pageImagesBlobs)
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
