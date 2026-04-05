const fs = require('fs');
const ts = require('typescript');
const path = 'e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx';
const content = fs.readFileSync(path, 'utf8');

const sourceFile = ts.createSourceFile('SendocPage.tsx', content, ts.ScriptTarget.Latest, true);

function traverse(node) {
  // We can look for unexpected tokens or syntax errors.
  ts.forEachChild(node, traverse);
}
traverse(sourceFile);

// Wait, typescript itself parses and gives errors in sourceFile.parseDiagnostics
if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
  sourceFile.parseDiagnostics.forEach(diag => {
    const start = ts.getLineAndCharacterOfPosition(sourceFile, diag.start);
    console.log(`Line ${start.line + 1}: ${ts.flattenDiagnosticMessageText(diag.messageText, '\\n')}`);
  });
} else {
  console.log("No syntax errors found by JS typescript module.");
}
