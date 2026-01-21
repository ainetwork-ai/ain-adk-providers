import "dotenv/config";

import { AzureOpenAI } from "../../packages/models/azure";
import { GeminiModel } from "../../packages/models/gemini";
import { AuthModule, MemoryModule, ModelModule } from "@ainetwork/adk/modules";
import { InMemoryMemory } from "../../packages/memory/inmemory";
import { AINAgent } from "@ainetwork/adk";
import { FirebaseAuth } from "@ainetwork/adk-provider-auth-firebase";

const PORT = Number(process.env.PORT) || 9100;

async function main() {
  const modelModule = new ModelModule();
  const azureModel = new AzureOpenAI(
    process.env.AZURE_OPENAI_PTU_BASE_URL!,
    process.env.AZURE_OPENAI_PTU_API_KEY!,
    process.env.AZURE_OPENAI_PTU_API_VERSION!,
    process.env.AZURE_OPENAI_MODEL_NAME!
  );
  modelModule.addModel("azure-gpt-4o", azureModel);

  const geminiModel = new GeminiModel(process.env.GEMINI_API_KEY!, process.env.GEMINI_MODEL_NAME!);
  modelModule.addModel("gemini-2.5", geminiModel);

  const memoryModule = new MemoryModule(
    new InMemoryMemory() as any
  );

  const authModule = new FirebaseAuth({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
  });

  // Adapter to bridge differing @types/express versions between this package and @ainetwork/adk
  // We use any for the request/response types to avoid the incompatible Request type error.
  const authAdapter = {
    authenticate: (req: any, res: any, next?: any) => {
      // Delegate to the FirebaseAuth instance while using 'any' to bypass type mismatch
      return (authModule as any).authenticate(req, res, next);
    },
    // If the provider exposes additional methods like authorize, delegate them too
    authorize: (req: any) => {
      return (authModule as any).authorize ? (authModule as any).authorize(req) : Promise.resolve(false);
    },
  } as AuthModule;

  const manifest = {
    name: "Firebase Auth Agent",
    description: "An agent with Firebase authentication",
    version: "0.0.2", // Incremented version
    url: `http://localhost:${PORT}`,
  };
  const agent = new AINAgent(
    manifest,
    { authModule: authAdapter, modelModule, memoryModule }
  );

  agent.start(PORT);
}

main();
