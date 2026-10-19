import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const port = Number(process.env.TASK_ALARM_PORT ?? 47833);
const pagePath = fileURLToPath(new URL('./index.html', import.meta.url));
const listeners = new Set();
const settingsPath = fileURLToPath(new URL('./settings.json', import.meta.url));
const scriptPath = fileURLToPath(new URL('./ring-task.ps1', import.meta.url));
let settings = { volumePercent: 100 };
try {
  const saved = JSON.parse(await readFile(settingsPath, 'utf8'));
  if (Number.isInteger(saved.volumePercent) && saved.volumePercent >= 1 && saved.volumePercent <= 100) settings = { volumePercent: saved.volumePercent };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let saving = false;
let testing = false;
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/settings') {
    json(response, 200, settings);
    return;
  }
  if (request.method === 'PUT' && request.url === '/settings') {
    if (request.headers['content-type'] !== 'application/json') { json(response, 415, { error: 'Use application/json' }); return; }
    if (saving) { json(response, 409, { error: 'Settings are being saved; try again' }); return; }
    saving = true;
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1024) { json(response, 413, { error: 'Request too large' }); return; }
      }
      let input;
      try { input = JSON.parse(body); } catch { json(response, 400, { error: 'Invalid JSON' }); return; }
      if (!Number.isInteger(input?.volumePercent) || input.volumePercent < 1 || input.volumePercent > 100) {
        json(response, 400, { error: 'Volume must be a whole number from 1 to 100' }); return;
      }
      const next = { volumePercent: input.volumePercent };
      await writeFile(settingsPath + '.tmp', JSON.stringify(next, null, 2) + '\n');
      await rename(settingsPath + '.tmp', settingsPath);
      settings = next;
      json(response, 200, settings);
    } catch { json(response, 500, { error: 'Could not save settings' }); }
    finally { saving = false; }
    return;
  }
  if (request.method === 'POST' && request.url === '/test') {
    if (testing) { json(response, 409, { error: 'Alarm is already playing' }); return; }
    testing = true;
    execFile('pwsh.exe', ['-NoProfile', '-File', scriptPath], { windowsHide: true, timeout: 15000, env: { ...process.env, TASK_ALARM_PORT: String(port) } }, error => {
      testing = false;
      json(response, error ? 500 : 200, error ? { error: 'Could not play alarm' } : { success: true });
    });
    return;
  }
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    createReadStream(pagePath).pipe(response);
    return;
  }
  if (request.method === 'GET' && request.url === '/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    response.write(': connected\n\n');
    listeners.add(response);
    request.on('close', () => listeners.delete(response));
    return;
  }
  if (request.method === 'POST' && request.url === '/ring') {
    for (const listener of listeners) listener.write('event: ring\ndata: now\n\n');
    response.writeHead(204).end();
    return;
  }
  response.writeHead(404).end('Not found');
}).listen(port, '127.0.0.1', () => {
  console.log(`Task alarm ready at http://127.0.0.1:${port}`);
});
