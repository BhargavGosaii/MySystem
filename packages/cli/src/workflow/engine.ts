import * as readline from 'readline/promises';
import { inspectService } from '../services/inspect';
import { reviewService, EngineeringFinding } from '../services/review';
import { autoFixService } from '../services/autofix';
import { planningService } from '../services/plan';
import { deploymentService } from '../services/deploy';
import { verificationService } from '../services/verify';
import { monitoringService } from '../services/monitor';
import { WorkflowContext, createInitialContext } from './state';
import { PlannerConstraints } from '../planner/planner';

export class WorkflowEngine {
  private context: WorkflowContext;

  constructor(projectRoot: string) {
    this.context = createInitialContext(projectRoot);
  }

  async run(): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // 1. Inspect Project
      this.context.currentState = 'INSPECTING';
      console.log('\n\x1b[1m🔍 [1/10] Inspecting Project Codebase...\x1b[0m');
      this.context.characteristics = await inspectService.inspect(this.context.projectRoot);
      this.context.projectName = this.context.characteristics.name;
      console.log(`   Framework: \x1b[36m${this.context.characteristics.framework}\x1b[0m`);

      // 2. Engineering Review
      this.context.currentState = 'REVIEWING';
      console.log('\n\x1b[1m🔬 [2/10] Running Engineering Review...\x1b[0m');
      this.context.findings = await reviewService.review(this.context.characteristics, this.context.projectRoot);
      console.log(`   Found \x1b[33m${this.context.findings.length}\x1b[0m initial issues.`);

      // 3. Automatically Fix Safe Issues
      this.context.currentState = 'FIXING';
      const autofixable = this.context.findings.filter(f => f.action === 'AUTOFIX');
      if (autofixable.length > 0) {
        console.log('\n\x1b[1m🔧 [3/10] Automatically Fixing Safe Issues...\x1b[0m');
        for (const finding of autofixable) {
          console.log(`   🛠️  Fixing: ${finding.title}...`);
          const success = await autoFixService.fix(finding, this.context.characteristics, this.context.projectRoot);
          if (success) {
            finding.fixed = true;
            console.log(`     ✅ Solved.`);
          } else {
            console.log(`     ❌ Fix failed.`);
          }
        }
      }

      // 4. Re-run Engineering Review
      console.log('\n\x1b[1m🔬 [4/10] Re-running Engineering Review to Verify Fixes...\x1b[0m');
      this.context.findings = await reviewService.review(this.context.characteristics, this.context.projectRoot);

      // 5. If blockers or approvals remain, handle them
      this.context.currentState = 'AWAITING_APPROVALS';
      console.log('\n\x1b[1m⚠️  [5/10] Resolving Approvals and Blockers...\x1b[0m');

      // Print current remaining items
      const unresolvedBlockers = this.context.findings.filter(f => f.blocksDeployment && !f.fixed);
      if (unresolvedBlockers.length > 0) {
        console.log('\n   🔴 REMAINING BLOCKERS:');
        unresolvedBlockers.forEach(b => {
          console.log(`     - \x1b[31m[BLOCKER]\x1b[0m \x1b[1m${b.title}\x1b[0m`);
          console.log(`       Evidence: ${b.evidence.join(', ')}`);
          console.log(`       Recommendation: ${b.recommendation}\n`);
        });
      }

      // AWS Region Selection (Required Blocker)
      let awsRegion = 'us-east-1';
      const validRegions = [
        'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
        'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
        'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
        'ap-southeast-1', 'ap-southeast-2', 'ap-southeast-4',
        'ap-south-1', 'sa-east-1', 'ca-central-1'
      ];
      while (true) {
        const regionInput = await rl.question('\nEnter AWS Region [us-east-1]: ');
        const trimmed = regionInput.trim().toLowerCase();
        if (!trimmed) {
          awsRegion = 'us-east-1';
          break;
        }
        if (validRegions.includes(trimmed)) {
          awsRegion = trimmed;
          break;
        }
        console.log(`\x1b[31mError: "${trimmed}" is not a valid AWS region. Please choose a valid region (e.g. us-east-1, us-west-2, eu-west-1).\x1b[0m`);
      }
      this.context.awsRegion = awsRegion;

      // Database Requirement Selection
      const dbInput = await rl.question('\nDoes your application require a database? (y/n) [y]: ');
      const needsDatabase = dbInput.trim().toLowerCase() !== 'n';
      this.context.needsDatabase = needsDatabase;

      // Budget Limit
      const budgetInput = await rl.question('\nEnter your maximum monthly hosting budget limit ($) [50]: ');
      const maxBudget = parseFloat(budgetInput.trim()) || 50.00;
      this.context.maxBudget = maxBudget;

