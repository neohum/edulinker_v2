import { useState } from 'react'
import { toast } from 'sonner'

export const ITEMS_PER_PAGE = 10

export function SendocListView({
  viewMode,
  isTeacher,
  searchQuery, setSearchQuery,
  docs, pendingDocs, localDrafts,
  draftsPage, setDraftsPage,
  sentPage, setSentPage,
  receivedPage, setReceivedPage,
  resumeDraft, handleDeleteDoc, fetchStatus, handleResendDoc, handleRecallDoc, openSignView,
  setActiveAssetModal, setViewMode, setSelectedFile, setFields, setBackgroundUrl, setServerBgUrl, setEditingDraftId,
  fileInputRef, handleFileSelect, isConverting, convertProgress, handleProcessDocument, selectedFile,
  activeAssetModal, user, showStatusModal, setShowStatusModal, loadingStatus, recipients, isDocMerged, activeDoc, openBulkPrintViewer, openResultViewer
}: any) {

  if (viewMode === 'selector') {
    return (
      <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <button onClick={() => setViewMode('list')} className="btn-secondary" style={{ padding: '8px 12px' }}><i className="fi fi-rr-arrow-left" /></button>
          <h3 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>새 문서 작성</h3>
        </div>
        <div style={{ background: 'white', borderRadius: 16, padding: 40, border: '1px solid #e2e8f0', textAlign: 'center', maxWidth: 600, margin: '0 auto', marginTop: 60 }}>
          <div style={{ marginBottom: 32 }}>
            <h4 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>사용할 문서 파일을 업로드하세요</h4>
            <p style={{ color: '#64748b', fontSize: 14 }}>PDF, HWP, HWPX, XLSX 문서만 지원합니다 (최대 10MB)</p>
          </div>
          {!selectedFile ? (
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ padding: '16px 32px', fontSize: 16, border: '2px dashed #cbd5e1', background: '#f8fafc', color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', height: 200, justifyContent: 'center' }}>
              <i className="fi fi-rr-file-upload" style={{ fontSize: 32, color: '#94a3b8' }} />
              파일 선택하기
            </button>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              <i className="fi fi-rr-document" style={{ fontSize: 48, color: '#3b82f6', marginBottom: 16 }} />
              <p style={{ fontWeight: 700, fontSize: 18 }}>{selectedFile.name}</p>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexDirection: 'column', alignItems: 'center' }}>
                <button onClick={handleProcessDocument} disabled={isConverting} className="btn-primary" style={{ padding: '12px 32px' }}>
                  {isConverting ? (convertProgress || '변환 중...') : '이 파일로 문서 작성하기'}
                </button>
                {isConverting && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6366f1', fontSize: 13 }}>
                    <div style={{ width: 16, height: 16, border: '2px solid #c7d2fe', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    {convertProgress}
                  </div>
                )}
                {!isConverting && <button onClick={() => setSelectedFile(null)} className="btn-secondary">파일 변경</button>}
              </div>
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".hwp,.hwpx,.xlsx,.xls,.pdf" style={{ display: 'none' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div><h3 style={{ fontSize: 22, fontWeight: 700 }}>전자문서 및 서명</h3><p style={{ color: '#64748b', fontSize: 14 }}>문서를 발송하고 수집하세요.</p></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', width: 280 }}>
            <i className="fi fi-rr-search" style={{ position: 'absolute', left: 14, top: 12, color: '#94a3b8', fontSize: 15 }} />
            <input type="text" placeholder="모든 문서 제목 통합 검색..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSentPage(1); setReceivedPage(1); setDraftsPage(1); }} style={{ width: '100%', padding: '10px 16px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', background: '#f8fafc' }} />
          </div>
          {isTeacher && <button onClick={() => setActiveAssetModal('signature')} className="btn-secondary" style={{ padding: '12px 24px' }}>서명 등록</button>}
          {isTeacher && <button onClick={() => setActiveAssetModal('stamp')} className="btn-secondary" style={{ padding: '12px 24px' }}>도장 등록</button>}
          {isTeacher && <button onClick={() => { setViewMode('selector'); setSelectedFile(null); setFields([]); setBackgroundUrl(null); setServerBgUrl(null); setEditingDraftId(null); }} className="btn-primary" style={{ padding: '12px 24px' }}>새 문서 작성</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isTeacher ? '1fr 1fr' : '1fr', gap: 40, alignItems: 'start' }}>
        {/* Left Panel: Documents */}
        {isTeacher && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fi fi-rr-edit" style={{ color: '#d97706' }} /> 발송 전 문서
                </h4>
              </div>
              {localDrafts.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14, background: 'rgba(255,255,255,0.5)', borderRadius: 16, border: '1px dashed #e2e8f0' }}>로컬에 임시저장된 문서가 없습니다.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                    {localDrafts.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((draftsPage - 1) * ITEMS_PER_PAGE, draftsPage * ITEMS_PER_PAGE).map((d: any) => {
                      let isMerged = false;
                      try {
                        const parsedFields = JSON.parse(d.fields_json || '[]');
                        const metaField = parsedFields.find((f: any) => f.id === 'META_OPTIONS' || f.id === 'canvas_overlay_meta');
                        if (metaField) isMerged = JSON.parse(metaField.value || '{}').mergeSignatures === true;
                      } catch { }
                      return (
                        <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #fce7f3', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span style={{ fontSize: 11, padding: '3px 10px', background: '#fce7f3', color: '#db2777', borderRadius: 20 }}>내 PC 임시보관</span>
                              {isMerged && <span style={{ fontSize: 11, padding: '3px 10px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 20 }}>한 페이지에 모두 받기</span>}
                            </div>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                          </div>
                          <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, flex: 1 }}>{d.title}</h4>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => resumeDraft(d)} className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: '8px 0', margin: 0, color: '#db2777', borderColor: '#f9a8d4', background: '#fdf2f8' }}>이어서 작성하기</button>
                            <button onClick={() => handleDeleteDoc(d.id, true, true)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#ef4444' }}>삭제</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {localDrafts.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                      <button onClick={() => setDraftsPage((p: number) => Math.max(1, p - 1))} disabled={draftsPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
                      <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{draftsPage} / {Math.ceil(localDrafts.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
                      <button onClick={() => setDraftsPage((p: number) => Math.min(Math.ceil(localDrafts.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={draftsPage === Math.ceil(localDrafts.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fi fi-rr-paper-plane" style={{ color: '#4f46e5' }} /> 발송한 문서
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
                {docs.filter((d: any) => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((sentPage - 1) * ITEMS_PER_PAGE, sentPage * ITEMS_PER_PAGE).map((d: any) => {
                  let isMerged = false;
                  try {
                    const parsedFields = JSON.parse(d.fields_json || '[]');
                    const metaField = parsedFields.find((f: any) => f.id === 'META_OPTIONS' || f.id === 'canvas_overlay_meta');
                    if (metaField) isMerged = JSON.parse(metaField.value || '{}').mergeSignatures === true;
                  } catch { }
                  return (
                    <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{ fontSize: 11, padding: '3px 10px', background: d.status === 'recalled' ? '#fee2e2' : '#f1f5f9', color: d.status === 'recalled' ? '#ef4444' : '#475569', borderRadius: 20 }}>{d.status === 'recalled' ? '회수됨' : d.status}</span>
                          {isMerged && <span style={{ fontSize: 11, padding: '3px 10px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 20 }}>한 페이지에 모두 받기</span>}
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                      </div>
                      <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{d.title}</h4>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => fetchStatus(d)} className={d.status === 'completed' ? "btn-primary" : "btn-secondary"} style={{ flex: 1, fontSize: 12, padding: '8px 0', margin: 0, background: d.status === 'completed' ? '#ef4444' : undefined, borderColor: d.status === 'completed' ? '#ef4444' : undefined }}>{d.status === 'completed' ? '진행 완료' : '진행현황 보기'}</button>
                        <button onClick={() => handleResendDoc(d)} className="btn-primary" style={{ flex: 1, fontSize: 12, padding: '8px 0', margin: 0 }}>재발송</button>
                        {d.status === 'recalled' ? (
                          <button disabled className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#94a3b8', opacity: 0.7 }}>회수 완료</button>
                        ) : (
                          <button onClick={() => handleRecallDoc(d)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#f59e0b' }}>회수</button>
                        )}
                        <button onClick={() => handleDeleteDoc(d.id, true, false)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', margin: 0, color: '#ef4444' }}>삭제</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {docs.filter((d: any) => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setSentPage((p: number) => Math.max(1, p - 1))} disabled={sentPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
                  <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{sentPage} / {Math.ceil(docs.filter((d: any) => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
                  <button onClick={() => setSentPage((p: number) => Math.min(Math.ceil(docs.filter((d: any) => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={sentPage === Math.ceil(docs.filter((d: any) => d.status !== 'draft' && d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fi fi-rr-download" style={{ color: '#0ea5e9' }} /> 받은 문서
            </h4>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            {pendingDocs.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).slice((receivedPage - 1) * ITEMS_PER_PAGE, receivedPage * ITEMS_PER_PAGE).map((d: any) => {
              const hasDraft = !d.is_signed && (isTeacher
                ? !!((window as any).go?.main?.App?.HasSendocDraft && (window as any).__sendocDraftCache?.[d.id])
                : !!localStorage.getItem(`sendoc_draft_${d.id}`));
              return (
                <div key={d.id} style={{ padding: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', opacity: d.status === 'recalled' ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', background: d.status === 'recalled' ? '#e5e7eb' : (d.is_signed ? '#f1f5f9' : '#fee2e2'), color: d.status === 'recalled' ? '#6b7280' : (d.is_signed ? '#475569' : '#ef4444'), borderRadius: 20 }}>{d.status === 'recalled' ? '발신자 회수' : (d.is_signed ? '서명완료' : '서명필요')}</span>
                      {hasDraft && <span style={{ fontSize: 11, padding: '3px 10px', background: '#fef3c7', color: '#d97706', borderRadius: 20 }}>임시 저장됨</span>}
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{d.title}</h4>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => {
                      if (d.status === 'recalled') return toast.error('발신자가 회수한 문서입니다.');
                      openSignView(d);
                    }} className={d.status === 'recalled' ? "btn-secondary" : (hasDraft ? "btn-secondary" : "btn-primary")} style={{ flex: 1, fontSize: 12, padding: '8px 0', borderColor: hasDraft ? '#fbbf24' : (d.is_signed && d.status !== 'recalled' ? '#ef4444' : undefined), color: hasDraft ? '#d97706' : undefined, background: hasDraft ? '#fef3c7' : (d.is_signed && d.status !== 'recalled' ? '#ef4444' : undefined) }}>{d.status === 'recalled' ? '회수됨' : (d.is_signed ? '작성 내용 확인' : (hasDraft ? '이어서 작성하기' : '문서 확인 및 서명'))}</button>
                    <button onClick={() => handleDeleteDoc(d.id, false)} className="btn-secondary" style={{ fontSize: 12, padding: '8px 12px', color: '#ef4444' }}>삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
          {pendingDocs.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length > ITEMS_PER_PAGE && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              <button onClick={() => setReceivedPage((p: number) => Math.max(1, p - 1))} disabled={receivedPage === 1} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>이전</button>
              <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{receivedPage} / {Math.ceil(pendingDocs.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)}</span>
              <button onClick={() => setReceivedPage((p: number) => Math.min(Math.ceil(pendingDocs.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE), p + 1))} disabled={receivedPage === Math.ceil(pendingDocs.filter((d: any) => d.title.toLowerCase().includes(searchQuery.toLowerCase())).length / ITEMS_PER_PAGE)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>다음</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
