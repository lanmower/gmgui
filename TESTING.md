# GMGUI Testing Guide

Complete testing guide for GMGUI with multiple test scenarios, including Bun SQLite integration and agent-browser automated testing.

## Quick Test (5 minutes)

### Setup
```bash
# Terminal 1
npm start

# Terminal 2
node examples/mock-agent.js

# Terminal 3
node examples/agent-client.js --id test-agent --endpoint ws://localhost:3001 --verbose

# Browser
Open http://localhost:3000
```

## Automated Tests

### Integration Test
```bash
./test-integration.sh
```

Tests:
- ✅ Server startup
- ✅ WebSocket connections
- ✅ Message routing
- ✅ Agent lifecycle
- ✅ Error recovery

## Browser Testing with agent-browser

The agent-browser skill provides automated browser interaction testing. Use it for:

1. **UI Interaction Testing**
   - Form filling
   - Button clicking
   - Text input
   - Navigation

2. **Real-time Communication Testing**
   - WebSocket connection verification
   - Message delivery confirmation
   - Status updates
   - Console output validation

3. **Settings Persistence Testing**
   - localStorage validation
   - Page refresh scenarios
   - State recovery

### Setup agent-browser Test

```bash
# Install agent-browser if not available
npm install @anthropic-sdk/agent-browser

# Run browser tests
node run-browser-tests.js
```

### Browser Test Scenarios

#### Test 1: Basic UI Load
```javascript
// Navigate to GMGUI
await browser.goto('http://localhost:3000');

// Verify title
const title = await browser.evaluate(() => document.title);
console.assert(title === 'GMGUI - Multi-Agent ACP Client');

// Check main elements
const header = await browser.querySelector('h1');
console.assert(header !== null);
```

#### Test 2: Agent Connection
```javascript
// Fill agent form
await browser.fill('#agentId', 'test-agent');
await browser.fill('#agentEndpoint', 'ws://localhost:3001');

// Click connect
await browser.click('button:contains("Connect")');

// Wait for agent in list
await browser.waitFor('.agent-item', { timeout: 5000 });

// Verify status
const status = await browser.textContent('.agent-status');
console.assert(status === 'connected');
```

#### Test 3: Message Sending
```javascript
// Select agent
await browser.click('.agent-item');

// Type message
await browser.fill('#messageInput', 'Hello Agent');

// Send
await browser.click('button:contains("Send")');

// Wait for console output
await browser.waitFor('.console-message:contains("Sent to test-agent")', {
  timeout: 3000,
});

// Verify message appears
const messages = await browser.textContent('#consoleOutput');
console.assert(messages.includes('Hello Agent'));
```

#### Test 4: Settings Persistence
```javascript
// Click settings tab
await browser.click('button[data-tab="settings"]');

// Toggle auto-scroll
await browser.click('#autoScroll');

// Verify checked
const checked = await browser.isChecked('#autoScroll');
console.assert(!checked);

// Refresh page
await browser.reload();

// Verify setting persisted
const stillUnchecked = await browser.isChecked('#autoScroll');
console.assert(!stillUnchecked);
```

#### Test 5: Agent Disconnect
```javascript
// Find disconnect button for agent
const disconnectBtn = await browser.querySelector('.agent-actions button:last-child');

// Click disconnect
await browser.click(disconnectBtn);

// Verify agent removed
await browser.waitFor('.agent-item', {
  timeout: 2000,
  visible: false,
});

// Check console message
const messages = await browser.textContent('#consoleOutput');
console.assert(messages.includes('Disconnected from test-agent'));
```

## Bun SQLite Testing

### Test Database Functionality

```bash
# Run Bun server with SQLite
bun run server-bun.js
```

### Verify Database

```bash
# Check database exists
ls -lh gmgui.db

# Query agents table
sqlite3 gmgui.db "SELECT * FROM agents;"

# Query messages table
sqlite3 gmgui.db "SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;"

# Get message history via API
curl http://localhost:3000/api/agents/test-agent/history?limit=20
```

### Test Scenarios with Bun

#### Test 1: Message Persistence
```bash
# Start server (Bun)
bun run server-bun.js &

# Send a message
curl -X POST http://localhost:3000/api/agents/test-agent \
  -H "Content-Type: application/json" \
  -d '{"type":"message","content":"Test message"}'

# Verify in database
sqlite3 gmgui.db "SELECT * FROM messages WHERE agentId='test-agent';"
```

#### Test 2: Agent Status Tracking
```bash
# Check agent status in DB
sqlite3 gmgui.db "SELECT id, status, lastMessageAt FROM agents;"

# Update agent
curl -X POST http://localhost:3000/api/agents/agent1 \
  -H "Content-Type: application/json" \
  -d '{"status":"connected"}'

# Verify update
sqlite3 gmgui.db "SELECT status FROM agents WHERE id='agent1';"
```

#### Test 3: History Retrieval
```bash
# Get last 50 messages for agent
curl http://localhost:3000/api/agents/test-agent/history?limit=50 | jq .

# Verify response
# Should return JSON array with messages
```

## Performance Testing

### Load Test - Multiple Agents

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start multiple agents
for i in {1..10}; do
  node examples/agent-client.js \
    --id agent-$i \
    --endpoint ws://localhost:3001 &
done

