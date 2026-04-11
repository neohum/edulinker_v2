import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import type { UserInfo } from '../App'
import type { DocField, Stroke } from '../types/sendoc'

import { SendocDesignerCanvas } from '../components/sendoc/SendocDesignerCanvas'
import { SendocRecipientModal } from '../components/sendoc/SendocRecipientModal'
import { SendocResultViewer } from '../components/sendoc/SendocResultViewer'
import { TeacherAssetRegisterModal } from '../components/sendoc/TeacherAssetRegisterModal'
import { SendocListView } from '../components/sendoc/SendocListView'

import { useSendocAPI } from '../hooks/useSendocAPI'
import { useSendocCanvas } from '../hooks/useSendocCanvas'
import { useDocDrafting } from '../hooks/useDocDrafting'
import { useDocActions } from '../hooks/useDocActions'
import { useDocGeneration } from '../hooks/useDocGeneration'

export default function SendocPage({ user }: { user: UserInfo }) {
  const isTeacher = user.role === 'teacher'

  // Core UI States
  const [viewMode, setViewMode] = useState<'list' | 'selector' | 'designer'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAssetModal, setActiveAssetModal] = useState<'signature' | 'stamp' | null>(null)

  // Document Context
  const [title, setTitle] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [serverBgUrl, setServerBgUrl] = useState<string | null>(null)
  const [pageImages, setPageImages] = useState<string[]>([])

  // Designer States
  const [fields, setFields] = useState<DocField[]>([])
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [isMergeSignatures, setIsMergeSignatures] = useState(true)

  const [activeTool, setActiveTool] = useState<'select' | 'pen' | 'eraser'>('select')
  const [penColor, setPenColor] = useState('#000000')
  const [currentPageIdx, setCurrentPageIdx] = useState(0)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [activeSignField, setActiveSignField] = useState<string | null>(null)
  const [strokeRedrawTrigger, setStrokeRedrawTrigger] = useState(0)

  // Recipient / Modal States
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [isSignerView, setIsSignerView] = useState(false)
  const [activeDoc, setActiveDoc] = useState<any>(null)

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [resultViewerData, setResultViewerData] = useState<any>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null)

  const [recipients, setRecipients] = useState<any[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)

  // Pagination states
  const [draftsPage, setDraftsPage] = useState(1)
  const [sentPage, setSentPage] = useState(1)
  const [receivedPage, setReceivedPage] = useState(1)

  // Hooks
  const { allUsers, docs, pendingDocs, loading, fetchStatus, fetchDocs, fetchPendingDocs } = useSendocAPI(isTeacher)

  const { zoom, setZoom, strokes, setStrokes, fullCanvasRef, isDrawingMode, setIsDrawingMode, penSize, setPenSize, isEraser, setIsEraser, signatureCanvasRef, containerRef, scrollContainerRef, handlePanStart, handlePanMove, handlePanEnd, startDrawing, draw, stopDrawing, saveSignature, startFullDrawing, drawFull, stopFullDrawing, handleFieldDrag, handleFieldResize } = useSendocCanvas({
    viewMode,
    pageImagesLength: pageImages.length,
    strokeRedrawTrigger,
    setFields,
    fields,
    activeSignField,
    setActiveSignField
  })

  const { localDrafts, isDraftSaved, hasUnsavedChanges, setHasUnsavedChanges, fetchLocalDrafts, handleSaveDraft, resumeDraft } = useDocDrafting({
    isTeacher, activeDoc, viewMode, fields, strokes, setTitle, setEditingDraftId, setIsMergeSignatures, setFields, setStrokes, setSelectedUsers, setPageImages, setBackgroundUrl, setServerBgUrl, setActiveDoc, setViewMode, setStrokeRedrawTrigger
  })

  const { isSending, handleSend, handleRecallDoc, handleDeleteDoc, handleResendDoc } = useDocActions({
    isTeacher, title, selectedUsers, strokes, fields, isMergeSignatures, pageImagesLength: pageImages.length, serverBgUrl, backgroundUrl, activeDoc, editingDraftId, fullCanvasRef, setEditingDraftId, setStrokeRedrawTrigger, setHasUnsavedChanges, setStrokes, setViewMode, setShowRecipientModal, fetchLocalDrafts, fetchDocs, fetchPendingDocs, setConfirmDialog
  })

  // Hook injections
  const { selectedFile, setSelectedFile, isConverting, convertProgress, fileInputRef, handleFileSelect, handleProcessDocument } = useDocGeneration({
    isTeacher, setFields, setViewMode, setBackgroundUrl, setServerBgUrl, setPageImages, setCurrentPageIdx, setZoom, setStrokes
  })

  const openSignView = (d: any) => {
    try {
      let bgs: string[] = []
      if (d.background_images_json) try { bgs = JSON.parse(d.background_images_json) } catch { }
      else if (d.background_url) bgs = [d.background_url]

      let finalBgs = [...bgs]
      if (!d.is_signed && !isTeacher) {
        const stored = localStorage.getItem(`sendoc_draft_${d.id}`)
        if (stored) {
          const sd = JSON.parse(stored)
          if (sd.strokes) setStrokes(sd.strokes)
          if (sd.fields) setFields(sd.fields)
          if (sd.pageImages) finalBgs = sd.pageImages
        } else {
          setStrokes([]); if (d.fields_json) { try { setFields(JSON.parse(d.fields_json)) } catch { } }
        }
      } else {
        if (d.strokes_json) try { setStrokes(JSON.parse(d.strokes_json)) } catch { }
        if (d.fields_json) try { setFields(JSON.parse(d.fields_json)) } catch { }
      }

      setPageImages(finalBgs); setBackgroundUrl(finalBgs[0]); setServerBgUrl(null)
      setCurrentPageIdx(0); setZoom(1); setTitle(d.title); setActiveDoc(d); setIsSignerView(true)
      setViewMode('designer'); setEditingDraftId(d.id)
    } catch { toast.error('문서를 불러오지 못했습니다.') }
  }

  const handleFetchStatus = async (doc: any) => {
    setActiveDoc(doc);
    setShowStatusModal(true);
    setLoadingStatus(true);
    try {
      const data = await fetchStatus(doc.id);
      setRecipients(data || []);
    } catch {
      toast.error('현황을 불러오지 못했습니다.');
    } finally {
      setLoadingStatus(false);
    }
  }

  const isDocMerged = (d: any) => {
    if (!d || !d.fields_json) return false;
    try {
      const fs = JSON.parse(d.fields_json)
      const mf = fs.find((f: any) => f.id === 'META_OPTIONS' || f.id === 'canvas_overlay_meta')
      if (mf) return JSON.parse(mf.value || '{}').mergeSignatures === true
    } catch { }
    return false;
  }

  const openBulkPrintViewer = (doc: any, userRecipients: any[], merged: boolean) => {
    toast.info('일괄 인쇄 뷰어를 엽니다...')
    setResultViewerData({ bulk: true, doc, userRecipients, merged })
  }

  const handleSafePrint = async () => {
    try {
      setTimeout(() => { window.print() }, 500);
    } catch (e: any) { toast.error('서명 결과 인쇄 실패: ' + e.message); }
  }

  return (
    <div style={{ display: 'flex', height: '0', flex: 1, background: '#f8fafc', flexDirection: 'column' }}>

      {(viewMode === 'list' || viewMode === 'selector') && (
        <SendocListView
          isTeacher={isTeacher} user={user}
          viewMode={viewMode} setViewMode={setViewMode}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          docs={docs} pendingDocs={pendingDocs} localDrafts={localDrafts}
          draftsPage={draftsPage} setDraftsPage={setDraftsPage}
          sentPage={sentPage} setSentPage={setSentPage}
          receivedPage={receivedPage} setReceivedPage={setReceivedPage}
          resumeDraft={resumeDraft} handleDeleteDoc={handleDeleteDoc}
          fetchStatus={handleFetchStatus}
          handleResendDoc={handleResendDoc} handleRecallDoc={handleRecallDoc} openSignView={openSignView}
          setActiveAssetModal={setActiveAssetModal} setSelectedFile={setSelectedFile}
          setFields={setFields} setBackgroundUrl={setBackgroundUrl} setServerBgUrl={setServerBgUrl}
          setEditingDraftId={setEditingDraftId} fileInputRef={fileInputRef} handleFileSelect={handleFileSelect}
          isConverting={isConverting} convertProgress={convertProgress} handleProcessDocument={handleProcessDocument} selectedFile={selectedFile}
        />
      )}

      {viewMode === 'designer' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <header style={{ height: 60, background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => {
                setConfirmDialog({
                  message: "작성을 취소하고 목록으로 돌아가시겠습니까? 저장되지 않은 변경사항은 사라질 수 있습니다.",
                  onConfirm: () => { setViewMode('list'); setActiveDoc(null); setEditingDraftId(null) }
                })
              }} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }}><i className="fi fi-rr-arrow-left" /></button>
              <div style={{ height: 24, width: 1, background: '#e2e8f0' }} />
              <input type={isSignerView ? 'hidden' : 'text'} value={title} onChange={e => setTitle(e.target.value)} placeholder="문서 제목을 입력하세요" style={{ border: 'none', background: 'transparent', fontSize: 16, fontWeight: 700, outline: 'none', width: 300, display: isSignerView ? 'none' : 'block' }} />
              {isSignerView && <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title} (서명 중)</h3>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', borderRadius: 8, padding: 4, border: '1px solid #e2e8f0' }}>
                <button onClick={() => setZoom((z: number) => Math.max(0.5, z - 0.1))} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><i className="fi fi-rr-minus-small" /></button>
                <span style={{ fontSize: 13, fontWeight: 600, width: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z: number) => Math.min(2, z + 0.1))} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><i className="fi fi-rr-plus-small" /></button>
              </div>
              <div style={{ height: 24, width: 1, background: '#e2e8f0' }} />
              {isDraftSaved && <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}><i className="fi fi-rr-check-circle" /> 저장됨</span>}
              {!isSignerView && <button onClick={() => handleSaveDraft(true)} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 13 }}>임시저장</button>}
              {!isSignerView ? (
                <button onClick={() => setShowRecipientModal(true)} className="btn-primary" style={{ padding: '8px 20px', fontSize: 13 }} disabled={!title.trim() || fields.length === 0}>발송하기 <i className="fi fi-rr-arrow-right" style={{ marginLeft: 6 }} /></button>
              ) : (
                <button onClick={() => {
                  const requiredMissing = fields.filter((f: any) => f.required && !f.value && !strokes.some((s: any) => s.fieldId === f.id));
                  if (requiredMissing.length > 0) return toast.error(`필수 항목 ${requiredMissing.length}개를 모두 작성해주세요.`);
                  setConfirmDialog({
                    message: "서명을 마치고 제출하시겠습니까? 제출 후에는 수정할 수 없습니다.",
                    onConfirm: () => handleSend(false, true)
                  })
                }} className="btn-primary" style={{ padding: '8px 20px', fontSize: 13, background: '#10b981', borderColor: '#10b981' }} disabled={isSending}>{isSending ? '제출 중...' : '작성 완료 및 제출'}</button>
              )}
            </div>
          </header>

          <SendocDesignerCanvas
            zoom={zoom} viewMode={viewMode} backgroundUrl={backgroundUrl}
            fields={fields} setFields={setFields} strokes={strokes} setStrokes={setStrokes as any} isSigner={isSignerView} isViewer={false} isTeacher={isTeacher}
            penSize={penSize} setPenSize={setPenSize}
            isDrawingMode={isDrawingMode} setIsDrawingMode={setIsDrawingMode} isEraser={isEraser} setIsEraser={setIsEraser}
            pageImages={pageImages} currentPageIdx={currentPageIdx} setCurrentPageIdx={setCurrentPageIdx}
            activeDoc={activeDoc} resultViewerData={resultViewerData} addField={(type) => setFields([...fields, { id: 'field_' + Date.now(), type, x: 10, y: 10, width: 200, height: 50, label: '' }])}
            activeSignField={activeSignField} setActiveSignField={setActiveSignField} activeCharPicker={null} setActiveCharPicker={() => { }} specialChars={['○', '×', '✓']}
            scrollContainerRef={scrollContainerRef} containerRef={containerRef} fullCanvasRef={fullCanvasRef as any} signatureCanvasRef={signatureCanvasRef as any}
            handlePanStart={handlePanStart} handlePanMove={handlePanMove} handlePanEnd={handlePanEnd}
            startFullDrawing={startFullDrawing} drawFull={drawFull} stopFullDrawing={stopFullDrawing}
            startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} saveSignature={saveSignature} handleFieldDrag={handleFieldDrag} handleFieldResize={handleFieldResize}
          />
        </div>
      )}

      {showRecipientModal && (
        <SendocRecipientModal
          allUsers={allUsers} selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} setShowRecipientModal={setShowRecipientModal}
          handleSend={handleSend}
          isSending={isSending}
        />
      )}

      {showStatusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
              <h4 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>전송 및 서명 현황</h4>
              <div style={{ display: 'flex', gap: 12 }}>
                {recipients.length > 0 && recipients.every((r: any) => r.is_signed) && isDocMerged(activeDoc) && (
                  <button onClick={() => openBulkPrintViewer(activeDoc, recipients, true)} className="btn-secondary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, borderColor: '#3b82f6', color: '#3b82f6', background: '#eff6ff' }}>한 페이지로 보기</button>
                )}
                <button onClick={() => setShowStatusModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            {loadingStatus ? <div className="spinner" style={{ margin: '20px auto' }} /> : (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recipients.map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid #eee', borderRadius: 12, background: r.is_signed ? '#f0fdf4' : 'white' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{r.user.name} ({r.user.role})</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{r.is_signed ? `서명 완료: ${new Date(r.signed_at).toLocaleString()}` : '서명 대기 중'}</div>
                    </div>
                    {r.is_signed && <button onClick={() => { setResultViewerData({ bulk: false, doc: activeDoc, userRecipient: r }); setShowStatusModal(false) }} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>결과 확인</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {resultViewerData && (
        <SendocResultViewer resultViewerData={resultViewerData} setResultViewerData={setResultViewerData} pageImages={pageImages} handleSafePrint={handleSafePrint} />
      )}

      {confirmDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <h4 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>확인창</h4>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setConfirmDialog(null)} className="btn-secondary" style={{ flex: 1 }}>취소</button>
              <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="btn-primary" style={{ flex: 1, background: '#ef4444' }}>확인</button>
            </div>
          </div>
        </div>
      )}

      {activeAssetModal && <TeacherAssetRegisterModal assetType={activeAssetModal} userID={user.id || ""} onClose={() => setActiveAssetModal(null)} />}
    </div>
  )
}
