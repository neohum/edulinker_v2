const fs = require('fs');
const content = fs.readFileSync('e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx', 'utf8');

// Find the very last "  </div>" and fix the EOF specifically to match proper React syntax:
//   </div>
//  )
// }

let newContent = content.trimEnd();

if (newContent.endsWith('}')) {
  newContent = newContent.slice(0, -1).trimEnd();
}
if (newContent.endsWith(')')) {
  newContent = newContent.slice(0, -1).trimEnd();
}
// now we should be exactly at </div>
if (!newContent.endsWith('</div>')) {
  console.log('EOF is NOT </div>!');
}

newContent += '\n  )\n}\n';

fs.writeFileSync('e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx', newContent);
console.log('Fixed EOF');