# Terminal 3: Monitor
curl http://localhost:3000/api/agents | jq '.agents | length'
# Should show 10 agents
```

### Message Throughput Test

```javascript
// In browser console
const start = Date.now();
let count = 0;

const interval = setInterval(() => {
  app.sendMessage();
  count++;
  if (count >= 100) {
    clearInterval(interval);
    const elapsed = Date.now() - start;
    console.log(`Sent 100 messages in ${elapsed}ms`);
    console.log(`Throughput: ${(100000 / elapsed).toFixed(2)} msg/sec`);
  }
}, 10);
```

### Memory Usage Test

```bash
# Terminal 1: Start server and monitor memory
node --expose-gc server.js &
PID=$!

# Terminal 2: Monitor memory growth
watch -n 1 "ps -p $PID -o %mem=,rss="

# Terminal 3: Send messages
for i in {1..1000}; do
  curl -s http://localhost:3000/api/agents/test-agent \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"message\",\"content\":\"Test $i\"}" > /dev/null
done
```

## Full End-to-End Test Checklist

### Prerequisites
- ✅ Node.js 18+ or Bun installed
- ✅ npm packages installed (`npm install`)
- ✅ Port 3000 and 3001 available

### Test Flow

1. **Start Services**
   ```bash
   # Terminal 1
   npm start

   # Terminal 2
   node examples/mock-agent.js

   # Terminal 3
   node examples/agent-client.js --id e2e-test --endpoint ws://localhost:3001
   ```

2. **Browser Testing**
   - [ ] Open http://localhost:3000
   - [ ] Verify page loads
   - [ ] Check for "GMGUI" title
   - [ ] See "No agents connected" message

3. **Agent Connection**
   - [ ] Enter "e2e-test" in Agent ID
   - [ ] Enter "ws://localhost:3001" in Endpoint
   - [ ] Click "Connect"
   - [ ] Wait for agent to appear in sidebar
   - [ ] Verify status shows "connected"

4. **Message Exchange**
   - [ ] Click on agent to select it
   - [ ] Type "Test message" in input
   - [ ] Press Enter to send
   - [ ] Verify message appears in console
   - [ ] Check timestamp is recorded

5. **Settings**
   - [ ] Click "Settings" tab
   - [ ] Verify auto-scroll checkbox
   - [ ] Toggle it off
   - [ ] Verify it stays off after refresh

6. **Console Operations**
   - [ ] Send 5 more messages
   - [ ] Verify all in console
   - [ ] Click "Clear"
   - [ ] Verify console is empty

7. **Disconnect**
   - [ ] Click "Disconnect" button
   - [ ] Verify agent removed from sidebar
   - [ ] Check console shows disconnection message

8. **Database Verification** (if using Bun)
   ```bash
   sqlite3 gmgui.db "SELECT COUNT(*) as msg_count FROM messages;"
   # Should show at least 6 messages
   ```

## CI/CD Testing

### GitHub Actions Workflow

```yaml
name: Test GMGUI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run integration tests
        run: ./test-integration.sh
      
      - name: Verify Bun compatibility
        run: |
          npm install -g bun
          bun run server-bun.js &
          sleep 2
          curl http://localhost:3000/api/agents
```

## Test Environment Variables

```bash
# Port configuration
PORT=3000

# Server mode
NODE_ENV=test

# Watch mode
WATCH=true

# Verbose logging
VERBOSE=true

# Database file (Bun)
DB_FILE=gmgui-test.db
```

## Troubleshooting Tests

### Server won't start
```bash
# Check port is available
lsof -i :3000

# Kill any process on port
fuser -k 3000/tcp

# Try different port
PORT=3001 npm start
```

### Agent won't connect
```bash
# Verify mock agent running
curl ws://localhost:3001 -I

# Check agent endpoint in code
grep -r "3001" examples/

# Try verbose mode
node examples/agent-client.js --verbose
```

### WebSocket connection fails
```bash
# Check browser console for errors
# Open DevTools: F12 → Console tab

# Verify WebSocket upgrade
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:3000/
```

### Database errors (Bun)
```bash
# Check database integrity
sqlite3 gmgui.db ".integrity_check"

# Backup and reset
cp gmgui.db gmgui.db.backup
rm gmgui.db
# Server will recreate on startup
```

## Test Reports

After running tests, check:

1. **Console Output**
   - Look for ✅ (pass) vs ❌ (fail) symbols
   - Check timing information
   - Verify no error messages

2. **Server Logs**
   ```bash
   tail -f /tmp/gmgui.log
   ```

3. **Browser DevTools**
   - Console tab: Check for JavaScript errors
   - Network tab: Check WebSocket frames
   - Storage tab: Check localStorage

4. **Database Statistics** (Bun)
   ```bash
   sqlite3 gmgui.db "SELECT 
     (SELECT COUNT(*) FROM agents) as agents,
     (SELECT COUNT(*) FROM messages) as messages,
     (SELECT COUNT(*) FROM sessions) as sessions;"
   ```

## Continuous Testing

```bash
# Watch mode - re-run tests on file changes
npm run test:watch

# Or manually with nodemon
npm install -g nodemon
nodemon --watch . --exec ./test-integration.sh
```

---

**All tests should pass before considering the build production-ready.**

See [PROJECT_STATUS.md](PROJECT_STATUS.md) for final verification checklist.
