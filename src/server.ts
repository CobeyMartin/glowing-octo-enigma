import * as http from 'http';
import * as vscode from 'vscode';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

interface ChatResponse {
  content: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface ModelInfo {
  id: string;
  name: string;
  family: string;
  vendor: string;
  maxInputTokens: number;
}

// HTML escaping to prevent XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// HTML Templates
const baseStyles = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    h1 {
      color: #00d4ff;
      margin-bottom: 1.5rem;
      font-size: 2rem;
      text-align: center;
    }
    .card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
    }
    .status-ok { color: #00ff88; }
    .status-error { color: #ff4444; }
    .nav {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }
    .nav a {
      color: #00d4ff;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border: 1px solid #00d4ff;
      border-radius: 6px;
      transition: all 0.3s ease;
    }
    .nav a:hover {
      background: #00d4ff;
      color: #1a1a2e;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      margin-left: 0.5rem;
    }
    .badge-vendor { background: #6366f1; }
    .badge-family { background: #8b5cf6; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    th { color: #00d4ff; font-weight: 600; }
    .chat-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 200px);
      min-height: 400px;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .message {
      margin-bottom: 1rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      max-width: 80%;
    }
    .message-user {
      background: #00d4ff;
      color: #1a1a2e;
      margin-left: auto;
    }
    .message-assistant {
      background: rgba(255, 255, 255, 0.1);
    }
    .chat-input-container {
      display: flex;
      gap: 0.5rem;
    }
    .chat-input {
      flex: 1;
      padding: 0.75rem 1rem;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #e0e0e0;
      font-size: 1rem;
    }
    .chat-input:focus {
      outline: none;
      border-color: #00d4ff;
    }
    .send-btn {
      padding: 0.75rem 1.5rem;
      background: #00d4ff;
      color: #1a1a2e;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .send-btn:hover { background: #00b8e6; }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    select {
      padding: 0.5rem;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      color: #e0e0e0;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    select:focus { outline: none; border-color: #00d4ff; }
    .loading { opacity: 0.7; font-style: italic; }
  </style>
`;

const navHtml = `
  <nav class="nav">
    <a href="/health">Health</a>
    <a href="/models">Models</a>
    <a href="/chat">Chat</a>
  </nav>
`;

function healthPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM API Server - Health</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <h1>🏥 Health Status</h1>
    ${navHtml}
    <div class="card">
      <h2>Server Status: <span class="status-ok">✓ OK</span></h2>
      <p style="margin-top: 1rem; color: #888;">The LLM API Server is running and ready to accept requests.</p>
    </div>
    <div class="card">
      <h3 style="margin-bottom: 0.5rem;">API Endpoints</h3>
      <table>
        <tr><th>Endpoint</th><th>Method</th><th>Description</th></tr>
        <tr><td>/health</td><td>GET</td><td>Check server status</td></tr>
        <tr><td>/models</td><td>GET</td><td>List available models</td></tr>
        <tr><td>/chat</td><td>POST</td><td>Send chat messages</td></tr>
      </table>
    </div>
  </div>
</body>
</html>`;
}

function modelsPageHtml(models: ModelInfo[]): string {
  const modelRows = models.map(m => `
    <tr>
      <td>${escapeHtml(m.name)}<span class="badge badge-family">${escapeHtml(m.family)}</span></td>
      <td><span class="badge badge-vendor">${escapeHtml(m.vendor)}</span></td>
      <td>${m.maxInputTokens.toLocaleString()}</td>
      <td><code style="font-size: 0.8rem; color: #888;">${escapeHtml(m.id)}</code></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM API Server - Models</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <h1>🤖 Available Models</h1>
    ${navHtml}
    <div class="card">
      <p style="margin-bottom: 1rem;">Found <strong>${models.length}</strong> model(s) available for use.</p>
      <table>
        <tr><th>Name</th><th>Vendor</th><th>Max Tokens</th><th>ID</th></tr>
        ${modelRows}
      </table>
    </div>
  </div>
</body>
</html>`;
}

function noModelsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM API Server - Models</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <h1>🤖 Available Models</h1>
    ${navHtml}
    <div class="card">
      <h2 class="status-error">No Models Available</h2>
      <p style="margin-top: 1rem; color: #888;">
        No language models are currently available. Please ensure you have GitHub Copilot or another
        language model extension installed and activated in VS Code.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function chatPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM API Server - Chat</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <h1>💬 Chat</h1>
    ${navHtml}
    <div class="card chat-container">
      <div style="margin-bottom: 1rem;">
        <label for="model-select">Model: </label>
        <select id="model-select">
          <option value="">Loading models...</option>
        </select>
      </div>
      <div class="chat-messages" id="chat-messages">
        <p style="color: #888; text-align: center;">Start a conversation by typing a message below.</p>
      </div>
      <div class="chat-input-container">
        <input type="text" class="chat-input" id="chat-input" placeholder="Type your message..." />
        <button class="send-btn" id="send-btn">Send</button>
      </div>
    </div>
  </div>
  <script>
    const messagesDiv = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const modelSelect = document.getElementById('model-select');
    
    let messages = [];
    let models = [];

    // Load models
    async function loadModels() {
      try {
        const res = await fetch('/models', { headers: { 'Accept': 'application/json' } });
        models = await res.json();
        modelSelect.innerHTML = models.map(m => 
          '<option value="' + m.id + '">' + m.name + ' (' + m.vendor + ')</option>'
        ).join('');
      } catch (err) {
        modelSelect.innerHTML = '<option value="">Failed to load models</option>';
      }
    }
    loadModels();

    function addMessage(role, content) {
      messages.push({ role, content });
      const div = document.createElement('div');
      div.className = 'message message-' + role;
      div.textContent = content;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || !modelSelect.value) return;

      input.value = '';
      addMessage('user', text);
      
      sendBtn.disabled = true;
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'message message-assistant loading';
      loadingDiv.textContent = 'Thinking...';
      messagesDiv.appendChild(loadingDiv);

      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelSelect.value,
            messages: messages
          })
        });
        
        const data = await res.json();
        messagesDiv.removeChild(loadingDiv);
        
        if (data.error) {
          addMessage('assistant', 'Error: ' + data.error);
        } else {
          addMessage('assistant', data.content);
        }
      } catch (err) {
        messagesDiv.removeChild(loadingDiv);
        addMessage('assistant', 'Error: Failed to send message');
      }
      
      sendBtn.disabled = false;
      input.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`;
}

function errorPageHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LLM API Server - Error</title>
  ${baseStyles}
</head>
<body>
  <div class="container">
    <h1>⚠️ ${escapeHtml(title)}</h1>
    ${navHtml}
    <div class="card">
      <p class="status-error">${escapeHtml(message)}</p>
    </div>
  </div>
</body>
</html>`;
}

