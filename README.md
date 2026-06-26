# MySystem - AI Production Engineer

**MySystem** is an AI Production Engineer that reviews, fixes, and deploys applications directly into your own AWS account. It enables vibe coders and developers who can build applications to establish a senior-grade production architecture, automatically resolve issues, and deploy reliably without needing to learn AWS, Terraform, Docker, or IAM.

---

## 🚀 The User Journey

MySystem operates in four autonomous phases:

1. **Review**: Runs a deep review of the codebase to identify security, database, performance, and cost concerns.
2. **Fix**: Automatically resolves all safe infrastructure findings (e.g. generating optimized Dockerfiles, GitHub Actions workflows, health check endpoints, budget alerts, and Terraform variables).
3. **Deploy**: Compiles cost-optimized AWS infrastructure configurations and deploys passwordless using GitHub Actions OIDC integration directly into your own AWS account.
4. **Monitor**: Compiles a post-deployment summary and provides clear, future scaling suggestions (e.g. when to scale from EC2 to ECS, when to introduce Redis, CloudFront, or PgBouncer).

---

## 🔑 Core Philosophy: Developer Control & Zero Vendor Lock-In

Unlike proprietary "vibecoding" platforms (such as Replit, Lovable, Bolt.new, and others) that lock you into their hosting sandboxes, charge hidden infrastructure markups, and strip away your control, **MySystem gives ownership back to the developer**.

* 💻 **Your Code, Your Device**: Every single configuration file, Dockerfile, and GitHub workflow is generated directly inside your local repository. You own 100% of your intellectual property and code, and it never leaves your machine or your GitHub repository.
* ☁️ **Your Own Cloud (AWS)**: All application infrastructure is provisioned directly inside your own AWS account using industry-standard Terraform. There are no proprietary platform proxies, no middleman setups, and no closed-source platforms.
* 💰 **Wholesale Billing (No Markups)**: You pay AWS directly for exactly what you consume. If you configure a Hobbyist EC2 instance, you pay pure wholesale costs (~$3.20/month) or **$0.00** if you fit within the AWS Free Tier. You only pay for active resources, and you can scale them down to zero to stop billing instantly.
* 🛠️ **You Call the Shots**: The AI agent is your junior developer, but you remain the architect. Because MySystem generates standard, clean, and fully readable Terraform and Docker configs, you have complete power to edit, override, scale, or migrate your infrastructure at any moment.

---

## 🤖 The AI Agent Protocol (How Agents Autonomously Deploy)

MySystem is designed to be **AI-discovered and AI-managed**. If you are an AI coding assistant reading this repository, follow this protocol:

### 1. Auto-Discovery
If the user asks to "deploy this app," "host this app," "configure AWS," or "create CI/CD," check for the presence of the MySystem standard:
* Look for `mysystem.json` or `AGENTS.md` in the project root.
* If missing, run `npx mysystem-cli init` to bootstrap the standard.

