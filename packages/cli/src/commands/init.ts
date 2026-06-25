import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { detectProject } from '../utils/detector';

export async function runInit(projectRoot: string) {
  console.log('\n🔍 Scanning project codebase...');
  const detected = detectProject(projectRoot);

  console.log(`Detected application type: \x1b[36m${detected.type}\x1b[0m`);
  console.log(`Default container port: \x1b[36m${detected.port}\x1b[0m`);
  console.log(`Requires database: \x1b[36m${detected.hasDatabase ? 'Yes' : 'No'}\x1b[0m`);
  console.log(`Requires Redis:    \x1b[36m${detected.hasRedis ? 'Yes' : 'No'}\x1b[0m\n`);

  // Prompt the user for overrides using native readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const appNameInput = await rl.question(`Enter application name [${detected.name}]: `);
    const appName = appNameInput.trim() || detected.name;

    const awsRegionInput = await rl.question(`Enter AWS region [us-east-1]: `);
    const awsRegion = awsRegionInput.trim() || 'us-east-1';

    console.log('Select your AWS hosting tier:');
    console.log('  \x1b[36m1. Production\x1b[0m [ECS Fargate + RDS + ALB + WAF] (~$17/mo free-tier, ~$51/mo standard)');
    console.log('  \x1b[36m2. Hobbyist\x1b[0m   [Single EC2 + Docker Compose + Postgres] ($0/mo free-tier, ~$3.20/mo standard)');
    const tierInput = await rl.question('Choose tier [1]: ');
    const isProductionTier = tierInput.trim() !== '2';

    let enableDatabase = detected.hasDatabase;
    let enableRedis = detected.hasRedis;
    let enableRdsProxy = false;

    if (isProductionTier) {
      const enableDbInput = await rl.question(`Enable RDS PostgreSQL database? (y/n) [${detected.hasDatabase ? 'y' : 'n'}]: `);
      enableDatabase = enableDbInput.trim() ? enableDbInput.trim().toLowerCase() === 'y' : detected.hasDatabase;

      const enableRedisInput = await rl.question(`Enable ElastiCache Redis? (y/n) [${detected.hasRedis ? 'y' : 'n'}]: `);
      enableRedis = enableRedisInput.trim() ? enableRedisInput.trim().toLowerCase() === 'y' : detected.hasRedis;

      if (enableDatabase) {
        const enableProxyInput = await rl.question(`Enable RDS Proxy (PgBouncer connection pooler)? (y/n) [n]: `);
        enableRdsProxy = enableProxyInput.trim().toLowerCase() === 'y';
      }
    } else {
      // Hobby tier runs Postgres inside Docker Compose on the same instance (flat cost)
      enableDatabase = true;
      enableRedis = false;
      enableRdsProxy = false;
    }

    const billingEmailInput = await rl.question(`Enter email for AWS budget alerts (press Enter to skip): `);
    const billingEmail = billingEmailInput.trim();

    const customDomainInput = await rl.question(`Enable custom domain & HTTPS SSL certificate? (y/n) [n]: `);
    const enableCustomDomain = customDomainInput.trim().toLowerCase() === 'y';

    let domainName = '';
    let dnsProvider = 'external';
    if (enableCustomDomain) {
      const domainInput = await rl.question(`Enter custom domain (e.g., app.myproduct.com): `);
      domainName = domainInput.trim();

      const providerInput = await rl.question(`Is your domain DNS managed on AWS Route 53? (y/n) [n]: `);
      dnsProvider = providerInput.trim().toLowerCase() === 'y' ? 'route53' : 'external';
    }

    const enableSentryInput = await rl.question(`Enable Sentry Error Tracking? (y/n) [n]: `);
    const enableSentry = enableSentryInput.trim().toLowerCase() === 'y';
    let sentryDsn = '';
    if (enableSentry) {
      const dsnInput = await rl.question(`Enter Sentry DSN (press Enter to skip and configure later): `);
      sentryDsn = dsnInput.trim();
    }

    rl.close();

    console.log('\n🚀 Generating deployment assets...');

    // Find templates directory relative to CLI source or dist
    let templatesDir = '';
    const pathsToCheck = [
      path.join(__dirname, '../../templates'),       // Packaged location relative to dist/commands/
      path.join(__dirname, '../../../templates'),      // Local dev relative to src/commands/
      path.join(__dirname, '../../../../templates'),    // Local dev relative to packages/cli/dist/commands
      path.join(__dirname, '../../../../../templates'),  // Fallback
    ];

    for (const p of pathsToCheck) {
      if (fs.existsSync(p)) {
        templatesDir = p;
        break;
      }
    }

    if (!fs.existsSync(templatesDir)) {
      throw new Error(`Templates directory not found. Looked in: ${templatesDir}`);
    }

    // 1. Copy Dockerfile
    let dockerfileTemplate = '';
    switch (detected.type) {
      case 'nextjs':
        dockerfileTemplate = 'nextjs.Dockerfile';
        break;
      case 'react-vite':
        dockerfileTemplate = 'react.Dockerfile';
        break;
      case 'fastapi':
        dockerfileTemplate = 'fastapi.Dockerfile';
        break;
      default:
        dockerfileTemplate = 'node.Dockerfile';
    }

    const srcDockerfile = path.join(templatesDir, 'docker', dockerfileTemplate);
    const destDockerfile = path.join(projectRoot, 'Dockerfile');
    if (fs.existsSync(srcDockerfile)) {
      fs.copyFileSync(srcDockerfile, destDockerfile);
      console.log('  ✅ Created Dockerfile');
    }

    // 2. Create GitHub Actions folder & copy deploy.yml and destroy.yml
    const githubWorkflowDir = path.join(projectRoot, '.github', 'workflows');
    fs.mkdirSync(githubWorkflowDir, { recursive: true });
    
    const srcDeployWorkflow = path.join(templatesDir, 'github', isProductionTier ? 'deploy.yml' : 'deploy-ec2.yml');
    const destDeployWorkflow = path.join(githubWorkflowDir, 'mysystem-deploy.yml');
    if (fs.existsSync(srcDeployWorkflow)) {
      let workflowContent = fs.readFileSync(srcDeployWorkflow, 'utf8');
      workflowContent = workflowContent.replace(/aws-region: us-east-1/g, `aws-region: ${awsRegion}`);
      fs.writeFileSync(destDeployWorkflow, workflowContent, 'utf8');
      console.log('  ✅ Created .github/workflows/mysystem-deploy.yml');
    }

    const srcDestroyWorkflow = path.join(templatesDir, 'github', 'destroy.yml');
    const destDestroyWorkflow = path.join(githubWorkflowDir, 'mysystem-destroy.yml');
    if (fs.existsSync(srcDestroyWorkflow)) {
      let workflowContent = fs.readFileSync(srcDestroyWorkflow, 'utf8');
      workflowContent = workflowContent.replace(/aws-region: us-east-1/g, `aws-region: ${awsRegion}`);
      fs.writeFileSync(destDestroyWorkflow, workflowContent, 'utf8');
      console.log('  ✅ Created .github/workflows/mysystem-destroy.yml');
    }

    // 3. Create Terraform directory & copy templates
    const terraformDir = path.join(projectRoot, 'terraform');
    fs.mkdirSync(terraformDir, { recursive: true });

    const srcTerraformDir = path.join(templatesDir, isProductionTier ? 'terraform' : 'terraform-ec2');
    if (fs.existsSync(srcTerraformDir)) {
      const files = fs.readdirSync(srcTerraformDir);
      for (const file of files) {
        const filePath = path.join(srcTerraformDir, file);
        if (fs.statSync(filePath).isFile() && file !== 'bootstrap-oidc.yaml') {
          fs.copyFileSync(filePath, path.join(terraformDir, file));
        }
      }
      console.log('  ✅ Created Terraform modules in /terraform');
    }

    // 4. Write terraform.tfvars
    const tfvarsContent = `aws_region           = "${awsRegion}"
app_name             = "${appName}"
container_port       = ${detected.port}
enable_database      = ${enableDatabase}
enable_redis         = ${enableRedis}
enable_rds_proxy     = ${enableRdsProxy}
billing_email        = "${billingEmail}"
enable_custom_domain = ${enableCustomDomain}
domain_name          = "${domainName}"
dns_provider         = "${dnsProvider}"
sentry_dsn           = "${sentryDsn}"
`;
    fs.writeFileSync(path.join(terraformDir, 'terraform.tfvars'), tfvarsContent, 'utf8');
    console.log('  ✅ Created terraform/terraform.tfvars');

    // 5. Copy AGENTS.md
    let srcAgentsMd = '';
    const agentsPathsToCheck = [
      path.join(__dirname, '../../AGENTS.md'),
      path.join(__dirname, '../../../AGENTS.md'),
      path.join(__dirname, '../../../../AGENTS.md'),
      path.join(__dirname, '../../../../../AGENTS.md'),
    ];
    for (const p of agentsPathsToCheck) {
      if (fs.existsSync(p)) {
        srcAgentsMd = p;
        break;
      }
    }
    const destAgentsMd = path.join(projectRoot, 'AGENTS.md');
    if (fs.existsSync(srcAgentsMd)) {
      fs.copyFileSync(srcAgentsMd, destAgentsMd);
      console.log('  ✅ Created AGENTS.md');
    }

    // 6. Write project configuration mysystem.json
    const config = {
      name: appName,
      region: awsRegion,
      port: detected.port,
      tier: isProductionTier ? 'production' : 'hobbyist',
      database: enableDatabase,
      redis: enableRedis,
      rdsProxy: enableRdsProxy,
      billingEmail: billingEmail,
      customDomain: enableCustomDomain,
      domainName: domainName,
      dnsProvider: dnsProvider,
      sentryDsn: sentryDsn,
      type: detected.type,
      initializedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(projectRoot, 'mysystem.json'), JSON.stringify(config, null, 2), 'utf8');
    console.log('  ✅ Created mysystem.json');

    // Output Setup Guidance
    const cfUrl = `https://console.aws.amazon.com/cloudformation/home?region=${awsRegion}#/stacks/create/review?templateURL=https://raw.githubusercontent.com/ai-production-standard/mysystem/main/templates/terraform/bootstrap-oidc.yaml&stackName=mysystem-oidc-${appName}`;

    console.log('\n\x1b[32m✨ MySystem deployment files initialized successfully!\x1b[0m\n');
    console.log('\x1b[1m🚀 NEXT STEPS TO DEPLOY:\x1b[0m\n');
    console.log('\x1b[33mStep 1: Connect AWS to GitHub (One-Time Setup)\x1b[0m');
    console.log('--------------------------------------------');
    console.log('Click this link to configure a secure OIDC Trust stack in AWS:');
    console.log(`\x1b[36m${cfUrl}\x1b[0m\n`);
    console.log('Fill in parameters:');
    console.log('  - GitHubOrg: Your GitHub Org or username (case-sensitive)');
    console.log('  - GitHubRepo: Your GitHub repository name (case-sensitive)');
    console.log('\nClick "Create Stack". Once complete, copy the "RoleARN" from outputs.');

    console.log('\n\x1b[33mStep 2: Save Role ARN as a GitHub Secret\x1b[0m');
    console.log('----------------------------------------');
    console.log('Go to your GitHub repository -> Settings -> Secrets and variables -> Actions.');
    console.log('Add a new secret:');
    console.log('  - Name:  \x1b[1mAWS_ROLE_ARN\x1b[0m');
    console.log('  - Value: \x1b[32m<copied-role-arn>\x1b[0m');

    console.log('\n\x1b[33mStep 3: Tell your AI coding agent to push and deploy!\x1b[0m');
    console.log('----------------------------------------------------');
    console.log('Simply type in your AI chat:');
    console.log('  \x1b[32m"I have set up the AWS secrets. Push changes to deploy."\x1b[0m');
    console.log('\nThe agent will commit, push, and initiate the GitHub Actions pipeline.\n');

  } catch (e: any) {
    rl.close();
    console.error(`\x1b[31mError during initialization: ${e.message}\x1b[0m`);
  }
}
