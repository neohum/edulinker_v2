const fs = require('fs');
const path = 'e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const missingBlock = `
interface SendocPageProps {
  user: UserInfo
}

export default function SendocPage({ user }: SendocPageProps) {
  const isTeacher = user.role === 'teacher' || user.role === 'admin'


  // Unified Search & Dual Pagination States
  const [searchQuery, setSearchQuery] = useState('')
  const [sentPage, setSentPage] = useState(1)
  const [receivedPage, setReceivedPage] = useState(1)
  const [draftsPage, setDraftsPage] = useState(1)
  const ITEMS_PER_PAGE = 8

  // View Modes: list -> selector -> designer -> signer/viewer
  const [viewMode, setViewMode] = useState<'list' | 'selector' | 'designer' | 'signer' | 'viewer'>('list')

  // Designer States
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [activeDoc, setActiveDoc] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [serverBgUrl, setServerBgUrl] = useState<string | null>(null)
  const [fields, setFields] = useState<DocField[]>([])
  const [resultViewerData, setResultViewerData] = useState<{ doc: Sendoc, fields: DocField[], bgUrl: string, bulkMode?: boolean, bulkRecipients?: { recipient: RecipientStatus, fields: DocField[] }[] } | null>(null)

  // File Selector States (from HwpConverterPage)
  const [isDragging, setIsDragging] = useState(false)
  const [pageImages, setPageImages] = useState<string[]>([])   // base64 per page
  const [currentPageIdx, setCurrentPageIdx] = useState(0)      // which page is shown
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Status/Recipient states
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [recipients, setRecipients] = useState<RecipientStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string, onConfirm: () => void } | null>(null)
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)

  // Signature states
  const [activeSignField, setActiveSignField] = useState<string | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingField = useRef(false)
  const [draftCanvasData, setDraftCanvasData] = useState<string | null>(null)

  // Zoom & Full Canvas Drawing
  const [zoom, setZoom] = useState(1)
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const fullCanvasRef = useRef<HTMLCanvasElement>(null)
  const isFullDrawingRef = useRef(false)
  const [penSize, setPenSize] = useState(3)
  const [isEraser, setIsEraser] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const currentStrokeRef = useRef<Stroke | null>(null)
  const totalDrawnRef = useRef(0)
  const [activeCharPicker, setActiveCharPicker] = useState<string | null>(null)
  const specialChars = ['✓', 'O', 'X', '※', '★', '☆', '■', '□', '●']

  // Draft Feedback State
  const [isDraftSaved, setIsDraftSaved] = useState(false)
  const [strokeRedrawTrigger, setStrokeRedrawTrigger] = useState(0)

  const { docs, pendingDocs, allUsers, loading, setLoading, fetchDocs, fetchPendingDocs } = useSendocAPI(isTeacher)
  const { selectedFile, setSelectedFile, isConverting, convertProgress, hancom, excelStatus, handleFileSelect, handleProcessDocument } = useDocumentUpload({
    setPageImages, setCurrentPageIdx, setBackgroundUrl, setServerBgUrl, setStrokes, setViewMode, fullCanvasRef, title, setTitle
  })

  // Document Panning
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

`;

// Insert the missing block right before 'const handlePanStart'
const target = 'const handlePanStart = (e: React.MouseEvent) => {';
const index = content.indexOf(target);
if (index !== -1) {
  content = content.substring(0, index) + missingBlock + content.substring(index);
  // also add back } at the end
  content += "\\n}\\n";
  fs.writeFileSync(path, content);
  console.log('Restored the deleted block.');
} else {
  console.error('Target not found!');
}