      // Security Level
      console.log('\nChoose target security level:');
      console.log('  1. Basic  [Direct ALB/EC2 routing]');
      console.log('  2. High   [Shielded via AWS WAF firewall]');
      const secInput = await rl.question('Choose security level [1]: ');
      const securityLevel = secInput.trim() === '2' ? 'waf-shielded' : 'basic';

      // Custom Domain
      const customDomainInput = await rl.question('\nEnable custom domain & HTTPS SSL certificate? (y/n) [n]: ');
      const enableCustomDomain = customDomainInput.trim().toLowerCase() === 'y';
      let domainName = '';
      if (enableCustomDomain) {
        const domainInput = await rl.question('Enter custom domain (e.g. app.myproduct.com): ');
        domainName = domainInput.trim();
      }

      const billingEmailInput = await rl.question('\nEnter email for AWS budget alerts (press Enter to skip): ');
      const billingEmail = billingEmailInput.trim();

      // Resolve database blocker if approved
      const sqliBlocker = this.context.findings.find(f => f.id === 'sec-sql-injection');
      if (sqliBlocker) {
        console.log(`\n\x1b[33m⚠️  SQL Injection smell detected. You must confirm parameters sanitization.\x1b[0m`);
        const approveSqli = await rl.question('Do you approve parameter sanitization and ORM safety compliance? (y/n) [y]: ');
        if (approveSqli.trim().toLowerCase() !== 'n') {
          sqliBlocker.fixed = true;
          console.log('   ✅ Approved.');
        } else {
          console.log('   🛑 Blocked. Deployment cannot proceed with raw injection exposure.');
          rl.close();
          return false;
        }
      }

      // Check if any deployment blockers remain unresolved
      const activeBlockers = this.context.findings.filter(f => f.blocksDeployment && !f.fixed);
      if (activeBlockers.length > 0) {
        console.log('\n\x1b[31m❌ Cannot deploy. The following unresolved blockers remain:\x1b[0m');
        activeBlockers.forEach(b => console.log(`   - ${b.title}`));
        rl.close();
        return false;
      }

      // 6. Prepare AWS Infrastructure
      this.context.currentState = 'PLANNING';
      console.log('\n\x1b[1m💰 [6/10] Preparing Cost-Optimized AWS Infrastructure plan...\x1b[0m');
      const constraints: PlannerConstraints = {
        maxMonthlyBudget: this.context.maxBudget,
        availabilityTarget: this.context.maxBudget > 30 ? 'multi-zone' : 'single',
        securityLevel,
        performanceLevel: 'standard',
        needsDatabase: this.context.needsDatabase
      };

      this.context.plan = await planningService.plan(
        this.context.characteristics,
        constraints,
        this.context.awsRegion,
        domainName,
        billingEmail
      );

      // 7. Configure GitHub Actions
      this.context.currentState = 'PREPARING_ASSETS';
      console.log('\n\x1b[1m⚙️  [7/10] Configuring GitHub Actions deployment configurations...\x1b[0m');
      const successDeploy = await deploymentService.deploy(
        this.context.plan,
        this.context.characteristics,
        this.context.projectRoot
      );

      if (!successDeploy) {
        throw new Error('Asset configuration deployment failed.');
      }
      console.log('   ✅ Terraform modules created in /terraform');
      console.log('   ✅ GitHub Actions deployment workflow created.');

      // 8. Deploy
      this.context.currentState = 'DEPLOYING';
      console.log('\n\x1b[1m🚀 [8/10] Simulating OIDC Stack Trust Validation and deployment checks...\x1b[0m');
      console.log('   ✅ OIDC Stack verification URLs compiled.');

      // 9. Verify Deployment
      this.context.currentState = 'VERIFYING';
      console.log('\n\x1b[1m🛡️  [9/10] Verifying generated production assets... \x1b[0m');
      const verification = await verificationService.verify(this.context.projectRoot);
      if (!verification.success) {
        console.log('\x1b[31mVerification Errors:\x1b[0m');
        verification.errors.forEach(err => console.log(`   - ${err}`));
        this.context.currentState = 'FAILED';
        rl.close();
        return false;
      }
      console.log('   ✅ Verification checks successfully passed.');

      // 10. Produce Production Summary
      this.context.currentState = 'COMPLETED';
      console.log('\n\x1b[1m📝 [10/10] Compiling Production Summary dashboard...\x1b[0m');
      const summary = await monitoringService.generateSummary(this.context.plan);
      monitoringService.printSummary(summary);

      rl.close();
      return true;

    } catch (err: any) {
      this.context.currentState = 'FAILED';
      console.error(`\n\x1b[31mWorkflow failed: ${err.message}\x1b[0m`);
      rl.close();
      return false;
    }
  }
}
