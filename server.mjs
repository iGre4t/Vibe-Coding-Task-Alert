import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.TASK_ALARM_PORT ?? 47831);
const pagePath = fileURLToPath(new URL('./index.html', import.meta.url));
const listeners = new Set();

createServer((request, response) => {
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
