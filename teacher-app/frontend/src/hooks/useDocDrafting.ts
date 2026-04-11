import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

interface UseDocDraftingProps {
  isTeacher: boolean;
  activeDoc: any;
  viewMode: string;
  fields: any[];
  strokes: any[];
  setTitle: (t: string) => void;
  setEditingDraftId: (id: string | null) => void;
  setIsMergeSignatures: (v: boolean) => void;
  setFields: (f: any[]) => void;
  setStrokes: (s: any[]) => void;
  setSelectedUsers: (u: string[]) => void;
  setPageImages: (p: string[]) => void;
  setBackgroundUrl: (u: string | null) => void;
  setServerBgUrl: (u: string | null) => void;
  setActiveDoc: (d: any) => void;
  setViewMode: (v: any) => void;
  setStrokeRedrawTrigger: React.Dispatch<React.SetStateAction<number>>;
}

export function useDocDrafting({
  isTeacher,
  activeDoc,
  viewMode,
  fields,
  strokes,
  setTitle,
  setEditingDraftId,
  setIsMergeSignatures,
  setFields,
  setStrokes,
  setSelectedUsers,
  setPageImages,
  setBackgroundUrl,
  setServerBgUrl,
  setActiveDoc,
  setViewMode,
  setStrokeRedrawTrigger
}: UseDocDraftingProps) {
  const [localDrafts, setLocalDrafts] = useState<any[]>([])
  const [isDraftSaved, setIsDraftSaved] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Track Unsaved
  useEffect(() => {
    if (viewMode === 'designer' || viewMode === 'signer') {
      setHasUnsavedChanges(true)
    }
  }, [fields, strokes, viewMode])

  const fetchLocalDrafts = useCallback(async () => {
    if (!isTeacher) return;
    const wailsApp = (window as any).go?.main?.App;
    if (wailsApp?.GetLocalSendocDrafts) {
      try {
        const arr = await wailsApp.GetLocalSendocDrafts();
        setLocalDrafts((arr || []).map((d: any) => ({ ...d, status: 'draft', id: d.id, title: d.title, created_at: d.updated_at })));
      } catch { }
    }
  }, [isTeacher]);

  useEffect(() => {
    fetchLocalDrafts();
  }, [fetchLocalDrafts]);

  const handleSaveDraft = async (isAuto = false) => {
    if (!activeDoc || viewMode !== 'signer') return
    try {
      const wailsApp = (window as any).go?.main?.App
      if (isTeacher && wailsApp?.SaveSendocDraft) {
        await wailsApp.SaveSendocDraft(
          activeDoc.id,
          JSON.stringify(fields),
          JSON.stringify(strokes)
        );
      } else {
        localStorage.setItem(`sendoc_draft_${activeDoc.id}`, JSON.stringify({ fields, strokes }))
      }
      setIsDraftSaved(true)
      setHasUnsavedChanges(false)
      setStrokeRedrawTrigger((n: number) => n + 1)
      setTimeout(() => { setIsDraftSaved(false); setStrokeRedrawTrigger((n: number) => n + 1) }, 2000)

      if (isTeacher) {
        (window as any).__sendocDraftCache = { ...((window as any).__sendocDraftCache || {}), [activeDoc.id]: true }
      }
      if (!isAuto) toast.success(`임시 저장이 완료되었습니다. (선 ${strokes.length}개)`)
    } catch {
      toast.error('임시 저장에 실패했습니다.')
    }
  }

  const resumeDraft = async (d: any) => {
    const wailsApp = (window as any).go?.main?.App;
    if (!wailsApp?.GetLocalSendocDraft) return toast.error('로컬 기능을 지원하지 않습니다.');

    try {
      const meta = await wailsApp.GetLocalSendocDraft(d.id);
      setTitle(meta.title || '(제목 없음)');
      setEditingDraftId(meta.id);

      try {
        const parsedFields = JSON.parse(meta.fields_json || '[]');
        const metaField = parsedFields.find((f: any) => f.id === 'META_OPTIONS');
        if (metaField) {
          const opts = JSON.parse(metaField.value || '{}');
          setIsMergeSignatures(opts.mergeSignatures === true);
        } else {
          setIsMergeSignatures(false);
        }
        setFields(parsedFields.filter((f: any) => f.id !== 'META_OPTIONS'));
        setStrokes(JSON.parse(meta.strokes_json || '[]'));
        setSelectedUsers(JSON.parse(meta.target_users_json || '[]'));
      } catch { }

      if (meta.page_images_base64 && meta.page_images_base64.length > 0) {
        const base64s = meta.page_images_base64;
        const sessionId = `draft_${meta.id}_${Date.now()}`;

        if (wailsApp.SaveConvertedPage) {
          if (wailsApp.ClearConvertedPages) {
            try { await wailsApp.ClearConvertedPages('prev'); } catch { }
          }
          for (let i = 0; i < base64s.length; i++) {
            await wailsApp.SaveConvertedPage(sessionId, i, base64s[i]);
          }
          const uris = base64s.map((_: any, i: number) => `sqlite:${sessionId}:${i}`);
          setPageImages(uris);
          setBackgroundUrl(uris[0]);
        } else {
          const uris = base64s.map((b: string) => `data:image/webp;base64,${b}`);
          setPageImages(uris);
          setBackgroundUrl(uris[0]);
        }

        const serverJsonBg = base64s.map((b: string) => `data:image/webp;base64,${b}`);
        setServerBgUrl(JSON.stringify(serverJsonBg));
      } else {
        setPageImages([]);
      }

      setActiveDoc(d);
      setViewMode('designer');
    } catch (e) {
      toast.error('로컬 임시저장 문서를 불러올 수 없습니다.');
    }
  }

  return {
    localDrafts,
    isDraftSaved,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    fetchLocalDrafts,
    handleSaveDraft,
    resumeDraft
  }
}
