const https = require('https');

const AUTH = Buffer.from('abiratkhadija@gmail.com:ATATT3xFfGF0jzM8y4Z8qbgzaZFHUA6jM6zJDgFJKJxAdqSAnqW5vtA3N7upcBekbO1z9sLd_xyOEkttMwo_DH7CjJpzQ3tNdoM2fuxqCTqmCp-2DQvOSovBQt0PsgB4oeh8pN8HMcu_iwwweMBz4F6dQTSofXIf6B62Z8tXJgagCCXGRPOVl6Q=C1FA6C65').toString('base64');

const body = JSON.stringify({
  jql: 'project = TOOL ORDER BY key ASC',
  maxResults: 100,
  fields: ['summary', 'status', 'issuetype', 'assignee', 'parent']
});

const req = https.request({
  hostname: 'abiratkhadija-1788780331877.atlassian.net',
  path: '/rest/api/3/search/jql',
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + AUTH,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.issues) {
        console.log(`Total issues in Jira: ${parsed.issues.length}`);
        parsed.issues.forEach(i => {
          const assignee = i.fields.assignee ? i.fields.assignee.emailAddress || i.fields.assignee.displayName : 'None';
          console.log(`${i.key} [${i.fields.issuetype.name}] (${assignee}) -> ${i.fields.status.name} : "${i.fields.summary}"`);
        });
      } else {
        console.log(data);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  });
});
req.write(body);
req.end();
