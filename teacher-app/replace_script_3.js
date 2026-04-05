const fs = require('fs');
const path = 'e:/works/project/edulinker/teacher-app/frontend/src/pages/SendocPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const tStart = content.indexOf('{resultViewerData && (');
if (tStart !== -1) {
  const badStart = content.indexOf(')})', tStart);
  if (badStart !== -1) {
    const endBlock = content.indexOf('{/* Confirm Dialog */}', badStart);
    if (endBlock !== -1) {
      // Remove everything from the badly injected )}) up to just before {/* Confirm Dialog */}
      content = content.substring(0, badStart) + ')}' + '\n      ' + content.substring(endBlock);
    }
  }
}

fs.writeFileSync(path, content);
console.log('Orphaned JSX removed.');
