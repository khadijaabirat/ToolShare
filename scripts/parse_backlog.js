const fs = require('fs');

const content = fs.readFileSync('toolshare_backlog_jira.csv', 'utf8');
const rows = [];
let currentRow = [];
let currentCell = '';
let inQuotes = false;

for (let i = 0; i < content.length; i++) {
  const c = content[i];
  if (c === '"') {
    if (inQuotes && content[i+1] === '"') {
      currentCell += '"';
      i++;
    } else {
      inQuotes = !inQuotes;
    }
  } else if (c === ',' && !inQuotes) {
    currentRow.push(currentCell);
    currentCell = '';
  } else if ((c === '\r' || c === '\n') && !inQuotes) {
    if (c === '\r' && content[i+1] === '\n') i++;
    currentRow.push(currentCell);
    rows.push(currentRow);
    currentRow = [];
    currentCell = '';
  } else {
    currentCell += c;
  }
}
if (currentCell || currentRow.length) {
  currentRow.push(currentCell);
  rows.push(currentRow);
}

const data = rows.slice(1).filter(r => r.length > 3);

console.log('--- ALL KHADIJA TASKS IN CSV ---');
data.forEach(r => {
  const id = r[0];
  const type = r[1];
  const summary = r[2];
  const parent = r[3];
  const desc = r[4];
  const priority = r[5];
  const assignee = r[6];
  const status = r[7];
  if (assignee.toLowerCase().includes('khadija')) {
    console.log(`[${id}] [${type}] [Status: ${status}] (Parent: ${parent}) -> ${summary}`);
  }
});

console.log('\n--- ALL AYMAN TASKS IN CSV ---');
data.forEach(r => {
  const id = r[0];
  const type = r[1];
  const summary = r[2];
  const parent = r[3];
  const desc = r[4];
  const priority = r[5];
  const assignee = r[6];
  const status = r[7];
  if (assignee.toLowerCase().includes('ayman')) {
    console.log(`[${id}] [${type}] [Status: ${status}] (Parent: ${parent}) -> ${summary}`);
  }
});
