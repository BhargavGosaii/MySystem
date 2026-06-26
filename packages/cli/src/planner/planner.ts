import { ArchitectureReview } from '../advisor';

export interface PlannerConstraints {
  maxMonthlyBudget: number;       // e.g. $5, $15, $50
  availabilityTarget: 'single' | 'multi-zone';
  securityLevel: 'basic' | 'high' | 'waf-shielded';
  performanceLevel: 'standard' | 'high-throughput';
  developerPreference?: string;
  needsDatabase?: boolean;
}

export interface ExecutionPlan {
  projectName: string;
  playbookName: 'startup' | 'growth' | 'enterprise';
  awsRegion: string;
  config: {
    hosting: 'ec2' | 'ecs-fargate';
    database: 'postgresql' | 'mysql' | 'none';
    redis: boolean;
    pgBouncer: boolean;
    customDomain: boolean;
    domainName?: string;
    dnsProvider?: 'route53' | 'external';
    waf: boolean;
    cloudwatch: boolean;
    budgetAlerts: boolean;
    emailAlerts?: string;
    sentry: boolean;
    sentryDsn?: string;
  };
  monthlyEstimate: number;
  planNotes: string[];
}

export async function runPlanner(
  review: ArchitectureReview,
  constraints: PlannerConstraints,
  awsRegion: string = 'us-east-1',
  customDomainName?: string,
  alertEmail?: string,
  sentryDsn?: string
): Promise<ExecutionPlan> {
  const planNotes: string[] = [];

  // Determine playbook name based on constraints
  let playbookName: 'startup' | 'growth' | 'enterprise' = 'startup';
  if (constraints.maxMonthlyBudget > 40 || constraints.availabilityTarget === 'multi-zone') {
    playbookName = 'growth';
  }
  if (constraints.maxMonthlyBudget > 70 && constraints.securityLevel === 'waf-shielded') {
    playbookName = 'enterprise';
  }

  // Base setup derived from Advisor recommendations and user constraints
  let hosting = review.recommendations['hosting']?.recommendation === 'Recommended' && 
                review.recommendations['hosting']?.monthlyCost > 5 ? 'ecs-fargate' : 'ec2';
  
  let database = 'none';
  if (constraints.needsDatabase !== undefined) {
    database = constraints.needsDatabase ? 'postgresql' : 'none';
  } else {
    database = review.recommendations['database']?.recommendation === 'Recommended' ? 'postgresql' : 'none';
  }

  let redis = false;
  if (constraints.needsDatabase !== undefined) {
    redis = constraints.needsDatabase;
  } else {
    redis = review.recommendations['redis']?.recommendation === 'Recommended';
  }

  let pgBouncer = database !== 'none' && review.recommendations['pgbouncer']?.recommendation === 'Recommended';
  let waf = review.recommendations['security']?.recommendation === 'Recommended';
  let sentry = review.recommendations['sentry']?.recommendation === 'Recommended';

  // Apply constraint limits (Crucial Step: Budget Enforcement)
  let currentEstimate = 0;
  const calculateCosts = () => {
    let cost = 0;
    cost += hosting === 'ecs-fargate' ? 15.00 : 3.20;
    cost += database === 'postgresql' ? 15.00 : 0.00;
    cost += redis ? 12.00 : 0.00;
    cost += pgBouncer ? 15.00 : 0.00;
    cost += waf ? 8.00 : 0.00;
    return cost;
  };

  currentEstimate = calculateCosts();

  // If budget constraint is violated, trim optional/scaling resources
  if (currentEstimate > constraints.maxMonthlyBudget) {
    planNotes.push(`Budget limit ($${constraints.maxMonthlyBudget}/mo) is exceeded by baseline cost ($${currentEstimate.toFixed(2)}/mo). Applying optimizations:`);

    if (pgBouncer && calculateCosts() > constraints.maxMonthlyBudget) {
      pgBouncer = false;
      planNotes.push('  - Disabled RDS Connection Proxy (PgBouncer) to conserve RDS connection overhead costs.');
    }
    
    if (redis && calculateCosts() > constraints.maxMonthlyBudget) {
      redis = false;
      planNotes.push('  - Disabled ElastiCache Redis cache instance. Cache operations will fall back to application process memory.');
    }

    if (hosting === 'ecs-fargate' && calculateCosts() > constraints.maxMonthlyBudget) {
      hosting = 'ec2';
      planNotes.push('  - Downgraded compute cluster from ECS Fargate to cheap EC2 Docker instance.');
    }

    if (waf && calculateCosts() > constraints.maxMonthlyBudget) {
      waf = false;
      planNotes.push('  - Disabled edge WAF rules to stay within budget constraints (ALB direct routing will be used).');
    }
  }

  // Force high-throughput / security preferences
  if (constraints.securityLevel === 'waf-shielded' && !waf) {
    waf = true;
    planNotes.push('  - Force-enabled edge WAF rules based on WAF-shielded security request.');
  }

  if (constraints.performanceLevel === 'high-throughput' && database === 'postgresql' && !pgBouncer) {
    pgBouncer = true;
    planNotes.push('  - Force-enabled database connection proxy based on high-throughput performance request.');
  }

  const finalEstimate = calculateCosts();

  return {
    projectName: review.projectName,
    playbookName,
    awsRegion,
    config: {
      hosting: hosting as 'ec2' | 'ecs-fargate',
      database: database as 'postgresql' | 'none',
      redis,
      pgBouncer,
      customDomain: !!customDomainName,
      domainName: customDomainName,
      dnsProvider: 'external',
      waf,
      cloudwatch: true,
      budgetAlerts: true,
      emailAlerts: alertEmail,
      sentry,
      sentryDsn
    },
    monthlyEstimate: finalEstimate,
    planNotes
  };
}
