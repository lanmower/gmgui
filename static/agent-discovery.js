/**
 * Agent Auto-Discovery
 * Automatically discover local CLI coding agents
 */

class AgentAutoDiscovery {
  constructor(options = {}) {
    this.options = {
      scanPorts: options.scanPorts || [3001, 3002, 3003, 3004, 3005],
      timeout: options.timeout || 1000,
      configPaths: options.configPaths || [],
      ...options,
    };
    this.discoveredAgents = new Map();
  }

  async discoverAll() {
    console.log('🔍 Starting agent auto-discovery...');

    const agents = [];

    // 1. Check environment variables
    const envAgents = this.getEnvAgents();
    agents.push(...envAgents);

    // 2. Scan well-known ports
    const portAgents = await this.scanPorts();
    agents.push(...portAgents);

    // 3. Load config files
    const configAgents = await this.loadConfigAgents();
    agents.push(...configAgents);

    // 4. Deduplicate
    const unique = this.deduplicateAgents(agents);

    console.log(`✅ Discovery complete: ${unique.length} agents found`);
    return unique;
  }

  getEnvAgents() {
    try {
      // Check GMGUI_AGENTS environment variable
      const envVar = localStorage.getItem('gmgui:env:agents');
      if (envVar) {
        const agents = JSON.parse(envVar);
        console.log(`✅ Found ${agents.length} agents from environment`);
        return agents;
      }
    } catch (error) {
      console.warn('Error parsing GMGUI_AGENTS:', error);
    }
    return [];
  }

  async scanPorts() {
    console.log(`🔍 Scanning ports: ${this.options.scanPorts.join(', ')}`);
    const agents = [];

    for (const port of this.options.scanPorts) {
      try {
        const url = `http://localhost:${port}/health`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeout);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.ok) {
          const agent = {
            id: `local-agent-${port}`,
            endpoint: `ws://localhost:${port}`,
            port,
            autoDetected: true,
            discoveryMethod: 'port-scan',
            timestamp: Date.now(),
          };

          agents.push(agent);
          console.log(`✅ Found agent on port ${port}`);
        }
      } catch (error) {
        // Port not responding, continue
      }
    }

    return agents;
  }

  async loadConfigAgents() {
    const agents = [];

    // Try to load from localStorage (simulating config file)
    try {
      const configKey = 'gmgui:agents:config';
      const stored = localStorage.getItem(configKey);

      if (stored) {
        const configAgents = JSON.parse(stored);
        console.log(`✅ Loaded ${configAgents.length} agents from config`);
        agents.push(...configAgents);
      }
    } catch (error) {
      console.warn('Error loading config agents:', error);
    }

    return agents;
  }

  deduplicateAgents(agents) {
    const seen = new Map();

    return agents.filter((agent) => {
      const key = `${agent.endpoint}`;

      if (seen.has(key)) {
        // Keep the more recent discovery
        const existing = seen.get(key);
        if (agent.timestamp > existing.timestamp) {
          seen.set(key, agent);
          return true;
        }
        return false;
      }

      seen.set(key, agent);
      return true;
    });
  }

  async testConnection(agent) {
    try {
      const ws = new WebSocket(agent.endpoint);
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 2000);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      });
    } catch (error) {
      return false;
    }
  }

  async verifyAgents(agents) {
    console.log('🔗 Verifying agent connections...');

    const verified = [];
    for (const agent of agents) {
      const isConnectable = await this.testConnection(agent);
      if (isConnectable) {
        verified.push(agent);
        console.log(`✅ Verified: ${agent.id}`);
      } else {
        console.warn(`⚠️  Could not connect to: ${agent.id}`);
      }
    }

    return verified;
  }
}

// Export for use in app.js
window.AgentAutoDiscovery = AgentAutoDiscovery;

console.log('✅ Agent auto-discovery system loaded');
