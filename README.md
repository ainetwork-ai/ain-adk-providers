# AINetwork ADK Providers

This monorepo contains official and community-driven provider packages for the [AINetwork Agent Development Kit (ADK)](https://github.com/ainetwork/ain-adk). These packages extend the capabilities of ADK agents by enabling them to connect to various Large Language Models (LLMs) and memory/database systems.

## Packages

This repository is managed using [Lerna](https://lerna.js.org/) and [Yarn Workspaces](https://classic.yarnpkg.com/lang/en/docs/workspaces/).

### Model Providers

-   [`packages/models/azure`](./packages/models/azure/): A provider to integrate with Azure OpenAI models.
-   [`packages/models/gemini`](./packages/models/gemini/): A provider to integrate with Google Gemini models.

### Memory Providers

-   [`packages/memory/inmemory`](./packages/memory/inmemory/): A simple, non-persistent in-memory provider for agent state and conversation history.
-   [`packages/memory/mongodb`](./packages/memory/mongodb/): A persistent memory provider using MongoDB to store agent data.

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (v20 or higher)
-   [Yarn](https://yarnpkg.com/)

### Installation

Clone the repository and install all dependencies using Yarn.

```bash
git clone https://github.com/ainetwork/ain-adk-providers.git
cd ain-adk-providers
yarn install
```

## Development

### Available Scripts

You can run the following scripts from the root directory:

-   `yarn build`: Builds all packages using `tsup`.
-   `yarn clean`: Removes `dist` directories from all packages.
-   `yarn lint`: Checks for code quality and style issues using Biome.
-   `yarn lint:write`: Automatically fixes linting and formatting issues.
-   `yarn update:adk`: Updates the `@ainetwork/adk` dependency across all packages.

### Running Examples

The [`examples`](./examples/) directory contains sample agents that demonstrate how to use these providers. Check the `README.md` file in each example directory for specific instructions.

## Publishing

This project uses Lerna to manage versioning and publishing to NPM.

Before publishing, ensure all changes are committed. Then, run the following command:

```bash
yarn publish
```

This will prompt you to select the new version for each changed package (if in independent mode) and publish them to the NPM registry.

## License

This project is licensed under the MIT License.
