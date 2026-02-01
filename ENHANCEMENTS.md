# GMGUI Enhancements - Advanced Features Roadmap

## New Capabilities Required

This document outlines the enhancements to add specialized display skills, agent auto-detection, and conversational UX improvements.

### 1. Display Skills

#### 1.1 displayhtml Skill
Safe HTML rendering in isolated iframe environment.

**Features:**
- Sandbox iframe with restricted permissions
- Content Security Policy (CSP) headers
- No access to parent DOM
- Configurable height/width
- Dynamic content updates
- Error boundary handling

**Implementation:**
```javascript
// In static/app.js
class DisplayHtmlSkill {
  render(content, options = {}) {
    const container = document.createElement('div');
    container.className = 'skill-display-html';
    
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.sandbox.add('allow-same-origin');
    iframe.style.width = options.width || '100%';
    iframe.style.height = options.height || '400px';
    iframe.style.border = '1px solid #e5e7eb';
    
    // Inject sanitized HTML with CSP
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'">
        <style>
          body { font-family: sans-serif; margin: 0; padding: 1rem; }
          * { max-width: 100%; }
        </style>
      </head>
      <body>${sanitizeHtml(content)}</body>
      </html>
    `);
    doc.close();
    
    container.appendChild(iframe);
    return container;
  }
}
```

#### 1.2 displaypdf Skill
PDF rendering from filesystem or URLs.

**Features:**
- PDF.js integration
- Page navigation
- Zoom controls
- Download button
- Search functionality
- Local file support

#### 1.3 displayimage Skill
Image display with metadata and operations.

**Features:**
- Local filesystem support
- Relative path resolution
- Image preview with dimensions
- EXIF metadata display
- Zoom and pan
- Copy to clipboard

### 2. Agent Auto-Detection

#### 2.1 Auto-Discover Local CLI Agents

Like aionui, automatically detect and connect to local coding agents.

**Discovery Methods:**
1. **Environment Variables**
   - `GMGUI_AGENTS` - JSON list of agents
   - `AGENT_*` - Individual agent configs

2. **Well-Known Ports**
   - Check common ACP ports (3001-3010)
   - Check local development patterns

3. **File System Scanning**
   - `~/.config/gmgui/agents.json`
   - `.gmgui/agents.json` in project
   - System-wide agent registry

4. **Process Detection**
   - Scan running processes for agent patterns
   - Check process command lines
   - Discover open ports

**Implementation:**
```javascript
class AgentAutoDiscovery {
  async discoverAgents() {
    const agents = [];
    
    // 1. Check environment variables
    const envAgents = this.getEnvAgents();
    agents.push(...envAgents);
    
    // 2. Scan well-known ports
    const portAgents = await this.scanPorts(3001, 3010);
    agents.push(...portAgents);
    
    // 3. Check config files
    const configAgents = this.loadConfigAgents();
    agents.push(...configAgents);
    
    // 4. Process detection (Node.js only)
    const processAgents = await this.detectProcessAgents();
    agents.push(...processAgents);
    
    return this.deduplicateAgents(agents);
  }

