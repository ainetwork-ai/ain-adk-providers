import "dotenv/config";

import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AzureOpenAI } from "@ainetwork/adk-provider-model-azure";
import { BaseAuth, MCPModule, MemoryModule, ModelModule } from "@ainetwork/adk/modules";
import { MongoDBSession, MongoDBIntent } from "@ainetwork/adk-provider-memory-mongodb";
import { AINAgent } from "@ainetwork/adk";
import { AuthResponse } from "@ainetwork/adk/types/auth";

const PORT = Number(process.env.PORT) || 9101;

class NoAuthScheme extends BaseAuth {
	public async authenticate(req, res): Promise<AuthResponse> {
		return { isAuthenticated: true, userId: 'test-user-id' }
	}
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
	await mcpModule.addMCPConfig({
		slack: {
			command: "npx",
			args: [
				"-y",
        "slack-mcp-server@latest",
        "--transport",
        "stdio"
      ],
			env: {
				...getDefaultEnvironment(),
				SLACK_MCP_XOXP_TOKEN: process.env.SLACK_MCP_XOXP_TOKEN!
			},
		},
	});

	const memoryModule = new MemoryModule({
		session: new MongoDBSession(process.env.MONGO_DB_CONNECTION_STRING!),
		intent: new MongoDBIntent(process.env.MONGO_DB_CONNECTION_STRING!),
	});

	const systemPrompt = `
You are a highly sophisticated automated agent that can answer user queries by utilizing various tools and resources.

There is a selection of tools that let you perform actions or retrieve helpful context to answer the user's question.
You can call tools repeatedly to take actions or gather as much context as needed until you have completed the task fully.

Don't give up unless you are sure the request cannot be fulfilled with the tools you have.
It's YOUR RESPONSIBILITY to make sure that you have done all you can to collect necessary context.

If you are not sure about content or context pertaining to the user's request, use your tools to read data and gather the relevant information: do NOT guess or make up an answer.
Be THOROUGH when gathering information. Make sure you have the FULL picture before replying. Use additional tool calls or clarifying questions as needed.

Don't try to answer the user's question directly.
First break down the user's request into smaller concepts and think about the kinds of tools and queries you need to grasp each concept.

There are two <tool_type> for tools: MCP_Tool and A2A_Tool.
The tool type can be identified by the presence of "[Bot Called <tool_type> with args <tool_args>]" at the beginning of the tool result message.
After executing a tool, a final response message must be written.

Refer to the usage instructions below for each <tool_type>.

<MCP_Tool>
   Use MCP tools through tools.
   MCP tool names are structured as follows:
     {MCP_NAME}_{TOOL_NAME}
     For example, tool names for the "notionApi" mcp would be:
       notionApi_API-post-search

   Separate rules can be specified under <{MCP_NAME}> for each MCP_NAME.
</MCP_Tool>

Unless otherwise requested, please send the response as is without summarizing.
`

	const authScheme = new NoAuthScheme();

	const manifest = {
		name: "ComCom Workspace Agent",
		description: "An agent that can provide answers by referencing the contents of ComCom Notion and Slack.",
		version: "0.0.2",
		url: `http://localhost:${PORT}`,
		prompts: {
			agent: "",
			system: systemPrompt,
		}
	};
	const agent = new AINAgent(
		manifest,
		{ modelModule, mcpModule, memoryModule },
		authScheme,
		true
	);

	agent.start(PORT);
}

main();