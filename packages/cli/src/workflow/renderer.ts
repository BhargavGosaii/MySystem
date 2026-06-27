import { ProductionDecision, ArchitectureReview } from '../advisor';
import { EngineeringFinding } from '../services/review';

/**
 * Renders the Production Plan and Review summary to the terminal.
 * This is the primary output the developer sees before deployment proceeds.
 */
export function renderProductionPlan(
  framework: string,
  decisions: ProductionDecision[],
  findings: EngineeringFinding[],
  totalCost: number,
  confidence: number,
  review?: ArchitectureReview
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

  // 1. Render Verdict
  const blockerDecisions = decisions.filter(d => d.decisionType === 'BLOCKER');
  const unresolvedBlockers = findings.filter(f => f.blocksDeployment && !f.fixed);
  const hasAnyBlocker = blockerDecisions.length > 0 || unresolvedBlockers.length > 0;

  console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[1m              PRODUCTION REVIEW VERDICT         \x1b[0m');
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('Can this application safely run in production on AWS?');
  if (hasAnyBlocker) {
    console.log('\x1b[31m👉 NO (Blocked by active architectural or security issues)\x1b[0m');
  } else if (findings.filter(f => !f.fixed && f.action !== 'IGNORE').length > 0) {
    console.log('\x1b[33m👉 YES (With recommended optimizations)\x1b[0m');
  } else {
    console.log('\x1b[32m👉 YES (All checks verified successfully!)\x1b[0m');
  }
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  // 2. Render Plan Table
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[1m              PRODUCTION PLAN                   \x1b[0m');
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  // Application
  printDecisionRow('Application', appType);
  if (review) {
    if (review.archetype) {
      printDecisionRow('Application Archetype', `\x1b[36m${review.archetype}\x1b[0m`);
    }
    if (review.simplicityScore !== undefined) {
      let rating = 'Simple';
      if (review.simplicityScore >= 85) rating = 'Highly Simple / Minimal';
      else if (review.simplicityScore >= 70) rating = 'Moderate Complexity';
      else rating = 'High Complexity / Multi-Service';
      printDecisionRow('Simplicity Score', `\x1b[32m${review.simplicityScore}% (${rating})\x1b[0m`);
    }
    if (review.complexityScore !== undefined) {
      printDecisionRow('Complexity Score', `${review.complexityScore}`);
    }
  }
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
  printReasonRows(['Production best practice.', '[Golden Rule: Prefer AWS native services]']);
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
  console.log('\x1b[90mℹ️  Decisions aligned with the MySystem Production Standard (AGENTS.md)\x1b[0m');
  console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  // Infrastructure Justification
  if (review && review.justifications) {
    console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    console.log('\x1b[1m         INFRASTRUCTURE JUSTIFICATION          \x1b[0m');
    console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

    Object.values(review.justifications).forEach(j => {
      console.log(`  \x1b[1m${j.service}\x1b[0m`);
      console.log(`  Decision:                  ${j.decision === 'Included' ? '\x1b[32mIncluded\x1b[0m' : '\x1b[33mNot Included\x1b[0m'}`);
      console.log(`  Evidence:                  ${j.evidence.join(', ')}`);
      if (j.decision === 'Included') {
        console.log(`  Benefits:                  ${j.benefits.join(', ')}`);
        console.log(`  Operational Complexity:    ${j.operationalComplexity}`);
        console.log(`  Estimated Monthly Cost:    $${j.monthlyCost.toFixed(2)}/month`);
      } else {
        const savings = j.monthlyCost || 12.00;
        console.log(`  Estimated Monthly Savings: ~$${savings.toFixed(2)}/month`);
      }
      console.log(`  Reason:                    ${j.reasonRejectedOrSelected}`);
      console.log('');
    });
    console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
  }

  // Future Scaling / Upgrade Path
  if (review && review.upgradePath && review.upgradePath.length > 0) {
    console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    console.log('\x1b[1m         FUTURE SCALING & UPGRADE PATHS        \x1b[0m');
    console.log('\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
    review.upgradePath.forEach(path => {
      console.log(`  🚀 \x1b[1m${path}\x1b[0m`);
    });
    console.log('\n\x1b[1m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
  }

  // 3. Render Review Findings
  const autofixes = findings.filter(f => f.action === 'AUTOFIX');
  const recommendations = findings.filter(f => !f.blocksDeployment && f.action !== 'AUTOFIX' && f.action !== 'IGNORE' && !f.fixed);
  const blockers = findings.filter(f => f.blocksDeployment && !f.fixed);

  if (blockers.length > 0) {
    console.log('\x1b[1m\x1b[31m[🛑 BLOCKERS - HALTING DEPLOYMENT]\x1b[0m');
    blockers.forEach(f => {
      console.log(`  - \x1b[1m${f.title}\x1b[0m (Risk: \x1b[31m${f.impact?.securityRisk || 'High'}\x1b[0m)`);
      console.log(`    \x1b[90mReasoning:\x1b[0m   ${f.description}`);
      console.log(`    \x1b[90mFix Guide:\x1b[0m   ${f.recommendation}`);
      if (f.impact?.costSavings) {
        console.log(`    \x1b[90mCost Impact:\x1b[0m ${f.impact.costSavings}`);
      }
      console.log('');
    });
  }

  if (recommendations.length > 0) {
    console.log('\x1b[1m\x1b[33m[⚠️  RECOMMENDATIONS - AUTO-PROCEEDING]\x1b[0m');
    recommendations.forEach(f => {
      const riskText = f.impact?.securityRisk ? `Risk: \x1b[33m${f.impact.securityRisk}\x1b[0m` : '';
      console.log(`  - \x1b[1m${f.title}\x1b[0m ${riskText ? `(${riskText})` : ''}`);
      console.log(`    \x1b[90mReasoning:\x1b[0m   ${f.description}`);
      console.log(`    \x1b[90mSuggestion:\x1b[0m  ${f.recommendation}`);
      if (f.impact?.latency) {
        console.log(`    \x1b[90mExpected Benefit:\x1b[0m ${f.impact.latency}`);
      }
      if (f.impact?.costSavings) {
        console.log(`    \x1b[90mCost Impact:\x1b[0m ${f.impact.costSavings}`);
      }
      console.log('');
    });
  }

  if (autofixes.length > 0) {
    console.log('\x1b[1m\x1b[32m[🔧 SAFE - AUTOMATICALLY INJECTED]\x1b[0m');
    autofixes.forEach(f => {
      console.log(`  - \x1b[1m${f.title}\x1b[0m (Applied automatically by MySystem verification engine)`);
      console.log(`    \x1b[90mReasoning:\x1b[0m   ${f.description}`);
      console.log(`    \x1b[90mAction Taken:\x1b[0m ${f.recommendation}`);
      console.log('');
    });
  }
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
