import * as fs from 'fs';
import * as path from 'path';

interface AuditItem {
  name: string;
  passed: boolean;
  type: 'error' | 'warning';
  message: string;
}

export function runAudit(projectRoot: string) {
  console.log('\n🔍 Auditing project for production readiness...\n');

  const items: AuditItem[] = [];

  // 1. Check Dockerfile
  const dockerfilePath = path.join(projectRoot, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
    items.push({
      name: 'Dockerfile Exists',
      passed: false,
      type: 'error',
      message: 'No Dockerfile found. Run `npx mysystem init` to generate one.',
    });
  } else {
    items.push({
      name: 'Dockerfile Exists',
      passed: true,
      type: 'error',
      message: 'Dockerfile found.',
    });

    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');

    // Check for non-root USER
    const hasUser = dockerfileContent.includes('USER ');
    items.push({
      name: 'Secure Container User (Non-Root)',
      passed: hasUser,
      type: 'error',
      message: hasUser
        ? 'Dockerfile specifies a non-root USER.'
        : 'Dockerfile executes as root. Add a USER instruction for security container hardening.',
    });

    // Check for healthcheck
    const hasHealthcheck = dockerfileContent.includes('HEALTHCHECK ');
    items.push({
      name: 'Container Health Check',
      passed: hasHealthcheck,
      type: 'warning',
      message: hasHealthcheck
        ? 'Dockerfile specifies a HEALTHCHECK instruction.'
        : 'No HEALTHCHECK found in Dockerfile. ECS needs health checks to detect failing tasks.',
    });
  }

  // 2. Check CI/CD Workflows
  const workflowPath = path.join(projectRoot, '.github', 'workflows', 'mysystem-deploy.yml');
  const hasWorkflow = fs.existsSync(workflowPath);
  items.push({
    name: 'GitHub Actions CI/CD Pipeline',
    passed: hasWorkflow,
    type: 'error',
    message: hasWorkflow
      ? 'GitHub Actions deploy workflow configured.'
      : 'Deployment workflow missing. Make sure `.github/workflows/mysystem-deploy.yml` exists.',
  });

  // 3. Check Terraform Infrastructure as Code
  const terraformPath = path.join(projectRoot, 'terraform');
  const hasTerraform = fs.existsSync(terraformPath) && fs.readdirSync(terraformPath).some(file => file.endsWith('.tf'));
  items.push({
    name: 'Infrastructure as Code (Terraform)',
    passed: hasTerraform,
    type: 'error',
    message: hasTerraform
      ? 'Terraform modules found in `/terraform` directory.'
      : 'Terraform configuration files not found in `/terraform`. Run `npx mysystem init`.',
  });

  // 4. Check AGENTS.md rulebook
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  const hasAgents = fs.existsSync(agentsPath);
  items.push({
    name: 'AI Agent Guidelines (AGENTS.md)',
    passed: hasAgents,
    type: 'warning',
    message: hasAgents
      ? 'AGENTS.md rules file configured in root.'
      : 'No AGENTS.md rules found. AI agents won\'t have constraints for production-readiness.',
  });

  // 5. Secret Scanning (Simple checks for common API Keys/Credentials)
  let foundSecrets = false;
  const filesToScan = scanDirForCodeFiles(projectRoot);
  for (const file of filesToScan) {
    // Skip node_modules, git, terraform, dist, etc.
    const content = fs.readFileSync(file, 'utf8');
    const hasSmdPattern = /aws_access_key_id\s*=\s*['"][A-Z0-9]{20}['"]/gi.test(content) || 
                           /aws_secret_access_key\s*=\s*['"][A-Za-z0-9/+=]{40}['"]/gi.test(content) ||
                           /db_password\s*=\s*['"][^'"]{6,}['"]/gi.test(content);
    if (hasSmdPattern) {
      foundSecrets = true;
      console.log(`\x1b[31m⚠️ Potential secret/credential leak in file: ${path.relative(projectRoot, file)}\x1b[0m`);
    }
  }

  items.push({
    name: 'No Hardcoded Secrets',
    passed: !foundSecrets,
    type: 'error',
    message: !foundSecrets
      ? 'No plain-text credentials found in repository files.'
      : 'Potential plain-text credentials detected in codebase. Clean secrets and use environment variables.',
  });

  // Output Audit Dashboard
  console.log('----------------------------------------------------');
  console.log('\x1b[1mAUDIT REPORT RESULTS\x1b[0m');
  console.log('----------------------------------------------------');

  let passedCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const item of items) {
    if (item.passed) {
      console.log(` ✅ \x1b[32m[PASS]\x1b[0m \x1b[1m${item.name}\x1b[0m`);
      console.log(`    ${item.message}`);
      passedCount++;
    } else {
      const color = item.type === 'error' ? '\x1b[31m[FAIL]\x1b[0m' : '\x1b[33m[WARN]\x1b[0m';
      console.log(` ❌ ${color} \x1b[1m${item.name}\x1b[0m`);
      console.log(`    ${item.message}`);
      if (item.type === 'error') errorCount++;
      else warningCount++;
    }
    console.log('');
  }

  const score = Math.round((passedCount / items.length) * 100);

  console.log('----------------------------------------------------');
  console.log(`Readiness Score: \x1b[1m${score === 100 ? '\x1b[32m' : score >= 70 ? '\x1b[33m' : '\x1b[31m'}${score}%\x1b[0m`);
  console.log(`Summary: ${passedCount} passed | ${errorCount} errors | ${warningCount} warnings`);
  console.log('----------------------------------------------------');

  if (errorCount > 0) {
    console.log('\x1b[31m❌ Fix all errors before deploying to production.\x1b[0m\n');
  } else if (warningCount > 0) {
    console.log('\x1b[33m⚠️ Resolving warnings is recommended for full production readiness.\x1b[0m\n');
  } else {
    console.log('\x1b[32m🚀 Your application is 100% production ready! Ready to deploy to AWS.\x1b[0m\n');
  }
}

function scanDirForCodeFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      // Exclude build, node, git, terraform folders
      if (['node_modules', '.git', 'terraform', 'dist', 'build', '.next', 'out'].includes(file)) {
        continue;
      }
      scanDirForCodeFiles(filePath, fileList);
    } else {
      // Only scan code files
      if (/\.(js|ts|tsx|jsx|json|py|env|tfvars)$/.test(file) && file !== 'package-lock.json') {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}
