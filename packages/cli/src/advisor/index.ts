import * as path from 'path';
import * as fs from 'fs';
import { ProjectCharacteristics } from '../inspectors';
import { parseKnowledgeFile, ParsedKnowledge, ConfidenceRule } from './interpreter';

// ─── Existing Types (unchanged) ────────────────────────────────

export interface ComponentRecommendation {
  component: string;
  recommendation: 'Recommended' | 'Not Recommended' | 'Optional';
  confidence: number;
  evidence: string[];
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
  alternatives: {
    option: string;
    reasoning: string;
  }[];
  monthlyCost: number;
}

// ─── New Types: Production Decisions ───────────────────────────

export type DecisionType = 'SAFE' | 'RECOMMENDATION' | 'BLOCKER';

export interface ProductionDecision {
  component: string;
  value: any;
  confidence: number;
  reasoning: string[];
  source: string;
  decisionType: DecisionType;
  monthlyCost: number;
}

// ─── Extended Architecture Review ──────────────────────────────

export interface ArchitectureReview {
  projectName: string;
  frameworkDetected: string;
  recommendations: Record<string, ComponentRecommendation>;
  decisions: ProductionDecision[];
  risks: string[];
  totalMonthlyCost: number;
  deploymentConfidence: number;
}

// ─── Confidence Rule Evaluator ─────────────────────────────────

interface EvaluationContext {
  hasWebsockets: boolean;
  queueLib: boolean;
  redisUrlConfigured: boolean;
  sentryLib: boolean;
  sentryDsnConfigured: boolean;
  hasDatabase: boolean;
  framework: string;
  [key: string]: any;
}

function buildEvaluationContext(chars: ProjectCharacteristics): EvaluationContext {
  return {
    hasWebsockets: chars.hasWebsockets,
    queueLib: chars.queueLib !== null,
    redisUrlConfigured: chars.redisUrlConfigured,
    sentryLib: chars.sentryLib !== null,
    sentryDsnConfigured: chars.sentryDsnConfigured,
    hasDatabase: !!(chars.databaseLib || chars.ormLib || chars.databaseUrlConfigured),
    framework: chars.framework,
  };
}

function evaluateCondition(condition: string, ctx: EvaluationContext): boolean {
  // Handle key=value conditions (e.g. "framework=nextjs")
  if (condition.includes('=')) {
    const [key, value] = condition.split('=');
    return ctx[key.trim()] === value.trim();
  }
  // Handle boolean conditions (e.g. "hasWebsockets")
  return !!ctx[condition];
}

function evaluateRule(rule: ConfidenceRule, ctx: EvaluationContext): boolean {
  const results = rule.conditions.map(c => evaluateCondition(c, ctx));

  let matched: boolean;
  if (rule.operator === 'OR') {
    matched = results.some(r => r);
  } else {
    matched = results.every(r => r);
  }

  // If the rule is negated (NOT prefix), invert the match
  return rule.negated ? !matched : matched;
}

function evaluateKnowledgeRules(
  knowledge: ParsedKnowledge,
  ctx: EvaluationContext
): { result: string; confidence: number } | null {
  for (const rule of knowledge.confidenceRules) {
    if (evaluateRule(rule, ctx)) {
      return { result: rule.result, confidence: rule.confidence };
    }
  }
  return null;
}

// ─── Main Advisor ──────────────────────────────────────────────

