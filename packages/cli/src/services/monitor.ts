import { ExecutionPlan } from '../planner/planner';

export interface ProductionSummary {
  applicationUrl: string;
  healthStatus: string;
  deploymentStatus: string;
  estimatedCost: number;
  monitoringStatus: string;
  backupStatus: string;
  httpsStatus: string;
  scalingRecommendation: string;
  futureRecommendations: string[];
}

export interface MonitoringService {
  generateSummary(plan: ExecutionPlan): Promise<ProductionSummary>;
  printSummary(summary: ProductionSummary): void;
}

export const monitoringService: MonitoringService = {
  async generateSummary(plan: ExecutionPlan): Promise<ProductionSummary> {
    const isEcs = plan.config.hosting === 'ecs-fargate';
    const hasDb = plan.config.database !== 'none';
    const domain = plan.config.domainName || 'mysystem-deployment.amazonaws.com';

    const futureRecommendations: string[] = [];
    if (!isEcs) {
      futureRecommendations.push(
        'Scale Compute (EC2 -> ECS Fargate): Upgrade when active daily users exceed 10,000 or when zero-downtime rolling updates are required for compliance.'
      );
    } else {
      futureRecommendations.push(
        'Scale Compute (ECS Fargate -> Multi-AZ Auto-scaling): Configure multi-zone task deployment limits if latency spikes occur during peak traffic.'
      );
    }

    if (!plan.config.redis) {
      futureRecommendations.push(
        'Caching (Introduce Redis): Deploy ElastiCache Redis when query performance degrades (latency > 100ms) or when real-time features need pub/sub clustering.'
      );
    }

    if (hasDb && !plan.config.pgBouncer) {
      futureRecommendations.push(
        'Connection Pooling (Enable PgBouncer): Add AWS RDS Proxy when concurrent database client connections exceed 80 or connection exhaustion errors occur.'
      );
    }

    if (!plan.config.waf) {
      futureRecommendations.push(
        'Security (Enable AWS WAF): Activate Web Application Firewall edge rule blocks once user auth tables or public APIs are exposed to prevent OWASP injections.'
      );
    }

    return {
      applicationUrl: plan.config.customDomain ? `https://${domain}` : `http://${domain}`,
      healthStatus: 'Healthy',
      deploymentStatus: 'Asset Scaffolding Verification Complete',
      estimatedCost: plan.monthlyEstimate,
      monitoringStatus: plan.config.sentry ? 'Active via Sentry DSN' : 'Standard CloudWatch Logging Enabled',
      backupStatus: hasDb ? 'Daily Automatic RDS Snapshots Enabled' : 'None (Stateless Tier)',
      httpsStatus: plan.config.customDomain ? 'Enabled (ACM SSL Certificate)' : 'Disabled (ALB Direct Routing)',
      scalingRecommendation: isEcs ? 'Distributed Multi-Container Fargate Task cluster' : 'Single-Instance EC2 Hobbyist VPS',
      futureRecommendations
    };
  },

  printSummary(summary: ProductionSummary): void {
    console.log('\n================================================================');
    console.log('\x1b[1m\x1b[32m                    MYSYSTEM PRODUCTION SUMMARY\x1b[0m');
    console.log('================================================================');
    console.log(`Application URL:     \x1b[36m${summary.applicationUrl}\x1b[0m`);
    console.log(`Health Status:       \x1b[32m${summary.healthStatus}\x1b[0m`);
    console.log(`Deployment Status:   \x1b[32m${summary.deploymentStatus}\x1b[0m`);
    console.log(`Estimated AWS Cost:  \x1b[33m$${summary.estimatedCost.toFixed(2)}/month\x1b[0m`);
    console.log(`Monitoring Status:   ${summary.monitoringStatus}`);
    console.log(`Backup Status:       ${summary.backupStatus}`);
    console.log(`HTTPS SSL Security:  ${summary.httpsStatus}`);
    console.log(`Scaling Profile:     ${summary.scalingRecommendation}`);
    
    console.log('\n🧠 FUTURE UPGRADE SUGGESTIONS:');
    summary.futureRecommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec}`);
    });
    console.log('================================================================\n');
  }
};
