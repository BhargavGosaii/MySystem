import { ProductionDecision } from '../advisor';

/**
 * Renders the Production Plan summary table to the terminal.
 * This is the primary output the developer sees before deployment proceeds.
 */
export function renderProductionPlan(
  framework: string,
  decisions: ProductionDecision[],
  totalCost: number,
  confidence: number
): void {
  const getDecision = (key: string) => decisions.find(d => d.component === key);

  const hosting = getDecision('hosting');
  const database = getDecision('database');
  const redis = getDecision('redis');
  const pgBouncer = getDecision('pgBouncer');
  const waf = getDecision('waf');
  const sentry = getDecision('sentry');
  const region = getDecision('region');
  const domain = getDecision('domain');

  // Format framework name for display
  const frameworkNames: Record<string, string> = {
    'nextjs': 'Next.js Web Application',
    'react-vite': 'React (Vite) Single Page Application',
    'node': 'Node.js Server Application',
    'fastapi': 'FastAPI (Python) Application',
    'unknown': 'Web Application',
  };
  const appType = frameworkNames[framework] || framework;

  // Format hosting value for display
  const hostingDisplay: Record<string, string> = {
    'ec2': 'EC2 (Single Instance)',
    'ecs-fargate': 'ECS Fargate (Managed Containers)',
  };

  console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[1m              PRODUCTION PLAN                   \x1b[0m');
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  // Application
  printDecisionRow('Application', appType);
  console.log('');

  // Hosting
  if (hosting) {
    printDecisionRow('Hosting', hostingDisplay[hosting.value] || hosting.value);
    printReasonRows(hosting.reasoning);
    console.log('');
  }

  // Region
  if (region) {
    printDecisionRow('Region', region.value);
    printReasonRows(region.reasoning);
    console.log('');
  }

  // Database
  if (database) {
    const dbDisplay = database.value === 'none' ? 'None' : 'PostgreSQL (AWS RDS)';
    printDecisionRow('Database', dbDisplay);
    printReasonRows(database.reasoning);
    console.log('');
  }

  // Redis / Caching
  if (redis) {
    const redisDisplay = redis.value ? 'ElastiCache Redis' : 'None';
    printDecisionRow('Caching', redisDisplay);
    printReasonRows(redis.reasoning);
    console.log('');
  }

  // PgBouncer
  if (pgBouncer && pgBouncer.value) {
    printDecisionRow('Connection Pooling', 'AWS RDS Proxy (PgBouncer)');
    printReasonRows(pgBouncer.reasoning);
    console.log('');
  }

  // WAF
  if (waf) {
    const wafDisplay = waf.value ? 'AWS WAF Enabled' : 'Disabled';
    printDecisionRow('Firewall', wafDisplay);
    printReasonRows(waf.reasoning);
    console.log('');
  }

  // Monitoring (always on)
  printDecisionRow('Monitoring', 'CloudWatch Enabled');
  printReasonRows(['Production best practice.']);
  console.log('');

  // Sentry
  if (sentry && sentry.value) {
    printDecisionRow('Error Tracking', 'Sentry SDK');
    printReasonRows(sentry.reasoning);
    console.log('');
  }

  // Domain
  if (domain && domain.value !== 'none') {
    printDecisionRow('Custom Domain', domain.value);
    printReasonRows(domain.reasoning);
    console.log('');
  }

  // Cost & Confidence
  console.log('\x1b[1m──────────────────────────────────────────────\x1b[0m');
  printDecisionRow('Estimated AWS Cost', `\x1b[32m$${totalCost.toFixed(2)}/month\x1b[0m`);
  printDecisionRow('Deployment Confidence', `\x1b[32m${confidence}%\x1b[0m`);

  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
}

function printDecisionRow(label: string, value: string): void {
  const paddedLabel = `  ${label}`.padEnd(28);
  console.log(`\x1b[1m${paddedLabel}\x1b[0m${value}`);
}

function printReasonRows(reasons: string[]): void {
  for (const reason of reasons) {
    console.log(`\x1b[90m${''.padEnd(28)}${reason}\x1b[0m`);
  }
}