export async function runAdvisor(
  characteristics: ProjectCharacteristics,
  knowledgeDir?: string
): Promise<ArchitectureReview> {
  // Resolve knowledge base files location
  const resolvedDir = knowledgeDir || path.join(__dirname, '../knowledge');

  const getKnowledge = (fileName: string): ParsedKnowledge => {
    try {
      return parseKnowledgeFile(path.join(resolvedDir, fileName));
    } catch {
      // Fallback in case of parsing error or missing file during test run
      return {
        name: fileName.replace('.md', ''),
        purpose: 'AWS architecture resource',
        pros: [],
        cons: [],
        complexity: 'Low',
        cost: 0,
        confidenceRules: [],
      };
    }
  };

  const computeRules = getKnowledge('architecture/compute.md');
  const redisRules = getKnowledge('architecture/redis.md');
  const pgbouncerRules = getKnowledge('architecture/pgbouncer.md');
  const securityRules = getKnowledge('architecture/security.md');
  const sentryRules = getKnowledge('architecture/sentry.md');

  const ctx = buildEvaluationContext(characteristics);
  const recs: Record<string, ComponentRecommendation> = {};
  const decisions: ProductionDecision[] = [];
  const risks: string[] = [];

  // ───────────────────────────────────────────────────────────
  // PART 1: Component Recommendations (existing logic, preserved)
  // ───────────────────────────────────────────────────────────

  // 1. Hosting (Compute) Recommendation
  const hasScalingTriggers = characteristics.hasWebsockets || characteristics.queueLib !== null;
  
  let hostingPros = computeRules.pros;
  let hostingCons = computeRules.cons;
  if (computeRules.subTradeoffs) {
    const key = hasScalingTriggers ? 'ecs fargate' : 'ec2';
    if (computeRules.subTradeoffs[key]) {
      hostingPros = computeRules.subTradeoffs[key].pros;
      hostingCons = computeRules.subTradeoffs[key].cons;
    }
  }

  const hostingRec: ComponentRecommendation = {
    component: 'Hosting (Compute)',
    recommendation: 'Recommended',
    confidence: hasScalingTriggers ? 90 : 95,
    evidence: [],
    tradeoffs: { pros: hostingPros, cons: hostingCons },
    alternatives: [],
    monthlyCost: 0,
  };

  if (hasScalingTriggers) {
    hostingRec.monthlyCost = computeRules.cost;
    hostingRec.evidence.push('WebSocket connections or background workers (queues) detected.');
    hostingRec.evidence.push('Scale target requires distributed load balancing.');
    hostingRec.alternatives.push({
      option: 'EC2',
      reasoning: 'Can be used for development/testing, but manual scaling is risky for real-time WebSocket traffic.',
    });
  } else {
    hostingRec.monthlyCost = 3.20;
    hostingRec.evidence.push('Stateless monolithic footprint with low traffic indicators.');
    hostingRec.evidence.push('No distributed background queue runners or WebSocket ports found.');
    hostingRec.alternatives.push({
      option: 'ECS Fargate',
      reasoning: 'Recommended when horizontal scaling and zero-downtime rolling updates become necessary.',
    });
  }
  recs['hosting'] = hostingRec;

  // 2. Database Recommendation
  const dbRec: ComponentRecommendation = {
    component: 'Database',
    recommendation: 'Not Recommended',
    confidence: 95,
    evidence: [],
    tradeoffs: { pros: ['Managed backups', 'Automatic patching'], cons: ['Adds baseline monthly cost'] },
    alternatives: [],
    monthlyCost: 0,
  };

  const hasDb = characteristics.databaseUrlConfigured || characteristics.databaseLib !== null || characteristics.ormLib !== null;
  if (hasDb) {
    dbRec.recommendation = 'Recommended';
    dbRec.monthlyCost = 15.00;
    dbRec.evidence.push(`Database package dependencies detected: ${characteristics.databaseLib || characteristics.ormLib}.`);
    if (characteristics.databaseUrlConfigured) {
      dbRec.evidence.push('Database environment connection variables config parsed in .env.');
    }
    dbRec.alternatives.push({
      option: 'SQLite',
      reasoning: 'Can be used for local testing but suffers from write-lock issues on server clusters.',
    });
  } else {
    dbRec.evidence.push('No database package manifests or environment variables detected.');
    dbRec.alternatives.push({
      option: 'PostgreSQL RDS',
      reasoning: 'Add if transactional user data or persistent schemas are introduced.',
    });
  }
  recs['database'] = dbRec;

  // 3. Redis Recommendation
  const redisRec: ComponentRecommendation = {
    component: 'Redis Cache & Messaging',
    recommendation: 'Not Recommended',
    confidence: 90,
    evidence: [],
    tradeoffs: { pros: redisRules.pros, cons: redisRules.cons },
    alternatives: [],
    monthlyCost: redisRules.cost,
  };

  const needsRedis = characteristics.hasWebsockets || characteristics.queueLib !== null || characteristics.redisUrlConfigured;
  if (needsRedis) {
    redisRec.recommendation = 'Recommended';
    redisRec.confidence = 95;
    if (characteristics.hasWebsockets) redisRec.evidence.push('WebSocket patterns (ws/socket.io) need synchronization across nodes.');
    if (characteristics.queueLib) redisRec.evidence.push(`Background queue package (${characteristics.queueLib}) requires a broker.`);
    if (characteristics.redisUrlConfigured) redisRec.evidence.push('Redis connection configuration variables found in .env.');
    redisRec.alternatives.push({
      option: 'In-Memory Cache (Local)',
      reasoning: 'Saves cost, but locks cache states to a single process. Fails in multi-instance scale.',
    });
  } else {
    redisRec.evidence.push('No caching layers, background queue workers, or WebSocket indicators found.');
    redisRec.alternatives.push({
      option: 'ElastiCache Redis',
      reasoning: 'Add when sub-millisecond query caches, job queues, or session persistence are required.',
    });
  }
  recs['redis'] = redisRec;

  // 4. PgBouncer (RDS Proxy) Recommendation
  const pgbRec: ComponentRecommendation = {
    component: 'PgBouncer Connection Pooling',
    recommendation: 'Not Recommended',
    confidence: 90,
    evidence: [],
    tradeoffs: { pros: pgbouncerRules.pros, cons: pgbouncerRules.cons },
    alternatives: [],
    monthlyCost: pgbouncerRules.cost,
  };

  const isServerlessDbAccess = hasDb && (characteristics.framework === 'nextjs' || characteristics.hasEnvFile);
  if (isServerlessDbAccess) {
    pgbRec.recommendation = 'Recommended';
    pgbRec.confidence = 85;
    pgbRec.evidence.push('Next.js/Serverless route architectures trigger connection pool exhaustion.');
    pgbRec.alternatives.push({
      option: 'Direct RDS Connection Pool',
      reasoning: 'Internal pool config (e.g. Prisma connections limit) works, but risks connection spikes.',
    });
  } else {
    pgbRec.evidence.push('Monolithic long-lived process handles internal connection pools safely.');
    pgbRec.alternatives.push({
      option: 'AWS RDS Proxy',
      reasoning: 'Deploy when scaling beyond 80 parallel client database connections.',
    });
  }
  recs['pgbouncer'] = pgbRec;

  // 5. Security (WAF & CloudFront) Recommendation
  const secRec: ComponentRecommendation = {
    component: 'Edge WAF Security & CDN',
    recommendation: 'Optional',
    confidence: 75,
    evidence: [],
    tradeoffs: { pros: securityRules.pros, cons: securityRules.cons },
    alternatives: [],
    monthlyCost: securityRules.cost,
  };

  if (hasDb) {
    secRec.recommendation = 'Recommended';
    secRec.confidence = 85;
    secRec.evidence.push('Database presence makes public route injections (SQLi/XSS) a security risk.');
    secRec.alternatives.push({
      option: 'Direct ALB Routing (No WAF)',
      reasoning: 'Saves WAF costs (~$8/mo) but exposes application to script bots and bad request payloads.',
    });
  } else {
    secRec.evidence.push('Static-first application does not hold database target routes.');
    secRec.alternatives.push({
      option: 'AWS WAF',
      reasoning: 'Enable if user auth database connections or compliance rules are introduced.',
    });
  }
  recs['security'] = secRec;

  // 6. Sentry Recommendation
  const sentryRec: ComponentRecommendation = {
    component: 'Error & Performance Tracking',
    recommendation: 'Optional',
    confidence: 70,
    evidence: [],
    tradeoffs: { pros: sentryRules.pros, cons: sentryRules.cons },
    alternatives: [],
    monthlyCost: 0,
  };

  const hasSentry = characteristics.sentryLib !== null || characteristics.sentryDsnConfigured;
  if (hasSentry) {
    sentryRec.recommendation = 'Recommended';
    sentryRec.confidence = 95;
    sentryRec.evidence.push(`Sentry package imports detected: ${characteristics.sentryLib}.`);
    sentryRec.alternatives.push({
      option: 'Standard CloudWatch Logs',
      reasoning: 'Zero-cost, but lacks real-time crash trace notifications and release tags tracking.',
    });
  } else {
    sentryRec.evidence.push('No error tracking libraries detected in package configurations.');
    sentryRec.alternatives.push({
      option: 'Sentry SDK Integration',
      reasoning: 'Highly recommended for real-time monitoring of client/server runtime exceptions.',
    });
  }
  recs['sentry'] = sentryRec;

  // Risk Audit Checks
  if (hasDb && !secRec.recommendation.includes('Recommended')) {
    risks.push('Active database connected without Web Application Firewall (WAF) edge protection.');
  }
  if (characteristics.hasWebsockets && !hasScalingTriggers) {
    risks.push('WebSockets are utilized, but compute hosting is not configured for horizontal scale.');
  }

  // ───────────────────────────────────────────────────────────
  // PART 2: Production Decisions (NEW — knowledge-driven)
  // ───────────────────────────────────────────────────────────

  // Hosting Decision (from knowledge rules)
  const hostingEval = evaluateKnowledgeRules(computeRules, ctx);
  const hostingValue = hostingEval?.result || (hasScalingTriggers ? 'ecs-fargate' : 'ec2');
  const hostingConf = hostingEval?.confidence || 95;
  const hostingCost = hostingValue === 'ecs-fargate' ? computeRules.cost || 15.00 : 3.20;

  decisions.push({
    component: 'hosting',
    value: hostingValue,
    confidence: hostingConf,
    reasoning: hostingValue === 'ecs-fargate'
      ? ['WebSocket or background queue patterns detected.', 'Distributed load balancing required.']
      : ['Single-service architecture.', 'No background workers or WebSocket connections detected.'],
    source: 'knowledge/architecture/compute.md',
    decisionType: 'RECOMMENDATION',
    monthlyCost: hostingCost,
  });

  // Database Decision
  decisions.push({
    component: 'database',
    value: hasDb ? 'postgresql' : 'none',
    confidence: 95,
    reasoning: hasDb
      ? [`Detected via ${characteristics.ormLib || characteristics.databaseLib || 'environment configuration'}.`]
      : ['No database dependencies or configuration detected.'],
    source: 'code-inspection',
    decisionType: 'RECOMMENDATION',
    monthlyCost: hasDb ? 15.00 : 0,
  });

  // Redis Decision (from knowledge rules)
  const redisEval = evaluateKnowledgeRules(redisRules, ctx);
  const redisValue = redisEval?.result === 'true';
  const redisConf = redisEval?.confidence || 95;

  decisions.push({
    component: 'redis',
    value: redisValue,
    confidence: redisConf,
    reasoning: redisValue
      ? ['Background queue or WebSocket patterns require a distributed broker.']
      : ['No caching, queue, or real-time sync requirements detected.'],
    source: 'knowledge/architecture/redis.md',
    decisionType: 'RECOMMENDATION',
    monthlyCost: redisValue ? redisRules.cost || 12.00 : 0,
  });

  // PgBouncer Decision (from knowledge rules)
  const pgbEval = evaluateKnowledgeRules(pgbouncerRules, ctx);
  const pgbValue = pgbEval?.result === 'true';
  const pgbConf = pgbEval?.confidence || 90;

  decisions.push({
    component: 'pgBouncer',
    value: pgbValue,
    confidence: pgbConf,
    reasoning: pgbValue
      ? ['Next.js serverless routes create ephemeral database connections that exhaust connection pools.']
      : ['Long-lived monolithic process manages internal connection pools safely.'],
    source: 'knowledge/architecture/pgbouncer.md',
    decisionType: 'RECOMMENDATION',
    monthlyCost: pgbValue ? pgbouncerRules.cost || 15.00 : 0,
  });

  // WAF Decision (from knowledge rules)
  const wafEval = evaluateKnowledgeRules(securityRules, ctx);
  const wafValue = wafEval?.result === 'true';
  const wafConf = wafEval?.confidence || 75;

  decisions.push({
    component: 'waf',
    value: wafValue,
    confidence: wafConf,
    reasoning: wafValue
      ? ['Database-backed application requires protection against SQL injection and XSS bots.']
      : ['Static-first application with no database target routes.'],
    source: 'knowledge/architecture/security.md',
    decisionType: 'RECOMMENDATION',
    monthlyCost: wafValue ? securityRules.cost || 8.00 : 0,
  });

  // Sentry Decision (from knowledge rules)
  const sentryEval = evaluateKnowledgeRules(sentryRules, ctx);
  const sentryValue = sentryEval?.result === 'true';
  const sentryConf = sentryEval?.confidence || 70;

  decisions.push({
    component: 'sentry',
    value: sentryValue,
    confidence: sentryConf,
    reasoning: sentryValue
      ? [`Sentry SDK detected: ${characteristics.sentryLib}.`]
      : ['No error tracking libraries found. CloudWatch will handle baseline logging.'],
    source: 'knowledge/architecture/sentry.md',
    decisionType: 'RECOMMENDATION',
    monthlyCost: 0,
  });

  // SAFE decisions — always applied, no discussion needed
  const envRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  decisions.push({
    component: 'region',
    value: envRegion,
    confidence: 95,
    reasoning: process.env.AWS_REGION
      ? ['Read from AWS_REGION environment variable.']
      : ['Defaulting to us-east-1 (lowest latency for most users).'],
    source: 'env-config',
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  decisions.push({
    component: 'cloudwatch',
    value: true,
    confidence: 100,
    reasoning: ['Production best practice. Always enabled.'],
    source: 'best-practice',
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  decisions.push({
    component: 'budgetAlerts',
    value: true,
    confidence: 100,
    reasoning: ['Cost protection. Always enabled.'],
    source: 'best-practice',
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  const domainName = process.env.MYSYSTEM_DOMAIN || '';
  decisions.push({
    component: 'domain',
    value: domainName || 'none',
    confidence: 95,
    reasoning: domainName
      ? [`Custom domain detected: ${domainName}.`]
      : ['No custom domain configured. AWS default endpoint will be used.'],
    source: 'env-config',
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  // ───────────────────────────────────────────────────────────
  // PART 3: Optimization Pass
  // ───────────────────────────────────────────────────────────

  const getDecision = (key: string) => decisions.find(d => d.component === key);

  // Optimization 1: Disable Redis if not truly needed
  const redisDec = getDecision('redis');
  if (redisDec && redisDec.value === true && !characteristics.hasWebsockets && !characteristics.queueLib && !characteristics.redisUrlConfigured) {
    redisDec.value = false;
    redisDec.monthlyCost = 0;
    redisDec.reasoning.push('Optimization: Redis removed — no queue, WebSocket, or session indicators detected.');
  }

  // Optimization 2: Disable PgBouncer if hosting is EC2 (single instance)
  const pgbDec = getDecision('pgBouncer');
  const hostDec = getDecision('hosting');
  if (pgbDec && pgbDec.value === true && hostDec && hostDec.value === 'ec2') {
    pgbDec.value = false;
    pgbDec.monthlyCost = 0;
    pgbDec.reasoning.push('Optimization: PgBouncer removed — single EC2 instance manages connections internally.');
  }

  // Optimization 3: Disable WAF if no database
  const wafDec = getDecision('waf');
  if (wafDec && wafDec.value === true && !hasDb) {
    wafDec.value = false;
    wafDec.monthlyCost = 0;
    wafDec.reasoning.push('Optimization: WAF removed — no database routes to protect.');
  }

  // ───────────────────────────────────────────────────────────
  // PART 4: Compute totals
  // ───────────────────────────────────────────────────────────

  const totalMonthlyCost = decisions.reduce((sum, d) => sum + d.monthlyCost, 0);
  const confidenceValues = decisions.filter(d => d.decisionType !== 'SAFE').map(d => d.confidence);
  const deploymentConfidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
    : 100;

  return {
    projectName: characteristics.name,
    frameworkDetected: characteristics.framework,
    recommendations: recs,
    decisions,
    risks,
    totalMonthlyCost,
    deploymentConfidence,
  };
}
