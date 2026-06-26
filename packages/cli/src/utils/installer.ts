import { execSync, spawnSync } from 'child_process';
import * as readline from 'readline/promises';
import * as fs from 'fs';
import * as path from 'path';

export async function ensureAwsCli(): Promise<boolean> {
  // 1. Check if AWS CLI is already installed
  try {
    execSync('aws --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    // AWS CLI not installed
  }

  console.log('AWS CLI not detected.');
  console.log('Installing AWS CLI...');

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // Windows: Use winget (native Windows Package Manager)
      const res = spawnSync('winget', ['install', '--id', 'Amazon.AWSCLI', '--silent', '--accept-source-agreements', '--accept-package-agreements'], {
        stdio: 'ignore',
        shell: true,
      });
      if (res.status === 0) {
        console.log('✓ Installation Complete');
        return true;
      }
    } else if (platform === 'darwin') {
      // macOS: Try homebrew first
      let hasBrew = false;
      try {
        execSync('brew --version', { stdio: 'ignore' });
        hasBrew = true;
      } catch (e) {}

      if (hasBrew) {
        const res = spawnSync('brew', ['install', 'awscli'], { stdio: 'ignore' });
        if (res.status === 0) {
          console.log('✓ Installation Complete');
          return true;
        }
      } else {
        // Fallback: Download pkg installer
        execSync('curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "/tmp/AWSCLIV2.pkg"', { stdio: 'ignore' });
        const res = spawnSync('sudo', ['installer', '-pkg', '/tmp/AWSCLIV2.pkg', '-target', '/'], { stdio: 'ignore' });
        if (res.status === 0) {
          console.log('✓ Installation Complete');
          return true;
        }
      }
    } else if (platform === 'linux') {
      // Linux install
      execSync('curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"', { stdio: 'ignore' });
      execSync('unzip -q /tmp/awscliv2.zip -d /tmp', { stdio: 'ignore' });
      const res = spawnSync('sudo', ['/tmp/aws/install', '--update'], { stdio: 'ignore' });
      if (res.status === 0) {
        console.log('✓ Installation Complete');
        return true;
      }
    }
  } catch (err: any) {
    // Fail silently to trigger the fallback print
  }

  console.log('✗ Installation Failed');
  console.log('\n⚠️  Please install the AWS CLI manually before running MySystem:');
  console.log('👉 https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html\n');
  return false;
}

export async function ensureGitHubCli(): Promise<boolean> {
  // 1. Check if GitHub CLI is already installed
  try {
    execSync('gh --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    // GitHub CLI not installed
  }

  console.log('GitHub CLI not detected.');
  console.log('Installing GitHub CLI...');

  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const res = spawnSync('winget', ['install', '--id', 'GitHub.cli', '--silent', '--accept-source-agreements', '--accept-package-agreements'], {
        stdio: 'ignore',
        shell: true,
      });
      if (res.status === 0) {
        console.log('✓ Installation Complete');
        return true;
      }
    } else if (platform === 'darwin') {
      let hasBrew = false;
      try {
        execSync('brew --version', { stdio: 'ignore' });
        hasBrew = true;
      } catch (e) {}

      if (hasBrew) {
        const res = spawnSync('brew', ['install', 'gh'], { stdio: 'ignore' });
        if (res.status === 0) {
          console.log('✓ Installation Complete');
          return true;
        }
      }
    } else if (platform === 'linux') {
      try {
        const res = spawnSync('sudo', ['apt-get', 'update', '-y', '&&', 'sudo', 'apt-get', 'install', 'gh', '-y'], {
          stdio: 'ignore',
          shell: true,
        });
        if (res.status === 0) {
          console.log('✓ Installation Complete');
          return true;
        }
      } catch {}
    }
  } catch (err: any) {
    // Fail silently to trigger the fallback print
  }

  console.log('✗ Installation Failed');
  console.log('\n⚠️  Please install the GitHub CLI manually before running MySystem:');
  console.log('👉 https://cli.github.com/\n');
  return false;
}

