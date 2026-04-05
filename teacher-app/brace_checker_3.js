const fs = require('fs');
const content = fs.readFileSync('e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx', 'utf8');

const lines = content.split('\n');
let braces = 0;
let parens = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];

  // Strip block comments start to end (naively on same line) and line comments
  line = line.replace(/\/\*.*?\*\//g, '');
  const commentIdx = line.indexOf('//');
  if (commentIdx !== -1) {
    line = line.substring(0, commentIdx);
  }

  // Strip strings
  line = line.replace(/('.*?')|(".*?")|(`.*?`)/g, '');

  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (c === '{') braces++;
    if (c === '}') braces--;
    if (c === '(') parens++;
    if (c === ')') parens--;
  }

  // Debug if it drops below
  if (parens < 0) {
    console.log(`Unmatched paren around line ${i + 1}: ${line}`);
    parens = 0; // reset to keep counting
  }
  if (braces < 0) {
    console.log(`Unmatched brace around line ${i + 1}: ${line}`);
    braces = 0;
  }
}

console.log(`Final counts -> Braces: ${braces}, Parens: ${parens}`);
