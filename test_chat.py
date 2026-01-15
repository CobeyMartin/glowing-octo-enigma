#!/usr/bin/env python3
"""Test script for LLM API Server."""

import requests

BASE_URL = "http://localhost:3434"


def test_health():
    """Test the /health endpoint."""
    print("Testing /health...")
    resp = requests.get(f"{BASE_URL}/health")
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    print()


def test_models():
    """Test the /models endpoint."""
    print("Testing /models...")
    resp = requests.get(f"{BASE_URL}/models")
    print(f"  Status: {resp.status_code}")
    models = resp.json()
    if isinstance(models, list):
        print(f"  Available models: {len(models)}")
        for m in models:
            print(f"    - {m['id']} ({m['family']}, max tokens: {m['maxInputTokens']})")
    else:
        print(f"  Response: {models}")
    print()
    return models


def test_chat(model_id: str, message: str):
    """Test the /chat endpoint."""
    print(f"Testing /chat with model '{model_id}'...")
    print(f"  Message: {message}")
    
    payload = {
        "model": model_id,
        "messages": [
            {"role": "user", "content": message}
        ]
    }
    
    resp = requests.post(f"{BASE_URL}/chat", json=payload)
    print(f"  Status: {resp.status_code}")
    
    data = resp.json()
    if "content" in data:
        print(f"  Response: {data['content'][:200]}...")
        print(f"  Usage: {data['usage']}")
    else:
        print(f"  Error: {data}")
    print()


def test_chat_conversation(model_id: str):
    """Test multi-turn conversation."""
    print(f"Testing multi-turn conversation with model '{model_id}'...")
    
    messages = [
        {"role": "system", "content": "You are a helpful assistant. Be concise."},
        {"role": "user", "content": "My name is Alice."},
    ]
    
    # First turn
    payload = {"model": model_id, "messages": messages}
    resp = requests.post(f"{BASE_URL}/chat", json=payload)
    data = resp.json()
    print(f"  User: My name is Alice.")
    print(f"  Assistant: {data.get('content', data)}")
    
    # Add assistant response and continue
    if "content" in data:
        messages.append({"role": "assistant", "content": data["content"]})
        messages.append({"role": "user", "content": "What's my name?"})
        
        payload = {"model": model_id, "messages": messages}
        resp = requests.post(f"{BASE_URL}/chat", json=payload)
        data = resp.json()
        print(f"  User: What's my name?")
        print(f"  Assistant: {data.get('content', data)}")
        print(f"  Usage: {data.get('usage', 'N/A')}")
    print()


if __name__ == "__main__":
    print("=" * 50)
    print("LLM API Server Test")
    print("=" * 50)
    print()
    
    try:
        test_health()
        models = test_models()
        
        if isinstance(models, list) and len(models) > 0:
            # Prefer known chat models over codex models
            preferred = ["claude-sonnet-4.5", "gpt-4o", "gpt-5", "claude-sonnet-4", "gpt-4o-mini"]
            model_id = None
            for pref in preferred:
                for m in models:
                    if m["id"] == pref or m["family"] == pref:
                        model_id = m["id"]
                        break
                if model_id:
                    break
            
            # Fallback to first model if no preferred found
            if not model_id:
                model_id = models[0]["id"]
            
            test_chat(model_id, "What is 2 + 2? Answer in one word.")
            test_chat_conversation(model_id)
        else:
            print("No models available. Make sure VS Code with Copilot is running.")
            
    except requests.exceptions.ConnectionError:
        print("ERROR: Could not connect to server.")
        print("Make sure the extension is running (press F5 in VS Code).")
