import * as vscode from 'vscode';
import { LLMServer } from './server';

let server: LLMServer | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('LLM API Server extension activating...');

  // Start server automatically
  server = new LLMServer(3434);
  server.start();

  // Register start command
  const startCommand = vscode.commands.registerCommand('llm-api.startServer', () => {
    if (server && server.isRunning()) {
      vscode.window.showInformationMessage('LLM API Server is already running on http://localhost:3434');
      return;
    }
    server = new LLMServer(3434);
    server.start();
  });

  // Register stop command
  const stopCommand = vscode.commands.registerCommand('llm-api.stopServer', () => {
    if (server) {
      server.stop();
      vscode.window.showInformationMessage('LLM API Server stopped');
    }
  });

  // Register disposables
  context.subscriptions.push(startCommand, stopCommand, {
    dispose: () => {
      if (server) {
        server.stop();
      }
    }
  });
}

export function deactivate(): Promise<void> | undefined {
  if (server) {
    return server.stop();
  }
  return undefined;
}
