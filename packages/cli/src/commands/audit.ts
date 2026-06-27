import { inspectService } from '../services/inspect';
import { reviewService } from '../services/review';
import { planningService } from '../services/plan';

export async function runAudit(projectRoot: string, isJson: boolean = false) {
  if (!isJson) {
    console.log('\n\x1b[1m🔍 Auditing project codebase via AWS Production Engineering Standard...\x1b[0m\n');
  }

  try {
    const characteristics = await inspectService.inspect(projectRoot);
    const findings = await reviewService.review(characteristics, projectRoot);

    // Call planner with default parameters to get baseline costs/savings
    const plan = await planningService.plan(characteristics, {
      maxMonthlyBudget: 50.00,
      availabilityTarget: 'single',
      securityLevel: 'basic',
      performanceLevel: 'standard'
    }, 'us-east-1');

    // Calculate score
    let score = 100;
    findings.forEach(f => {
      if (f.blocksDeployment) score -= 15;
      else if (f.action === 'APPROVAL') score -= 8;
      else score -= 4;
    });
    score = Math.max(0, Math.min(100, score));

    // Compile sections
    const autofixes = findings.filter(f => f.action === 'AUTOFIX');
    const actions = findings.filter(f => f.action === 'APPROVAL' || f.action === 'MANUAL');
    const blockers = findings.filter(f => f.blocksDeployment);

    // Estimate potential savings (e.g. if we move from Fargate to EC2 under low budget)
    const savings = plan.config.hosting === 'ecs-fargate' ? 11.80 : 0.00;

    if (isJson) {
      const output = {
        readinessScore: score,
        estimatedCost: plan.monthlyEstimate,
        estimatedSavings: savings,
        findings: findings.map(f => ({
          id: f.id,
          category: f.category,
          title: f.title,
          description: f.description,
          action: f.action,
          blocksDeployment: f.blocksDeployment,
          recommendation: f.recommendation,
          fixed: f.fixed
        })),
        plan: {
          hosting: plan.config.hosting,
          database: plan.config.database,
          redis: plan.config.redis,
          pgBouncer: plan.config.pgBouncer,
          waf: plan.config.waf
        }
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('              \x1b[1m\x1b[32mMYSYSTEM PRODUCTION REVIEW REPORT\x1b[0m');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Overall Production Readiness: \x1b[1m${score}%\x1b[0m`);
    console.log(`Estimated Monthly AWS Cost:   \x1b[33m$${plan.monthlyEstimate.toFixed(2)}/month\x1b[0m`);
    console.log(`Estimated Monthly Savings:    \x1b[32m$${savings.toFixed(2)}/month\x1b[0m`);

    if (autofixes.length > 0) {
      console.log('\n\x1b[1m\x1b[32m[🔧 AUTO-FIXES AVAILABLE]\x1b[0m');
      autofixes.forEach(f => {
        console.log(`  - ${f.title} (\x1b[36mSafe to apply automatically\x1b[0m)`);
      });
    } else {
      console.log('\n\x1b[32m✅ No safe automatic fixes pending.\x1b[0m');
    }

    if (actions.length > 0) {
      console.log('\n\x1b[1m\x1b[33m[⚠️  ACTIONS REQUIRED / APPROVALS]\x1b[0m');
      actions.forEach(f => {
        console.log(`  - \x1b[1m${f.title}\x1b[0m`);
        console.log(`    Recommendation: ${f.recommendation}`);
      });
    }

    if (blockers.length > 0) {
      console.log('\n\x1b[1m\x1b[31m[🛑 DEPLOYMENT BLOCKERS]\x1b[0m');
      blockers.forEach(f => {
        console.log(`  - \x1b[31m${f.title}\x1b[0m`);
        console.log(`    Reason: ${f.description}`);
      });
    } else {
      console.log('\n\x1b[32m✅ No active blockers preventing deployment.\x1b[0m');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err: any) {
    console.error(`\x1b[31mAudit failed: ${err.message}\x1b[0m\n`);
  }
}
