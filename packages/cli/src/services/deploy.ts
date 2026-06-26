import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../inspectors';
import { ExecutionPlan } from '../planner/planner';

export interface DeploymentService {
  deploy(plan: ExecutionPlan, characteristics: ProjectCharacteristics, projectRoot: string): Promise<boolean>;
}

export const deploymentService: DeploymentService = {
  async deploy(plan: ExecutionPlan, characteristics: ProjectCharacteristics, projectRoot: string): Promise<boolean> {
    try {
      // Find templates directory
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
        throw new Error('Templates directory not found.');
      }

      const isProdTier = plan.config.hosting === 'ecs-fargate';

      // 1. Create Terraform directory & copy templates
      const terraformDir = path.join(projectRoot, 'terraform');
      fs.mkdirSync(terraformDir, { recursive: true });

      const srcTerraformDir = path.join(templatesDir, isProdTier ? 'terraform' : 'terraform-ec2');
      if (fs.existsSync(srcTerraformDir)) {
        const files = fs.readdirSync(srcTerraformDir);
        for (const file of files) {
          const filePath = path.join(srcTerraformDir, file);
          if (fs.statSync(filePath).isFile() && file !== 'bootstrap-oidc.yaml') {
            fs.copyFileSync(filePath, path.join(terraformDir, file));
          }
        }
      }

      // 2. Write terraform.tfvars
      const tfvarsContent = `aws_region           = "${plan.awsRegion}"
app_name             = "${plan.projectName}"
container_port       = ${characteristics.port}
enable_database      = ${plan.config.database !== 'none'}
enable_redis         = ${plan.config.redis}
enable_rds_proxy     = ${plan.config.pgBouncer}
billing_email        = "${plan.config.emailAlerts || ''}"
enable_custom_domain = ${plan.config.customDomain}
domain_name          = "${plan.config.domainName || ''}"
dns_provider         = "${plan.config.dnsProvider || 'external'}"
sentry_dsn           = "${plan.config.sentryDsn || ''}"
`;
      fs.writeFileSync(path.join(terraformDir, 'terraform.tfvars'), tfvarsContent, 'utf8');

      // 3. Copy AGENTS.md
      let srcAgentsMd = '';
      const agentsPathsToCheck = [
        path.join(__dirname, '../../AGENTS.md'),
        path.join(__dirname, '../../../AGENTS.md'),
      ];
      for (const p of agentsPathsToCheck) {
        if (fs.existsSync(p)) {
          srcAgentsMd = p;
          break;
        }
      }
      const destAgentsMd = path.join(projectRoot, 'AGENTS.md');
      if (fs.existsSync(srcAgentsMd)) {
        fs.copyFileSync(srcAgentsMd, destAgentsMd);
      }

      // 4. Write project configuration mysystem.json
      const configData = {
        name: plan.projectName,
        region: plan.awsRegion,
        port: characteristics.port,
        tier: plan.config.hosting === 'ecs-fargate' ? 'production' : 'hobbyist',
        database: plan.config.database !== 'none',
        redis: plan.config.redis,
        rdsProxy: plan.config.pgBouncer,
        billingEmail: plan.config.emailAlerts,
        customDomain: plan.config.customDomain,
        domainName: plan.config.domainName,
        dnsProvider: plan.config.dnsProvider,
        sentryDsn: plan.config.sentryDsn,
        type: characteristics.framework,
        initializedAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(projectRoot, 'mysystem.json'), JSON.stringify(configData, null, 2), 'utf8');

      return true;
    } catch {
      return false;
    }
  }
};
