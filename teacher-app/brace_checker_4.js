const fs = require('fs');
const content = fs.readFileSync('e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx', 'utf8');

const lines = content.split('\n');
let braces = 0;

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  line = line.replace(/\/\*.*?\*\//g, '');
  const commentIdx = line.indexOf('//');
  if (commentIdx !== -1) line = line.substring(0, commentIdx);
  line = line.replace(/('.*?')|(".*?")|(`.*?`)/g, '');

  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (c === '{') braces++;
    if (c === '}') {
      braces--;
      if (braces === 0) {
        console.log(`Braces hit 0 at line ${i + 1}: ${line}`);
      }
    }
  }
}
