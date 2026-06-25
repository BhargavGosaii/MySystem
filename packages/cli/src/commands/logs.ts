import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';

import { ensureAwsCli } from '../utils/installer';

export async function runLogs(projectRoot: string) {
  const configPath = path.join(projectRoot, 'mysystem.json');
  if (!fs.existsSync(configPath)) {
    console.error('\x1b[31mError: MySystem is not initialized in this directory.\x1b[0m');
    console.error('Run `npx mysystem init` first.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const logGroupName = `/ecs/${config.name}`;
  const region = config.region;

  // 1. Ensure AWS CLI is installed
  const hasAwsCli = await ensureAwsCli();
  if (!hasAwsCli) {
    console.log('\nAlternatively, you can view logs in your browser via the AWS CloudWatch Console:');
    console.log(`👉 \x1b[36mhttps://console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/%252Fecs%252F${config.name}\x1b[0m\n`);
    process.exit(1);
  }

  console.log(`\n☁️  Streaming logs for \x1b[36m${config.name}\x1b[0m [Log Group: ${logGroupName}] in \x1b[32m${region}\x1b[0m...`);
  console.log('Press \x1b[33mCtrl+C\x1b[0m to stop streaming.\n');

  // Spawn AWS CLI log tailing command
  const awsLog = spawn('aws', ['logs', 'tail', logGroupName, '--follow', '--region', region], {
    stdio: 'inherit',
    shell: true,
  });

  awsLog.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n\x1b[31m❌ AWS CLI log tailing exited with code ${code}.\x1b[0m`);
      console.log('Make sure your AWS credentials are configured locally by running `aws configure`.');
    }
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    awsLog.kill();
    process.exit(0);
  });
}
