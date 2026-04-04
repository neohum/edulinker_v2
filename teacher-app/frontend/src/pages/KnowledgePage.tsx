import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { apiFetch, API_BASE } from '../api'

interface KnowledgeDoc {
  id: string
  school_id: string
  title: string
  source_type: string
  original_filename: string
  file_url?: string
  markdown_content?: string
  created_at: string
  user?: {
    name: string;
    grade?: number;
    class_num?: number;
  }
}



export default function KnowledgePage() {
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list')
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDoc | null>(null)
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  // List State
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Add Form State
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [filename, setFilename] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (activeTab === 'list') {
      fetchDocs()
    }

    const handleOnline = () => {
      setIsOfflineMode(prev => {
        if (prev) {
          // If we were offline and now online, fetch again!
          setTimeout(() => {
            if (activeTab === 'list') fetchDocs()
          }, 0)
          return false
        }
        return false
      })
    }
    window.addEventListener('server-online', handleOnline)
    return () => window.removeEventListener('server-online', handleOnline)
  }, [activeTab])

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  const [deleteData, setDeleteData] = useState<KnowledgeDoc | null>(null)
  const [deleteInput, setDeleteInput] = useState('')
  const [previewMode, setPreviewMode] = useState(false)

  const fetchDocs = async () => {
    try {
      setLoading(true)

      // 로컬 DB에서 먼저 데이터를 즉시 불러와서 화면에 빠르게 그려줌 (SWR 패턴)
      if ((window as any).go?.main?.App?.GetLocalKnowledge) {
        try {
          const localData = await (window as any).go.main.App.GetLocalKnowledge()
          if (localData && localData.length > 0) {
            setDocs(localData)
            setLoading(false) // 로컬 데이터가 있으면 로딩 스피너를 즉시 끔
          }
        } catch (e) { }
      }
      if (isOfflineMode || !navigator.onLine) {
        throw new Error('already offline')
      }

      // 백그라운드에서 최신 데이터를 서버로부터 패치
      const res = await apiFetch('/api/plugins/knowledge/docs')
      if (res.ok) {
        const data = await res.json()
        setDocs(data || [])
        setIsOfflineMode(false)
        if ((window as any).go?.main?.App?.SyncKnowledge) {
          try {
            const { getToken } = await import('../api');
            const token = await getToken();
            (window as any).go.main.App.SyncKnowledge(JSON.stringify(data || []), API_BASE, token).catch((e: any) => console.error(e));
          } catch (err) { }
        }
      } else {
        throw new Error('Server !ok')
      }
    } catch (e: any) {
      console.error(e)
      setIsOfflineMode(true)
      // 최신 서버 호출 실패 시 다시 로컬 데이터 확인해서 offline fallback 알림
      if ((window as any).go?.main?.App?.GetLocalKnowledge) {
        try {
          const localData = await (window as any).go.main.App.GetLocalKnowledge()
          setDocs(localData || [])
          if (e.message !== 'already offline') {
            toast.info("오프라인 모드로 로컬에 저장된 규정/정보를 불러왔습니다.", { duration: 3000 })
          }
        } catch (err) { }
      }
    } finally {
      setLoading(false)
    }
  }

  // 오프라인 대기 큐 비우기 기능 추가
  const flushOfflineKnowledgeQueue = async () => {
    const queueStr = localStorage.getItem('offline_knowledge_queue')
    if (!queueStr) return
    let queue = []
    try { queue = JSON.parse(queueStr) } catch (e) { return }
    if (queue.length === 0) return

    let anyFailed = false
    let successCount = 0
    const newQueue = []

    for (const doc of queue) {
      try {
        const body = JSON.stringify({
          title: doc.title,
          source_type: doc.source_type,
          original_filename: doc.original_filename || '',
          content: doc.markdown_content
        })
        const { getToken } = await import('../api')
        const token = await getToken()
        const res = await fetch(`${API_BASE}/api/plugins/knowledge/docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body
        })
        if (!res.ok) {
          anyFailed = true
          newQueue.push(doc)
        } else {
          successCount++
        }
      } catch (e) {
        anyFailed = true
        newQueue.push(doc)
      }
    }

    if (newQueue.length === 0) {
      localStorage.removeItem('offline_knowledge_queue')
    } else {
      localStorage.setItem('offline_knowledge_queue', JSON.stringify(newQueue))
    }

    if (successCount > 0) {
      toast.success(`${successCount}개의 오프라인 등록 문서가 서버와 동기화되었습니다.`)
      // Refresh documents after upload
      fetchDocs()
    }
  }

  // Mount 시에 큐 플러시 시도
  useEffect(() => {
    if (!isOfflineMode) {
      flushOfflineKnowledgeQueue()
    }
  }, [isOfflineMode])

  const handleDeleteClick = (doc: KnowledgeDoc) => {
    setDeleteData(doc)
    setDeleteInput('')
  }

  const confirmDelete = async () => {
    if (!deleteData || deleteInput !== '삭제') return
    try {
      const res = await apiFetch(`/api/plugins/knowledge/docs/${deleteData.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('문서가 삭제되었습니다.')
        fetchDocs()
        setDeleteData(null)
      }
    } catch (e) {
      toast.error('삭제 실패')
    }
  }

  const processFile = async (file: File) => {
    setFilename(file.name)
    setTitle(prev => prev ? prev : file.name.replace(/\.[^/.]+$/, ''))
    setSelectedFile(file)
    setIsConverting(true)

    try {
      if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        let mdText = '';
        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
          if (rows.length > 0) {
            mdText += `### ${sheetName}\n\n`;
            const maxCols = Math.max(...rows.map(r => r.length));
            if (maxCols > 0) {
              const paddedRows = rows.map(r => {
                const newRow = [...r];
                while (newRow.length < maxCols) newRow.push("");
                return newRow.map(c => String(c).replace(/\|/g, '\\|').replace(/\n/g, '<br>'));
              });
              mdText += '| ' + paddedRows[0].join(' | ') + ' |\n';
              mdText += '| ' + paddedRows[0].map(() => '---').join(' | ') + ' |\n';
              for (let i = 1; i < paddedRows.length; i++) {
                mdText += '| ' + paddedRows[i].join(' | ') + ' |\n';
              }
              mdText += '\n\n';
            }
          }
        });
        if (!mdText.trim()) mdText = '엑셀 내용을 추출할 수 없거나 빈 시트입니다.';
        setContent(prev => prev ? prev + '\n\n' + mdText : mdText);
        toast.success('엑셀 문서 추출 완료');
        setIsConverting(false);
      } else {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const base64data = (evt.target?.result as string).split(',')[1]

          // Call Wails Backend
          const res = await (window as any).go.main.App.ConvertToMarkdown(file.name, base64data)
          if (res.success) {
            setContent(prev => prev ? prev + '\n\n' + res.text : res.text)
            toast.success('문서 텍스트 추출 완료')
          } else {
            toast.error('텍스트 추출 실패: ' + res.error)
          }
          setIsConverting(false)
        }
        reader.readAsDataURL(file)
      }
    } catch (err: any) {
      toast.error('파일 처리 중 오류 발생')
      setIsConverting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isConverting) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isConverting) return

    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error('제목과 내용을 모두 입력해주세요.')
      return
    }

    try {
      setLoading(true)
      let body: any;
      const currentSourceType = selectedFile ? 'file' : 'text'

      if (selectedFile) {
        const formData = new FormData()
        formData.append('title', title)
        formData.append('source_type', currentSourceType)
        formData.append('original_filename', filename)
        formData.append('content', content)
        formData.append('file', selectedFile)
        body = formData
      } else {
        body = JSON.stringify({
          title,
          source_type: currentSourceType,
          original_filename: '',
          content
        })
      }

      if (isOfflineMode || !navigator.onLine) {
        throw new Error('already offline')
      }

      const res = await apiFetch('/api/plugins/knowledge/docs', {
        method: 'POST',
        body
      })

      if (res.ok) {
        const publishedDoc = await res.json()

        // Optimistic UI update: 새 문서를 즉시 화면 목록에 반영
        const newDocs = [publishedDoc, ...docs]
        setDocs(newDocs)

        // 로컬 SQLite에도 즉시 반영하여 이후 fetchDocs에서 딜레이 없이 나오게 함
        if ((window as any).go?.main?.App?.SyncKnowledge) {
          try {
            const { getToken } = await import('../api')
            const token = await getToken()
              ; (window as any).go.main.App.SyncKnowledge(JSON.stringify(newDocs), API_BASE, token).then(() => {
                if ((window as any).go?.main?.App?.IndexDocument) {
                  return (window as any).go.main.App.IndexDocument(publishedDoc.id, publishedDoc.title, publishedDoc.source_type, publishedDoc.markdown_content)
                }
              }).catch((err: any) => console.error('[Online Syncing/Indexing]', err))
          } catch (err) { }
        }

        toast.success('문서가 지식베이스에 등록되었습니다.')
        // Reset form
        setTitle('')
        setContent('')
        setFilename('')
        setSelectedFile(null)
        setActiveTab('list')
      } else {
        toast.error('등록 실패')
      }
    } catch (e) {
      setIsOfflineMode(true)
      toast.info('오프라인 상태입니다. 기기에 우선 저장되며, 온라인 시 자동 등록됩니다.', { duration: 5000 })

      const currentSourceType = selectedFile ? 'file' : 'text'
      const offlineDoc = {
        id: 'local-' + Date.now(),
        school_id: '',
        title,
        source_type: currentSourceType,
        original_filename: filename,
        markdown_content: content.trim(),
        created_at: new Date().toISOString(),
        user: { name: '나 (오프라인)' }
      }

      // localStorage 큐에 저장
      const queueStr = localStorage.getItem('offline_knowledge_queue')
      let queue = []
      try { queue = queueStr ? JSON.parse(queueStr) : [] } catch (e) { }
      queue.push(offlineDoc)
      localStorage.setItem('offline_knowledge_queue', JSON.stringify(queue))

      // UI 업데이트 및 SQLite 저장
      const newDocs = [offlineDoc, ...docs]
      setDocs(newDocs)

      if ((window as any).go?.main?.App?.SyncKnowledge) {
        try {
          const { getToken } = await import('../api')
          const token = await getToken()
            // 비동기 처리로 UI 블로킹 방지 (Ollama 로컬 임베딩이 5~10초 지연될 수 있으므로 분리)
            ; (window as any).go.main.App.SyncKnowledge(JSON.stringify(newDocs), API_BASE, token).then(() => {
              if ((window as any).go?.main?.App?.IndexDocument) {
                return (window as any).go.main.App.IndexDocument(offlineDoc.id, offlineDoc.title, offlineDoc.source_type, offlineDoc.markdown_content)
              }
            }).catch((err: any) => console.error('[Offline Syncing/Indexing]', err))
        } catch (err) {
          console.error('[Offline Setup]', err)
        }
      }

      setTitle('')
      setContent('')
      setFilename('')
      setSelectedFile(null)
      setActiveTab('list')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setActiveTab('list')}
          style={{
            background: 'none', border: 'none', padding: '12px 16px', fontSize: 16, cursor: 'pointer',
            borderBottom: activeTab === 'list' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: activeTab === 'list' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'list' ? 600 : 400
          }}
        >
          등록된 지식 문서
        </button>
        <button
          onClick={() => setActiveTab('add')}
          style={{
            background: 'none', border: 'none', padding: '12px 16px', fontSize: 16, cursor: 'pointer',
            borderBottom: activeTab === 'add' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: activeTab === 'add' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'add' ? 600 : 400
          }}
        >
          새 문서 추가
        </button>
      </div>

      {activeTab === 'list' && (
        <div className="card">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>로딩 중...</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                  총 {docs.filter(doc =>
                    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (doc.user?.name && doc.user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (doc.original_filename && doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase()))
                  ).length}건
                </div>
                <div style={{ position: 'relative', width: 300 }}>
                  <i className="fi fi-rr-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="문서 제목, 파일명, 작성자 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', paddingLeft: 36, borderRadius: 20 }}
                  />
                </div>
              </div>
              {docs.filter(doc =>
                doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (doc.user?.name && doc.user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (doc.original_filename && doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase()))
              ).length === 0 ? (
                <div className="empty-state">
                  <i className="fi fi-rr-document" style={{ fontSize: 48, opacity: 0.5, marginBottom: 16 }}></i>
                  <p>{searchQuery ? '검색 결과가 없습니다.' : '등록된 지식 문서가 없습니다. 새 문서를 추가해 AI 검색을 활용해보세요.'}</p>
                </div>
              ) : (
                <>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                        <th style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>제목</th>
                        <th style={{ padding: '16px 20px', color: 'var(--text-secondary)', width: 120 }}>유형</th>
                        <th style={{ padding: '16px 20px', color: 'var(--text-secondary)', width: 150 }}>작성자</th>
                        <th style={{ padding: '16px 20px', color: 'var(--text-secondary)', width: 150 }}>등록일</th>
                        <th style={{ padding: '16px 20px', color: 'var(--text-secondary)', width: 100, textAlign: 'center' }}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filteredDocs = docs.filter(doc =>
                          doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (doc.user?.name && doc.user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (doc.original_filename && doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase()))
                        )
                        const totalPages = Math.max(1, Math.ceil(filteredDocs.length / itemsPerPage))
                        const paginatedDocs = filteredDocs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

                        return paginatedDocs.map(doc => (
                          <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '16px 20px', fontWeight: 500 }}>
                              <div
                                onClick={() => setSelectedDoc(doc)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                              >
                                <i className={`fi ${doc.source_type === 'file' ? 'fi-rr-file-hwp' : 'fi-rr-text'}`} style={{ color: 'var(--text-secondary)' }} />
                                <span style={{ color: 'var(--text-primary)', textDecoration: 'underline', textUnderlineOffset: 4 }}>{doc.title}</span>
                              </div>
                              {doc.original_filename && (
                                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {doc.original_filename}
                                  {doc.file_url && (
                                    <button
                                      onClick={() => {
                                        const a = document.createElement('a')
                                        a.href = `${API_BASE}${doc.file_url}`
                                        a.download = doc.original_filename || 'download'
                                        a.target = '_blank'
                                        a.click()
                                      }}
                                      style={{ color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                                    >
                                      <i className="fi fi-rr-download" style={{ fontSize: 12 }} />
                                      다운로드
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <span style={{
                                padding: '4px 8px', borderRadius: 4, fontSize: 13,
                                background: doc.source_type === 'file' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                color: doc.source_type === 'file' ? 'rgb(59, 130, 246)' : 'rgb(34, 197, 94)'
                              }}>
                                {doc.source_type === 'file' ? '파일 업로드' : '직접 입력'}
                              </span>
                            </td>
                            <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
                              {doc.user ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-light)' }}>
                                    <i className="fi fi-rr-user" style={{ fontSize: 12, color: 'var(--text-muted)' }} />
                                  </div>
                                  <span>
                                    {doc.user.grade ? `${doc.user.grade}학년 ` : ''}
                                    {doc.user.class_num ? `${doc.user.class_num}반 ` : ''}
                                    <b>{doc.user.name}</b>
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>알 수 없음</span>
                              )}
                            </td>
                            <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                              {new Date(doc.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                              {!isOfflineMode && (
                                <button onClick={() => handleDeleteClick(doc)} className="btn-danger" style={{ padding: '6px 12px', fontSize: '13px' }}>삭제</button>
                              )}
                            </td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>

                  {/* Pagination Controls */}
                  {(() => {
                    const filteredCount = docs.filter(doc =>
                      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (doc.user?.name && doc.user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (doc.original_filename && doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase()))
                    ).length
                    const totalPages = Math.max(1, Math.ceil(filteredCount / itemsPerPage))

                    if (totalPages <= 1) return null;

                    return (
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', opacity: currentPage === 1 ? 0.5 : 1 }}
                        >
                          이전
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              style={{
                                width: 32, height: 32, borderRadius: 16, border: 'none', cursor: 'pointer',
                                background: currentPage === page ? 'var(--accent-blue)' : 'transparent',
                                color: currentPage === page ? 'white' : 'var(--text-primary)',
                                fontWeight: currentPage === page ? 600 : 400
                              }}
                            >
                              {page}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', opacity: currentPage === totalPages ? 0.5 : 1 }}
                        >
                          다음
                        </button>
                      </div>
                    )
                  })()}
                </>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'add' && (
        <div className="card">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>제목</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="문서 제목을 입력하세요"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>파일 첨부 (옵션)</label>
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '32px 20px', border: '2px dashed',
              borderColor: isDragging ? 'var(--accent-blue)' : 'var(--border-light)',
              borderRadius: '12px',
              background: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'var(--bg-primary)',
              cursor: isConverting ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
              opacity: isConverting ? 0.6 : 1
            }}
              onMouseOver={e => !isConverting && !isDragging && (e.currentTarget.style.borderColor = 'var(--accent-blue)', e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)')}
              onMouseOut={e => !isConverting && !isDragging && (e.currentTarget.style.borderColor = 'var(--border-light)', e.currentTarget.style.background = 'var(--bg-primary)')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <i className="fi fi-rr-cloud-upload" style={{ fontSize: 32, margin: '0 0 12px', color: filename ? 'var(--accent-blue)' : 'var(--text-muted)' }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                {filename ? filename : '클릭하여 파일 선택'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                지원 포맷: HWP, HWPX, PDF, TXT, CSV, MD, XLSX, XLS
              </span>
              <input
                type="file"
                style={{ display: 'none' }}
                accept=".hwp,.hwpx,.pdf,.txt,.csv,.md,.xlsx,.xls"
                onChange={handleFileSelect}
                disabled={isConverting}
              />
            </label>
            {isConverting && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--accent-blue)', fontSize: 13, fontWeight: 600, background: 'rgba(59,130,246,0.1)', padding: '10px 16px', borderRadius: 8 }}>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                파일을 텍스트로 변환 중입니다. HWP 파일의 경우 수 초가 소요될 수 있습니다...
              </div>
            )}
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, fontWeight: 500 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  본문 내용
                  <span style={{ color: 'var(--accent-blue)', fontSize: 13, fontWeight: 500, background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: 12 }}>(파일 업로드 시 자동 추출 및 추가됨)</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 400, marginTop: 4 }}>이 내용이 AI 검색에 활용됩니다.</div>
              </div>
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: 4, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setPreviewMode(false)}
                  style={{
                    padding: '4px 12px', fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: !previewMode ? 'var(--bg-primary)' : 'transparent',
                    color: !previewMode ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: !previewMode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontWeight: !previewMode ? 600 : 400
                  }}
                >
                  작성 모드
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode(true)}
                  style={{
                    padding: '4px 12px', fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: previewMode ? 'var(--bg-primary)' : 'transparent',
                    color: previewMode ? 'var(--text-primary)' : 'var(--text-muted)',
                    boxShadow: previewMode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontWeight: previewMode ? 600 : 400
                  }}
                >
                  미리보기
                </button>
              </div>
            </label>

            {previewMode ? (
              <div
                className="form-input markdown-body"
                style={{ width: '100%', height: 300, overflowY: 'auto', background: 'var(--bg-primary)', padding: '16px', fontSize: 15, lineHeight: 1.6, color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
              >
                {content.trim() ? (
                  <ReactMarkdown>{content}</ReactMarkdown>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>미리보기할 내용이 없습니다.</div>
                )}
              </div>
            ) : (
              <textarea
                className="form-input"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="직접 문서를 작성하거나 파일을 업로드하여 텍스트를 추출하세요. (마크다운 문법 지원)"
                style={{ width: '100%', height: 300, resize: 'none', overflowY: 'auto', fontFamily: 'monospace', fontSize: 14 }}
                disabled={isConverting}
              />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setTitle('')
                setContent('')
                setFilename('')
                setSelectedFile(null)
                setActiveTab('list')
              }}
              className="btn-secondary"
              disabled={loading || isConverting}
            >
              취소
            </button>
            <button onClick={handleSave} className="btn-primary" disabled={loading || isConverting}>
              {loading ? '저장 중...' : '지식베이스에 등록'}
            </button>
          </div>
        </div>
      )}

      {selectedDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 800, maxWidth: '90%', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', background: 'var(--bg-primary)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <i className={`fi ${selectedDoc.source_type === 'file' ? 'fi-rr-file-hwp' : 'fi-rr-text'}`} style={{ color: 'var(--accent-blue)' }} />
                {selectedDoc.title}
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedDoc.file_url ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (isOfflineMode) {
                        try {
                          await (window as any).go.main.App.OpenLocalKnowledgeFile(selectedDoc.id, selectedDoc.original_filename)
                        } catch (e: any) {
                          toast.error(typeof e === 'string' ? e : e.message || '파일을 열 수 없습니다.')
                        }
                      } else {
                        const a = document.createElement('a')
                        a.href = `${API_BASE}${selectedDoc.file_url}`
                        a.download = selectedDoc.original_filename || 'download'
                        a.target = '_blank'
                        a.click()
                      }
                    }}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, borderRadius: 6, margin: 0 }}
                  >
                    <i className="fi fi-rr-download" /> {isOfflineMode ? '오프라인에서 열기' : '원본 다운로드'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([selectedDoc.markdown_content || ''], { type: 'text/markdown;charset=utf-8;' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      const dlName = selectedDoc.original_filename ? `${selectedDoc.original_filename}.txt` : `${selectedDoc.title}.txt`
                      a.download = dlName
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 13, borderRadius: 6, margin: 0 }}
                  >
                    <i className="fi fi-rr-download" /> 텍스트 다운로드
                  </button>
                )}
                <button type="button" onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--text-secondary)', padding: '0 0 0 8px' }}>
                  <i className="fi fi-rr-cross-small" />
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', fontSize: 15, lineHeight: 1.6, color: 'var(--text-primary)', fontFamily: 'sans-serif', background: 'var(--bg-primary)' }}>
              <div className="markdown-body" style={{ background: 'transparent' }}>
                <ReactMarkdown>{selectedDoc.markdown_content || ''}</ReactMarkdown>
              </div>
            </div>
            {selectedDoc.original_filename && (
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-color)', fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>원본 파일: {selectedDoc.original_filename} (서버에는 최적화를 위해 추출된 텍스트만 다운로드 가능합니다)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 400, maxWidth: '90%', display: 'flex', flexDirection: 'column', padding: 24, background: 'var(--bg-primary)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', borderRadius: 12 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fi fi-rr-trash" style={{ color: '#ef4444' }} /> 문서 삭제
            </h3>
            <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: 16 }}>
              <p style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, margin: 0, lineHeight: 1.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <i className="fi fi-rr-triangle-warning" style={{ marginTop: 2 }} />
                <span>삭제하시면 모든 컴퓨터의 해당 문서가 삭제됩니다.</span>
              </p>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              정말로 <b>{deleteData.title}</b> 문서를 삭제하시겠습니까?<br />
              삭제를 진행하려면 아래 빈칸에 <b>삭제</b>라고 입력해주세요.
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="삭제"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-color)', marginBottom: 20, fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteData(null)}
                className="btn-secondary"
                style={{ padding: '8px 16px', borderRadius: 6, fontSize: 14 }}
              >
                취소
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteInput !== '삭제'}
                className="btn-danger"
                style={{ padding: '8px 16px', borderRadius: 6, opacity: deleteInput !== '삭제' ? 0.5 : 1, fontSize: 14 }}
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
