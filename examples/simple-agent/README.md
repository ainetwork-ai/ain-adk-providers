# Simple ADK Agent Example

This example demonstrates how to build a simple agent using the AINetwork ADK (Agent Development Kit).

## Features

- **Multi-Model Support:** Integrates both Azure OpenAI and Google Gemini models.
- **In-Memory State:** Uses an in-memory module to manage the agent's state and conversation history.
- **Extensible:** The example shows how to add different modules (Models, MCP, Memory) and can be easily extended to include more tools or functionalities.

## How to Run

1.  **Install dependencies:**
    ```bash
    npm install
    ```
    or
    ```bash
    yarn
    ```

2.  **Set up environment variables:**
    Create a `.env` file in this directory and add the necessary API keys and configuration. See the Configuration section below.

3.  **Start the agent:**
    ```bash
    npx tsx index.ts
    ```

The agent will start on port 9100 by default.

## Configuration

You need to create a `.env` file with the following variables:

```env
# Azure OpenAI
AZURE_OPENAI_PTU_BASE_URL=YOUR_AZURE_OPENAI_BASE_URL
AZURE_OPENAI_PTU_API_KEY=YOUR_AZURE_OPENAI_API_KEY
AZURE_OPENAI_PTU_API_VERSION=YOUR_AZURE_OPENAI_API_VERSION
AZURE_OPENAI_MODEL_NAME=YOUR_AZURE_DEPLOYMENT_NAME

# Google Gemini
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL_NAME=YOUR_GEMINI_MODEL_NAME

# Optional: Port
PORT=9100
```
