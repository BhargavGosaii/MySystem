import { execSync, spawnSync } from 'child_process';
import * as readline from 'readline/promises';

export async function ensureAwsCli(): Promise<boolean> {
  // 1. Check if AWS CLI is already installed
  try {
    execSync('aws --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    // AWS CLI not installed
  }

  console.log('\n\x1b[33m⚠️  AWS CLI is not installed on your system.\x1b[0m');
  console.log('The AWS CLI is required to stream container logs and manage local credentials.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question('\nWould you like MySystem to install the AWS CLI automatically? (y/n) [y]: ');
  rl.close();

  if (answer.trim().toLowerCase() === 'n') {
    return false;
  }

  const platform = process.platform;
  console.log(`\n⚙️  Installing AWS CLI for \x1b[36m${platform}\x1b[0m...`);

  try {
    if (platform === 'win32') {
      // Windows: Use winget (native Windows Package Manager)
      console.log('Running winget installer...');
      const res = spawnSync('winget', ['install', '--id', 'Amazon.AWSCLI', '--silent', '--accept-source-agreements', '--accept-package-agreements'], {
        stdio: 'inherit',
        shell: true,
      });
      if (res.status === 0) {
        console.log('\x1b[32m✅ AWS CLI installed successfully! You may need to restart your terminal for changes to take effect.\x1b[0m');
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
        console.log('Running: brew install awscli...');
        const res = spawnSync('brew', ['install', 'awscli'], { stdio: 'inherit' });
        if (res.status === 0) {
          console.log('\x1b[32m✅ AWS CLI installed successfully via Homebrew!\x1b[0m');
          return true;
        }
      } else {
        // Fallback: Download pkg installer
        console.log('Downloading AWS CLI macOS package...');
        execSync('curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "/tmp/AWSCLIV2.pkg"', { stdio: 'inherit' });
        console.log('Installing package (requires sudo privileges)...');
        const res = spawnSync('sudo', ['installer', '-pkg', '/tmp/AWSCLIV2.pkg', '-target', '/'], { stdio: 'inherit' });
        if (res.status === 0) {
          console.log('\x1b[32m✅ AWS CLI installed successfully!\x1b[0m');
          return true;
        }
      }
    } else if (platform === 'linux') {
      // Linux install
      console.log('Downloading AWS CLI Linux package...');
      execSync('curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"', { stdio: 'inherit' });
      execSync('unzip -q /tmp/awscliv2.zip -d /tmp', { stdio: 'inherit' });
      console.log('Installing package (requires sudo privileges)...');
      const res = spawnSync('sudo', ['/tmp/aws/install', '--update'], { stdio: 'inherit' });
      if (res.status === 0) {
        console.log('\x1b[32m✅ AWS CLI installed successfully!\x1b[0m');
        return true;
      }
    }
  } catch (err: any) {
    console.error(`\x1b[31mInstallation failed: ${err.message}\x1b[0m`);
  }

  console.log('\n\x1b[31m❌ Automatic installation failed.\x1b[0m');
  console.log('Please install the AWS CLI manually:');
  console.log('👉 \x1b[36mhttps://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html\x1b[0m\n');
  return false;
}
