import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

interface KnowledgeDoc {
    id: string
    school_id: string
    title: string
    source_type: string
    original_filename: string
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

    // List State
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 10

    // Add Form State
    const [title, setTitle] = useState('')
    const [sourceType, setSourceType] = useState<'text' | 'file'>('text')
    const [content, setContent] = useState('')
    const [filename, setFilename] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isConverting, setIsConverting] = useState(false)
    const [isDragging, setIsDragging] = useState(false)

    useEffect(() => {
        if (activeTab === 'list') {
            fetchDocs()
        }
    }, [activeTab])

    // Reset to page 1 when search query changes
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery])

    const fetchDocs = async () => {
        try {
            setLoading(true)
            const res = await apiFetch('/api/plugins/knowledge/docs')
            if (res.ok) {
                setDocs(await res.json())
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까? 관련 데이터가 모두 삭제됩니다.')) return
        try {
            const res = await apiFetch(`/api/plugins/knowledge/docs/${id}`, { method: 'DELETE' })
            if (res.ok) {
                toast.success('문서가 삭제되었습니다.')
                fetchDocs()
            }
        } catch (e) {
            toast.error('삭제 실패')
        }
    }

    const processFile = async (file: File) => {
        setFilename(file.name)
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
        setSelectedFile(file)
        setIsConverting(true)

        try {
            const reader = new FileReader()
            reader.onload = async (evt) => {
                const base64data = (evt.target?.result as string).split(',')[1]

                // Call Wails Backend
                const res = await (window as any).go.main.App.ConvertToMarkdown(file.name, base64data)
                if (res.success) {
                    setContent(res.text)
                    toast.success('문서 변환 완료')
                } else {
                    toast.error('변환 실패: ' + res.error)
                    setContent('')
                }
                setIsConverting(false)
            }
            reader.readAsDataURL(file)
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

            if (sourceType === 'file' && selectedFile) {
                const formData = new FormData()
                formData.append('title', title)
                formData.append('source_type', sourceType)
                formData.append('original_filename', filename)
                formData.append('content', content)
                formData.append('file', selectedFile)
                body = formData
            } else {
                body = JSON.stringify({
                    title,
                    source_type: sourceType,
                    original_filename: sourceType === 'file' ? filename : '',
                    content
                })
            }

            const res = await apiFetch('/api/plugins/knowledge/docs', {
                method: 'POST',
                body
            })

            if (res.ok) {
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
            toast.error('네트워크 오류')
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
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <i className={`fi ${doc.source_type === 'file' ? 'fi-rr-file-hwp' : 'fi-rr-text'}`} style={{ color: 'var(--text-secondary)' }} />
                                                                {doc.title}
                                                            </div>
                                                            {doc.original_filename && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{doc.original_filename}</div>}
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
                                                            <button onClick={() => handleDelete(doc.id)} className="btn-danger" style={{ padding: '6px 12px', fontSize: '13px' }}>삭제</button>
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
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                        <button
                            type="button"
                            onClick={() => setSourceType('text')}
                            className={sourceType === 'text' ? 'btn-primary' : 'btn-secondary'}
                            style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8, margin: 0 }}
                        >
                            <i className="fi fi-rr-keyboard" /> 텍스트 직접 입력
                        </button>
                        <button
                            type="button"
                            onClick={() => setSourceType('file')}
                            className={sourceType === 'file' ? 'btn-primary' : 'btn-secondary'}
                            style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 8, margin: 0 }}
                        >
                            <i className="fi fi-rr-file-upload" /> 파일 업로드 (HWP 등)
                        </button>
                    </div>

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

                    {sourceType === 'file' && (
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>파일 첨부</label>
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
                                    지원 포맷: HWP, HWPX, PDF, TXT, CSV, MD
                                </span>
                                <input
                                    type="file"
                                    style={{ display: 'none' }}
                                    accept=".hwp,.hwpx,.pdf,.txt,.csv,.md"
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
                    )}

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 500 }}>
                            본문 내용 {sourceType === 'file' && '(자동 추출됨)'}
                            <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 400 }}>이 내용이 AI 검색에 활용됩니다.</span>
                        </label>
                        <textarea
                            className="form-input"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="문서 본문을 입력하거나 파일을 업로드하여 텍스트를 추출하세요."
                            style={{ width: '100%', height: 300, resize: 'vertical', fontFamily: 'monospace', fontSize: 14 }}
                            disabled={isConverting}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={handleSave} className="btn-primary" disabled={loading || isConverting}>
                            {loading ? '저장 중...' : '지식베이스에 등록'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
