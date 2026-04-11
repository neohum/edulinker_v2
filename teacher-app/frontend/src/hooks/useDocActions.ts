import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '../api'

export function useDocActions({
  isTeacher,
  title,
  selectedUsers,
  strokes,
  fields,
  isMergeSignatures,
  pageImagesLength,
  serverBgUrl,
  backgroundUrl,
  activeDoc,
  editingDraftId,
  fullCanvasRef,
  setEditingDraftId,
  setStrokeRedrawTrigger,
  setHasUnsavedChanges,
  setStrokes,
  setViewMode,
  setShowRecipientModal,
  fetchLocalDrafts,
  fetchDocs,
  fetchPendingDocs,
  setConfirmDialog
}: any) {
  const [isSending, setIsSending] = useState(false)

  const handleSend = (isDraft: boolean = false, shouldExit: boolean = false) => {
    if (!title.trim()) return toast.error('제목을 입력하세요.')
    if (!isDraft && selectedUsers.length === 0) return toast.error('수신자를 선택하세요.')

    let sigData = ''
    if (fullCanvasRef?.current && strokes.length > 0) {
      sigData = JSON.stringify(strokes)
    }

    if (!isDraft) {
      toast.info('문서를 서버로 전송하고 있습니다...')
      setViewMode('list')
      setShowRecipientModal(false)
      setIsSending(true)
    } else {
      if (!shouldExit) toast.info('문서를 임시저장하고 있습니다...')
      setIsSending(true)
    }

    const sendData = async () => {
      try {
        let finalFields = [...fields];
        finalFields.push({
          id: 'META_OPTIONS', type: 'text', x: -100, y: -100, width: 0, height: 0, label: 'META_OPTIONS',
          value: JSON.stringify({ mergeSignatures: isMergeSignatures })
        } as any);

        if (sigData !== '') {
          finalFields.push({
            id: 'teacher_canvas_overlay',
            type: 'signature', x: 0, y: 0, width: 800, height: 1131 * Math.max(1, pageImagesLength),
            label: '선생님 펜선', signatureData: sigData
          } as any);
        }

        const wailsApp = (window as any).go?.main?.App;

        if (isDraft && isTeacher && wailsApp?.SaveLocalSendocDraft) {
          let b64Arr: string[] = [];
          const bgUrlForBlob = serverBgUrl || backgroundUrl || '';
          if (bgUrlForBlob.startsWith('[')) {
            try {
              const arr = JSON.parse(bgUrlForBlob);
              b64Arr = arr.map((s: string) => s.replace(/^data:image\/[^;]+;base64,/, ''));
            } catch { }
          } else if (bgUrlForBlob.startsWith('data:image')) {
            b64Arr = [bgUrlForBlob.replace(/^data:image\/[^;]+;base64,/, '')];
          }

          try {
            const fileName = activeDoc?.original_file_name || '(제목 없음)';
            const newId = await wailsApp.SaveLocalSendocDraft(editingDraftId || '', title, JSON.stringify(finalFields), JSON.stringify(strokes), JSON.stringify(selectedUsers), fileName, b64Arr);
            setEditingDraftId(newId);
            setStrokeRedrawTrigger((n: number) => n + 1)
            if (!shouldExit) toast.success('로컬 보관함에 안전하게 임시저장되었습니다.');
            setIsSending(false);
            fetchLocalDrafts();
            setHasUnsavedChanges(false);
            if (shouldExit) {
              setStrokes([]); setEditingDraftId(null); fullCanvasRef?.current?.getContext('2d')?.clearRect(0, 0, 1600, 2262 * 10); setViewMode('list');
            }
            return;
          } catch (err: any) {
            setIsSending(false);
            return toast.error('로컬 임시저장 실패: ' + err.message);
          }
        }

        let bgUrlForPayload = serverBgUrl || backgroundUrl || '';

        const payload = {
          title,
          content: 'Doc',
          background_url: bgUrlForPayload,
          fields_json: JSON.stringify(finalFields),
          requires_signature: finalFields.some(f => f.type === 'signature' && !f.id.includes('canvas_overlay')),
          target_user_ids: selectedUsers,
          is_draft: isDraft
        }

        const res = await apiFetch('/api/plugins/sendoc', {
          method: 'POST',
          body: JSON.stringify(payload)
        })

        if (res.ok) {
          if (!isDraft && wailsApp?.DeleteLocalSendocDraft && editingDraftId) {
            try { await wailsApp.DeleteLocalSendocDraft(editingDraftId); } catch { }
            setEditingDraftId(null);
            fetchLocalDrafts();
          }

          toast.success(`'${title}' 문서 발송이 완료되었습니다!`)
          setEditingDraftId(null)
          fetchDocs()
          fetchPendingDocs()
          window.dispatchEvent(new Event('sendoc_updated'))
        } else {
          const errorData = await res.json().catch(() => ({}))
          toast.error(`'${title}' 처리 실패: ` + (errorData.error || res.statusText))
        }
      } catch (e: any) {
        toast.error(`'${title}' 오류: ` + (e.message || '알 수 없는 오류'))
      } finally {
        setIsSending(false)
      }
    }
    sendData()
  }

  const handleSubmitSignature = async () => {
    if (!activeDoc) return

    let capturedSig = ''
    if (fullCanvasRef?.current && strokes.length > 0) {
      capturedSig = JSON.stringify(strokes)
    }

    setConfirmDialog({
      message: '다시 수정할 수 없습니다. 신중하게 확인 후 제출해주세요.',
      onConfirm: async () => {
        try {
          let sigData = capturedSig
          let finalFields = [...fields];
          if (sigData !== '') {
            finalFields.push({
              id: 'full_canvas_overlay',
              type: 'signature', x: 0, y: 0, width: 800, height: 1131 * Math.max(1, pageImagesLength),
              label: '전체 화면 펜선', signatureData: sigData
            } as any);
          } else {
            sigData = fields.find((f: any) => f.type === 'signature')?.signatureData || ''
          }

          const res = await apiFetch(`/api/plugins/sendoc/sign/${activeDoc.id}/submit`, {
            method: 'POST',
            body: JSON.stringify({ signature_image_url: sigData, form_data_json: JSON.stringify(finalFields) })
          })
          if (res.ok) {
            const wailsApp = (window as any).go?.main?.App
            if (isTeacher && wailsApp?.DeleteSendocDraft) {
              wailsApp.DeleteSendocDraft(activeDoc.id).catch(() => { })
              if ((window as any).__sendocDraftCache) delete (window as any).__sendocDraftCache[activeDoc.id]
            } else {
              localStorage.removeItem(`sendoc_draft_${activeDoc.id}`)
            }
            toast.success('제출 완료!'); setViewMode('list'); fetchPendingDocs()
          } else {
            const errorData = await res.json().catch(() => ({}));
            toast.error('제출 실패: ' + (errorData.error || res.statusText));
          }
        } catch (e: any) {
          toast.error('제출 중 오류 발생: ' + (e.message || '알 수 없는 오류'))
        }
      }
    });
  }

  const handleDeleteDoc = async (id: string, forTeacher: boolean, isLocal: boolean = false) => {
    setConfirmDialog({
      message: '정말 이 문서를 삭제하시겠습니까?',
      onConfirm: async () => {
        try {
          if (isLocal && forTeacher && (window as any).go?.main?.App?.DeleteLocalSendocDraft) {
            await (window as any).go.main.App.DeleteLocalSendocDraft(id);
            toast.success('로컬 보관함에서 삭제되었습니다.');
            fetchLocalDrafts();
            return;
          }

          const endpoint = forTeacher ? `/api/plugins/sendoc/${id}` : `/api/plugins/sendoc/sign/${id}`
          const res = await apiFetch(endpoint, { method: 'DELETE' })
          if (res.ok) {
            toast.success('삭제되었습니다.')
            fetchDocs()
            fetchPendingDocs()
            fetchLocalDrafts()
          } else {
            toast.error('삭제 실패')
          }
        } catch {
          toast.error('삭제 중 오류 발생')
        }
      }
    });
  }

  const handleRecallDoc = async (doc: any) => {
    setConfirmDialog({
      message: '문서를 회수하시겠습니까? 수신자가 더 이상 서명할 수 없게 되며, 초기 상태로 발송 전 문서에 보관됩니다.',
      onConfirm: async () => {
        try {
          const res = await apiFetch(`/api/plugins/sendoc/${doc.id}/recall`, { method: 'PUT' })
          if (res.ok) {
            try {
              const fetchRes = await apiFetch(`/api/plugins/sendoc/${doc.id}`)
              if (fetchRes.ok) {
                const data = await fetchRes.json()
                const parsedFields = JSON.parse(data.fields_json || '[]').map((f: any) => {
                  const nf = { ...f };
                  delete nf.signatureData;
                  return nf;
                })
                const wailsApp = (window as any).go?.main?.App;
                if (isTeacher && wailsApp?.SaveLocalSendocDraft) {
                  let b64Arr: string[] = [];
                  const bgUrlForBlob = data.background_url || '';
                  if (bgUrlForBlob.startsWith('[')) {
                    try {
                      const arr = JSON.parse(bgUrlForBlob);
                      b64Arr = arr.map((s: string) => s.replace(/^data:image\/[^;]+;base64,/, ''));
                    } catch { }
                  } else if (bgUrlForBlob.startsWith('data:image')) {
                    b64Arr = [bgUrlForBlob.replace(/^data:image\/[^;]+;base64,/, '')];
                  }
                  await wailsApp.SaveLocalSendocDraft(
                    '', data.title, JSON.stringify(parsedFields), '[]', '[]', data.title, b64Arr
                  );
                }
              }
            } catch (e) {
              console.error('Failed to copy recalled doc to local drafts', e)
            }
            toast.success('문서가 회수되었으며 발송 전 문서로 이동되었습니다.')
            fetchDocs()
            fetchPendingDocs()
            fetchLocalDrafts()
            window.scrollTo(0, 0)
          } else {
            const errorData = await res.json().catch(() => ({}));
            toast.error('회수 실패: ' + (errorData.error || '이미 회수된 문서일 수 있습니다.'))
          }
        } catch {
          toast.error('회수 중 오류 발생')
        }
      }
    });
  }

  const handleResendDoc = async (doc: any) => {
    toast.info('문서를 임시저장함으로 복사하는 중...')
    try {
      const res = await apiFetch(`/api/plugins/sendoc/${doc.id}`)
      if (!res.ok) throw new Error()
      const data = await res.json()

      const now = new Date()
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
      const cleanTitle = data.title.replace(/\s*\(\d{4}\.\d{2}\.\d{2} 발송\)$/, '').replace(/\s*\(복사본\)$/, '')
      const newTitle = `${cleanTitle} (${dateStr} 발송)`

      const parsedFields = JSON.parse(data.fields_json || '[]').map((f: any) => {
        const nf = { ...f };
        delete nf.signatureData;
        return nf;
      })

      const wailsApp = (window as any).go?.main?.App;
      if (isTeacher && wailsApp?.SaveLocalSendocDraft) {
        let b64Arr: string[] = [];
        const bgUrlForBlob = data.background_url || '';
        if (bgUrlForBlob.startsWith('[')) {
          try {
            const arr = JSON.parse(bgUrlForBlob);
            b64Arr = arr.map((s: string) => s.replace(/^data:image\/[^;]+;base64,/, ''));
          } catch { }
        } else if (bgUrlForBlob.startsWith('data:image')) {
          b64Arr = [bgUrlForBlob.replace(/^data:image\/[^;]+;base64,/, '')];
        }

        try {
          await wailsApp.SaveLocalSendocDraft(
            '', newTitle, JSON.stringify(parsedFields), '[]', '[]', data.title, b64Arr
          );
          toast.success(`'${newTitle}' 문서가 발송 전 문서(로컬 임시보관함)에 복사되었습니다!`);
          fetchDocs(); fetchPendingDocs(); fetchLocalDrafts(); window.scrollTo(0, 0);
        } catch {
          toast.error('로컬 보관함에 복사본을 저장하지 못했습니다.');
        }
      } else {
        const payload = {
          title: newTitle, content: data.content || 'Doc', background_url: data.background_url || '',
          fields_json: JSON.stringify(parsedFields),
          requires_signature: parsedFields.some((f: any) => f.type === 'signature' && !f.id.includes('canvas_overlay')),
          target_user_ids: [], is_draft: true
        }

        const postRes = await apiFetch('/api/plugins/sendoc', { method: 'POST', body: JSON.stringify(payload) })

        if (postRes.ok) {
          toast.success(`'${newTitle}' 문서가 발송 전 문서에 복사되었습니다!`)
          fetchDocs(); fetchPendingDocs(); fetchLocalDrafts(); window.scrollTo(0, 0)
        } else {
          toast.error('복사본을 저장하지 못했습니다.')
        }
      }
    } catch {
      toast.error('문서 정보를 불러오지 못했습니다.')
    }
  }

  return {
    isSending,
    handleSend,
    handleSubmitSignature,
    handleDeleteDoc,
    handleRecallDoc,
    handleResendDoc
  }
}
