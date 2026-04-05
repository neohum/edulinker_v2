const fs = require('fs');
const path = 'e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add new Imports
const newImports = `import { useSendocAPI } from '../hooks/useSendocAPI'
import { useDocumentUpload } from '../hooks/useDocumentUpload'
import { SendocDesignerCanvas } from '../components/sendoc/SendocDesignerCanvas'
import { SendocRecipientModal } from '../components/sendoc/SendocRecipientModal'
import { SendocResultViewer } from '../components/sendoc/SendocResultViewer'
import type { DocField, Stroke, Sendoc, PendingDoc, RecipientStatus, Point } from '../types/sendoc'
`;
content = content.replace(/import \* as pdfjsLib from 'pdfjs-dist'/, newImports + "import * as pdfjsLib from 'pdfjs-dist'");

// 2. Remove Interfaces and VectorSignatureCanvas
content = content.replace(/interface Sendoc \{[\s\S]*?const VectorSignatureCanvas = \(\{[\s\S]*?<\/canvas>\r?\n\}/, '');

// 3. Replace RecipientModal JSX
content = content.replace(/\{\s*showRecipientModal\s*&&\s*\(\(\)\s*=>\s*\{[\s\S]*?\}\)\(\)\s*\}/,
  `{showRecipientModal && (
  <SendocRecipientModal
    allUsers={allUsers}
    selectedUsers={selectedUsers}
    setSelectedUsers={setSelectedUsers}
    setShowRecipientModal={setShowRecipientModal}
    handleSend={handleSend}
    isSending={isSending}
  />
)}`
);

// 4. Replace Result Viewer JSX
content = content.replace(/\{\s*resultViewerData\s*&&\s*\([\s\S]*?<div className=\"print-modal-root\"[\s\S]*?<\/div>\s*<\/div>\s*\)/,
  `{resultViewerData && (
  <SendocResultViewer
    resultViewerData={resultViewerData}
    setResultViewerData={setResultViewerData}
    pageImages={pageImages}
    handleSafePrint={handleSafePrint}
  />
)}`
);

// 5. Replace Designer Canvas JSX
const designerMarkerStart = `<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>`;
const designerMarkerEnd = `{showRecipientModal`;
let dStart = content.indexOf(designerMarkerStart);
let dEnd = content.indexOf(designerMarkerEnd, dStart);

if (dStart !== -1 && dEnd !== -1) {
  content = content.substring(0, dStart) +
    `<SendocDesignerCanvas
    viewMode={viewMode} isTeacher={isTeacher} isSigner={isSigner} isViewer={isViewer} activeDoc={activeDoc} resultViewerData={resultViewerData}
    pageImages={pageImages} currentPageIdx={currentPageIdx} setCurrentPageIdx={setCurrentPageIdx} backgroundUrl={backgroundUrl} zoom={zoom}
    isDrawingMode={isDrawingMode} setIsDrawingMode={setIsDrawingMode} isEraser={isEraser} setIsEraser={setIsEraser} penSize={penSize} setPenSize={setPenSize}
    strokes={strokes} setStrokes={setStrokes} fields={fields} setFields={setFields} addField={addField} handleFieldDrag={handleFieldDrag} handleFieldResize={handleFieldResize}
    activeSignField={activeSignField} setActiveSignField={setActiveSignField} activeCharPicker={activeCharPicker} setActiveCharPicker={setActiveCharPicker} specialChars={specialChars}
    scrollContainerRef={scrollContainerRef} containerRef={containerRef} fullCanvasRef={fullCanvasRef} signatureCanvasRef={signatureCanvasRef}
    handlePanStart={handlePanStart} handlePanMove={handlePanMove} handlePanEnd={handlePanEnd}
    startFullDrawing={startFullDrawing} drawFull={drawFull} stopFullDrawing={stopFullDrawing}
    startDrawing={startDrawing} draw={draw} stopDrawing={stopDrawing} saveSignature={saveSignature}
  />\n        ` + content.substring(dEnd);
}

fs.writeFileSync(path, content);
console.log('JSX Abstraction completed.');
