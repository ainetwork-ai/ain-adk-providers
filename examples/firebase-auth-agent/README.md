# Firebase Auth Agent

A sample agent that demonstrates Firebase authentication integration with AIN ADK.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env`:
```env
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com

# Model Configuration (Azure OpenAI)
AZURE_OPENAI_PTU_BASE_URL=https://your-azure-openai-resource.openai.azure.com/
AZURE_OPENAI_PTU_API_KEY=your-azure-api-key
AZURE_OPENAI_PTU_API_VERSION=2024-02-01
AZURE_OPENAI_MODEL_NAME=gpt-4o

# Model Configuration (Gemini)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL_NAME=gemini-2.0-flash-exp

# Server Configuration
PORT=9100
```

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Go to Project Settings > Service Accounts
4. Generate a new private key
5. Use the generated JSON values in your `.env` file

## Authentication

This agent uses Firebase ID tokens for authentication. To make authenticated requests:

1. **Generate an ID Token**: Use Firebase Authentication to sign in a user and get their ID token
2. **Include in Authorization Header**: Add the ID token to your request headers:
   ```
   Authorization: Bearer YOUR_ID_TOKEN_HERE
   ```

### Example Request

```bash
curl -X POST http://localhost:9100/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -d '{"message": "Hello, authenticated agent!"}'
```

## Running the Agent

```bash
npx tsx index.ts
```

The agent will start on `http://localhost:9100` (or the port specified in your `.env` file).

## Features

- Firebase authentication using ID tokens
- Azure OpenAI and Gemini model support
- In-memory session and intent management
- RESTful API endpoints for chat interactions