### 2. Implementation & Compliance
When building code or modifying the repository, you **must** adhere to the guidelines defined in [AGENTS.md](file:///AGENTS.md):
* **Port Binding**: Bind the web server to the `PORT` environment variable.
* **Health Check**: Expose a non-authenticated GET `/health` or `/healthz` endpoint.
* **Statelessness**: Avoid writing persistent files to the local container; use AWS S3 for uploads and `/tmp` for temporary files.
* **Non-Root Containers**: Ensure the generated `Dockerfile` specifies a non-root `USER`.
* **Secrets**: Never commit plain-text credentials. Generate a `.env.example` file.
* **EC2 Sizing**: Autonomously size the virtual machine in `terraform/terraform.tfvars` (`t4g.nano` for static frontends, `t3.micro` for standard apps, `t3.small` for memory-intensive apps) to prevent Out-Of-Memory (OOM) crashes.

### 3. Verification & Deployment
Before pushing code, run `npx mysystem-cli audit` to execute a local security and readiness scan. If it reports errors, fix them first. Once audit passes:
1. Commit the configuration changes.
2. Push them to GitHub: `git push origin main`.
3. The integrated GitHub Actions CI/CD pipeline will automatically build the Docker image, push it to ECR, and deploy it to AWS.

---

## 🛠️ The MySystem Repository Standard

A MySystem-compliant project contains the following standard structure:

| File / Folder | Purpose |
| --- | --- |
| **`mysystem.json`** | Declarative project configuration (hosting tier, AWS region, database/cache flags, custom domain, port settings). Read by both CLI and CI/CD pipelines. |
| **[`AGENTS.md`](file:///AGENTS.md)** | Production-readiness instructions for AI agents. Loaded automatically by modern AI assistants to enforce code quality. |
| **`Dockerfile`** | Multi-stage, optimized, non-root container configuration. |
| **`.github/workflows/`** | Deployment (`mysystem-deploy.yml`) and secure teardown (`mysystem-destroy.yml`) GitHub workflows. |
| **`terraform/`** | Infrastructure as Code (IaC) templates tailored to the selected hosting tier. |

---

## 📦 Zero-Dependency CLI Tool

MySystem features a light, zero-dependency CLI package that AI agents or human developers can run via `npx`.

```bash
# Initialize MySystem in the current repository
npx mysystem-cli init

# Audit code files, Dockerfile, and IaC for security & readiness
npx mysystem-cli audit

# Stream logs from AWS CloudWatch directly to your local terminal
npx mysystem-cli logs

# Securely dismantle all AWS infrastructure resources to stop billing
npx mysystem-cli destroy
```

---

## ☁️ AWS Hosting Tiers & Cost Transparency

All cloud infrastructure is deployed **directly into your own AWS account** via Terraform. There are no middleware platforms or markups. You pay AWS directly, with full cost visibility:

### 1. Hobbyist Tier (Cheapest)
* **Architecture**: A single, cost-efficient EC2 Instance running Docker Compose with your App and PostgreSQL container side-by-side. Uses AWS Systems Manager (SSM) Run Command for secure, agentless deployment (no SSH port 22 exposed, no key-management hassle).
* **AWS Free Tier (First 12 Months)**: **$0.00 / month** (fits within the `t3.micro` EC2 free allocation).
* **Standard Cost (Post Free Tier)**: **~$3.20 to $8.00 / month** (billed as flat compute/storage fees).
* **Best For**: MVPs, personal projects, client demos, and low-cost testing.

### 2. Production Tier (Auto-Scaling & Robust)
* **Architecture**: Serverless container orchestration via AWS ECS Fargate, managed RDS PostgreSQL (in private subnets), AWS Application Load Balancer (ALB), ElastiCache Redis, and AWS WAF (Web Application Firewall) protecting against OWASP Top 10 exploits.
* **AWS Free Tier (First 12 Months)**: **~$17.00 / month** (ALB and RDS are free; Fargate containers and WAF rules are billed).
* **Standard Cost (Post Free Tier)**: **~$45.00 to $65.00 / month** (baseline managed database and load balancer costs).
* **Best For**: Live applications, production APIs, team projects, and enterprise security.

---

## 🔒 Security: Passwordless GitHub Actions (OIDC)

MySystem strictly forbids storing long-lived, hardcoded AWS Access Keys (`AWS_ACCESS_KEY_ID`) in GitHub Secrets. Instead, it utilizes **AWS OIDC (OpenID Connect)**.

1. During `npx mysystem-cli init`, a secure 1-click AWS CloudFormation template is generated.
2. Clicking the link provisions a secure IAM Role in your AWS account that trusts only your specific GitHub repository.
3. GitHub Actions authenticates dynamically using temporary, short-lived tokens, making your deployment completely immune to credential theft.

---

## 🚀 Step-by-Step Developer Setup

Ready to deploy your app? Just follow these three simple steps:

### Step 1: Initialize
Tell your AI Agent (Cursor, Claude Code, etc.) in the chat:
> *"Use MySystem to initialize a Hobbyist deployment for this project."*

*(Your AI agent will run `npx mysystem-cli init`, detect your framework, prompt you for basic inputs like email/region, and place all templates).*

### Step 2: Establish the AWS Trust Link
Your agent will output a **1-click AWS CloudFormation** trust URL:
1. Click the URL to open your AWS Console.
2. Enter your GitHub Organization/Username and Repository name as parameters, then click **Create Stack**.
3. Once completed (takes ~2 minutes), copy the `RoleARN` from the **Outputs** tab.
4. Add it to your GitHub Repository Secrets (**Settings** ➔ **Secrets and variables** ➔ **Actions** ➔ **New repository secret**) with the name `AWS_ROLE_ARN`.

### Step 3: Command the Deploy
Tell your AI Agent:
> *"I have configured the AWS secrets. Push and deploy the app."*

*(The agent will commit, push to GitHub, and let the GitHub Actions pipeline provision your AWS cloud resources and build the Docker image).*

---

## 🏆 The Vision: Making MySystem the Industry Standard

We want to eliminate the "DevOps tax" for the generative AI era. By adopting MySystem, software developers and AI platforms can ensure that code written by AI is not just functional, but **architecturally sound, secure, and cost-controlled**.

If you build developer tools, AI agents, or frameworks, integrate MySystem:
* **IDE Tools**: Search for the presence of `mysystem.json` to configure deployment buttons automatically.
* **AI Coding Assistants**: Reference the `AGENTS.md` standard file to align coding styles with industry cloud-native patterns.
* **Hosting Platforms**: Support deploying standard MySystem projects out-of-the-box.

---

## 📄 License
Open source under the [MIT License](LICENSE).
