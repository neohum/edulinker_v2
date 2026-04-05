const fs = require('fs');
const path = 'e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. We will insert the hooks just above useEffect
const hookCalls = `
  const { docs, pendingDocs, allUsers, loading, setLoading, fetchDocs, fetchPendingDocs } = useSendocAPI(isTeacher)
  const { selectedFile, setSelectedFile, isConverting, convertProgress, hancom, excelStatus, handleFileSelect, handleProcessDocument } = useDocumentUpload({
    setPageImages, setCurrentPageIdx, setBackgroundUrl, setServerBgUrl, setStrokes, setViewMode, fullCanvasRef, title, setTitle
  })
`;
content = content.replace(/\/\/ Status\/Recipient states/, hookCalls + '\n  // Status/Recipient states');

// 2. We remove the original useState declarations
content = content.replace(/  const \[docs, setDocs\] = useState<Sendoc\[\]>\(\[\]\)\r?\n/, '');
content = content.replace(/  const \[pendingDocs, setPendingDocs\] = useState<PendingDoc\[\]>\(\[\]\)\r?\n/, '');
content = content.replace(/  const \[loading, setLoading\] = useState\(true\)\r?\n/, '');
content = content.replace(/  const \[selectedFile, setSelectedFile\] = useState<File \| null>\(null\)\r?\n/, '');
content = content.replace(/  const \[isConverting, setIsConverting\] = useState\(false\)\r?\n/, '');
content = content.replace(/  const \[convertProgress, setConvertProgress\] = useState\(''\)\r?\n/, '');
content = content.replace(/  const \[hancom, setHancom\] = useState<any>\(null\)\r?\n/, '');
content = content.replace(/  const \[excelStatus, setExcelStatus\] = useState<any>\(null\)\r?\n/, '');
content = content.replace(/  const \[allUsers, setAllUsers\] = useState<any\[\]>\(\[\]\)\r?\n/, '');
// try more loose matching for hancom/excel array types if they had types
content = content.replace(/  const \[hancom, setHancom\] = useState<[^>]+>\(null\)\r?\n/, '');
content = content.replace(/  const \[excelStatus, setExcelStatus\] = useState<[^>]+>\(null\)\r?\n/, '');

// 3. Remove useEffect hook that triggers fetches
content = content.replace(/  useEffect\(\(\) => \{\r?\n    if \(isTeacher\) fetchDocs\(\)\r?\n    fetchPendingDocs\(\)\r?\n    fetchUsers\(\)\r?\n    checkHancom\(\)\r?\n    checkExcel\(\)\r?\n  \}, \[\]\)\r?\n/, '');

// 4. Remove fetch functions
const f1 = `  const checkHancom = async () => {\n    try {\n      const wailsApp = (window as any).go?.main?.App\n      if (wailsApp?.CheckHancom) setHancom(await wailsApp.CheckHancom())\n    } catch { }\n  }\n`;
content = content.replace(f1, '');
const f2 = `  const checkExcel = async () => {\n    try {\n      const wailsApp = (window as any).go?.main?.App\n      if (wailsApp?.CheckExcel) setExcelStatus(await wailsApp.CheckExcel())\n    } catch { }\n  }\n`;
content = content.replace(f2, '');
const f3 = `  const fetchDocs = async () => {\n    try {\n      const res = await apiFetch('/api/plugins/sendoc')\n      if (res.ok) setDocs(await res.json() || [])\n    } catch (e) { console.error(e) } finally { setLoading(false) }\n  }\n`;
content = content.replace(f3, '');

// Fetch Pending Docs is multi-line, let's use indexOf
const fetchPendStart = content.indexOf('  const fetchPendingDocs = async () => {');
const fetchPendEnd = content.indexOf('  // Hydrate draft cache', fetchPendStart);
if (fetchPendStart !== -1 && fetchPendEnd !== -1) {
  content = content.substring(0, fetchPendStart) + content.substring(fetchPendEnd);
}

const fetchUsersStart = content.indexOf('  const fetchUsers = async () => {');
const fetchUsersEnd = content.indexOf('  const fetchStatus = async', fetchUsersStart);
if (fetchUsersStart !== -1 && fetchUsersEnd !== -1) {
  content = content.substring(0, fetchUsersStart) + content.substring(fetchUsersEnd);
}

// 5. Remove handleFileSelect and handleProcessDocument completely.
const fileSelectStart = content.indexOf('  // --- File Selection Logic ---');
const fileSelectEnd = content.indexOf('  // --- Designer/Signer Tools ---', fileSelectStart);
if (fileSelectStart !== -1 && fileSelectEnd !== -1) {
  content = content.substring(0, fileSelectStart) + content.substring(fileSelectEnd);
}

fs.writeFileSync(path, content);
console.log('Script 2 completed.');
