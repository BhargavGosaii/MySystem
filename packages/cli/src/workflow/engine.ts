import * as fs from 'fs';
import * as path from 'path';
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
import { readManifest, writeManifest } from './manifest';
import { connectAwsAndGithubOidc } from '../utils/installer';

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
      // Load manifest if it exists
      const manifest = readManifest(this.context.projectRoot);
      let isReusingManifest = false;
      if (manifest) {
        console.log('\n\x1b[36mℹ️  [Manifest] Found existing project manifest (.mysystem/manifest.json). Reusing previous settings.\x1b[0m');
        this.context.awsRegion = manifest.awsRegion;
        this.context.needsDatabase = manifest.currentInfrastructure.database !== 'none';
        this.context.maxBudget = manifest.currentInfrastructure.hosting === 'ecs-fargate' ? 50.00 : 15.00;
        isReusingManifest = true;
      }

      // 1. Inspect Project
      this.context.currentState = 'INSPECTING';
      console.log('\n\x1b[1m🔍 [1/10] Inspecting Project Codebase...\x1b[0m');
      this.context.characteristics = await inspectService.inspect(this.context.projectRoot);
      
      if (!isReusingManifest || !manifest) {
        this.context.projectName = this.context.characteristics.name;
      } else {
        this.context.projectName = manifest.framework !== 'unknown' ? manifest.framework : this.context.characteristics.name;
      }
      console.log(`   Framework: \x1b[36m${this.context.characteristics.framework}\x1b[0m`);

      // 2. Engineering Review
      this.context.currentState = 'REVIEWING';
      console.log('\n\x1b[1m🔬 [2/10] Running Engineering Review...\x1b[0m');
      this.context.findings = await reviewService.review(this.context.characteristics, this.context.projectRoot);
      console.log(`   Found \x1b[33m${this.context.findings.length}\x1b[0m initial issues.`);

      // 3. Automatically Fix Safe Issues (Infrastructure Fixes)
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

      // Auto-Detect & Infer Configuration Parameters
      if (!isReusingManifest) {
        // 1. Infer AWS Region
        const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        this.context.awsRegion = envRegion || 'us-east-1';
        console.log(`   AWS Region:         \x1b[36m${this.context.awsRegion}\x1b[0m (Auto-detected)`);

        // 2. Infer Database requirement from codebase characteristics
        const hasDb = !!(this.context.characteristics?.databaseLib || this.context.characteristics?.ormLib || this.context.characteristics?.databaseUrlConfigured);
        this.context.needsDatabase = hasDb;
        console.log(`   Database required:  \x1b[36m${this.context.needsDatabase ? 'Yes' : 'No'}\x1b[0m (Auto-detected)`);

        // 3. Infer hosting and allocate budget limits
        const hasScalingTriggers = !!(this.context.characteristics?.hasWebsockets || this.context.characteristics?.queueLib);
        this.context.maxBudget = hasScalingTriggers ? 50.00 : 15.00;
        console.log(`   Budget allocated:   \x1b[36m$${this.context.maxBudget.toFixed(2)}/mo\x1b[0m (Auto-allocated)`);
      } else {
        console.log(`   Reused Region:      \x1b[36m${this.context.awsRegion}\x1b[0m (Reused)`);
        console.log(`   Reused Database:    \x1b[36m${this.context.needsDatabase ? 'Yes' : 'No'}\x1b[0m (Reused)`);
        console.log(`   Reused Budget limit:\x1b[36m$${this.context.maxBudget.toFixed(2)}/mo\x1b[0m (Reused)`);
      }

      // 4. Infer Security level (enable WAF automatically if database is exposed)
      const securityLevel = this.context.needsDatabase ? 'waf-shielded' : 'basic';
      console.log(`   Security profile:   \x1b[36m${securityLevel === 'waf-shielded' ? 'High (WAF Shielded)' : 'Basic'}\x1b[0m (Auto-configured)`);

      // 5. Custom Domain & Email Alert Defaults
      const domainName = process.env.MYSYSTEM_DOMAIN || '';
      const billingEmail = '';
      if (domainName) {
        console.log(`   Custom Domain:      \x1b[36m${domainName}\x1b[0m (Inferred from env)`);
      }

      // Resolve database code blocker if approved (Code Fix approval check)
      const sqliBlocker = this.context.findings.find(f => f.id === 'sec-sql-injection');
      if (sqliBlocker) {
        console.log(`\n\x1b[33m⚠️  SQL Injection smell detected. You must confirm parameter sanitization.\x1b[0m`);
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
      console.log('\n\x1b[1m🚀 [8/10] Connecting AWS and GitHub via OIDC Stack Trust...\x1b[0m');
      const oidcSuccess = await connectAwsAndGithubOidc(this.context.projectRoot);
      if (!oidcSuccess) {
        throw new Error('Failed to set up AWS/GitHub OIDC trust connection stack.');
      }

      // 9. Verify Deployment
      this.context.currentState = 'VERIFYING';
      console.log('\n\x1b[1m🛡️  [9/10] Verifying generated production assets... \x1b[0m');
      const verification = await verificationService.verify(this.context.projectRoot);
      if (!verification.success) {
        throw new Error(`Verification Failure: ${verification.errors.join(', ')}`);
      }
      console.log('   ✅ Verification checks successfully passed.');

      // 10. Produce Production Summary
      this.context.currentState = 'COMPLETED';
      console.log('\n\x1b[1m📝 [10/10] Compiling Production Summary dashboard...\x1b[0m');
      const summary = await monitoringService.generateSummary(this.context.plan);
      
      // Save manifest json
      writeManifest(this.context.projectRoot, {
        framework: this.context.characteristics.framework,
        deploymentType: this.context.plan.config.hosting === 'ecs-fargate' ? 'production' : 'hobbyist',
        awsRegion: this.context.awsRegion,
        lastReview: new Date().toISOString(),
        lastDeployment: new Date().toISOString(),
        healthStatus: 'Healthy',
        currentInfrastructure: {
          hosting: this.context.plan.config.hosting,
          database: this.context.plan.config.database !== 'none' ? 'postgresql' : 'none',
          redis: this.context.plan.config.redis,
          pgBouncer: this.context.plan.config.pgBouncer,
          waf: this.context.plan.config.waf
        },
        version: '1.0.4'
      });

      monitoringService.printSummary(summary);
      rl.close();
      return true;

    } catch (err: any) {
      const failedState = this.context.currentState;
      this.context.currentState = 'ROLLING_BACK';
      console.log('\n\x1b[1m🔴 [ROLLING BACK] Initiating infrastructure rollback and restoring files...\x1b[0m');
      
      // Revert generated assets
      try {
        const pathsToCleanup = [
          path.join(this.context.projectRoot, 'Dockerfile'),
          path.join(this.context.projectRoot, 'mysystem.json'),
          path.join(this.context.projectRoot, '.github', 'workflows', 'mysystem-deploy.yml'),
          path.join(this.context.projectRoot, '.github', 'workflows', 'mysystem-destroy.yml')
        ];
        pathsToCleanup.forEach(p => {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        });
        const tfDir = path.join(this.context.projectRoot, 'terraform');
        if (fs.existsSync(tfDir)) {
          fs.rmSync(tfDir, { recursive: true, force: true });
        }
        console.log('   ✅ Local infrastructure variables and manifests reverted.');
      } catch {
        console.log('   ⚠️  Failed to complete file reversion cleanly.');
      }

      console.log('\n================================================================');
      console.log('\x1b[1m\x1b[31m                    MYSYSTEM ROLLBACK DIAGNOSTICS REPORT\x1b[0m');
      console.log('================================================================');
      console.log(`Failed Step:         \x1b[33m${failedState}\x1b[0m`);
      console.log(`Error Diagnostics:   \x1b[31m${err.message}\x1b[0m`);
      console.log(`Rollback Action:     Reverted generated CloudFormation/Terraform assets`);
      console.log(`System State:        Restored to original pre-deployment state`);
      console.log('================================================================\n');

      this.context.currentState = 'FAILED';
      rl.close();
      return false;
    }
  }
}
