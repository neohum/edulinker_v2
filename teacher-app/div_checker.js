const fs = require('fs');
const content = fs.readFileSync('e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx', 'utf8');

const lines = content.split('\n');
let divBalance = 0;

for (let i = 999; i < lines.length; i++) {
  const line = lines[i];

  // Count open divs
  const opens = (line.match(/<div(?=[\s>])/g) || []).length;
  // Exclude self-closing divs
  const selfCloses = (line.match(/<div[^>]*\/>/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;

  divBalance += (opens - selfCloses - closes);

  if (divBalance < 0) {
    console.log(`Extra </div> at line ${i + 1}: ${line}`);
    break;
  }
}

console.log(`Final div balance from line 1000: ${divBalance}`);
