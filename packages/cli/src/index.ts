#!/usr/bin/env node

import { runInit } from './commands/init';
import { runAudit } from './commands/audit';
import { runDestroy } from './commands/destroy';
import { runLogs } from './commands/logs';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
\x1b[1mMySystem CLI - Production Deployment for Vibecoders\x1b[0m

Usage:
  npx mysystem-cli <command> [options]

Commands:
  \x1b[36minit\x1b[0m      Initialize AWS Terraform configs, Dockerfiles, and GitHub workflows.
  \x1b[36maudit\x1b[0m     Audit local files for production-readiness, security, and compliance.
  \x1b[36mlogs\x1b[0m      Stream container logs from AWS CloudWatch directly to your terminal.
  \x1b[36mdestroy\x1b[0m   Teardown all AWS infrastructure resources for this application.
  \x1b[36mhelp\x1b[0m      Print this help menu.

Examples:
  $ npx mysystem-cli init
  $ npx mysystem-cli audit
  $ npx mysystem-cli logs
  $ npx mysystem-cli destroy
  `);
}

async function main() {
  switch (command) {
    case 'init':
      await runInit(process.cwd());
      break;
    case 'audit':
      runAudit(process.cwd());
      break;
    case 'logs':
      await runLogs(process.cwd());
      break;
    case 'destroy':
      await runDestroy(process.cwd());
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      if (!command) {
        printHelp();
      } else {
        console.error(`\x1b[31mUnknown command: ${command}\x1b[0m`);
        printHelp();
        process.exit(1);
      }
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal error occurred:\x1b[0m', err);
  process.exit(1);
});
