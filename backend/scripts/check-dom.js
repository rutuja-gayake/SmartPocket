import fs from 'node:fs';

const code = fs.readFileSync('public/js/app.js', 'utf8');
const html = fs.readFileSync('public/index.html', 'utf8');

const regex = /getElementById\(['"]([^'"]+)['"]\)/g;
const matches = [];
let match;
while ((match = regex.exec(code)) !== null) {
  matches.push(match[1]);
}

const missing = [];
for (const id of matches) {
  const hasDouble = html.includes(`id="${id}"`);
  const hasSingle = html.includes(`id='${id}'`);
  if (!hasDouble && !hasSingle) {
    missing.push(id);
  }
}

console.log('Total getElementById calls:', matches.length);
console.log('Unique IDs:', new Set(matches).size);
console.log('Missing IDs in index.html:', [...new Set(missing)]);

