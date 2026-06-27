import * as path from 'path';
import * as fs from 'fs';
import { ProjectCharacteristics } from '../inspectors';
import { parseKnowledgeFile, ParsedKnowledge, ConfidenceRule } from './interpreter';

// ─── Existing Types ──────────────────────────────────────────────

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

export interface ServiceJustification {
  service: string;
  decision: 'Included' | 'Not Included';
  evidence: string[];
  benefits: string[];
  operationalComplexity: string;
  monthlyCost: number;
  reasonRejectedOrSelected: string;
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
  archetype?: string;
  simplicityScore?: number;
  complexityScore?: number;
  justifications?: Record<string, ServiceJustification>;
  upgradePath?: string[];
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
  if (condition.includes('=')) {
    const [key, value] = condition.split('=');
    return ctx[key.trim()] === value.trim();
  }
  return !!ctx[condition];
}

function evaluateRule(rule: ConfidenceRule, ctx: EvaluationContext): boolean {
  const results = rule.conditions.map(c => evaluateCondition(c, ctx));
  let matched: boolean = rule.operator === 'OR' ? results.some(r => r) : results.every(r => r);
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

// ─── Archetype Inference ───────────────────────────────────────

function inferArchetype(
  chars: ProjectCharacteristics,
  allDeps: Record<string, string>,
  reqsText: string
): string {
  const hasAuth = !!(
    allDeps['next-auth'] ||
    allDeps['@auth/core'] ||
    allDeps['passport'] ||
    allDeps['firebase-admin'] ||
    allDeps['clerk'] ||
    allDeps['@clerk/nextjs'] ||
    chars.variables.some(v => v.includes('AUTH') || v.includes('JWT') || v.includes('SECRET')) ||
    reqsText.includes('passport') ||
    reqsText.includes('auth') ||
    reqsText.includes('jwt')
  );

  const hasPayment = !!(
    allDeps['stripe'] ||
    allDeps['braintree'] ||
    allDeps['paypal-rest-sdk'] ||
    reqsText.includes('stripe') ||
    reqsText.includes('paypal')
  );

  const hasDb = !!(chars.databaseLib || chars.ormLib || chars.databaseUrlConfigured);

  // 1. Realtime SaaS
  if (chars.hasWebsockets) {
    return 'Realtime SaaS';
  }

  // 2. Creator Platform / Marketplace
  if (hasPayment && hasDb && hasAuth) {
    if (allDeps['shopify'] || reqsText.includes('commerce') || chars.name.includes('shop') || chars.name.includes('market')) {
      return 'Marketplace';
    }
    return 'Creator Platform';
  }

  // 3. Learning Platform
  if (chars.name.includes('learn') || chars.name.includes('course') || allDeps['moodle'] || reqsText.includes('moodle')) {
    return 'Learning Platform';
  }

  // 4. Community Platform
  if (chars.name.includes('forum') || chars.name.includes('community') || allDeps['discourse']) {
    return 'Community Platform';
  }

  // 5. Streaming Platform
  if (chars.hasFileUploads && (allDeps['fluent-ffmpeg'] || allDeps['multer'] || reqsText.includes('ffmpeg') || reqsText.includes('streaming'))) {
    return 'Streaming Platform';
  }

  // 6. Worker Service
  if (chars.queueLib && !chars.port) {
    return 'Worker Service';
  }

  // 7. CRUD SaaS
  if (hasDb && hasAuth) {
    return 'CRUD SaaS';
  }

  // 8. Admin Dashboard
  if (chars.name.includes('admin') || chars.name.includes('dashboard')) {
    return 'Admin Dashboard';
  }

  // 9. API Service
  if (chars.framework === 'fastapi' || (chars.framework === 'node' && chars.name.includes('api'))) {
    return 'API Service';
  }

  // 10. Documentation Site
  if (allDeps['docusaurus'] || allDeps['nextra'] || chars.name.includes('docs') || chars.name.includes('documentation')) {
    return 'Documentation Site';
  }

  // 11. Portfolio / Marketing Website / Company Website
  if (!hasDb && !chars.hasWebsockets) {
    if (chars.name.includes('portfolio') || chars.name.includes('cv') || chars.name.includes('resume')) {
      return 'Portfolio';
    }
    if (chars.name.includes('company') || chars.name.includes('agency') || chars.name.includes('business')) {
      return 'Company Website';
    }
    return 'Marketing Website';
  }

  return 'Marketing Website';
}

// ─── Main Advisor ──────────────────────────────────────────────

export async function runAdvisor(
  characteristics: ProjectCharacteristics,
  projectRoot?: string,
  knowledgeDir?: string
): Promise<ArchitectureReview> {
  const resolvedDir = knowledgeDir || path.join(__dirname, '../knowledge');

  const getKnowledge = (fileName: string): ParsedKnowledge => {
    try {
      return parseKnowledgeFile(path.join(resolvedDir, fileName));
    } catch {
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

  // 1. Resolve package lists & raw requirements
  let allDeps: Record<string, string> = {};
  let reqsText = '';
  if (projectRoot) {
    try {
      const pJsonPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pJsonPath)) {
        const pJson = JSON.parse(fs.readFileSync(pJsonPath, 'utf8'));
        allDeps = { ...pJson.dependencies, ...pJson.devDependencies };
      }
    } catch {}

    try {
      const reqTxtPath = path.join(projectRoot, 'requirements.txt');
      if (fs.existsSync(reqTxtPath)) {
        reqsText = fs.readFileSync(reqTxtPath, 'utf8').toLowerCase();
      }
    } catch {}
  }

  // Infer Archetype
  const archetype = inferArchetype(characteristics, allDeps, reqsText);

  const hasAuth = !!(
    allDeps['next-auth'] ||
    allDeps['@auth/core'] ||
    allDeps['passport'] ||
    allDeps['firebase-admin'] ||
    allDeps['clerk'] ||
    allDeps['@clerk/nextjs'] ||
    characteristics.variables.some(v => v.includes('AUTH') || v.includes('JWT') || v.includes('SECRET')) ||
    reqsText.includes('passport') ||
    reqsText.includes('auth') ||
    reqsText.includes('jwt')
  );

  // Load existing configuration overrides (AI Freedom)
  let existingConfig: any = {};
  if (projectRoot) {
    try {
      const mysystemJsonPath = path.join(projectRoot, 'mysystem.json');
      if (fs.existsSync(mysystemJsonPath)) {
        existingConfig = JSON.parse(fs.readFileSync(mysystemJsonPath, 'utf8'));
      }
    } catch {}

    try {
      const manifestPath = path.join(projectRoot, '.mysystem', 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        existingConfig = {
          ...existingConfig,
          ...(manifestData.currentInfrastructure || {}),
          hosting: manifestData.deployment || manifestData.currentInfrastructure?.hosting || existingConfig.hosting,
          region: manifestData.awsRegion || existingConfig.region
        };
      }
    } catch {}
  }

  const aiHosting = existingConfig.hosting || (existingConfig.tier === 'production' ? 'ecs-fargate' : existingConfig.tier === 'hobbyist' ? 'ec2' : undefined);
  const aiDb = existingConfig.database;
  const aiRedis = existingConfig.redis;
  const aiPgb = existingConfig.pgBouncer !== undefined ? existingConfig.pgBouncer : existingConfig.rdsProxy;
  const aiWaf = existingConfig.waf;
  const aiSentry = existingConfig.sentry !== undefined ? existingConfig.sentry : existingConfig.sentryDsn;

  // ───────────────────────────────────────────────────────────
  // PART 1: Evidence-Driven Architecture & Decision Audit
  // ───────────────────────────────────────────────────────────

  // 1. Hosting (Compute - EC2 vs ECS Fargate)
  const hasMultipleServices = !!(
    (characteristics.queueLib && characteristics.framework !== 'unknown') ||
    (allDeps['bullmq'] || allDeps['bull'] || reqsText.includes('celery'))
  );
  const hasHighAvailabilityReq = !!(
    existingConfig.tier === 'production' ||
    existingConfig.availabilityTarget === 'multi-zone'
  );
  const hasWebsockets = characteristics.hasWebsockets;

  const hostingEvidence: string[] = [];
  if (hasMultipleServices) hostingEvidence.push('Multiple microservices (API + worker queue) detected.');
  if (hasHighAvailabilityReq) hostingEvidence.push('High availability / multi-zone target requested.');
  if (hasWebsockets && hasHighAvailabilityReq) hostingEvidence.push('Horizontal WebSocket scaling requested.');

  let hostingValue: 'ec2' | 'ecs-fargate' = 'ec2';
  if (hostingEvidence.length > 0) {
    hostingValue = 'ecs-fargate';
  }

  let hostingSource = 'evidence-engine';
  let hostingReasoning = hostingValue === 'ecs-fargate'
    ? [...hostingEvidence, '[Golden Rule: Preserve the application\'s architecture]']
    : ['Smallest production-ready compute layer: Single virtual machine running Docker Compose.', '[Golden Rule: Minimize AWS monthly cost]'];

  if (aiHosting && (aiHosting === 'ec2' || aiHosting === 'ecs-fargate')) {
    hostingValue = aiHosting;
    hostingSource = 'ai-config';
    hostingReasoning = [`Preserved AI decision to use ${hostingValue === 'ecs-fargate' ? 'ECS Fargate' : 'EC2'}.`, '[Golden Rule: Preserve the application\'s architecture]'];

    if (hostingValue === 'ec2' && characteristics.hasWebsockets) {
      risks.push('AI configured EC2 hosting but the app uses WebSockets. EC2 single-instance lacks container-native load balancing and scaling.');
    }
  }

  // Rec metadata
  const hostingRec: ComponentRecommendation = {
    component: 'Hosting (Compute)',
    recommendation: 'Recommended',
    confidence: hostingValue === 'ecs-fargate' ? 90 : 95,
    evidence: hostingValue === 'ecs-fargate' ? hostingEvidence : ['Stateless monolithic footprint with low traffic indicators.'],
    tradeoffs: { pros: computeRules.pros, cons: computeRules.cons },
    alternatives: hostingValue === 'ecs-fargate'
      ? [{ option: 'EC2', reasoning: 'Cheaper and simpler for single-instance, but lacks automatic load-balanced rolling deployments.' }]
      : [{ option: 'ECS Fargate', reasoning: 'More scalable, but introduces ALB and container cluster overhead costs.' }],
    monthlyCost: hostingValue === 'ecs-fargate' ? 15.00 : 3.20,
  };
  recs['hosting'] = hostingRec;

  // 2. Database (RDS vs SQLite/None)
  const hasSqlLib = !!(
    allDeps['pg'] ||
    allDeps['postgres'] ||
    allDeps['mysql2'] ||
    allDeps['mongodb'] ||
    allDeps['prisma'] ||
    allDeps['typeorm'] ||
    allDeps['sequelize'] ||
    allDeps['drizzle-orm'] ||
    reqsText.includes('psycopg2') ||
    reqsText.includes('asyncpg') ||
    reqsText.includes('mysqlclient') ||
    reqsText.includes('sqlalchemy') ||
    reqsText.includes('tortoise-orm')
  );
  const isSQLite = !!(allDeps['better-sqlite3'] || allDeps['sqlite3'] || reqsText.includes('sqlite'));

  const rdsEvidence: string[] = [];
  if (hasSqlLib && !isSQLite) rdsEvidence.push(`SQL Database library detected: ${characteristics.databaseLib || characteristics.ormLib || 'driver'}.`);
  if (characteristics.databaseUrlConfigured) rdsEvidence.push('Database connection string found in environment.');

  let dbValue = rdsEvidence.length > 0 ? 'postgresql' : 'none';
  let dbSource = 'evidence-engine';
  let dbReasoning = dbValue === 'postgresql'
    ? [...rdsEvidence, '[Golden Rule: Never ask a question that can be answered through inspection]']
    : ['No external SQL database or environment configuration detected.', '[Golden Rule: Avoid unnecessary infrastructure]'];

  if (aiDb !== undefined) {
    const isDbNeeded = typeof aiDb === 'string' ? aiDb !== 'none' : !!aiDb;
    dbValue = isDbNeeded ? 'postgresql' : 'none';
    dbSource = 'ai-config';
    dbReasoning = [`Preserved AI decision to use database: ${dbValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const dbRec: ComponentRecommendation = {
    component: 'Database',
    recommendation: dbValue !== 'none' ? 'Recommended' : 'Not Recommended',
    confidence: 95,
    evidence: dbValue !== 'none' ? rdsEvidence : ['No database package manifests or environment variables detected.'],
    tradeoffs: { pros: ['Managed backups', 'Automatic patching'], cons: ['Adds baseline monthly cost'] },
    alternatives: dbValue !== 'none'
      ? [{ option: 'SQLite', reasoning: 'Can be used for local testing but suffers from write-lock issues on server clusters.' }]
      : [{ option: 'PostgreSQL RDS', reasoning: 'Add if transactional user data or persistent schemas are introduced.' }],
    monthlyCost: dbValue !== 'none' ? 15.00 : 0.00,
  };
  recs['database'] = dbRec;

  // 3. Redis (Cache & Broker)
  const redisEvidence: string[] = [];
  if (allDeps['bullmq'] || allDeps['bull'] || reqsText.includes('celery')) {
    redisEvidence.push(`Queue library detected: ${characteristics.queueLib || 'Celery'}.`);
  }
  if (allDeps['redis'] || allDeps['ioredis'] || reqsText.includes('redis')) {
    redisEvidence.push(`Redis client library detected: ${characteristics.redisLib || 'redis'}.`);
  }
  if (hasWebsockets && hostingValue === 'ecs-fargate') {
    redisEvidence.push('Multi-instance WebSocket deployment requires a Redis pub/sub adapter.');
  }
  if (characteristics.redisUrlConfigured) {
    redisEvidence.push('Redis connection URL detected in environment.');
  }

  let redisValue = redisEvidence.length > 0;
  let redisSource = 'evidence-engine';
  let redisReasoning = redisValue
    ? [...redisEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['No caching, queue, or multi-node WebSocket sync requirements detected.', '[Golden Rule: Avoid unnecessary infrastructure]'];

  if (aiRedis !== undefined) {
    redisValue = !!aiRedis;
    redisSource = 'ai-config';
    redisReasoning = [`Preserved AI decision to use Redis: ${redisValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const redisRec: ComponentRecommendation = {
    component: 'Redis Cache & Messaging',
    recommendation: redisValue ? 'Recommended' : 'Not Recommended',
    confidence: 95,
    evidence: redisValue ? redisEvidence : ['No caching layers, background queue workers, or WebSocket indicators found.'],
    tradeoffs: { pros: redisRules.pros, cons: redisRules.cons },
    alternatives: redisValue
      ? [{ option: 'In-Memory Cache (Local)', reasoning: 'Saves cost, but locks cache states to a single process. Fails in multi-instance scale.' }]
      : [{ option: 'ElastiCache Redis', reasoning: 'Add when sub-millisecond query caches, job queues, or session persistence are required.' }],
    monthlyCost: redisValue ? 12.00 : 0.00,
  };
  recs['redis'] = redisRec;

  // 4. PgBouncer (RDS Connection Proxy)
  const pgbEvidence: string[] = [];
  if (dbValue === 'postgresql') {
    if (characteristics.framework === 'nextjs') {
      pgbEvidence.push('Next.js/Serverless routes trigger connection pool spikes.');
    }
    if (allDeps['prisma'] || reqsText.includes('prisma')) {
      pgbEvidence.push('Prisma client connection pooling requires RDS proxying under high concurrency.');
    }
    if (hostingValue === 'ecs-fargate' && hasHighAvailabilityReq) {
      pgbEvidence.push('Multiple concurrent container instances require a centralized connection proxy.');
    }
  }

  let pgbValue = pgbEvidence.length > 0;
  let pgbSource = 'evidence-engine';
  let pgbReasoning = pgbValue
    ? [...pgbEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['Direct client-side connection pooling is sufficient for single server.', '[Golden Rule: Avoid unnecessary complexity]'];

  if (aiPgb !== undefined) {
    pgbValue = !!aiPgb;
    pgbSource = 'ai-config';
    pgbReasoning = [`Preserved AI decision to use PgBouncer: ${pgbValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const pgbRec: ComponentRecommendation = {
    component: 'PgBouncer Connection Pooling',
    recommendation: pgbValue ? 'Recommended' : 'Not Recommended',
    confidence: 90,
    evidence: pgbValue ? pgbEvidence : ['Direct client-side connection pooling is sufficient for single server.'],
    tradeoffs: { pros: pgbouncerRules.pros, cons: pgbouncerRules.cons },
    alternatives: pgbValue
      ? [{ option: 'Direct RDS Connection Pool', reasoning: 'Internal pool config works, but risks connection spikes.' }]
      : [{ option: 'AWS RDS Proxy', reasoning: 'Deploy when scaling beyond 80 parallel client database connections.' }],
    monthlyCost: pgbValue ? 15.00 : 0.00,
  };
  recs['pgbouncer'] = pgbRec;

  // 5. AWS WAF (Web Application Firewall)
  const wafEvidence: string[] = [];
  if (dbValue === 'postgresql' && hasAuth) {
    wafEvidence.push('Application has a database and user auth system exposed to public routes.');
  }

  let wafValue = wafEvidence.length > 0;
  let wafSource = 'evidence-engine';
  let wafReasoning = wafValue
    ? [...wafEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['Static-first application or no sensitive auth database inputs detected.', '[Golden Rule: Avoid unnecessary infrastructure]'];

  if (aiWaf !== undefined) {
    wafValue = !!aiWaf;
    wafSource = 'ai-config';
    wafReasoning = [`Preserved AI decision to use WAF: ${wafValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const secRec: ComponentRecommendation = {
    component: 'Edge WAF Security & CDN',
    recommendation: wafValue ? 'Recommended' : 'Not Recommended',
    confidence: 85,
    evidence: wafValue ? wafEvidence : ['No sensitive auth database inputs or public API routes.'],
    tradeoffs: { pros: securityRules.pros, cons: securityRules.cons },
    alternatives: wafValue
      ? [{ option: 'Direct ALB Routing (No WAF)', reasoning: 'Saves WAF costs but exposes application to script bots.' }]
      : [{ option: 'AWS WAF', reasoning: 'Enable if user auth database connections or compliance rules are introduced.' }],
    monthlyCost: wafValue ? securityRules.cost || 8.00 : 0.00,
  };
  recs['security'] = secRec;

  // 6. Sentry
  const sentryEvidence: string[] = [];
  if (characteristics.sentryLib || characteristics.sentryDsnConfigured) {
    sentryEvidence.push(`Sentry SDK detected: ${characteristics.sentryLib}.`);
  }

  let sentryValue = sentryEvidence.length > 0;
  let sentrySource = 'evidence-engine';
  let sentryReasoning = sentryValue
    ? [...sentryEvidence, '[Golden Rule: Never ask a question that can be answered through inspection]']
    : ['No error tracking libraries found. CloudWatch will handle baseline logging.', '[Golden Rule: Avoid unnecessary infrastructure]'];

  if (aiSentry !== undefined) {
    sentryValue = typeof aiSentry === 'string' ? aiSentry !== 'none' : !!aiSentry;
    sentrySource = 'ai-config';
    sentryReasoning = [`Preserved AI decision to use Sentry: ${sentryValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const sentryRec: ComponentRecommendation = {
    component: 'Error & Performance Tracking',
    recommendation: sentryValue ? 'Recommended' : 'Optional',
    confidence: 90,
    evidence: sentryValue ? sentryEvidence : ['No error tracking libraries detected in package configurations.'],
    tradeoffs: { pros: sentryRules.pros, cons: sentryRules.cons },
    alternatives: sentryValue
      ? [{ option: 'Standard CloudWatch Logs', reasoning: 'Zero-cost, but lacks real-time crash trace notifications.' }]
      : [{ option: 'Sentry SDK Integration', reasoning: 'Highly recommended for real-time monitoring of runtime exceptions.' }],
    monthlyCost: 0.00,
  };
  recs['sentry'] = sentryRec;

  // Risks
  if (dbValue === 'postgresql' && !wafValue) {
    risks.push('Active database connected without Web Application Firewall (WAF) edge protection.');
  }
  if (characteristics.hasWebsockets && hostingValue === 'ec2') {
    risks.push('WebSockets are utilized, but compute hosting is not configured for horizontal scale.');
  }

  // Populating Decisions Array
  decisions.push({
    component: 'hosting',
    value: hostingValue,
    confidence: hostingValue === 'ecs-fargate' ? 90 : 95,
    reasoning: hostingReasoning,
    source: hostingSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: hostingValue === 'ecs-fargate' ? 15.00 : 3.20,
  });

  decisions.push({
    component: 'database',
    value: dbValue,
    confidence: 95,
    reasoning: dbReasoning,
    source: dbSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: dbValue !== 'none' ? 15.00 : 0.00,
  });

  decisions.push({
    component: 'redis',
    value: redisValue,
    confidence: 95,
    reasoning: redisReasoning,
    source: redisSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: redisValue ? 12.00 : 0.00,
  });

  decisions.push({
    component: 'pgBouncer',
    value: pgbValue,
    confidence: 90,
    reasoning: pgbReasoning,
    source: pgbSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: pgbValue ? 15.00 : 0.00,
  });

  decisions.push({
    component: 'waf',
    value: wafValue,
    confidence: 85,
    reasoning: wafReasoning,
    source: wafSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: wafValue ? 8.00 : 0.00,
  });

  decisions.push({
    component: 'sentry',
    value: sentryValue,
    confidence: 90,
    reasoning: sentryReasoning,
    source: sentrySource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: 0.00,
  });

  // 7. Region
  let detectedRegion = existingConfig.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '';
  let regionSource = existingConfig.region ? 'ai-config' : 'env-config';
  let regionReasoning = existingConfig.region
    ? [`Preserved AI decision to use region '${detectedRegion}'.`, '[Golden Rule: Preserve the application\'s architecture]']
    : ['Read from AWS_REGION/AWS_DEFAULT_REGION environment variable.', '[Golden Rule: Never ask a question that can be answered through inspection]'];

  if (!detectedRegion) {
    try {
      const { execSync } = require('child_process');
      const awsRegion = execSync('aws configure get region', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (awsRegion) {
        detectedRegion = awsRegion;
        regionSource = 'aws-cli-config';
        regionReasoning = [`Auto-detected default region '${detectedRegion}' from configured AWS CLI profile.`, '[Golden Rule: Never ask a question that can be answered through inspection]'];
      }
    } catch {}
  }

  if (!detectedRegion) {
    detectedRegion = 'us-east-1';
    regionSource = 'default-fallback';
    regionReasoning = ["Defaulting to 'us-east-1' (no active profile or environment region override detected).", '[Golden Rule: Minimize AWS monthly cost]'];
  }

  decisions.push({
    component: 'region',
    value: detectedRegion,
    confidence: 95,
    reasoning: regionReasoning,
    source: regionSource,
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  // 8. CloudWatch & Budget
  decisions.push({
    component: 'cloudwatch',
    value: true,
    confidence: 100,
    reasoning: ['Production best practice. Always enabled.', '[Golden Rule: Prefer AWS native services]'],
    source: 'best-practice',
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  decisions.push({
    component: 'budgetAlerts',
    value: true,
    confidence: 100,
    reasoning: ['Cost protection. Always enabled.', '[Golden Rule: Minimize AWS monthly cost]'],
    source: 'best-practice',
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  // 9. Domain
  let domainName = existingConfig.domainName || existingConfig.domain || process.env.MYSYSTEM_DOMAIN || '';
  let domainSource = (existingConfig.domainName || existingConfig.domain) ? 'ai-config' : 'env-config';
  let domainReasoning = domainName
    ? [`Custom domain configured: ${domainName}.`, '[Golden Rule: Never ask a question that can be answered through inspection]']
    : ['No custom domain configured. AWS default endpoint will be used.', '[Golden Rule: Minimize AWS monthly cost]'];

  decisions.push({
    component: 'domain',
    value: domainName || 'none',
    confidence: 95,
    reasoning: domainReasoning,
    source: domainSource,
    decisionType: 'SAFE',
    monthlyCost: 0,
  });

  // ───────────────────────────────────────────────────────────
  // PART 2: Service Justification & Simplicity calculation
  // ───────────────────────────────────────────────────────────

  const justifications: Record<string, ServiceJustification> = {};

  const addJustification = (service: string, key: string, evidence: string[], benefits: string[], complexity: string, cost: number, rejectedReason: string) => {
    const decVal = decisions.find(d => d.component === key);
    let isIncluded = false;
    if (decVal) {
      if (key === 'hosting') {
        isIncluded = decVal.value === 'ecs-fargate';
      } else if (key === 'database') {
        isIncluded = decVal.value !== 'none';
      } else {
        isIncluded = !!decVal.value;
      }
    }
    justifications[key] = {
      service,
      decision: isIncluded ? 'Included' : 'Not Included',
      evidence: evidence.length > 0 ? evidence : ['No evidence supporting this service detected.'],
      benefits: isIncluded ? benefits : ['Saves monthly cloud expenditure and simplifies network stack.'],
      operationalComplexity: complexity,
      monthlyCost: isIncluded ? cost : 0,
      reasonRejectedOrSelected: isIncluded ? 'Required to satisfy current workload requirements.' : rejectedReason
    };
  };

  addJustification(
    'ECS (Managed Containers)',
    'hosting',
    hostingEvidence,
    ['Provides horizontal scaling', 'Enables zero-downtime rolling updates', 'Isolates containers in private subnets'],
    hostingValue === 'ecs-fargate' ? 'High (Score: 7)' : 'Low (Score: 2)',
    15.00,
    'Single EC2 instance running Docker Compose is the simplest and cheapest starting tier for the monolithic workload.'
  );

  addJustification(
    'RDS (Managed PostgreSQL)',
    'database',
    dbValue !== 'none' ? rdsEvidence : [],
    ['Automated daily snapshots and backups', 'Managed minor version upgrades', 'High availability deployment options'],
    'Medium (Score: 4)',
    15.00,
    'No database is required or local SQLite is sufficient.'
  );

  addJustification(
    'Redis (Cache & Messaging Broker)',
    'redis',
    redisEvidence,
    ['High-throughput pub/sub for WebSockets', 'Broker backing background worker queues', 'Sub-millisecond query caching'],
    'Medium (Score: 5)',
    12.00,
    'Additional operational complexity without measurable benefit.'
  );

  addJustification(
    'PgBouncer (Database Proxy)',
    'pgBouncer',
    pgbEvidence,
    ['Protects RDS connection pool limits', 'Supports serverless connection spikes safely'],
    'Medium (Score: 4)',
    15.00,
    'Direct client connection pools are sufficient; no serverless spikes detected.'
  );

  addJustification(
    'AWS WAF (Web Application Firewall)',
    'waf',
    wafEvidence,
    ['Shields public auth endpoints', 'Blocks SQL Injection and XSS bot attacks'],
    'Medium (Score: 3)',
    8.00,
    'Application does not expose critical user auth databases or sensitive endpoints to public bots.'
  );

  const isAlbIncluded = hostingValue === 'ecs-fargate';
  justifications['alb'] = {
    service: 'Application Load Balancer (ALB)',
    decision: isAlbIncluded ? 'Included' : 'Not Included',
    evidence: isAlbIncluded ? ['ECS Fargate requires a load balancer for traffic routing to dynamic tasks.'] : ['EC2 hosting maps direct domains to the instance IP.'],
    benefits: isAlbIncluded ? ['SSL termination and multi-task routing'] : ['Saves monthly ALB fees and simplifies routing.'],
    operationalComplexity: 'Medium (Score: 5)',
    monthlyCost: isAlbIncluded ? 15.00 : 0.00,
    reasonRejectedOrSelected: isAlbIncluded ? 'Required by ECS Fargate.' : 'Direct DNS Elastic IP mapping is simpler.'
  };

  // Complexity Calculation
  let complexityScore = 0;
  if (hostingValue === 'ec2') {
    complexityScore += 2; // EC2
    complexityScore += 1; // Docker Compose
  } else {
    complexityScore += 7; // ECS
    complexityScore += 5; // ALB
  }
  if (dbValue === 'postgresql') complexityScore += 4;
  if (redisValue) complexityScore += 5;
  if (pgbValue) complexityScore += 4;
  if (wafValue) complexityScore += 3;

  const simplicityScore = Math.max(10, 100 - complexityScore * 3);

  // Upgrade Path Recommendations
  const upgradePath: string[] = [];
  if (hostingValue === 'ec2') {
    upgradePath.push('When average CPU exceeds 70% for sustained periods or multiple services are introduced, migrate to ECS.');
  }
  if (dbValue === 'none') {
    upgradePath.push('If multi-instance scalability or persistent structured schemas are required later, provision AWS RDS.');
  }
  if (!redisValue) {
    upgradePath.push('Add ElastiCache Redis if background workers, WebSocket event synchronization, or high-read caches are introduced.');
  }
  if (!wafValue) {
    upgradePath.push('Enable AWS WAF when public user auth, payment processors, or API gateway endpoints are added.');
  }

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
    archetype,
    simplicityScore,
    complexityScore,
    justifications,
    upgradePath,
  };
}