export async function connectAwsAndGithubOidc(projectRoot: string): Promise<boolean> {
  // 1. Ensure AWS CLI is installed and authenticated
  console.log('\n🔍 Checking AWS CLI status...');
  const awsInstalled = await ensureAwsCli();
  if (!awsInstalled) {
    console.error('❌ AWS CLI installation failed.');
    return false;
  }

  let awsAuthed = false;
  try {
    execSync('aws sts get-caller-identity', { stdio: 'ignore' });
    awsAuthed = true;
  } catch (e) {}

  if (!awsAuthed) {
    console.log('\n\x1b[33m⚠️  AWS CLI is not authenticated. Redirecting to login...\x1b[0m');
    console.log('Please configure your AWS access keys now.');
    const loginRes = spawnSync('aws', ['configure'], { stdio: 'inherit' });
    if (loginRes.status !== 0) {
      console.error('❌ AWS CLI configuration exited with error.');
      return false;
    }
    // Check again
    try {
      execSync('aws sts get-caller-identity', { stdio: 'ignore' });
      awsAuthed = true;
    } catch (e) {
      console.error('❌ AWS authentication failed after configuration.');
      return false;
    }
  }
  console.log('✅ AWS CLI authenticated.');

  // 2. Ensure GitHub CLI is installed and authenticated
  console.log('\n🔍 Checking GitHub CLI status...');
  const ghInstalled = await ensureGitHubCli();
  if (!ghInstalled) {
    console.error('❌ GitHub CLI installation failed.');
    return false;
  }

  let ghAuthed = false;
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    ghAuthed = true;
  } catch (e) {}

  if (!ghAuthed) {
    console.log('\n\x1b[33m⚠️  GitHub CLI is not authenticated. Initiating login...\x1b[0m');
    const loginRes = spawnSync('gh', ['auth', 'login'], { stdio: 'inherit' });
    if (loginRes.status !== 0) {
      console.error('❌ GitHub CLI authentication exited with error.');
      return false;
    }
    // Check again
    try {
      execSync('gh auth status', { stdio: 'ignore' });
      ghAuthed = true;
    } catch (e) {
      console.error('❌ GitHub authentication failed after login.');
      return false;
    }
  }
  console.log('✅ GitHub CLI authenticated.');

  // 3. Extract remote git info (org/repo)
  console.log('\n🔍 Extracting Git repository remote info...');
  let remoteUrl = '';
  try {
    remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  } catch (e) {
    console.error('\n\x1b[31m❌ No remote Git repository origin found.\x1b[0m');
    console.log('Please run: git remote add origin <github-repo-url> before deploying.');
    return false;
  }

  const match = remoteUrl.match(/github\.com[:\/]([^\/]+)\/([^\/\.]+)(?:\.git)?/);
  if (!match) {
    console.error(`❌ Could not parse GitHub Org/Repo from remote URL: ${remoteUrl}`);
    return false;
  }

  const gitHubOrg = match[1];
  const gitHubRepo = match[2];
  console.log(`   Owner:      \x1b[36m${gitHubOrg}\x1b[0m`);
  console.log(`   Repository: \x1b[36m${gitHubRepo}\x1b[0m`);

  // 4. Locate OIDC CloudFormation template
  let templatesDir = '';
  const pathsToCheck = [
    path.join(__dirname, '../../templates'),
    path.join(__dirname, '../../../templates'),
    path.join(__dirname, '../../../../templates'),
  ];
  for (const p of pathsToCheck) {
    if (fs.existsSync(p)) {
      templatesDir = p;
      break;
    }
  }
  if (!templatesDir) {
    console.error('❌ Templates directory not found.');
    return false;
  }

  const oidcTemplate = path.join(templatesDir, 'terraform', 'bootstrap-oidc.yaml');
  if (!fs.existsSync(oidcTemplate)) {
    console.error(`❌ OIDC CloudFormation template not found at: ${oidcTemplate}`);
    return false;
  }

  // 5. Deploy CloudFormation Stack
  const stackName = `MySystem-OIDC-${gitHubRepo}`;
  console.log(`\n🚀 Deploying OIDC IAM Stack to AWS (Stack: ${stackName})...`);
  const deployRes = spawnSync('aws', [
    'cloudformation',
    'deploy',
    '--template-file',
    oidcTemplate,
    '--stack-name',
    stackName,
    '--parameter-overrides',
    `GitHubOrg=${gitHubOrg}`,
    `GitHubRepo=${gitHubRepo}`,
    '--capabilities',
    'CAPABILITY_NAMED_IAM'
  ], { stdio: 'inherit' });

  if (deployRes.status !== 0) {
    console.error('❌ CloudFormation OIDC deployment failed.');
    return false;
  }
  console.log('✅ OIDC IAM stack deployed successfully.');

  // 6. Query stack output for Role ARN
  console.log('\n🔍 Retrieving IAM Role ARN...');
  let roleArn = '';
  try {
    roleArn = execSync(`aws cloudformation describe-stacks --stack-name ${stackName} --query "Stacks[0].Outputs[?OutputKey=='RoleARN'].OutputValue" --output text`, {
      encoding: 'utf8'
    }).trim();
  } catch (e: any) {
    console.error(`❌ Failed to retrieve Role ARN: ${e.message}`);
    return false;
  }

  if (!roleArn || roleArn === 'None') {
    console.error('❌ Retrieved invalid Role ARN from AWS CloudFormation.');
    return false;
  }
  console.log(`   IAM Role ARN: \x1b[36m${roleArn}\x1b[0m`);

  // 7. Save Role ARN as GitHub Secret AWS_ROLE_ARN
  console.log('\n🔒 Setting GitHub Actions Secret AWS_ROLE_ARN...');
  const secretRes = spawnSync('gh', ['secret', 'set', 'AWS_ROLE_ARN', '--body', roleArn], { stdio: 'inherit' });
  if (secretRes.status !== 0) {
    console.error('❌ Failed to set GitHub repository secret.');
    return false;
  }

  console.log('\n\x1b[32m✅ Successfully connected AWS and GitHub via OIDC Stack Trust!\x1b[0m');
  console.log('GitHub Actions is now authorized to provision and deploy infrastructure to your AWS account.');
  return true;
}
