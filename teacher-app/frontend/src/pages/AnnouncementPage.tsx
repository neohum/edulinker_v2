import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { getToken, apiFetch, API_BASE } from '../api'
import * as XLSX from 'xlsx'

const openDB = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('AnnouncementDB', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending_announcements', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
const savePendingAnnouncement = async (data: any) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pending_announcements', 'readwrite');
    tx.objectStore('pending_announcements').add({ id: Date.now(), ...data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
const getPendingAnnouncements = async () => {
  const db = await openDB();
  return new Promise<any[]>((resolve, reject) => {
    const request = db.transaction('pending_announcements', 'readonly').objectStore('pending_announcements').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
const deletePendingAnnouncement = async (id: number) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('pending_announcements', 'readwrite');
    tx.objectStore('pending_announcements').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

import type { UserInfo } from '../App'
import TargetTreeModal from '../components/TargetTreeModal'
import ReactMarkdown from 'react-markdown'

interface Announcement {
  id: string
  title: string
  content: string
  type: 'simple' | 'confirm' | 'apply' | 'todo'
  is_urgent: boolean
  attachments_json?: string
  author_id: string
  created_at: string
  due_date?: string
  is_confirmed?: boolean
}

interface AnnouncementPageProps {
  user?: UserInfo
  counts?: { total: number, simple: number, confirm: number, apply: number, todo: number }
}

export default function AnnouncementPage({ user, counts }: AnnouncementPageProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)

  const [isOfflineMode, setIsOfflineMode] = useState(false)
  const isOfflineModeRef = useRef(false)
  useEffect(() => {
    isOfflineModeRef.current = isOfflineMode
  }, [isOfflineMode])

  // Create modal
  const [showModal, setShowModal] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formType, setFormType] = useState('simple')
  const [formFiles, setFormFiles] = useState<File[]>([])
  const parsedMarkdownRef = useRef<{ [key: string]: string }>({})
  const [formTargets, setFormTargets] = useState<string[]>(['TEACHER'])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const [allUsers, setAllUsers] = useState<any[]>([])
  const [showTargetModal, setShowTargetModal] = useState(false)

  // Status modal
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [activeStatusDoc, setActiveStatusDoc] = useState<Announcement | null>(null)
  const [statusData, setStatusData] = useState<any>(null)

  const [stationaryCounts] = useState(counts || { total: 0, simple: 0, confirm: 0, apply: 0, todo: 0 })

  const syncPendingAnnouncements = async () => {
    try {
      const pending = await getPendingAnnouncements();
      if (pending.length === 0) return;
      const token = await getToken();
      let successCount = 0;
      toast.info(`오프라인에 임시 저장된 ${pending.length}건의 공문을 전송합니다...`, { duration: 3000 });
      for (const item of pending) {
        const formData = new FormData();
        formData.append('title', item.title);
        formData.append('content', item.content);
        formData.append('type', item.type);
        formData.append('is_urgent', item.is_urgent ? 'true' : 'false');
        formData.append('markdown_content', item.markdown_content);

        if (item.files && item.files.length > 0) {
          for (const f of item.files) {
            const byteString = atob(f.base64);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
            const blob = new Blob([ab]);
            formData.append('files', blob, f.name);
          }
        }

        const res = await fetch(`${API_BASE || 'http://localhost:5200'}/api/plugins/announcement`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        if (res.ok) {
          await deletePendingAnnouncement(item.id);
          successCount++;
        }
      }
      if (successCount > 0) {
        toast.success(`${successCount}개의 공문 전송이 완료되었습니다.`);
        fetchAnnouncements();
      }
    } catch (err) {
      console.error('Failed to sync offline announcements:', err);
    }
  };

  useEffect(() => {
    fetchAnnouncements()
    fetchUsers()

    const handleOnline = () => {
      if (isOfflineModeRef.current) {
        setIsOfflineMode(false)
        setTimeout(() => {
          fetchAnnouncements()
          syncPendingAnnouncements()
        }, 0)
      }
    }
    window.addEventListener('server-online', handleOnline)

    return () => {
      localStorage.setItem(`announcement_last_viewed_${user?.id || 'unknown'}`, new Date().toISOString())
      window.dispatchEvent(new Event('announcements_updated'))
      window.removeEventListener('server-online', handleOnline)
    }
  }, [filterType, user])

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/core/users?page_size=1000')
      if (res.ok) {
        const data = await res.json()
        setAllUsers(data.users || [])
      }
    } catch { }
  }

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)

      if (user?.isOffline || !navigator.onLine) {
        throw new Error('already offline')
      }

      const token = await getToken()
      const timestamp = new Date().getTime()
      const url = filterType ? `/api/plugins/announcement?type=${filterType}&_t=${timestamp}` : `/api/plugins/announcement?_t=${timestamp}`
      const res = await apiFetch(url, { cache: 'no-store' })

      if (res.ok) {
        const data = await res.json()
        setAnnouncements(data.announcements || [])
        setIsOfflineMode(false)

        // Push locally stuck items if the app was restarted and connected online
        syncPendingAnnouncements()

        if ((window as any).go?.main?.App?.SyncAnnouncements) {
          try {
            (window as any).go.main.App.SyncAnnouncements(JSON.stringify(data.announcements || []), API_BASE, token).catch((e: any) => console.error(e));
          } catch (err) { }
        }
      } else {
        throw new Error('Server !ok')
      }
    } catch (e: any) {
      console.error(e)
      setIsOfflineMode(true)
      let merged: any[] = []
      if ((window as any).go?.main?.App?.GetLocalAnnouncements) {
        try {
          const localData = await (window as any).go.main.App.GetLocalAnnouncements()
          merged = localData || []
        } catch (err) { }
      }
      try {
        const pending = await getPendingAnnouncements()
        const pseudo = pending.map(p => ({
          id: `pending-${p.id}`,
          title: `[오프라인 전송대기] ${p.title}`,
          content: p.content,
          type: p.type,
          is_urgent: p.is_urgent,
          markdown_content: p.markdown_content || '> ⏳ **오프라인 송신 대기 중**\\n> 네트워크 연결 시 자동으로 전송됩니다.',
          author_id: user?.id,
          author_name: user?.name,
          created_at: new Date(p.id).toISOString(),
          is_confirmed: false
        }))
        merged = [...pseudo, ...merged]
      } catch (err) { }

      if (filterType) merged = merged.filter((a: any) => a.type === filterType)
      setAnnouncements(merged)

      if (e.message !== 'already offline') {
        toast.info("오프라인 모드로 로컬에 동기화된 공문 목록을 불러왔습니다.", { duration: 3000 })
      }
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id: string) => {
    try {
      const token = await getToken()
      fetch(`http://localhost:5200/api/plugins/announcement/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
    } catch (e) { }
  }

  const handleConfirm = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    // Optimistically update UI so checkbox ticks instantly
    setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_confirmed: true } : a))

    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/announcement/${id}/confirm`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        toast.success('확인 처리되었습니다.')
        // fetchAnnouncements() 지연된 서버 리프레시로 인한 체크 박스 풀림 방지
      } else {
        // Revert on failure
        setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_confirmed: false } : a))
        toast.error('확인 처리 실패')
      }
    } catch (e) {
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_confirmed: false } : a))
      toast.error('네트워크 오류')
    }
  }

  const handleViewStatus = async (a: Announcement, e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveStatusDoc(a)
    setStatusData(null)
    setShowStatusModal(true)
    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/announcement/${a.id}/status`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) setStatusData(await res.json())
    } catch (e) { }
  }

  const handleDeleteAnnouncement = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm('해당 공문을 정말 삭제하시겠습니까?\n(삭제 시 모든 수신자의 목록에서도 함께 삭제됩니다)')) return;

    try {
      const token = await getToken()
      const res = await fetch(`http://localhost:5200/api/plugins/announcement/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      if (res.ok) {
        toast.success('공문이 삭제되었습니다.')
        fetchAnnouncements()
      } else {
        toast.error('삭제 처리에 실패했습니다.')
      }
    } catch (e) {
      toast.error('네트워크 오류')
    }
  }

  const handleCreate = async () => {
    if (!formTitle.trim()) { toast.warning('제목을 입력하세요'); return }
    try {
      const token = await getToken()
      let body: any;
      let headers: HeadersInit = {
        'Authorization': `Bearer ${token}`
      };

      if (formFiles.length > 0) {
        setIsUploading(true)
        const toastId = toast.loading('파일을 변환하고 업로드하는 중입니다...')

        let markdownContent = ''
        for (const file of formFiles) {
          const cachedMd = parsedMarkdownRef.current[file.name] || '';
          if (cachedMd.trim()) {
            markdownContent += `\n\n### ${file.name}\n${cachedMd}`;
          }
        }

        const fileDataArray = [];
        for (const file of formFiles) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
              reader.onerror = () => reject(new Error('파일 읽기 실패'))
              reader.readAsDataURL(file)
            })
            fileDataArray.push({ name: file.name, base64 })
          } catch (e) { }
        }

        if (isOfflineMode) {
          // Serialize to indexedDB
          try {
            await savePendingAnnouncement({
              title: formTitle,
              content: formContent,
              type: formType,
              is_urgent: false,
              markdown_content: markdownContent.trim(),
              files: fileDataArray
            });
            toast.success('오프라인 환경이라 네트워크 복구 시 전송되도록 저장했습니다.');
            setShowModal(false)
            setFormTitle('')
            setFormContent('')
            setFormType('simple')
            setFormFiles([])
            setShowPreview(false)
          } catch (e) {
            toast.error('오프라인 저장을 실패했습니다.');
          } finally {
            setIsUploading(false);
            toast.dismiss(toastId)
            fetchAnnouncements()
          }
          return;
        }

        const formData = new FormData()
        formData.append('title', formTitle)
        formData.append('content', formContent)
        formData.append('type', formType)
        formData.append('is_urgent', 'false')
        formData.append('markdown_content', markdownContent.trim())
        formFiles.forEach(f => formData.append('files', f))
        body = formData

        toast.dismiss(toastId)
      } else {
        if (isOfflineMode) {
          try {
            await savePendingAnnouncement({
              title: formTitle,
              content: formContent,
              type: formType,
              is_urgent: false,
              markdown_content: '',
              files: []
            });
            toast.success('오프라인 환경이라 네트워크 복구 시 전송되도록 저장했습니다.');
            setShowModal(false)
            setFormTitle('')
            setFormContent('')
            setFormType('simple')
            setFormFiles([])
            setShowPreview(false)
          } catch (e) { toast.error('저장에 실패했습니다.'); }
          fetchAnnouncements()
          return;
        }

        headers['Content-Type'] = 'application/json'
        body = JSON.stringify({
          title: formTitle, content: formContent, type: formType, is_urgent: false
        })
      }

      const res = await fetch(`${API_BASE || 'http://localhost:5200'}/api/plugins/announcement`, {
        method: 'POST',
        headers,
        body
      })
      if (res.ok) {
        toast.success('공문이 등록되었습니다.')
        setShowModal(false)
        setFormTitle('')
        setFormContent('')
        setFormType('simple')
        setFormFiles([])
        parsedMarkdownRef.current = {}
        setShowPreview(false)
        fetchAnnouncements()
      } else {
        toast.error('공문 등록에 실패했습니다.')
      }
    } catch (e) {
      console.error(e)
      toast.error('서버에 연결할 수 없습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }

  const handleFilesAdd = async (newFiles: File[]) => {
    if (newFiles.length === 0) return

    setIsUploading(true)
    const toastId = toast.loading(`${newFiles.length}개의 파일을 분석 중입니다...`)

    let appendedTitles: string[] = []
    let appendedContent = ''

    for (const file of newFiles) {
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
          parsedMarkdownRef.current[file.name] = mdText;
          appendedContent += `\n\n### 📄 ${file.name}\n${mdText}`
        } else {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve((reader.result as string).split(',')[1] || '')
            reader.onerror = () => reject(new Error('파일 읽기 실패'))
            reader.readAsDataURL(file)
          })
          const res = await (window as any).go.main.App.ConvertToMarkdown(file.name, base64)
          if (res && res.success && res.text) {
            parsedMarkdownRef.current[file.name] = res.text;
            appendedContent += `\n\n### 📄 ${file.name}\n${res.text}`
          }
        }
      } catch (e) {
      }
      appendedTitles.push(file.name.replace(/\.[^/.]+$/, ""))
    }

    setFormTitle(prev => {
      const merged = prev ? `${prev}, ` + appendedTitles.join(', ') : appendedTitles.join(', ')
      return merged.length > 200 ? merged.substring(0, 197) + '...' : merged
    })

    setFormContent(prev => prev + appendedContent)
    setFormFiles(prev => [...prev, ...newFiles])

    toast.success('문서별로 본문 내용 작성이 완료되었습니다.')
    toast.dismiss(toastId)
    setIsUploading(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdd(Array.from(e.dataTransfer.files))
    }
  }

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'confirm': return { bg: '#e0e7ff', color: '#4338ca', label: '열람확인' }
      case 'apply': return { bg: '#dcfce3', color: '#15803d', label: '신청필요' }
      case 'todo': return { bg: '#fef3c7', color: '#b45309', label: '업무이관' }
      default: return { bg: '#f1f5f9', color: '#475569', label: '단순전달' }
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}><i className="fi fi-rr-document" style={{ marginRight: 8 }} />교내 공문 전달망</h3>
        <button onClick={() => setShowModal(true)} style={{ background: '#4f46e5', color: 'white', padding: '8px 16px', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer' }}>
          + 공문 공유
        </button>
      </div>

      <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
        {['', 'simple', 'confirm', 'apply'].map(t => {
          const badgeCount = t === '' ? stationaryCounts.total : stationaryCounts[t as keyof typeof stationaryCounts]
          return (
            <button
              key={t}
              onClick={() => { setFilterType(t); setCurrentPage(1); }}
              style={{
                padding: '6px 12px', borderRadius: 20, border: filterType === t ? '1px solid var(--primary)' : '1px solid var(--border)', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                background: filterType === t ? '#eef2ff' : 'white',
                color: filterType === t ? 'var(--primary)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              {t === '' ? '전체보기' : getTypeStyle(t).label}
              {badgeCount > 0 && filterType !== t && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: 11, padding: '2px 6px', borderRadius: 10 }}>{badgeCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><i className="fi fi-rr-spinner" /> 로딩 중...</div>
      ) : announcements.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'white', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>수신된 공문이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {announcements.slice((currentPage - 1) * 10, currentPage * 10).map(a => {
            const styleInfo = getTypeStyle(a.type)
            return (
              <div key={a.id} style={{ padding: '20px', background: 'white', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {a.is_urgent && <span style={{ background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 'bold' }}>긴급</span>}
                  <span style={{ background: styleInfo.bg, color: styleInfo.color, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 'bold' }}>{styleInfo.label}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{a.title}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, maxHeight: 150, overflowY: 'auto', background: '#f8fafc', padding: '12px 16px', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                  <ReactMarkdown>{a.content}</ReactMarkdown>
                </div>

                {(() => {
                  try {
                    const attachments = JSON.parse(a.attachments_json || '[]')
                    if (attachments.length > 0) {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          {attachments.map((f: any, i: number) => (
                            <a key={i} href={isOfflineMode ? '#' : `${API_BASE}${f.url}`} download={!isOfflineMode ? f.name : undefined} target={!isOfflineMode ? "_blank" : undefined} rel="noreferrer" onClick={(e) => {
                              if (isOfflineMode) {
                                e.preventDefault()
                                if ((window as any).go?.main?.App?.OpenLocalAnnouncementFile) {
                                  (window as any).go.main.App.OpenLocalAnnouncementFile(a.id, f.name).catch((err: any) => toast.error(err))
                                } else {
                                  toast.error('오프라인 환경에서는 첨부파일을 열 수 없거나 동기화 대기 중입니다.')
                                }
                              } else {
                                // Normally markAsRead if you want
                              }
                            }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, textDecoration: 'none', color: '#334155', fontSize: 13, fontWeight: 500, width: 'fit-content', transition: 'background 0.2s', cursor: 'pointer' }}>
                              <i className="fi fi-rr-clip" style={{ color: '#64748b' }} />
                              {f.name}
                              <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 4 }}>({Math.round(f.size / 1024)}KB)</span>
                            </a>
                          ))}
                        </div>
                      )
                    }
                  } catch (e) { }
                  return null
                })()}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {a.type === 'confirm' && a.author_id !== user?.id && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: '6px 12px', background: a.is_confirmed ? '#f0fdf4' : '#f8fafc', border: `1px solid ${a.is_confirmed ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 6, cursor: a.is_confirmed ? 'default' : 'pointer', fontWeight: 600, color: a.is_confirmed ? '#166534' : '#475569', transition: 'all 0.2s', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={a.is_confirmed || false}
                        disabled={a.is_confirmed}
                        onChange={(e) => {
                          if (!a.is_confirmed) {
                            handleConfirm(a.id, e as unknown as React.MouseEvent)
                          }
                        }}
                        style={{ width: 16, height: 16, cursor: a.is_confirmed ? 'default' : 'pointer', accentColor: '#16a34a' }}
                      />
                      {a.is_confirmed ? '확인 완료' : '확인하기'}
                    </label>
                  )}
                  {a.author_id === user?.id && (
                    <>
                      <button onClick={(e) => handleViewStatus(a, e)} className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 6, fontSize: 13, margin: 0 }}>
                        <i className="fi fi-rr-eye" style={{ marginRight: 6 }} />열람 현황 보기
                      </button>
                      <button onClick={(e) => handleDeleteAnnouncement(a.id, e)} className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 6, fontSize: 13, margin: 0, color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2' }}>
                        <i className="fi fi-rr-trash" style={{ marginRight: 6 }} />삭제
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {Math.ceil(announcements.length / 10) > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24, marginBottom: 24 }}>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}>이전</button>
              {Array.from({ length: Math.ceil(announcements.length / 10) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: currentPage === i + 1 ? '1px solid var(--accent-blue, #3b82f6)' : '1px solid var(--border)',
                    background: currentPage === i + 1 ? 'var(--accent-blue, #3b82f6)' : 'white',
                    color: currentPage === i + 1 ? 'white' : 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  {i + 1}
                </button>
              ))}
              <button disabled={currentPage === Math.ceil(announcements.length / 10)} onClick={() => setCurrentPage(p => Math.min(Math.ceil(announcements.length / 10), p + 1))} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', cursor: currentPage === Math.ceil(announcements.length / 10) ? 'not-allowed' : 'pointer', opacity: currentPage === Math.ceil(announcements.length / 10) ? 0.5 : 1 }}>다음</button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 20
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'slideUp 0.3s ease-out' }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 10, color: '#0f172a' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fi fi-rr-share" style={{ transform: 'translateY(1px)' }} />
              </div>
              새 공문 공유
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 10 }}>공문 형식</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 15, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', outline: 'none', cursor: 'pointer', appearance: 'none' }}
                >
                  <option value="simple">단순전달 — 회신이나 확인 불필요</option>
                  <option value="confirm">열람확인 — 수신자의 읽음 확인 필요</option>
                  <option value="apply">신청필요 — 수신자의 추가 동작 필요</option>
                </select>
                {formType === 'confirm' && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>열람 확인 대상 <span style={{ color: '#ef4444' }}>*</span></label>
                      <button type="button" onClick={() => setShowTargetModal(true)} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.borderColor = 'var(--primary)'} onMouseOut={e => e.currentTarget.style.borderColor = '#cbd5e1'}>
                        <i className="fi fi-rr-list-tree" style={{ marginRight: 4 }} /> 대상 상세 설정하기
                      </button>
                    </div>
                    <div style={{ padding: '12px', borderRadius: 10, background: 'white', border: '1px solid #cbd5e1', minHeight: 44, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {formTargets.includes('TEACHER') && formTargets.length === 1 ? (
                        <span style={{ fontSize: 13, padding: '4px 10px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 16, border: '1px solid #c7d2fe', fontWeight: 600 }}>교직원 전체</span>
                      ) : formTargets.includes('ALL') ? (
                        <span style={{ fontSize: 13, padding: '4px 10px', background: '#f1f5f9', color: '#475569', borderRadius: 16, border: '1px solid #e2e8f0', fontWeight: 600 }}>전체 (교직원·학생·학부모)</span>
                      ) : formTargets.map(t => {
                        let text = t
                        if (t === 'STUDENT') text = '학생 전체'
                        else if (t.startsWith('STUDENT_')) { const p = t.split('_'); text = p.length === 2 ? `학생 ${p[1]}학년` : `학생 ${p[1]}학년 ${p[2]}반` }
                        else if (t === 'TEACHER') text = '교직원 전체'
                        else if (t.startsWith('TEACHER_')) { text = `교직원 ${t.replace('TEACHER_', '')}` }
                        else if (t === 'PARENT') text = '학부모 전체'
                        else if (t.startsWith('PARENT_')) { const p = t.split('_'); text = p.length === 2 ? `학부모 ${p[1]}학년` : `학부모 ${p[1]}학년 ${p[2]}반` }
                        else if (t.startsWith('USER_')) { const u = allUsers.find(x => x.id === t.replace('USER_', '')); text = u ? `${u.name}` : '개별 사용자' }
                        return <span key={t} style={{ fontSize: 13, padding: '4px 10px', background: '#e0e7ff', color: '#4f46e5', borderRadius: 16, border: '1px solid #c7d2fe', fontWeight: 600 }}>{text} <i className="fi fi-rr-cross-small" style={{ marginLeft: 4, cursor: 'pointer' }} onClick={() => {
                          const newTargets = formTargets.filter(x => x !== t);
                          setFormTargets(newTargets.length === 0 ? ['ALL'] : newTargets)
                        }} /></span>
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 10 }}>제목</label>
                <input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="공문 제목을 명확하게 입력하세요"
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 15, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', outline: 'none' }}
                  autoFocus
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>상세 내용 (Markdown 지원)</label>
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 4 }}>
                    <button type="button" onClick={() => setShowPreview(false)} style={{ padding: '4px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: !showPreview ? 'white' : 'transparent', color: !showPreview ? '#0f172a' : '#64748b', boxShadow: !showPreview ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s' }}>편집</button>
                    <button type="button" onClick={() => setShowPreview(true)} style={{ padding: '4px 12px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer', background: showPreview ? 'white' : 'transparent', color: showPreview ? '#0f172a' : '#64748b', boxShadow: showPreview ? '0 1px 2px rgba(0,0,0,0.05)' : 'none', transition: 'all 0.2s' }}>미리보기</button>
                  </div>
                </div>
                {!showPreview ? (
                  <textarea
                    rows={8}
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    placeholder="파일을 첨부하면 내용이 자동으로 요약/추출되어 채워집니다. 마크다운(Markdown) 문법을 지원합니다."
                    style={{ width: '100%', padding: '16px', borderRadius: 12, border: '1px solid #cbd5e1', fontSize: 15, lineHeight: 1.6, color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }}
                  />
                ) : (
                  <div style={{ width: '100%', padding: '16px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', overflowY: 'auto', minHeight: 180, maxHeight: 400, fontSize: 14, color: '#334155', lineHeight: 1.6, boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)', boxSizing: 'border-box' }}>
                    {formContent ? <ReactMarkdown>{formContent}</ReactMarkdown> : <span style={{ color: '#94a3b8' }}>작성된 내용이 없습니다.</span>}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 12 }}>
                  <span>첨부파일 (선택)</span>
                </label>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {formFiles.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', border: isDragOver ? '2px dashed var(--accent-blue)' : '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                      {formFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'white', borderRadius: 8, border: '1px solid #f1f5f9', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#334155' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: '#eff6ff', color: '#3b82f6' }}>
                              <i className="fi fi-rr-file-alt" />
                            </div>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px', fontWeight: 500 }}>{f.name}</span>
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>({Math.round(f.size / 1024)}KB)</span>
                          </div>
                          <button type="button" onClick={() => setFormFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>
                            <i className="fi fi-rr-cross-circle" style={{ transform: 'translateY(1px)' }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label style={{ cursor: 'pointer', padding: formFiles.length > 0 ? '12px 0' : '24px 0', border: isDragOver ? '2px dashed var(--accent-blue)' : '2px dashed #cbd5e1', borderRadius: 12, textAlign: 'center', color: isDragOver ? 'var(--accent-blue)' : '#94a3b8', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: isDragOver ? '#eff6ff' : 'transparent', transition: 'all 0.2s' }} onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.color = 'var(--accent-blue)' }} onMouseOut={e => { e.currentTarget.style.borderColor = isDragOver ? 'var(--accent-blue)' : '#cbd5e1'; e.currentTarget.style.color = isDragOver ? 'var(--accent-blue)' : '#94a3b8' }}>
                    <i className="fi fi-rr-cloud-upload-alt" style={{ fontSize: formFiles.length > 0 ? 20 : 24 }} />
                    {formFiles.length > 0 ? '추가 파일을 선택하거나 드래그 앤 드롭하세요' : '파일을 선택하거나 드래그 앤 드롭하세요'}
                    <input
                      type="file" multiple style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files) {
                          handleFilesAdd(Array.from(e.target.files))
                        }
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8, borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
                <button type="button" disabled={isUploading} onClick={() => { setShowModal(false); setFormTitle(''); setFormContent(''); setFormType('simple'); setFormFiles([]); parsedMarkdownRef.current = {}; setFormTargets(['TEACHER']); setShowPreview(false); }} style={{ padding: '12px 24px', fontSize: 15, borderRadius: 10, border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: 600, cursor: 'pointer', opacity: isUploading ? 0.5 : 1 }}>취소</button>
                <button type="button" disabled={isUploading} onClick={handleCreate} style={{ padding: '12px 24px', fontSize: 15, borderRadius: 10, border: 'none', background: 'var(--accent-blue)', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isUploading ? 0.5 : 1 }}>
                  {isUploading ? <i className="fi fi-rr-spinner" style={{ animation: 'spin 1s linear infinite' }} /> : <i className="fi fi-rr-paper-plane" style={{ transform: 'translateY(1px)' }} />} {isUploading ? '전송 중...' : '공문 전달하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TargetTreeModal
        isOpen={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        allUsers={allUsers}
        currentTargets={formTargets}
        onlyTeachers={formType === 'confirm'}
        onApply={(newTargets) => {
          setFormTargets(newTargets)
          setShowTargetModal(false)
        }}
      />

      {showStatusModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, padding: 20
        }}>
          <div style={{ background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', animation: 'slideUp 0.3s ease-out', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>열람 및 확인 현황</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeStatusDoc?.title}</span> 공문의 열람 현황입니다.
            </p>

            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-around', border: '1px solid #e2e8f0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>열람 인원</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)' }}>{statusData ? statusData.total_read : '-'}명</div>
              </div>
              {activeStatusDoc?.type === 'confirm' && (
                <>
                  <div style={{ width: 1, background: '#cbd5e1' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>확인 완료</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{statusData ? statusData.confirmed : '-'}명</div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
              {statusData ? (
                statusData.readers.length > 0 ? (
                  statusData.readers.map((r: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                          {r.user?.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{r.user?.name || '알 수 없음'}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(r.read_at).toLocaleString()}</div>
                        </div>
                      </div>
                      {activeStatusDoc?.type === 'confirm' && (
                        <div>
                          {r.is_confirmed ? (
                            <span style={{ fontSize: 12, background: '#dcfce3', color: '#15803d', padding: '4px 8px', borderRadius: 20, fontWeight: 600 }}>확인 완료</span>
                          ) : (
                            <span style={{ fontSize: 12, background: '#f1f5f9', color: '#64748b', padding: '4px 8px', borderRadius: 20, fontWeight: 600 }}>미확인</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 14 }}>아직 문서를 열람한 사람이 없습니다.</div>
                )
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 14 }}><i className="fi fi-rr-spinner" style={{ animation: 'spin 1s linear infinite' }} /> 정보 불러오는 중...</div>
              )}
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowStatusModal(false)} className="btn-secondary" style={{ padding: '10px 24px' }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