export class LLMServer {
  private server: http.Server | undefined;
  private port: number;
  private running = false;

  constructor(port: number) {
    this.port = port;
  }

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    this.server = http.createServer(async (req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Content-Type', 'application/json');

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${this.port}`);

      // Check if request accepts HTML (browser request)
      const acceptHeader = req.headers.accept || '';
      const wantsHtml = acceptHeader.includes('text/html');

      try {
        if (url.pathname === '/health' && req.method === 'GET') {
          await this.handleHealth(req, res, wantsHtml);
        } else if (url.pathname === '/models' && req.method === 'GET') {
          await this.handleModels(req, res, wantsHtml);
        } else if (url.pathname === '/chat' && req.method === 'POST') {
          await this.handleChat(req, res);
        } else if (url.pathname === '/chat' && req.method === 'GET' && wantsHtml) {
          await this.handleChatPage(res);
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err) {
        console.error('Server error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        vscode.window.showErrorMessage(`Port ${this.port} is already in use. LLM API Server could not start.`);
      } else {
        vscode.window.showErrorMessage(`LLM API Server error: ${err.message}`);
      }
      this.running = false;
    });

    this.server.listen(this.port, 'localhost', () => {
      this.running = true;
      vscode.window.showInformationMessage(`LLM API Server running on http://localhost:${this.port}`);
      console.log(`LLM API Server running on http://localhost:${this.port}`);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.running = false;
          this.server = undefined;
          console.log('LLM API Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleHealth(req: http.IncomingMessage, res: http.ServerResponse, wantsHtml: boolean): Promise<void> {
    if (wantsHtml) {
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(healthPageHtml());
    } else {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
    }
  }

  private async handleModels(req: http.IncomingMessage, res: http.ServerResponse, wantsHtml: boolean): Promise<void> {
    try {
      const models = await vscode.lm.selectChatModels({});
      
      if (models.length === 0) {
        if (wantsHtml) {
          res.setHeader('Content-Type', 'text/html');
          res.writeHead(200);
          res.end(noModelsPageHtml());
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'No models available' }));
        }
        return;
      }

      const modelList: ModelInfo[] = models.map((m) => ({
        id: m.id,
        name: m.name,
        family: m.family,
        vendor: m.vendor,
        maxInputTokens: m.maxInputTokens
      }));

      if (wantsHtml) {
        res.setHeader('Content-Type', 'text/html');
        res.writeHead(200);
        res.end(modelsPageHtml(modelList));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify(modelList));
      }
    } catch (err) {
      console.error('Error fetching models:', err);
      if (wantsHtml) {
        res.setHeader('Content-Type', 'text/html');
        res.writeHead(500);
        res.end(errorPageHtml('Error', 'Failed to fetch models'));
      } else {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to fetch models' }));
      }
    }
  }

  private async handleChatPage(res: http.ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(chatPageHtml());
  }

  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Parse request body
    const body = await this.readBody(req);
    let chatRequest: ChatRequest;

    try {
      chatRequest = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    // Validate request
    if (!chatRequest.model || !chatRequest.messages || !Array.isArray(chatRequest.messages)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid request. Required: model (string), messages (array)' }));
      return;
    }

    // Find the requested model
    const models = await vscode.lm.selectChatModels({});
    const model = models.find((m) => m.id === chatRequest.model || m.family === chatRequest.model);

    if (!model) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Model not found' }));
      return;
    }

    try {
      // Convert messages to VS Code format and handle context limit
      let messages = await this.prepareMessages(chatRequest.messages, model);

      // Count input tokens
      let inputTokens = 0;
      for (const msg of messages) {
        inputTokens += await model.countTokens(msg);
      }

      // Check if we need to summarize (80% threshold)
      const threshold = model.maxInputTokens * 0.8;
      if (inputTokens > threshold) {
        messages = await this.summarizeConversation(messages, model, chatRequest.messages);
        
        // Recount tokens after summarization
        inputTokens = 0;
        for (const msg of messages) {
          inputTokens += await model.countTokens(msg);
        }
      }

      // Send request to model
      const response = await model.sendRequest(messages, {});

      // Collect full response
      let content = '';
      for await (const fragment of response.text) {
        content += fragment;
      }

      // Count output tokens
      const outputTokens = await model.countTokens(content);

      const chatResponse: ChatResponse = {
        content,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens
        }
      };

      res.writeHead(200);
      res.end(JSON.stringify(chatResponse));
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Chat error:', error);
      console.error('Error name:', error?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      if (err instanceof vscode.LanguageModelError) {
        console.error('LanguageModelError code:', err.code);
        console.error('LanguageModelError cause:', err.cause);
        if (err.code === 'NoPermissions') {
          res.writeHead(403);
          res.end(JSON.stringify({ error: 'Permission denied. Please accept the Copilot consent dialog in VS Code.' }));
          return;
        } else if (err.code === 'Blocked') {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Content blocked by model' }));
          return;
        }
      }

      res.writeHead(500);
      res.end(JSON.stringify({ error: `Chat request failed: ${error?.message || 'Unknown error'}` }));
    }
  }

  private async prepareMessages(messages: ChatMessage[], model: vscode.LanguageModelChat): Promise<vscode.LanguageModelChatMessage[]> {
    const vscodeMessages: vscode.LanguageModelChatMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'system') {
        vscodeMessages.push(vscode.LanguageModelChatMessage.User(msg.content));
      } else if (msg.role === 'assistant') {
        vscodeMessages.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
      }
    }

    return vscodeMessages;
  }

  private async summarizeConversation(
    currentMessages: vscode.LanguageModelChatMessage[],
    model: vscode.LanguageModelChat,
    originalMessages: ChatMessage[]
  ): Promise<vscode.LanguageModelChatMessage[]> {
    console.log('Context limit approaching, summarizing conversation...');

    // Build a summary request
    const conversationText = originalMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt = vscode.LanguageModelChatMessage.User(
      `Please provide a concise summary of the following conversation, preserving key context and decisions:\n\n${conversationText}`
    );

    try {
      const summaryResponse = await model.sendRequest([summaryPrompt], {});
      
      let summary = '';
      for await (const fragment of summaryResponse.text) {
        summary += fragment;
      }

      // Get the last user message
      const lastUserMessage = originalMessages
        .filter((m) => m.role === 'user')
        .pop();

      // Return summarized context + last user message
      const newMessages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(`Previous conversation summary: ${summary}`)
      ];

      if (lastUserMessage) {
        newMessages.push(vscode.LanguageModelChatMessage.User(lastUserMessage.content));
      }

      console.log('Conversation summarized successfully');
      return newMessages;
    } catch (err) {
      console.error('Failed to summarize conversation:', err);
      // Fall back to truncating - keep last few messages
      return currentMessages.slice(-4);
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', (err) => {
        reject(err);
      });
    });
  }
}
