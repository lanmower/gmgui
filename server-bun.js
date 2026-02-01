#!/usr/bin/env bun
/**
 * GMGUI Server - Bun Edition with Native SQLite
 * 
 * Features:
 * - Bun's native WebSocket support
 * - Built-in SQLite with bun:sqlite
 * - Message persistence
 * - Hot reload via file watcher
 * 
 * Usage:
 *   bun run server-bun.js
 */

import { Database } from "bun:sqlite";
import { serve } from "bun";
import { pack, unpack } from "msgpackr";

const PORT = process.env.PORT || 3000;
const watch = process.argv.includes("--watch");

// Initialize SQLite database
const db = new Database("gmgui.db");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    status TEXT DEFAULT 'disconnected',
    lastMessageAt INTEGER,
    createdAt INTEGER DEFAULT (unixepoch('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agentId TEXT NOT NULL,
    type TEXT DEFAULT 'message',
    content TEXT,
    direction TEXT CHECK(direction IN ('in', 'out')),
    timestamp INTEGER,
    createdAt INTEGER DEFAULT (unixepoch('now')),
    FOREIGN KEY (agentId) REFERENCES agents(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agentId TEXT NOT NULL,
    startedAt INTEGER DEFAULT (unixepoch('now')),
    endedAt INTEGER,
    messageCount INTEGER DEFAULT 0,
    FOREIGN KEY (agentId) REFERENCES agents(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_agentId ON messages(agentId);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
  CREATE INDEX IF NOT EXISTS idx_sessions_agentId ON sessions(agentId);
`);

// Prepared statements for performance
const insertMessage = db.prepare(`
  INSERT INTO messages (agentId, type, content, direction, timestamp)
  VALUES (?, ?, ?, ?, ?)
`);

const insertAgent = db.prepare(`
  INSERT OR REPLACE INTO agents (id, endpoint, status, lastMessageAt)
  VALUES (?, ?, ?, unixepoch('now'))
`);

const updateAgentStatus = db.prepare(`
  UPDATE agents SET status = ?, lastMessageAt = unixepoch('now') WHERE id = ?
`);

const getAgents = db.prepare(`
  SELECT * FROM agents ORDER BY lastMessageAt DESC
`);

const getMessages = db.prepare(`
  SELECT * FROM messages WHERE agentId = ? ORDER BY timestamp DESC LIMIT ?
`);

// Agent connection manager
class AgentManager {
  constructor() {
    this.agents = new Map();
    this.clients = [];
  }

  registerAgent(id, endpoint) {
    this.agents.set(id, {
      id,
      endpoint,
      connected: false,
      ws: null,
      status: "disconnected",
      lastMessage: null,
    });

    // Persist to database
    try {
      insertAgent.run(id, endpoint, "disconnected");
    } catch (e) {
      console.error(`Failed to insert agent ${id}:`, e.message);
    }
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  getAllAgents() {
    try {
      return getAgents.all().map((row) => ({
        ...row,
        connected: this.agents.get(row.id)?.connected || false,
        ws: this.agents.get(row.id)?.ws || null,
      }));
    } catch (e) {
      console.error("Failed to get agents:", e.message);
      return Array.from(this.agents.values());
    }
  }

  setAgentWs(id, ws) {
    const agent = this.agents.get(id);
    if (agent) {
      agent.ws = ws;
      agent.connected = true;
      agent.status = "connected";
      updateAgentStatus.run("connected", id);
    }
  }

  recordMessage(agentId, type, content, direction) {
    try {
      insertMessage.run(agentId, type, content, direction, Date.now());
    } catch (e) {
      console.error(`Failed to record message for ${agentId}:`, e.message);
    }
  }

  getHistory(agentId, limit = 100) {
    try {
      return getMessages.all(agentId, limit);
    } catch (e) {
      console.error(`Failed to get history for ${agentId}:`, e.message);
      return [];
    }
  }

  broadcastToClients(message) {
    const packed = pack(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) {
        try {
          client.send(packed);
        } catch (e) {
          console.error("Failed to send to client:", e.message);
        }
      }
    });
  }
}

const agentManager = new AgentManager();

// HTTP request handler
async function handleRequest(request, server) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 200 });
  }

  // API routes
  if (pathname === "/api/agents" && request.method === "GET") {
    return new Response(
      JSON.stringify({ agents: agentManager.getAllAgents() }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  if (
    pathname.match(/^\/api\/agents\/[^/]+$/) &&
    request.method === "POST"
  ) {
    const agentId = pathname.split("/")[3];
    const body = await request.json();

    const agent = agentManager.getAgent(agentId);
    if (agent?.ws) {
      try {
        agentManager.recordMessage(agentId, body.type || "message", body.content, "out");
        agent.ws.send(pack(body));
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        });
      }
    }

    return new Response(JSON.stringify({ error: "Agent not found" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 404,
    });
  }

  // Get message history
  if (
    pathname.match(/^\/api\/agents\/[^/]+\/history$/) &&
    request.method === "GET"
  ) {
    const agentId = pathname.split("/")[3];
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const history = agentManager.getHistory(agentId, limit);
    return new Response(JSON.stringify({ history }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // Serve static files
  if (pathname === "/" || pathname === "/index.html") {
    const file = Bun.file("./static/index.html");
    return new Response(file, {
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    });
  }

  // Serve static assets
  if (pathname.startsWith("/")) {
    const file = Bun.file(`.${pathname}`);
    if (await file.exists()) {
      const ext = pathname.split(".").pop();
      const mimeTypes = {
        js: "application/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        json: "application/json",
        png: "image/png",
        jpg: "image/jpeg",
        svg: "image/svg+xml",
      };

      return new Response(file, {
        headers: {
          "Content-Type": mimeTypes[ext] || "application/octet-stream",
          ...corsHeaders,
        },
      });
    }
  }

  return new Response("Not found", { status: 404 });
}

// WebSocket handler
const server = serve({
  port: PORT,
  fetch: handleRequest,
  websocket: {
    open(ws) {
      const url = ws.url || "";
      const agentId = url.match(/\/agent\/([^/]+)/)?.[1];

      if (agentId) {
        const agent = agentManager.getAgent(agentId) || {
          id: agentId,
          endpoint: "unknown",
          status: "connected",
        };

        agentManager.registerAgent(agentId, agent.endpoint);
        agentManager.setAgentWs(agentId, ws);

        console.log(`Agent connected: ${agentId}`);

        agentManager.broadcastToClients({
          type: "agent:connected",
          agentId,
          agent,
        });
      } else if (url === "/hot-reload") {
        agentManager.clients.push(ws);
      }
    },

    message(ws, message) {
      const url = ws.url || "";
      const agentId = url.match(/\/agent\/([^/]+)/)?.[1];

      if (!agentId) return;

      try {
        const data = typeof message === "string" ? JSON.parse(message) : unpack(message);
        data.agentId = agentId;
        data.timestamp = Date.now();

        // Record in database
        agentManager.recordMessage(agentId, data.type || "message", JSON.stringify(data), "in");

        // Broadcast to clients
        agentManager.broadcastToClients({
          type: "agent:message",
          ...data,
        });

        const agent = agentManager.getAgent(agentId);
        if (agent) {
          agent.lastMessage = data;
        }
      } catch (e) {
        console.error(`Error processing message from ${agentId}:`, e.message);
      }
    },

    close(ws) {
      const url = ws.url || "";
      const agentId = url.match(/\/agent\/([^/]+)/)?.[1];

      if (agentId) {
        const agent = agentManager.getAgent(agentId);
        if (agent) {
          agent.connected = false;
          agent.status = "disconnected";
        }

        console.log(`Agent disconnected: ${agentId}`);

        agentManager.broadcastToClients({
          type: "agent:disconnected",
          agentId,
        });

        updateAgentStatus.run("disconnected", agentId);
      } else {
        // Hot reload client
        const idx = agentManager.clients.indexOf(ws);
        if (idx > -1) agentManager.clients.splice(idx, 1);
      }
    },

    error(ws, error) {
      console.error("WebSocket error:", error);
    },
  },
});

console.log(`✅ GMGUI Server (Bun Edition) running on http://localhost:${PORT}`);
console.log(`📦 SQLite database: gmgui.db`);
console.log(`🔄 Hot reload: ${watch ? "enabled" : "disabled"}`);

// File watcher for hot reload
if (watch) {
  const watcher = Bun.watch("./static");
  watcher.on("change", () => {
    console.log("📝 Files changed, notifying clients...");
    agentManager.broadcastToClients({ type: "reload" });
  });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Shutting down gracefully...");
  db.close();
  process.exit(0);
});
