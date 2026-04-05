const fs = require('fs');
const content = fs.readFileSync('e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx', 'utf8');

const lines = content.split('\n');
let braces = 0;
let parens = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Simple check ignoring strings and comments for a quick heuristic
  const cleanLine = line.replace(/'.*?'/g, '').replace(/".*?"/g, '').replace(/\/\/.*$/g, '');

  for (let j = 0; j < cleanLine.length; j++) {
    const c = cleanLine[j];
    if (c === '{') braces++;
    if (c === '}') braces--;
    if (c === '(') parens++;
    if (c === ')') parens--;
  }

  if (braces < 0) {
    console.log(`Extra } at line ${i + 1}: ${line}`);
    break;
  }
  if (parens < 0) {
    console.log(`Extra ) at line ${i + 1}: ${line}`);
    break;
  }
}

console.log(`Final counts -> Braces: ${braces}, Parens: ${parens}`);
