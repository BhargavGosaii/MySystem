import * as path from 'path';
import * as fs from 'fs';
import { ProjectCharacteristics } from '../inspectors';
import { parseKnowledgeFile, ParsedKnowledge } from './interpreter';

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

export interface ArchitectureReview {
  projectName: string;
  frameworkDetected: string;
  recommendations: Record<string, ComponentRecommendation>;
  risks: string[];
}

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
      };
    }
  };

  const computeRules = getKnowledge('architecture/compute.md');
  const redisRules = getKnowledge('architecture/redis.md');
  const pgbouncerRules = getKnowledge('architecture/pgbouncer.md');
  const securityRules = getKnowledge('architecture/security.md');
  const sentryRules = getKnowledge('architecture/sentry.md');

  const recs: Record<string, ComponentRecommendation> = {};
  const risks: string[] = [];

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
    recommendation: hasScalingTriggers ? 'Recommended' : 'Recommended', // Placeholder wrapper
    confidence: hasScalingTriggers ? 90 : 95,
    evidence: [],
    tradeoffs: { pros: hostingPros, cons: hostingCons },
    alternatives: [],
    monthlyCost: 0,
  };

  if (hasScalingTriggers) {
    hostingRec.recommendation = 'Recommended'; // ECS Fargate
    hostingRec.monthlyCost = computeRules.cost; // ECS baseline cost (~$15.00)
    hostingRec.evidence.push('WebSocket connections or background workers (queues) detected.');
    hostingRec.evidence.push('Scale target requires distributed load balancing.');
    hostingRec.alternatives.push({
      option: 'EC2',
      reasoning: 'Can be used for development/testing, but manual scaling is risky for real-time WebSocket traffic.',
    });
  } else {
    hostingRec.recommendation = 'Recommended'; // EC2
    hostingRec.monthlyCost = 3.20; // EC2 baseline cost
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
    dbRec.monthlyCost = 15.00; // RDS PostgreSQL baseline
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

  return {
    projectName: characteristics.name,
    frameworkDetected: characteristics.framework,
    recommendations: recs,
    risks,
  };
}
