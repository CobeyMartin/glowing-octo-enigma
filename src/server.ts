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

      try {
        if (url.pathname === '/health' && req.method === 'GET') {
          await this.handleHealth(req, res);
        } else if (url.pathname === '/models' && req.method === 'GET') {
          await this.handleModels(req, res);
        } else if (url.pathname === '/chat' && req.method === 'POST') {
          await this.handleChat(req, res);
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

  private async handleHealth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
  }

  private async handleModels(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const models = await vscode.lm.selectChatModels({});
      
      if (models.length === 0) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'No models available' }));
        return;
      }

      const modelList: ModelInfo[] = models.map((m) => ({
        id: m.id,
        name: m.name,
        family: m.family,
        vendor: m.vendor,
        maxInputTokens: m.maxInputTokens
      }));

      res.writeHead(200);
      res.end(JSON.stringify(modelList));
    } catch (err) {
      console.error('Error fetching models:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to fetch models' }));
    }
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
