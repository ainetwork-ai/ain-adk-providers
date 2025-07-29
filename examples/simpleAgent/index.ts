import "dotenv/config";
import { readFile } from "fs/promises";

import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AzureOpenAI } from "../../packages/models/azure";
import { GeminiModel } from "../../packages/models/gemini";
import { MCPModule, MemoryModule, ModelModule } from "@ainetwork/adk/modules";
// import { InMemoryMemory } from "../src/modules/memory/inmemory.js";
import { MongoDBMemory } from "../../packages/memory/mongodb";
import { AinAgentManifest } from "@ainetwork/adk/types/agent";
import { AINAgent } from "@ainetwork/adk";

const PORT = Number(process.env.PORT) || 9100;

async function readFileAsync(path: string): Promise<string> {
	const content: string = await readFile(path, 'utf-8');
	return content;
}

async function main() {
	const modelModule = new ModelModule();
	const azureModel = new AzureOpenAI(
		process.env.AZURE_OPENAI_PTU_BASE_URL!,
		process.env.AZURE_OPENAI_PTU_API_KEY!,
		process.env.AZURE_OPENAI_PTU_API_VERSION!,
		process.env.AZURE_OPENAI_MODEL_NAME!,
	);
	modelModule.addModel('azure-gpt-4o', azureModel);

	const geminiModel = new GeminiModel(
		process.env.GEMINI_API_KEY!,
		process.env.GEMINI_MODEL_NAME!,
	);
	modelModule.addModel('gemini-2.5', geminiModel);

	const mcpModule = new MCPModule();
	await mcpModule.addMCPConfig({
		notionApi: {
			command: "npx",
			args: ["-y", "@notionhq/notion-mcp-server"],
			env: {
				...getDefaultEnvironment(),
				OPENAPI_MCP_HEADERS: `{\"Authorization\": \"Bearer ${process.env.NOTION_API_KEY}\", \"Notion-Version\": \"2022-06-28\" }`,
			},
		},
	});

	// const inMemoryMemory = new InMemoryMemory();
	// const memoryModule = new MemoryModule(inMemoryMemory);
	// const mongodbMemory = new MongoDBMemory(process.env.MONGODB_URI!);
	// const memoryModule = new MemoryModule(mongodbMemory);

	const systemPrompt = await readFileAsync("./examples/sampleSystem.prompt");
	const manifest: AinAgentManifest = {
		name: "ComCom Agent",
		description: "An agent that can provide answers by referencing the contents of ComCom Notion.",
		version: "0.0.2", // Incremented version
		url: `http://localhost:${PORT}`,
		prompts: {
			agent: "",
			system: systemPrompt,
		}
	};
	const agent = new AINAgent(
		manifest,
		{ modelModule, mcpModule }
	);

	agent.start(PORT);
}

main();