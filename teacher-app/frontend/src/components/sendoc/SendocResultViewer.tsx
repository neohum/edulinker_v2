import { toast } from 'sonner'
import { VectorSignatureCanvas } from './VectorSignatureCanvas'

interface SendocResultViewerProps {
  resultViewerData: any
  setResultViewerData: (data: any) => void
  pageImages: string[]
  handleSafePrint: () => void
}

export function SendocResultViewer({ resultViewerData, setResultViewerData, pageImages, handleSafePrint }: SendocResultViewerProps) {
  if (!resultViewerData) return null

  return (
    <div className="print-modal-root" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <div className="print-modal-content" style={{ background: '#f1f5f9', borderRadius: 16, width: '90%', maxWidth: 1000, height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="no-print" style={{ padding: '16px 24px', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{resultViewerData.doc.title} - 결과 확인</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleSafePrint} className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}><i className="fi fi-rr-print" /> 출력하기</button>
            <button onClick={() => setResultViewerData(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>✕</button>
          </div>
        </div>
        <div className="print-modal-body" style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .print-modal-root { position: absolute !important; background: none !important; align-items: flex-start !important; justify-content: stretch !important; top: 0 !important; left: 0 !important; z-index: 99999 !important; }
              .print-modal-content { height: auto !important; max-height: none !important; width: 100% !important; max-width: none !important; overflow: visible !important; border-radius: 0 !important; background: none !important; }
              .print-modal-body { overflow: visible !important; padding: 0 !important; gap: 0 !important; }
              
              #sendoc-viewer-container, #sendoc-viewer-container * { visibility: visible; }
              #sendoc-viewer-container { display: block !important; width: 100% !important; }
              .sendoc-print-page { position: relative !important; display: block !important; width: 100% !important; box-shadow: none !important; page-break-after: always; break-after: page; margin: 0 !important; }
              .sendoc-print-page:last-child { page-break-after: auto; break-after: auto; }
              .no-print { display: none !important; }
              @page { margin: 0; }
            }
          `}</style>
          <div id="sendoc-viewer-container" style={{ display: 'flex', flexDirection: 'column', gap: 40, width: '100%', alignItems: 'center' }}>
            {resultViewerData.bulkMode && resultViewerData.bulkRecipients ? (
              resultViewerData.bulkRecipients.map((br: any, idx: number) => (
                <div key={idx} className="sendoc-print-page" style={{ position: 'relative', width: 800, height: 1131 * Math.max(1, pageImages.length), background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  {pageImages.length > 0 ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                      {pageImages.map((pg, i) => (
                        <img key={i} src={`data:image/webp;base64,${pg}`} style={{ width: '100%', height: `${100 / pageImages.length}%`, display: 'block', pointerEvents: 'none' }} alt={`문서 배경 ${i + 1}`} />
                      ))}
                      {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                        <div key={'div' + i} className="no-print" style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: 0, width: '100%', height: 4, background: '#94a3b8', borderTop: '1px dashed #475569', borderBottom: '1px dashed #475569', zIndex: 15, pointerEvents: 'none' }} />
                      ))}
                    </div>
                  ) : (
                    <img src={resultViewerData.bgUrl} style={{ width: '100%', display: 'block' }} alt="문서 배경" onError={(e) => { e.currentTarget.style.display = 'none'; toast.error('배경 이미지를 불러올 수 없습니다.'); }} />
                  )}
                  {br.fields.map((f: any) => (
                    <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}px`, height: `${f.height}px`, zIndex: 10 }}>
                      {f.id.includes('canvas_overlay') ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                          {f.signatureData && f.signatureData.startsWith('[') ? (
                            <VectorSignatureCanvas strokesJSON={f.signatureData} width={typeof f.width === 'number' ? f.width : 800} height={typeof f.height === 'number' ? f.height : 1131} />
                          ) : (
                            f.signatureData && <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          )}
                        </div>
                      ) : f.type === 'text' ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: f.fontSize || 13, color: 'black' }}>{f.value || ''}</div>
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {f.signatureData && f.signatureData.startsWith('[') ? (
                            <VectorSignatureCanvas strokesJSON={f.signatureData} width={f.width} height={f.height} />
                          ) : (
                            f.signatureData && <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* Name Badge for tracking */}
                  <div className="no-print" style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 20 }}>
                    작성자: {br.recipient.user.name} ({br.recipient.user.role})
                    <style>{`@media print { .no-print { display: none !important; } }`}</style>
                  </div>
                </div>
              ))
            ) : (
              <div className="sendoc-print-page" style={{ position: 'relative', width: 800, height: 1131 * Math.max(1, pageImages.length), background: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                {pageImages.length > 0 ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {pageImages.map((pg, i) => (
                      <img key={i} src={`data:image/webp;base64,${pg}`} style={{ width: '100%', height: `${100 / pageImages.length}%`, display: 'block', pointerEvents: 'none' }} alt={`문서 배경 ${i + 1}`} />
                    ))}
                    {pageImages.length > 1 && Array.from({ length: pageImages.length - 1 }).map((_, i) => (
                      <div key={'div' + i} className="no-print" style={{ position: 'absolute', top: `${(i + 1) * (100 / pageImages.length)}%`, left: 0, width: '100%', height: 4, background: '#94a3b8', borderTop: '1px dashed #475569', borderBottom: '1px dashed #475569', zIndex: 15, pointerEvents: 'none' }} />
                    ))}
                  </div>
                ) : (
                  <img src={resultViewerData.bgUrl} style={{ width: '100%', display: 'block' }} alt="문서 배경" onError={(e) => { e.currentTarget.style.display = 'none'; toast.error('배경 이미지를 불러올 수 없습니다.'); }} />
                )}
                {resultViewerData.fields.map((f: any) => (
                  <div key={f.id} style={{ position: 'absolute', left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}px`, height: `${f.height}px`, zIndex: 10 }}>
                    {f.type === 'text' ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: f.fontSize || 13, color: 'black' }}>{f.value || ''}</div>
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                        {f.signatureData && f.signatureData.startsWith('[') ? (
                          <VectorSignatureCanvas strokesJSON={f.signatureData} width={f.width} height={f.height} />
                        ) : (
                          f.signatureData && <img src={f.signatureData} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
