# MySystem — Production Engineering Standard for AI Coding Agents

MySystem is an open-source Production Engineering Standard for AI coding agents deploying to AWS. 

AI coding tools like Cursor, Claude Code, and Lovable are excellent at building application logic, but production deployment still requires deep infrastructure expertise. MySystem bridges this gap. It acts as the production handbook and verification framework that helps your AI agent configure and deploy your application safely into AWS infrastructure that you own.

**"The AI owns the application. MySystem owns production readiness."**

---

## 🤖 The Developer Journey

```mermaid
graph TD
    Developer["Developer"] -->|"Deploy this application"| AI["AI Coding Agent<br>(Cursor / Claude Code / Antigravity)"]
    AI -->|Reads standard| MySystem["MySystem Standards<br>(AGENTS.md / mysystem.json)"]
    AI -->|Audits codebase| Review["Production Review<br>(Security, Reliability, Cost, Observability)"]
    AI -->|Generates config| Plan["Production Plan<br>(Dockerfile, Terraform, Workflows)"]
    AI -->|Pushes changes| GitHub["GitHub Actions Pipeline"]
    GitHub -->|Passwordless OIDC deploy| AWS["Your AWS Account<br>(EC2 / ECS / RDS / S3)"]
    AWS -->|Runs live| Live["Live Application"]
```

---

## ⚖️ Without vs. With MySystem

### Without MySystem
```
Developer ➔ AI builds app ➔ Complex cloud questions ➔ Manual AWS Console setup ➔ Writing custom Terraform ➔ Debugging ports & healthchecks ➔ Unsecured access keys ➔ Fragile deployments 🛑
```

### With MySystem
```
Developer ➔ AI builds app ➔ AI follows MySystem Standard ➔ Git Push ➔ Automated AWS OIDC Deployment ➔ Secure, cost-optimized live application 🎉
```

---

## 🚀 Why MySystem?

AI agents can generate server code in seconds, but deploying it correctly requires making dozens of operations decisions: *Which instance type is cheapest? How do I configure SSL? Where do I store secrets? How do I hook up CI/CD without hardcoding AWS passwords?*

MySystem establishes a clear standard to automate these decisions:
1. **Preserves Application Architecture**: It respects the database and caching technologies your AI chose rather than forcing a redesign.
2. **Minimizes AWS Monthly Costs**: Selects the smallest viable cloud footprint (such as $3.20/mo ARM EC2 instances for hobbyists, and NAT-less network routing for production containers) to prevent surprise bills.
3. **Enforces Production Best Practices**: Validates secure non-root containers, ACM SSL/TLS certificates, graceful shutdowns, structured JSON logging, and AWS budget alerts.
4. **Zero SaaS Lock-in**: Everything is provisioned directly inside your own AWS account using industry-standard Terraform and Docker. You pay wholesale AWS rates directly.

---

## 🤝 Zero Decision Deployment

Deploy AI-built applications into your own AWS account with almost no manual input.

The only things the developer should provide are:
* **AWS Authentication** (logged in via AWS CLI)
* **GitHub Authentication** (logged in via GitHub CLI)
* **Secrets** (referenced as environment variables)
* **Domain Ownership** (optional, if using a custom domain)

Everything else is inferred or decided automatically by the AI agent following the MySystem standards whenever reasonably possible.

---

## 📦 Installation & CLI commands

MySystem distributes as a light, zero-dependency npm package. Because the primary user interface is conversational, your AI coding agent runs the CLI behind the scenes on your behalf:

```bash
# Initialize MySystem in the current repository
npx -y mysystem-cli init

# Audit code files, Dockerfile, and IaC for security & readiness
npx -y mysystem-cli audit

# Stream logs from AWS CloudWatch directly to your local terminal
npx -y mysystem-cli logs

# Securely dismantle all AWS infrastructure resources to stop billing
npx -y mysystem-cli destroy
```

---

## 🛠️ Repository footprint

When initialized, MySystem creates and maintains the following configuration files in your repository to keep the application ready for autonomous deployment:

| File / Folder | Purpose |
| --- | --- |
| **`mysystem.json`** | Public configuration indicator letting AI agents know this repository conforms to the MySystem standard. |
| **`.mysystem/`** | Local metadata directory containing the OIDC manifest and historical log entries. |
| **[`AGENTS.md`](file:///AGENTS.md)** | Production standards instructions for AI coding agents. |
| **`Dockerfile`** | Multi-stage, optimized, non-root container configuration. |
| **`.github/workflows/`** | GitHub Actions deploy and destroy workflows. |
| **`terraform/`** | Reproducible Infrastructure as Code (IaC) templates. |

---

## 🤖 The AI Agent Protocol (AI-First Design)

If you are an AI coding assistant reading this repository, follow this protocol:
1. **Auto-Discovery**: If the user requests deployment or AWS hosting setup, check for `mysystem.json` or `AGENTS.md` in the project root. If missing, run `npx -y mysystem-cli init` to bootstrap the standard.
2. **Follow the Standards**: Ensure any server modifications respect the instructions in [AGENTS.md](file:///AGENTS.md) (e.g. binding to `process.env.PORT`, implementing a `/health` endpoint, utilizing structured logs, and avoiding local file persistence).
3. **Verify & Push**: Run `npx -y mysystem-cli audit` to execute a local security and readiness scan. If it passes, commit and push changes. The OIDC workflow will handle AWS provisioning passwordless.

---

## 📄 License

Open source under the [MIT License](LICENSE).
