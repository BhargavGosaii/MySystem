import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { ArchitectureReview } from '../advisor';

export interface HostingCheckResult {
  hosted: boolean;
  details?: string;
}

/**
 * Checks if the application is already deployed or hosted on AWS.
 */
export async function checkIfAlreadyHosted(projectRoot: string, projectName: string): Promise<HostingCheckResult> {
  // 1. Check local manifests
  const manifestPath = path.join(projectRoot, '.mysystem', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.lastDeployment) {
        return {
          hosted: true,
          details: `Local manifest shows active deployment since ${manifest.lastDeployment} in region ${manifest.awsRegion}.`
        };
      }
    } catch {}
  }

  const configPath = path.join(projectRoot, 'mysystem.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.initializedAt) {
        return {
          hosted: true,
          details: `Local configuration (mysystem.json) initialized at ${config.initializedAt} in region ${config.region}.`
        };
      }
    } catch {}
  }

  // 2. Query AWS CLI for active infrastructure
  try {
    const checkCommand = `aws ecr describe-repositories --repository-names ${projectName} --query "repositories[0].repositoryArn" --output text`;
    const repoArn = execSync(checkCommand, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (repoArn && repoArn.startsWith('arn:aws:ecr')) {
      return {
        hosted: true,
        details: `Active AWS ECR repository detected: ${repoArn}`
      };
    }
  } catch {}

  try {
    const stackCommand = `aws cloudformation describe-stacks --stack-name MySystem-OIDC-${projectName} --query "Stacks[0].StackStatus" --output text`;
    const stackStatus = execSync(stackCommand, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (stackStatus) {
      return {
        hosted: true,
        details: `Active AWS OIDC Stack found on CloudFormation (Status: ${stackStatus}).`
      };
    }
  } catch {}

  return { hosted: false };
}

/**
 * Renders the Evaluation Mode report and prompts the user for approval.
 */
export async function runEvaluationPrompt(
  projectRoot: string,
  projectName: string,
  review: ArchitectureReview
): Promise<boolean> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                 \x1b[1m\x1b[36mMYSYSTEM EVALUATION REPORT\x1b[0m');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Hosting Status
  const status = await checkIfAlreadyHosted(projectRoot, projectName);
  if (status.hosted) {
    console.log(`\x1b[1mAWS Deployment Status:\x1b[0m \x1b[33mAlready Hosted on AWS\x1b[0m`);
    console.log(`\x1b[90m  (${status.details})\x1b[0m`);
  } else {
    console.log(`\x1b[1mAWS Deployment Status:\x1b[0m \x1b[32mNew Deployment (Not currently hosted on AWS)\x1b[0m`);
  }

  // 2. What it will do
  console.log('\n\x1b[1mWhat MySystem will do:\x1b[0m');
  if (status.hosted) {
    console.log('  🔄 Update existing AWS runtime environment configuration.');
  } else {
    console.log('  🆕 Provision a brand-new production runtime environment.');
  }

  const hostingVal = review.decisions.find(d => d.component === 'hosting')?.value || 'ec2';
  const dbVal = review.decisions.find(d => d.component === 'database')?.value || 'none';
  const redisVal = review.decisions.find(d => d.component === 'redis')?.value;

  console.log(`  🐳 Synthesize local Docker Compose and production environment files.`);
  console.log(`  🖥️  Configure compute: ${hostingVal === 'ecs-fargate' ? 'ECS Fargate Cluster' : 'Single EC2 instance with Docker Compose'}.`);
  if (dbVal !== 'none') {
    if (status.hosted) {
      console.log(`  🗄️  Reuse or update the existing PostgreSQL database.`);
    } else {
      console.log(`  🗄️  Provision/configure PostgreSQL database.`);
    }
  }
  if (redisVal) {
    console.log('  ⚡ Configure Redis Cache & Messaging Broker.');
  }
  console.log('  🔐 Setup OIDC Trust Stack & push Terraform modules.');
  console.log('  🚀 Trigger GitHub Actions to deploy infrastructure and code.');

  // 3. How much it will cost
  console.log(`\n\x1b[1mEstimated AWS Cost:\x1b[0m     \x1b[33m$${review.totalMonthlyCost.toFixed(2)}/month\x1b[0m`);

  // 4. Chronological steps
  console.log('\n\x1b[1mEvery step MySystem will take:\x1b[0m');
  const steps = [
    'Inspect local project dependencies, characteristics, and environment configs.',
    'Execute Production Engineering Standards audit (security, DB, telemetry).',
    'Apply safe infrastructure auto-fixes (Dockerfile, health check, workflows).',
    'Synthesize Docker Compose, secrets, env files, and backup schedules locally.',
    'Provision secure AWS OIDC role trust stack for passwordless GitHub access.',
    'Scaffold Terraform modules and configure GitHub Actions deploy workflow.',
    'Assume AWS deployment role and build/tag/push containers to AWS ECR.',
    'Run Terraform plan & apply to provision/update runtime infrastructure.',
    'Execute database migrations (if ORM is detected).',
    'Run live validation tests and verify endpoints are healthy.'
  ];
  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 5. Ask user to proceed
  if (process.env.MYSYSTEM_AUTO_APPROVE === 'true' || process.env.NODE_ENV === 'test') {
    console.log('\n\x1b[32m🚀 Auto-approving deployment plan (MYSYSTEM_AUTO_APPROVE/test mode active).\x1b[0m\n');
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question('\x1b[1m? Do you want to proceed with this deployment? (y/N): \x1b[0m');
    rl.close();
    if (answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes') {
      console.log('\n\x1b[32m🚀 User approved. Proceeding with deployment workflow...\x1b[0m\n');
      return true;
    } else {
      console.log('\n\x1b[33m❌ Deployment aborted by user.\x1b[0m\n');
      return false;
    }
  } catch (err) {
    rl.close();
    return false;
  }
}
