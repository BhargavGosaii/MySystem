import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { spawn } from 'child_process';

export async function runDestroy(projectRoot: string) {
  const configPath = path.join(projectRoot, 'mysystem.json');
  if (!fs.existsSync(configPath)) {
    console.error('\x1b[31mError: MySystem is not initialized in this directory.\x1b[0m');
    console.error('Run `npx mysystem init` first.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  console.log(`\n\x1b[31m⚠️  WARNING: You are about to DESTROY all AWS infrastructure for "${config.name}".\x1b[0m`);
  console.log('This will delete the database (RDS), cache (Redis), server (Fargate), and load balancers.');
  console.log('\x1b[1mALL DATA WILL BE PERMANENTLY LOST.\x1b[0m\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const confirm = await rl.question('Are you absolutely sure? Type the application name to confirm: ');
  rl.close();

  if (confirm.trim() !== config.name) {
    console.log('\n❌ Confirmation failed. Destruction cancelled.');
    return;
  }

  console.log('\n🔥 Initiating infrastructure destruction. Please wait...');

  const tfDir = path.join(projectRoot, 'terraform');
  if (!fs.existsSync(tfDir)) {
    console.error('\x1b[31mError: terraform directory not found.\x1b[0m');
    process.exit(1);
  }

  // Execute terraform destroy
  // Set stdio: 'inherit' to stream Terraform output directly to user's terminal
  const tf = spawn('terraform', ['destroy', '-auto-approve'], {
    cwd: tfDir,
    stdio: 'inherit',
    shell: true,
  });

  tf.on('close', (code) => {
    if (code === 0) {
      console.log('\n\x1b[32m✅ Successfully destroyed all AWS resources for this application.\x1b[0m');
      console.log('Your AWS billing for this project has been stopped.');

      // Remove local generated files if they want, or keep configuration
      try {
        if (fs.existsSync(path.join(projectRoot, 'mysystem.json'))) {
          fs.unlinkSync(path.join(projectRoot, 'mysystem.json'));
        }
        console.log('Deleted local mysystem.json configuration.');
      } catch (e) {}
    } else {
      console.error(`\n\x1b[31m❌ Terraform destroy failed with exit code ${code}.\x1b[0m`);
    }
  });
}
