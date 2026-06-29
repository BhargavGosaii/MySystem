import * as path from 'path';
import * as fs from 'fs';
import { ProjectCharacteristics } from '../inspectors';
import { parseDecisionModule, ParsedDecisionKnowledge, ConfidenceRule } from './interpreter';

// ─── Component Recommendation Interface ──────────────────────────

export interface AlternativeOption {
  option: string;
  costTier: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
  complexityTier: 'Low' | 'Medium' | 'High';
  suitability: number;
  reason: string;
}

export interface ComponentRecommendation {
  component: string;
  recommendation: string; // e.g. "ec2", "postgresql", "redis", "pgbouncer", "waf"
  confidence: number;
  evidence: string[];
  tradeoffs: {
    pros: string[];
    cons: string[];
  };
  costTier: 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
  complexityTier: 'Low' | 'Medium' | 'High';
  suitability: number; // 0-100
  reasoning: string[];
  alternatives: AlternativeOption[];
  migrationTrigger: string;
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

function evaluateDecisionRules(
  knowledge: ParsedDecisionKnowledge,
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

  if (chars.hasWebsockets) {
    return 'Realtime SaaS';
  }

  if (hasPayment && hasDb && hasAuth) {
    if (allDeps['shopify'] || reqsText.includes('commerce') || chars.name.includes('shop') || chars.name.includes('market')) {
      return 'Marketplace';
    }
    return 'Creator Platform';
  }

  if (chars.name.includes('learn') || chars.name.includes('course') || allDeps['moodle'] || reqsText.includes('moodle')) {
    return 'Learning Platform';
  }

  if (chars.name.includes('forum') || chars.name.includes('community') || allDeps['discourse']) {
    return 'Community Platform';
  }

  if (chars.hasFileUploads && (allDeps['fluent-ffmpeg'] || allDeps['multer'] || reqsText.includes('ffmpeg') || reqsText.includes('streaming'))) {
    return 'Streaming Platform';
  }

  if (chars.queueLib && !chars.port) {
    return 'Worker Service';
  }

  if (hasDb && hasAuth) {
    return 'CRUD SaaS';
  }

  if (chars.name.includes('admin') || chars.name.includes('dashboard')) {
    return 'Admin Dashboard';
  }

  if (chars.framework === 'fastapi' || (chars.framework === 'node' && chars.name.includes('api'))) {
    return 'API Service';
  }

  if (allDeps['docusaurus'] || allDeps['nextra'] || chars.name.includes('docs') || chars.name.includes('documentation')) {
    return 'Documentation Site';
  }

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

  const getKnowledge = (dirName: string): ParsedDecisionKnowledge => {
    try {
      return parseDecisionModule(path.join(resolvedDir, dirName));
    } catch (err: any) {
      // Fallback empty configuration
      return {
        decisionName: dirName,
        defaultChoice: 'none',
        costTier: 'Low',
        complexityTier: 'Low',
        alternatives: [],
        purpose: 'AWS architecture decision module',
        indicators: [],
        avoidWhen: [],
        migrationTriggers: [],
        tradeoffs: {},
        confidenceRules: []
      };
    }
  };

  const hostingMod = getKnowledge('hosting');
  const databaseMod = getKnowledge('database');
  const cachingMod = getKnowledge('caching');
  const securityMod = getKnowledge('security');
  const networkingMod = getKnowledge('networking');

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

  // ───────────────────────────────────────────────────────────
  // PART 1: Decision Heuristics
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

  // Bind properties to context
  ctx.hasWebsockets = hasWebsockets;
  ctx.queueLib = hasMultipleServices;

  let hostingValue = evaluateDecisionRules(hostingMod, ctx)?.result || 'ec2';
  let hostingSource = 'evidence-engine';
  let hostingReasoning = hostingValue === 'ecs-fargate'
    ? [...hostingEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['Smallest production-ready compute layer: Single virtual machine running Docker Compose.', '[Golden Rule: Minimize AWS monthly cost]'];

  if (aiHosting && (aiHosting === 'ec2' || aiHosting === 'ecs-fargate')) {
    hostingValue = aiHosting;
    hostingSource = 'ai-config';
    hostingReasoning = [`Preserved AI decision to use ${hostingValue === 'ecs-fargate' ? 'ECS Fargate' : 'EC2'}.`, '[Golden Rule: Preserve the application\'s architecture]'];

    if (hostingValue === 'ec2' && characteristics.hasWebsockets) {
      risks.push('AI configured EC2 hosting but the app uses WebSockets. EC2 single-instance lacks container-native load balancing and scaling.');
    }
  }

  // Calculate Suitability
  const ec2Suitability = (hasWebsockets || hasMultipleServices) ? 40 : 96;
  const ecsSuitability = (hasWebsockets || hasMultipleServices || hasHighAvailabilityReq) ? 92 : 42;

  const hostingRec: ComponentRecommendation = {
    component: 'Compute Hosting Platform',
    recommendation: hostingValue,
    confidence: hostingValue === 'ecs-fargate' ? 90 : 95,
    evidence: hostingValue === 'ecs-fargate' ? hostingEvidence : ['Stateless monolithic footprint with low traffic indicators.'],
    tradeoffs: {
      pros: hostingMod.tradeoffs['ec2']?.pros || ['Lowest baseline cost', 'Minimal operational overhead'],
      cons: hostingMod.tradeoffs['ec2']?.cons || ['Single point of failure', 'Vertical scaling only']
    },
    costTier: hostingValue === 'ecs-fargate' ? 'Medium' : 'Low',
    complexityTier: hostingValue === 'ecs-fargate' ? 'High' : 'Low',
    suitability: hostingValue === 'ecs-fargate' ? ecsSuitability : ec2Suitability,
    reasoning: hostingReasoning,
    migrationTrigger: hostingMod.migrationTriggers[0] || 'Upgrade to ECS Fargate if average CPU exceeds 70% or multiple microservices are introduced.',
    alternatives: [
      {
        option: hostingValue === 'ecs-fargate' ? 'EC2' : 'ECS Fargate',
        costTier: hostingValue === 'ecs-fargate' ? 'Low' : 'Medium',
        complexityTier: hostingValue === 'ecs-fargate' ? 'Low' : 'High',
        suitability: hostingValue === 'ecs-fargate' ? ec2Suitability : ecsSuitability,
        reason: hostingValue === 'ecs-fargate'
          ? 'Requires manual virtual machine orchestration and updates; lacks native container high-availability targets.'
          : 'Introduces Application Load Balancer and cluster orchestration overhead for simple monoliths.'
      }
    ],
    monthlyCost: hostingValue === 'ecs-fargate' ? 15.00 : 3.20
  };
  recs['hosting'] = hostingRec;


  // 2. Database (RDS vs Docker Postgres/None)
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

  // Set properties in context for database evaluation
  ctx.hasDirectDbConnections = rdsEvidence.length > 0;
  ctx.hasFrameworkDb = hasSqlLib && !isSQLite;

  let dbValue = evaluateDecisionRules(databaseMod, ctx)?.result || 'none';
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

  const dbPostgresSuitability = dbValue !== 'none' ? 95 : 20;
  const dbNoneSuitability = dbValue !== 'none' ? 25 : 98;

  const dbRec: ComponentRecommendation = {
    component: 'SQL Database Hosting',
    recommendation: dbValue,
    confidence: 95,
    evidence: dbValue !== 'none' ? rdsEvidence : ['No database package manifests or environment variables detected.'],
    tradeoffs: {
      pros: databaseMod.tradeoffs['postgresql']?.pros || ['Automated backups', 'Automatic minor upgrades'],
      cons: databaseMod.tradeoffs['postgresql']?.cons || ['Adds operational cost']
    },
    costTier: dbValue !== 'none' ? 'Medium' : 'Very Low',
    complexityTier: dbValue !== 'none' ? 'Medium' : 'Low',
    suitability: dbValue !== 'none' ? dbPostgresSuitability : dbNoneSuitability,
    reasoning: dbReasoning,
    migrationTrigger: databaseMod.migrationTriggers[0] || 'Upgrade to managed RDS if database size exceeds 20GB or high-availability failover is required.',
    alternatives: [
      {
        option: dbValue !== 'none' ? 'SQLite/None' : 'PostgreSQL',
        costTier: dbValue !== 'none' ? 'Very Low' : 'Medium',
        complexityTier: dbValue !== 'none' ? 'Low' : 'Medium',
        suitability: dbValue !== 'none' ? dbNoneSuitability : dbPostgresSuitability,
        reason: dbValue !== 'none'
          ? 'Cannot support multi-instance cluster writing safely due to file system locking.'
          : 'Adds unnecessary hosting billing for static frontend or stateless APIs.'
      }
    ],
    monthlyCost: dbValue !== 'none' ? 15.00 : 0.00
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

  // Set properties in context for cache evaluation
  ctx.hasBullMQ = !!(allDeps['bullmq'] || allDeps['bull'] || reqsText.includes('celery'));
  ctx.hasRedisClient = !!(allDeps['redis'] || allDeps['ioredis'] || characteristics.redisUrlConfigured);
  ctx.hasCelery = reqsText.includes('celery');

  let redisValue = evaluateDecisionRules(cachingMod, ctx)?.result === 'redis';
  let redisSource = 'evidence-engine';
  let redisReasoning = redisValue
    ? [...redisEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['No caching, queue, or multi-node WebSocket sync requirements detected.', '[Golden Rule: Avoid unnecessary infrastructure]'];

  if (aiRedis !== undefined) {
    redisValue = !!aiRedis;
    redisSource = 'ai-config';
    redisReasoning = [`Preserved AI decision to use Redis: ${redisValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const redisSuitability = redisValue ? 95 : 30;
  const redisNoneSuitability = redisValue ? 25 : 98;

  const redisRec: ComponentRecommendation = {
    component: 'In-Memory Caching',
    recommendation: redisValue ? 'redis' : 'none',
    confidence: 95,
    evidence: redisValue ? redisEvidence : ['No caching layers, background queue workers, or WebSocket indicators found.'],
    tradeoffs: {
      pros: cachingMod.tradeoffs['redis']?.pros || ['Sub-millisecond query caches', 'High-throughput broker'],
      cons: cachingMod.tradeoffs['redis']?.cons || ['Adds extra cache configuration']
    },
    costTier: redisValue ? 'Medium' : 'Very Low',
    complexityTier: redisValue ? 'Medium' : 'Low',
    suitability: redisValue ? redisSuitability : redisNoneSuitability,
    reasoning: redisReasoning,
    migrationTrigger: cachingMod.migrationTriggers[0] || 'Add ElastiCache Redis if background worker queues or multi-node WebSocket sync are introduced.',
    alternatives: [
      {
        option: redisValue ? 'None/In-Memory' : 'Redis',
        costTier: redisValue ? 'Very Low' : 'Medium',
        complexityTier: redisValue ? 'Low' : 'Medium',
        suitability: redisValue ? redisNoneSuitability : redisSuitability,
        reason: redisValue
          ? 'Cache state would be locked to a single instance, crashing worker queues on scale out.'
          : 'Unnecessary caching dependency for static frontends or simple CRUD routes.'
      }
    ],
    monthlyCost: redisValue ? 12.00 : 0.00
  };
  recs['redis'] = redisRec;


  // 4. PgBouncer (RDS Connection Proxy)
  const pgbEvidence: string[] = [];
  if (dbValue === 'postgresql') {
    if (characteristics.framework === 'nextjs') {
      pgbEvidence.push('Next.js/Serverless routes trigger connection pool spikes.');
    }
    if (allDeps['prisma'] || allDeps['@prisma/client'] || reqsText.includes('prisma')) {
      pgbEvidence.push('Prisma client connection pooling requires RDS proxying under high concurrency.');
    }
    if (hostingValue === 'ecs-fargate' && hasHighAvailabilityReq) {
      pgbEvidence.push('Multiple concurrent container instances require a central connection proxy.');
    }
  }

  // Set properties in context for database proxy evaluation
  ctx.isServerlessSpiky = pgbEvidence.length > 0;
  ctx.postgresql = dbValue === 'postgresql';

  let pgbValue = dbValue === 'postgresql' && pgbEvidence.length > 0;
  let pgbSource = 'evidence-engine';
  let pgbReasoning = pgbValue
    ? [...pgbEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['Direct client-side connection pooling is sufficient for single server.', '[Golden Rule: Avoid unnecessary complexity]'];

  if (aiPgb !== undefined) {
    pgbValue = !!aiPgb;
    pgbSource = 'ai-config';
    pgbReasoning = [`Preserved AI decision to use PgBouncer: ${pgbValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const pgbSuitability = pgbValue ? 90 : 20;
  const pgbNoneSuitability = pgbValue ? 30 : 98;

  const pgbRec: ComponentRecommendation = {
    component: 'Database Connection Proxy',
    recommendation: pgbValue ? 'pgbouncer' : 'none',
    confidence: 90,
    evidence: pgbValue ? pgbEvidence : ['Direct client-side connection pooling is sufficient.'],
    tradeoffs: {
      pros: databaseMod.tradeoffs['pgbouncer']?.pros || ['Manages connection limits', 'Protects RDS pool limits'],
      cons: databaseMod.tradeoffs['pgbouncer']?.cons || ['Adds proxy routing overhead']
    },
    costTier: pgbValue ? 'Low' : 'Very Low',
    complexityTier: pgbValue ? 'Medium' : 'Low',
    suitability: pgbValue ? pgbSuitability : pgbNoneSuitability,
    reasoning: pgbReasoning,
    migrationTrigger: 'Deploy AWS RDS Proxy when database connection pools spike beyond 80 connections.',
    alternatives: [
      {
        option: pgbValue ? 'Direct Connection' : 'PgBouncer',
        costTier: pgbValue ? 'Very Low' : 'Low',
        complexityTier: pgbValue ? 'Low' : 'Medium',
        suitability: pgbValue ? pgbNoneSuitability : pgbSuitability,
        reason: pgbValue
          ? 'Risk of database connection starvation under serverless or auto-scaled container surges.'
          : 'Direct client connection pool sizing is sufficient for low concurrency workloads.'
      }
    ],
    monthlyCost: pgbValue ? 15.00 : 0.00
  };
  recs['pgbouncer'] = pgbRec;


  // 5. AWS WAF (Web Application Firewall)
  const wafEvidence: string[] = [];
  if (dbValue === 'postgresql' && hasAuth) {
    wafEvidence.push('Application has a database and user auth system exposed to public routes.');
  }

  ctx.hasAuthAndDb = hasAuth && dbValue === 'postgresql';

  let wafValue = evaluateDecisionRules(securityMod, ctx)?.result === 'waf';
  let wafSource = 'evidence-engine';
  let wafReasoning = wafValue
    ? [...wafEvidence, '[Golden Rule: Prefer AWS native services]']
    : ['No database user auth or sensitive public input endpoints detected.', '[Golden Rule: Avoid unnecessary infrastructure]'];

  if (aiWaf !== undefined) {
    wafValue = !!aiWaf;
    wafSource = 'ai-config';
    wafReasoning = [`Preserved AI decision to use WAF: ${wafValue}.`, '[Golden Rule: Preserve the application\'s architecture]'];
  }

  const wafSuitability = wafValue ? 90 : 15;
  const wafNoneSuitability = wafValue ? 25 : 98;

  const secRec: ComponentRecommendation = {
    component: 'Firewall & Security Shield',
    recommendation: wafValue ? 'waf' : 'none',
    confidence: 90,
    evidence: wafValue ? wafEvidence : ['Application does not expose critical database schemas or auth inputs.'],
    tradeoffs: {
      pros: securityMod.tradeoffs['waf']?.pros || ['Shields public routes', 'Blocks SQLi and XSS bot attacks'],
      cons: securityMod.tradeoffs['waf']?.cons || ['High baseline ACL monthly cost']
    },
    costTier: wafValue ? 'High' : 'Very Low',
    complexityTier: wafValue ? 'Medium' : 'Low',
    suitability: wafValue ? wafSuitability : wafNoneSuitability,
    reasoning: wafReasoning,
    migrationTrigger: securityMod.migrationTriggers[0] || 'Enable AWS WAF when public user auth, payment processors, or API gateway endpoints are added.',
    alternatives: [
      {
        option: wafValue ? 'None/DNS Only' : 'WAF Firewall',
        costTier: wafValue ? 'Very Low' : 'High',
        complexityTier: wafValue ? 'Low' : 'Medium',
        suitability: wafValue ? wafNoneSuitability : wafSuitability,
        reason: wafValue
          ? 'Leaves authentication and user dashboards exposed to automated bot and credential-stuffing attacks.'
          : 'Simple monolithic portfolios do not warrant the $12.00/mo baseline rule fee.'
      }
    ],
    monthlyCost: wafValue ? 8.00 : 0.00
  };
  recs['waf'] = secRec;

  // 6. Networking Traffic Routing (ALB vs Direct)
  const isAlbIncluded = hostingValue === 'ecs-fargate';
  ctx.isEcsHosting = isAlbIncluded;

  let routingValue = evaluateDecisionRules(networkingMod, ctx)?.result || 'direct';
  let routingSource = 'evidence-engine';
  let routingReasoning = routingValue === 'alb'
    ? ['ECS Fargate requires a load balancer for traffic routing to dynamic tasks.']
    : ['EC2 hosting maps direct domains to the instance IP.', '[Golden Rule: Minimize AWS monthly cost]'];

  const albSuitability = isAlbIncluded ? 95 : 15;
  const directSuitability = isAlbIncluded ? 10 : 98;

  const netRec: ComponentRecommendation = {
    component: 'Traffic Routing & Load Balancer',
    recommendation: routingValue,
    confidence: 95,
    evidence: isAlbIncluded ? ['ECS Fargate active task orchestration.'] : ['Single EC2 monolithic server mapped directly.'],
    tradeoffs: {
      pros: networkingMod.tradeoffs['alb']?.pros || ['SSL termination', 'Dynamic target group task routing'],
      cons: networkingMod.tradeoffs['alb']?.cons || ['Adds baseline ALB hourly cost']
    },
    costTier: routingValue === 'alb' ? 'High' : 'Very Low',
    complexityTier: routingValue === 'alb' ? 'High' : 'Low',
    suitability: routingValue === 'alb' ? albSuitability : directSuitability,
    reasoning: routingReasoning,
    migrationTrigger: networkingMod.migrationTriggers[0] || 'Add Application Load Balancer when migrating compute to ECS Fargate.',
    alternatives: [
      {
        option: routingValue === 'alb' ? 'Direct Routing' : 'Load Balancer (ALB)',
        costTier: routingValue === 'alb' ? 'Very Low' : 'High',
        complexityTier: routingValue === 'alb' ? 'Low' : 'High',
        suitability: routingValue === 'alb' ? directSuitability : albSuitability,
        reason: routingValue === 'alb'
          ? 'Direct host mapping fails to target horizontally scaled, ephemeral ECS tasks.'
          : 'Avoids load balancer costs for single-node EC2 monolithic servers.'
      }
    ],
    monthlyCost: routingValue === 'alb' ? 15.00 : 0.00
  };
  recs['networking'] = netRec;

  // ───────────────────────────────────────────────────────────
  // PART 2: Format Output & Summary
  // ───────────────────────────────────────────────────────────

  // Translate decisions for downstream synthesis & deployment modules
  decisions.push({
    component: 'hosting',
    value: hostingValue,
    confidence: hostingRec.confidence,
    reasoning: hostingRec.reasoning,
    source: hostingSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: hostingRec.monthlyCost
  });

  decisions.push({
    component: 'database',
    value: dbValue,
    confidence: dbRec.confidence,
    reasoning: dbRec.reasoning,
    source: dbSource,
    decisionType: dbValue !== 'none' ? 'RECOMMENDATION' : 'SAFE',
    monthlyCost: dbRec.monthlyCost
  });

  decisions.push({
    component: 'redis',
    value: redisValue,
    confidence: redisRec.confidence,
    reasoning: redisRec.reasoning,
    source: redisSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: redisRec.monthlyCost
  });

  decisions.push({
    component: 'pgBouncer',
    value: pgbValue,
    confidence: pgbRec.confidence,
    reasoning: pgbRec.reasoning,
    source: pgbSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: pgbRec.monthlyCost
  });

  decisions.push({
    component: 'waf',
    value: wafValue,
    confidence: secRec.confidence,
    reasoning: secRec.reasoning,
    source: wafSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: secRec.monthlyCost
  });

  decisions.push({
    component: 'networking',
    value: routingValue,
    confidence: netRec.confidence,
    reasoning: netRec.reasoning,
    source: routingSource,
    decisionType: 'RECOMMENDATION',
    monthlyCost: netRec.monthlyCost
  });

  // Justifications Mapping for Legacy Console Rendering
  const justifications: Record<string, ServiceJustification> = {};
  justifications['hosting'] = {
    service: 'ECS (Managed Containers)',
    decision: hostingValue === 'ecs-fargate' ? 'Included' : 'Not Included',
    evidence: hostingEvidence,
    benefits: ['Provides horizontal scaling', 'Enables zero-downtime rolling updates', 'Isolates tasks in private subnets'],
    operationalComplexity: hostingValue === 'ecs-fargate' ? 'High (Score: 7)' : 'Low (Score: 2)',
    monthlyCost: hostingValue === 'ecs-fargate' ? 15.00 : 0.00,
    reasonRejectedOrSelected: hostingValue === 'ecs-fargate' ? 'Required to satisfy current workload requirements.' : 'Single EC2 instance running Docker Compose is the simplest and cheapest starting tier for the monolithic workload.'
  };

  justifications['database'] = {
    service: 'RDS (Managed PostgreSQL)',
    decision: dbValue !== 'none' ? 'Included' : 'Not Included',
    evidence: dbValue !== 'none' ? rdsEvidence : [],
    benefits: ['Automated daily snapshots and backups', 'Managed minor version upgrades', 'High availability options'],
    operationalComplexity: 'Medium (Score: 4)',
    monthlyCost: dbValue !== 'none' ? 15.00 : 0.00,
    reasonRejectedOrSelected: dbValue !== 'none' ? 'Required to satisfy database requirements.' : 'No SQL database required or local SQLite is sufficient.'
  };

  justifications['redis'] = {
    service: 'Redis (Cache & Messaging Broker)',
    decision: redisValue ? 'Included' : 'Not Included',
    evidence: redisEvidence,
    benefits: ['High-throughput pub/sub for WebSockets', 'Broker backing background queue workers', 'Sub-millisecond caches'],
    operationalComplexity: 'Medium (Score: 5)',
    monthlyCost: redisValue ? 12.00 : 0.00,
    reasonRejectedOrSelected: redisValue ? 'Required to satisfy messaging/broker requirements.' : 'Additional operational complexity without measurable benefit.'
  };

  justifications['pgBouncer'] = {
    service: 'PgBouncer (Database Proxy)',
    decision: pgbValue ? 'Included' : 'Not Included',
    evidence: pgbEvidence,
    benefits: ['Protects RDS connection pool limits', 'Supports serverless connection spikes safely'],
    operationalComplexity: 'Medium (Score: 4)',
    monthlyCost: pgbValue ? 15.00 : 0.00,
    reasonRejectedOrSelected: pgbValue ? 'Required to satisfy connection concurrency requirements.' : 'Direct client connection pools are sufficient; no serverless spikes detected.'
  };

  justifications['waf'] = {
    service: 'AWS WAF (Web Application Firewall)',
    decision: wafValue ? 'Included' : 'Not Included',
    evidence: wafEvidence,
    benefits: ['Shields public auth endpoints', 'Blocks SQL Injection and XSS bot attacks'],
    operationalComplexity: 'Medium (Score: 3)',
    monthlyCost: wafValue ? 8.00 : 0.00,
    reasonRejectedOrSelected: wafValue ? 'Required to satisfy application security policies.' : 'Application does not expose critical user auth databases or sensitive endpoints to public bots.'
  };

  justifications['alb'] = {
    service: 'Application Load Balancer (ALB)',
    decision: isAlbIncluded ? 'Included' : 'Not Included',
    evidence: isAlbIncluded ? ['ECS Fargate requires a load balancer for routing.'] : ['EC2 hosting maps direct domains to the instance IP.'],
    benefits: isAlbIncluded ? ['SSL termination and multi-task routing'] : ['Saves monthly ALB fees and simplifies routing.'],
    operationalComplexity: 'Medium (Score: 5)',
    monthlyCost: isAlbIncluded ? 15.00 : 0.00,
    reasonRejectedOrSelected: isAlbIncluded ? 'Required by ECS Fargate.' : 'Direct DNS Elastic IP mapping is simpler.'
  };

  // Complexity Calculation (Legacy)
  let complexityScore = 0;
  if (hostingValue === 'ec2') {
    complexityScore += 2;
    complexityScore += 1;
  } else {
    complexityScore += 7;
    complexityScore += 5;
  }
  if (dbValue === 'postgresql') complexityScore += 4;
  if (redisValue) complexityScore += 5;
  if (pgbValue) complexityScore += 4;
  if (wafValue) complexityScore += 3;

  const simplicityScore = Math.max(10, 100 - complexityScore * 3);

  // Upgrade Path Recommendations
  const upgradePath: string[] = [];
  if (hostingValue === 'ec2') {
    upgradePath.push('hosting: ' + hostingRec.migrationTrigger);
  }
  if (dbValue === 'none') {
    upgradePath.push('database: ' + dbRec.migrationTrigger);
  }
  if (!redisValue) {
    upgradePath.push('caching: ' + redisRec.migrationTrigger);
  }
  if (!wafValue) {
    upgradePath.push('security: ' + secRec.migrationTrigger);
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
