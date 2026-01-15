# LLM API Server

A VS Code extension that exposes the VS Code Language Model API as a local HTTP server on `localhost:3434`.

## Features

- Access VS Code's built-in language models (Copilot, GPT-4o, Claude, Gemini, etc.) via HTTP
- Simple JSON request/response format
- Token usage tracking (input and output tokens)
- Automatic context summarization when approaching token limits (80% threshold)
- No authentication required (localhost only)

## Endpoints

### `GET /health`

Health check endpoint.

**Response:**
```json
{ "status": "ok" }
```

### `GET /models`

List all available language models.

**Response:**
```json
[
  {
    "id": "gpt-4o",
    "name": "GPT-4o",
    "family": "gpt-4o",
    "vendor": "copilot",
    "maxInputTokens": 63805
  }
]
```

### `POST /chat`

Send a chat completion request.

**Request:**
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" },
    { "role": "assistant", "content": "Hi there! How can I help?" },
    { "role": "user", "content": "What is 2 + 2?" }
  ]
}
```

**Response:**
```json
{
  "content": "2 + 2 equals 4.",
  "usage": {
    "input_tokens": 42,
    "output_tokens": 8
  }
}
```

**Error Response:**
```json
{ "error": "Model not found" }
```

## Installation

### From Source

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile TypeScript:
   ```bash
   npm run compile
   ```
4. Press `F5` in VS Code to launch the Extension Development Host

### VS Code Commands

- **LLM API: Start Server** - Manually start the server
- **LLM API: Stop Server** - Stop the server

## Usage Example (Python)

```python
import requests

# Check health
resp = requests.get("http://localhost:3434/health")
print(resp.json())  # {"status": "ok"}

# List models
models = requests.get("http://localhost:3434/models").json()
print(f"Available: {[m['id'] for m in models]}")

# Chat
response = requests.post("http://localhost:3434/chat", json={
    "model": "gpt-4o",
    "messages": [
        {"role": "user", "content": "Explain Python in one sentence."}
    ]
})
data = response.json()
print(f"Response: {data['content']}")
print(f"Tokens: {data['usage']}")
```

## Usage Example (curl)

```bash
# Health check
curl http://localhost:3434/health

# List models
curl http://localhost:3434/models

# Chat
curl -X POST http://localhost:3434/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Context Management

When conversation messages exceed 80% of the model's `maxInputTokens`, the extension automatically:

1. Summarizes the conversation using the same model
2. Replaces the message history with the summary
3. Appends the latest user message
4. Retries the request

This allows for long-running conversations without manual token management.

## Requirements

- VS Code 1.90.0 or higher
- GitHub Copilot extension (for access to language models)
- Active Copilot subscription

## Limitations

- Runs only on localhost (no remote access by design)
- Requires VS Code to be running with the extension active
- Model availability depends on your Copilot subscription tier

## License

MIT
