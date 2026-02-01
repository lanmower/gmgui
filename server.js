import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import os from 'os';
import { execSync } from 'child_process';
import { queries } from './database.js';
import ACPConnection from './acp-launcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const watch = process.argv.includes('--watch');

const staticDir = path.join(__dirname, 'static');
if (!fs.existsSync(staticDir)) fs.mkdirSync(staticDir, { recursive: true });

// ACP connection pool keyed by agentId
const acpPool = new Map();

async function getACP(agentId, cwd) {
  let conn = acpPool.get(agentId);
  if (conn?.isRunning()) return conn;

  conn = new ACPConnection();
  const agentType = agentId === 'opencode' ? 'opencode' : 'claude-code';
  await conn.connect(agentType, cwd);
  await conn.initialize();
  await conn.newSession(cwd);
  await conn.setSessionMode('bypassPermissions');
  acpPool.set(agentId, conn);
  console.log(`ACP connection ready for ${agentId} in ${cwd}`);
  return conn;
}

function discoverAgents() {
  const agents = [];
  const binaries = [
    { cmd: 'claude', id: 'claude-code', name: 'Claude Code', icon: 'C' },
    { cmd: 'opencode', id: 'opencode', name: 'OpenCode', icon: 'O' },
  ];
  for (const bin of binaries) {
    try {
      const result = execSync(`which ${bin.cmd} 2>/dev/null`, { encoding: 'utf-8' }).trim();
      if (result) agents.push({ id: bin.id, name: bin.name, icon: bin.icon, path: result });
    } catch (_) {}
  }
  return agents;
}

const discoveredAgents = discoverAgents();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('error', reject);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  try {
    if (req.url === '/api/conversations' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations: queries.getAllConversations() }));
      return;
    }

    if (req.url === '/api/conversations' && req.method === 'POST') {
      const body = await parseBody(req);
      const conversation = queries.createConversation(body.agentId, body.title);
      queries.createEvent('conversation.created', { agentId: body.agentId }, conversation.id);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation }));
      return;
    }

    const convMatch = req.url.match(/^\/api\/conversations\/([^/]+)$/);
    if (convMatch && req.method === 'GET') {
      const conv = queries.getConversation(convMatch[1]);
      if (!conv) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation: conv }));
      return;
    }

    if (convMatch && req.method === 'POST') {
      const body = await parseBody(req);
      const conv = queries.updateConversation(convMatch[1], body);
      queries.createEvent('conversation.updated', body, convMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation: conv }));
      return;
    }

    if (convMatch && req.method === 'DELETE') {
      const deleted = queries.deleteConversation(convMatch[1]);
      if (!deleted) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deleted: true }));
      return;
    }

    const messagesMatch = req.url.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: queries.getConversationMessages(messagesMatch[1]) }));
      return;
    }

    if (messagesMatch && req.method === 'POST') {
      const conversationId = messagesMatch[1];
      const body = await parseBody(req);
      const message = queries.createMessage(conversationId, 'user', body.content);
      queries.createEvent('message.created', { role: 'user' }, conversationId);
      const session = queries.createSession(conversationId);
      queries.createEvent('session.created', { messageId: message.id }, conversationId, session.id);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message, session }));
      processMessage(conversationId, message.id, session.id, body.content, body.agentId, body.folderContext);
      return;
    }

    const messageMatch = req.url.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)$/);
    if (messageMatch && req.method === 'GET') {
      const msg = queries.getMessage(messageMatch[2]);
      if (!msg || msg.conversationId !== messageMatch[1]) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: msg }));
      return;
    }

    const sessionMatch = req.url.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const sess = queries.getSession(sessionMatch[1]);
      if (!sess) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
      const events = queries.getSessionEvents(sessionMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session: sess, events }));
      return;
    }

    if (req.url === '/api/agents' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ agents: discoveredAgents }));
      return;
    }

    if (req.url === '/api/home' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ home: process.env.HOME || '/config' }));
      return;
    }

    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(staticDir, filePath);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(staticDir)) { res.writeHead(403); res.end('Forbidden'); return; }

    fs.stat(filePath, (err, stats) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        fs.stat(filePath, (err2) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return; }
          serveFile(filePath, res);
        });
      } else {
        serveFile(filePath, res);
      }
    });
  } catch (e) {
    console.error('Server error:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    let content = data.toString();
    if (ext === '.html' && watch) {
      content += `\n<script>(function(){const ws=new WebSocket('ws://'+location.host+'/hot-reload');ws.onmessage=e=>{if(JSON.parse(e.data).type==='reload')location.reload()};})();</script>`;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

async function processMessage(conversationId, messageId, sessionId, content, agentId, folderContext) {
  try {
    queries.updateSession(sessionId, { status: 'processing' });
    queries.createEvent('session.processing', {}, conversationId, sessionId);

    const cwd = folderContext?.path || '/config';
    const conn = await getACP(agentId || 'claude-code', cwd);

    let fullText = '';
    conn.onUpdate = (params) => {
      const u = params.update;
      if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.text) {
        fullText += u.content.text;
      }
    };

    const result = await conn.sendPrompt(content);
    conn.onUpdate = null;

    const responseText = fullText || (result?.stopReason ? `Completed: ${result.stopReason}` : 'No response.');
    queries.createMessage(conversationId, 'assistant', responseText);
    queries.updateSession(sessionId, { status: 'completed', response: { text: responseText }, completed_at: Date.now() });
    queries.createEvent('session.completed', {}, conversationId, sessionId);
  } catch (e) {
    console.error('processMessage error:', e.message);
    queries.createMessage(conversationId, 'assistant', `Error: ${e.message}`);
    queries.updateSession(sessionId, { status: 'error', error: e.message, completed_at: Date.now() });
    queries.createEvent('session.error', { error: e.message }, conversationId, sessionId);
    acpPool.delete(agentId || 'claude-code');
  }
}

const wss = new WebSocketServer({ server });
const clients = [];
wss.on('connection', (ws, req) => {
  if (req.url === '/hot-reload') {
    clients.push(ws);
    ws.on('close', () => { const i = clients.indexOf(ws); if (i > -1) clients.splice(i, 1); });
  }
});

if (watch) {
  const watchedFiles = new Map();
  try {
    fs.readdirSync(staticDir).forEach(file => {
      const fp = path.join(staticDir, file);
      if (watchedFiles.has(fp)) return;
      fs.watchFile(fp, { interval: 100 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) clients.forEach(c => { if (c.readyState === 1) c.send(JSON.stringify({ type: 'reload' })); });
      });
      watchedFiles.set(fp, true);
    });
  } catch (e) { console.error('Watch error:', e.message); }
}

process.on('SIGTERM', async () => {
  for (const conn of acpPool.values()) await conn.terminate();
  acpPool.clear();
  wss.close(() => server.close(() => process.exit(0)));
});

server.listen(PORT, () => {
  console.log(`GMGUI running on http://localhost:${PORT}`);
  console.log(`Agents: ${discoveredAgents.map(a => a.name).join(', ') || 'none'}`);
  console.log(`Hot reload: ${watch ? 'on' : 'off'}`);
});
