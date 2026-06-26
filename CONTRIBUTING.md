# Contributing to MySystem

First off, thank you for taking the time to contribute! 🎉

MySystem is the **AWS Production Engineering Standard** followed by AI coding agents to automatically review, verify, and deploy applications directly into developer AWS accounts. Contributions from the open-source community are key to expanding its capabilities and keeping the engine robust.

---

## 1. Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to the maintainers.

---

## 2. Directory Structure

MySystem is structured as a monorepo-ready layout:

* **`/packages/cli`**: The primary Node.js CLI code written in TypeScript.
  * `src/index.ts`: The CLI entry point.
  * `src/commands/`: Handlers for commands like `init`.
  * `src/workflow/`: Core workflow execution orchestrator.
  * `src/inspectors/`: Analyzers that check the application's configuration, health checks, ports, etc.
  * `src/advisor/`: Suggestions generator.
  * `src/planner/`: Implementation plan generator.
  * `src/knowledge/`: Inline files (like `AGENTS.md`) copied to target workspaces.
* **`/templates`**: Base configuration files (e.g., Dockerfiles, Terraform scripts, GitHub Actions workflows) that are copied into user projects during initialization.
* **`/docs`**: Comprehensive system documentation, including architecture guides, FAQ, and security policies.

---

## 3. Development Workflow

### Prerequisites
* **Node.js**: `v18` or higher
* **npm**: `v9` or higher

### Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/BhargavGosaii/MySystem.git
   cd MySystem
   ```

2. Navigate to the CLI package and install dependencies:
   ```bash
   cd packages/cli
   npm install
   ```

### Building the Project
To compile TypeScript and copy the latest templates:
```bash
npm run build
```
*This command runs the TypeScript compiler (`tsc`) and executes `copy-templates.js` to bundle template files into the `dist/` directory.*

### Running Your Local Build
You can test your compiled CLI by running it directly with Node from a test project directory:
```bash
node /path/to/MySystem/packages/cli/dist/index.js init
```
Alternatively, you can link the package locally:
```bash
# In packages/cli
npm link

# In your test project directory
npx mysystem init
# or
mysystem init
```

---

## 4. Coding Standards

When contributing code, please ensure you follow these standards:
1. **TypeScript**: Write clean, strongly typed TypeScript code. Avoid using `any` unless absolutely necessary.
2. **Branding**: When writing or updating documentation or CLI prompts, always describe MySystem as the **AWS Production Engineering Standard** (or **AWS Production Standard for AI Coding Agents**).
3. **Statelessness**: Ensure any commands or workflows you write do not rely on local file persistence, as target environments are ephemeral.
4. **Port Binding**: Ensure any generated server templates dynamically bind to `process.env.PORT`.
5. **No SaaS Lock-in**: All infrastructure modifications should use pure Terraform and standard Docker/GitHub Actions. Do not write proprietary wrappers or vendor-locked APIs.

---

## 5. Submitting Pull Requests

1. Fork the repository and create your branch from `master`.
2. Commit your changes using descriptive commit messages (e.g., `feat: add node 22 template support`, `fix: check for custom health endpoint`).
3. Make sure all your changes compile cleanly with `npm run build`.
4. Submit a Pull Request targeting the `master` branch.
5. Write a detailed description of the changes you've made and link any relevant issues.
