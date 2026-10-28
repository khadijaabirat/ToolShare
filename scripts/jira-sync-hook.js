'use strict';

const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const EMAIL = 'abiratkhadija@gmail.com';
const API_TOKEN = 'ATATT3xFfGF0jzM8y4Z8qbgzaZFHUA6jM6zJDgFJKJxAdqSAnqW5vtA3N7upcBekbO1z9sLd_xyOEkttMwo_DH7CjJpzQ3tNdoM2fuxqCTqmCp-2DQvOSovBQt0PsgB4oeh8pN8HMcu_iwwweMBz4F6dQTSofXIf6B62Z8tXJgagCCXGRPOVl6Q=C1FA6C65';
const HOST = 'abiratkhadija-1788780331877.atlassian.net';
const AUTH = Buffer.from(`${EMAIL}:${API_TOKEN}`).toString('base64');

function request(urlPath, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      path: urlPath,
      method: method,
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  let commitMsg = '';
  try {
    commitMsg = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
  } catch {
    return;
  }

  const match = commitMsg.match(/TOOL-\d+/i);
  if (!match) return;

  const ticketKey = match[0].toUpperCase();
  const lowerMsg = commitMsg.toLowerCase();
  const isDone = /termin[ée]|done|close|resolv|finish|#done/i.test(lowerMsg);

  if (!isDone) {
    console.log(`\x1b[36m[Jira Sync]\x1b[0m Ticket ${ticketKey} mentionné dans le commit.`);
    return;
  }

  try {
    const transRes = await request(`/rest/api/3/issue/${ticketKey}/transitions`);
    if (transRes.status !== 200 || !transRes.data.transitions) {
      console.log(`\x1b[33m[Jira Sync]\x1b[0m Impossible de récupérer les transitions pour ${ticketKey}`);
      return;
    }

    const doneTransition = transRes.data.transitions.find(t =>
      t.name.toLowerCase().includes('termin') ||
      t.name.toLowerCase().includes('done') ||
      t.id === '31'
    );

    if (!doneTransition) {
      console.log(`\x1b[33m[Jira Sync]\x1b[0m Le ticket ${ticketKey} est peut-être déjà Terminé.`);
      return;
    }

    const applyRes = await request(`/rest/api/3/issue/${ticketKey}/transitions`, 'POST', {
      transition: { id: doneTransition.id }
    });

    if (applyRes.status === 204 || applyRes.status === 200) {
      console.log(`\x1b[32m✔ [Jira Auto-Sync] Ticket ${ticketKey} passé automatiquement à "Terminé" sur Jira !\x1b[0m`);
    } else {
      console.log(`\x1b[33m[Jira Sync]\x1b[0m Statut transition Jira : ${applyRes.status}`);
    }
  } catch (err) {
    console.error(`\x1b[31m[Jira Sync Error]\x1b[0m ${err.message}`);
  }
}

run();