  async scanPorts(start, end) {
    const agents = [];
    for (let port = start; port <= end; port++) {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          timeout: 1000
        });
        if (response.ok) {
          agents.push({
            id: `auto-agent-${port}`,
            endpoint: `ws://localhost:${port}`,
            autoDetected: true,
            port
          });
        }
      } catch (e) {
        // Port not responding, continue
      }
    }
    return agents;
  }

  getEnvAgents() {
    const env = process.env.GMGUI_AGENTS || '[]';
    return JSON.parse(env);
  }

  loadConfigAgents() {
    // Load from ~/.config/gmgui/agents.json
    // Load from .gmgui/agents.json
    // Return merged list
  }

  async detectProcessAgents() {
    // Use child_process to list running processes
    // Match against known agent patterns
    // Extract port information
  }

  deduplicateAgents(agents) {
    const seen = new Set();
    return agents.filter(a => {
      const key = `${a.id}:${a.endpoint}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
```

### 3. Conversation History & Drafts

#### 3.1 Conversation Memory

Store and recall partial drafts, iterations, and conversation context.

**Features:**
- Auto-save conversation state
- Draft management (create, edit, discard)
- Conversation branches
- Version history
- Search across conversations
- Tag and organize

**Schema:**
```javascript
// IndexedDB structure
conversations: {
  keyPath: 'id',
  indexes: [
    { name: 'timestamp', keyPath: 'timestamp' },
    { name: 'agentId', keyPath: 'agentId' }
  ]
}

drafts: {
  keyPath: 'id',
  indexes: [
    { name: 'conversationId', keyPath: 'conversationId' },
    { name: 'status', keyPath: 'status' }
  ]
}

messages: {
  keyPath: 'id',
  indexes: [
    { name: 'conversationId', keyPath: 'conversationId' },
    { name: 'timestamp', keyPath: 'timestamp' },
    { name: 'agentId', keyPath: 'agentId' }
  ]
}
```

#### 3.2 Perfect Conversational UX

**Features:**
- Streaming message display (word by word)
- Real-time typing indicators
- Conversation context panel
- Multi-turn memory
- Agent suggestions based on context
- Smart message routing

**Implementation:**
```javascript
class ConversationManager {
  async sendMessage(content, context = {}) {
    // Save to draft
    const draft = await this.createDraft(content);
    
    // Send with streaming
    const stream = await this.streamMessage(content, context);
    
    // Display streaming response
    const messageDiv = this.createMessageDisplay();
    for await (const chunk of stream) {
      this.appendChunk(messageDiv, chunk);
    }
    
    // Save completed message
    await this.finalizeMessage(draft, messageDiv.textContent);
    
    // Update conversation history
    await this.saveConversation({
      messages: [...this.messages],
      context: this.getContext(),
      timestamp: Date.now()
    });
  }

  async streamMessage(content, context) {
    // Return async generator that yields chunks
    const response = await fetch('/api/stream', {
      method: 'POST',
      body: JSON.stringify({ content, context })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  }

  appendChunk(element, chunk) {
    // Append word by word for natural feel
    const words = chunk.split(' ');
    words.forEach((word, i) => {
      setTimeout(() => {
        element.textContent += (i === 0 ? '' : ' ') + word;
        element.scrollIntoView({ behavior: 'smooth' });
      }, i * 50);
    });
  }
}
```

### 4. Black Magic & Pluggability

#### 4.1 Skill Plugin System

Extensible architecture for custom skills.

**Features:**
- Dynamic skill registration
- Skill marketplace
- Custom skill creation
- Middleware hooks
- Event system
- State management

**Implementation:**
```javascript
class SkillRegistry {
  constructor() {
    this.skills = new Map();
    this.hooks = new Map();
    this.middleware = [];
  }

  register(name, skill) {
    // Validate skill interface
    if (!skill.execute || !skill.metadata) {
      throw new Error('Invalid skill');
    }
    
    this.skills.set(name, skill);
    this.emit('skill:registered', { name, skill });
  }

  async execute(skillName, input, context = {}) {
    // Run middleware
    let processedInput = input;
    for (const mw of this.middleware) {
      processedInput = await mw(processedInput, context);
    }

    // Execute skill
    const skill = this.skills.get(skillName);
    if (!skill) throw new Error(`Skill not found: ${skillName}`);

    const result = await skill.execute(processedInput, context);

    // Run hooks
    await this.runHooks(`skill:${skillName}:complete`, { input, result });

    return result;
  }

  registerMiddleware(fn) {
    this.middleware.push(fn);
  }

  onHook(event, handler) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push(handler);
  }

  async runHooks(event, data) {
    const handlers = this.hooks.get(event) || [];
    for (const handler of handlers) {
      await handler(data);
    }
  }

  emit(event, data) {
    this.runHooks(event, data);
  }
}

// Create global registry
window.gmguiSkills = new SkillRegistry();

// Register built-in skills
gmguiSkills.register('displayhtml', {
  metadata: {
    name: 'Display HTML',
    description: 'Safely render HTML in iframe',
    version: '1.0.0'
  },
  async execute(html, context) {
    return new DisplayHtmlSkill().render(html, context);
  }
});

gmguiSkills.register('displaypdf', {
  metadata: {
    name: 'Display PDF',
    description: 'Render PDF files',
    version: '1.0.0'
  },
  async execute(path, context) {
    return new DisplayPdfSkill().render(path, context);
  }
});

gmguiSkills.register('displayimage', {
  metadata: {
    name: 'Display Image',
    description: 'Display image from filesystem',
    version: '1.0.0'
  },
  async execute(path, context) {
    return new DisplayImageSkill().render(path, context);
  }
});
```

#### 4.2 Message Parser with Skill Invocation

Auto-detect and invoke skills in messages.

**Features:**
- Regex-based skill detection
- Parameter extraction
- Safe execution
- Error recovery
- Skill chaining

**Implementation:**
```javascript
class MessageParser {
  constructor(skillRegistry) {
    this.skills = skillRegistry;
    this.patterns = new Map();
  }

  registerPattern(skill, pattern) {
    this.patterns.set(skill, pattern);
  }

  async parseAndRender(message) {
    const container = document.createElement('div');
    
    let remaining = message;
    
    for (const [skillName, pattern] of this.patterns) {
      const matches = remaining.match(pattern);
      
      if (matches) {
        // Extract text before match
        const before = remaining.substring(0, matches.index);
        container.appendChild(this.createTextNode(before));

        // Execute skill
        try {
          const skillInput = matches[1] || matches[0];
          const result = await this.skills.execute(skillName, skillInput, {
            message, context: this
          });
          container.appendChild(result);
        } catch (e) {
          container.appendChild(this.createErrorNode(e));
        }

        // Continue with remaining text
        remaining = remaining.substring(matches.index + matches[0].length);
      }
    }

    // Add remaining text
    if (remaining) {
      container.appendChild(this.createTextNode(remaining));
    }

    return container;
  }

  createTextNode(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div;
  }

  createErrorNode(error) {
    const div = document.createElement('div');
    div.className = 'skill-error';
    div.textContent = `Error: ${error.message}`;
    return div;
  }
}

// Register skill patterns
const parser = new MessageParser(gmguiSkills);

parser.registerPattern('displayhtml', /```html\n([\s\S]*?)\n```/);
parser.registerPattern('displaypdf', /pdf:([\w\/.]+)/);
parser.registerPattern('displayimage', /image:([\w\/.]+)/);
```

### 5. Integration with Agent Auto-Detection

Combine auto-detection with conversation UX:

```javascript
class EnhancedGMGUI {
  async initialize() {
    // 1. Auto-discover agents
    const discovery = new AgentAutoDiscovery();
    const discoveredAgents = await discovery.discoverAgents();
    
    // 2. Load conversation history
    const history = await this.loadConversationHistory();
    
    // 3. Initialize conversation manager
    this.conversationManager = new ConversationManager({
      agents: discoveredAgents,
      history,
      skillRegistry: window.gmguiSkills
    });

    // 4. Setup message parser
    this.messageParser = new MessageParser(window.gmguiSkills);

    // 5. Bind UI
    this.setupUI();
  }

  async sendMessage(content) {
    // Parse for skills
    const rendered = await this.messageParser.parseAndRender(content);
    
    // Send to agent
    await this.conversationManager.sendMessage(content, {
      skillRegistry: window.gmguiSkills,
      parser: this.messageParser
    });

    // Save conversation
    await this.conversationManager.saveConversation();
  }
}

const gmgui = new EnhancedGMGUI();
gmgui.initialize();
```

## Implementation Phases

### Phase 1: Display Skills (Week 1)
- [ ] displayhtml with CSP sandboxing
- [ ] displaypdf with PDF.js
- [ ] displayimage with filesystem support
- [ ] Skill registry system

### Phase 2: Agent Auto-Detection (Week 2)
- [ ] Port scanning
- [ ] Config file loading
- [ ] Process detection
- [ ] UI integration

### Phase 3: Conversation History (Week 2)
- [ ] IndexedDB schema
- [ ] Conversation persistence
- [ ] Draft management
- [ ] History UI

### Phase 4: Conversational UX (Week 3)
- [ ] Streaming messages
- [ ] Typing indicators
- [ ] Context memory
- [ ] Smart routing

### Phase 5: Black Magic (Week 3)
- [ ] Middleware system
- [ ] Event hooks
- [ ] Skill chaining
- [ ] Advanced patterns

## Configuration

### Environment Variables
```bash
# Agent discovery
GMGUI_AGENTS='[{"id":"agent-1","endpoint":"ws://localhost:3001"}]'
GMGUI_AGENT_SCAN_PORTS="3001-3010"
GMGUI_AGENT_CONFIG="~/.config/gmgui/agents.json"

# Display settings
GMGUI_SANDBOX_CSP='strict'
GMGUI_STREAM_DELAY='50ms'
GMGUI_HISTORY_LIMIT='1000'
```

## Security Considerations

1. **HTML Sandbox**
   - No cross-origin access
   - CSP headers enforced
   - Script execution limited

2. **File System**
   - Whitelist allowed paths
   - No absolute path exposure
   - Relative path only

3. **Agent Communication**
   - Message validation
   - Type checking
   - Error boundaries

## Testing Strategy

1. **Display Skills**
   - Unit tests for rendering
   - Security tests for sandbox
   - Performance tests

2. **Agent Discovery**
   - Mock agents for testing
   - Port scan validation
   - Config file parsing

3. **Conversation UX**
   - Streaming tests
   - History persistence
   - Draft recovery

4. **Pluggability**
   - Skill registration tests
   - Middleware tests
   - Hook tests

---

**Next Steps:** Begin Phase 1 implementation with display skills and skill registry system.
