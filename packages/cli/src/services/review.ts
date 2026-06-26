import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../inspectors';
import { parseKnowledgeFile } from '../advisor/interpreter';

export type ExecutionAction = 'AUTOFIX' | 'APPROVAL' | 'MANUAL' | 'IGNORE';

export interface EngineeringFinding {
  id: string;
  category: 'architecture' | 'security' | 'database' | 'api' | 'performance' | 'cost' | 'observability' | 'quality' | 'testing';
  title: string;
  description: string;
  action: ExecutionAction;
  evidence: string[];
  recommendation: string;
  fixed: boolean;
  blocksDeployment: boolean;
  impact?: {
    latency?: string;
    costSavings?: string;
    securityRisk?: 'Low' | 'Medium' | 'High' | 'Critical';
  };
}

export interface ReviewService {
  review(characteristics: ProjectCharacteristics, projectRoot: string): Promise<EngineeringFinding[]>;
}

export const reviewService: ReviewService = {
  async review(characteristics: ProjectCharacteristics, projectRoot: string): Promise<EngineeringFinding[]> {
    const findings: EngineeringFinding[] = [];
    const knowledgeBaseDir = path.join(__dirname, '../knowledge');

    // Helper to load markdown detail
    const getRecommendationFromMd = (subpath: string, fallback: string): string => {
      try {
        const parsed = parseKnowledgeFile(path.join(knowledgeBaseDir, subpath));
        return parsed.purpose || fallback;
      } catch {
        return fallback;
      }
    };

    // 1. Check health endpoint (GET /health or /healthz)
    let hasHealthEndpoint = false;
    const sourceFiles = scanForSourceFiles(projectRoot);
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const normalizedPath = file.replace(/\\/g, '/');
        if (
          content.includes('/health') ||
          content.includes('/healthz') ||
          normalizedPath.includes('health/route.ts') ||
          normalizedPath.includes('health.ts')
        ) {
          hasHealthEndpoint = true;
          break;
        }
      } catch {}
    }

    if (!hasHealthEndpoint) {
      findings.push({
        id: 'obs-missing-healthcheck',
        category: 'observability',
        title: 'Missing Health Check Endpoint',
        description: 'No unauthenticated GET /health or /healthz endpoint was detected in the codebase.',
        action: 'AUTOFIX',
        evidence: ['Scanned code files. No health route registration found.'],
        recommendation: getRecommendationFromMd(
          'observability/health.md',
          'Expose an unauthenticated GET /health endpoint returning a 200 OK status to let the AWS ALB verify container vitality.'
        ),
        fixed: false,
        blocksDeployment: true,
        impact: {
          securityRisk: 'Low',
          latency: 'Prevents routing failures during deployments.'
        }
      });
    }

    // 2. Check SQL injection / Raw concatenations
    let hasSqliSmells = false;
    const sqliEvidence: string[] = [];
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = path.relative(projectRoot, file);
        if (
          (content.includes('$queryRawUnsafe') && (content.includes('+') || content.includes('`'))) ||
          (content.includes('.query(') && content.includes('`SELECT') && content.includes('${'))
        ) {
          hasSqliSmells = true;
          sqliEvidence.push(`Concatenated raw database query found in: ${relativePath}`);
        }
      } catch {}
    }

    if (hasSqliSmells) {
      findings.push({
        id: 'sec-sql-injection',
        category: 'security',
        title: 'Potential SQL Injection Risk',
        description: 'Code contains raw database queries constructed using string concatenation/templates.',
        action: 'APPROVAL',
        evidence: sqliEvidence,
        recommendation: getRecommendationFromMd(
          'security/A03-injection.md',
          'Refactor raw queries to use parameterized values (e.g. database placeholders) instead of string interpolation.'
        ),
        fixed: false,
        blocksDeployment: true,
        impact: {
          securityRisk: 'Critical',
          costSavings: 'Prevents data breaches and database unauthorized access.'
        }
      });
    }

    // 3. Check N+1 queries in loops
    let hasNPlusOneSmell = false;
    const n1Evidence: string[] = [];
    for (const file of sourceFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = path.relative(projectRoot, file);
        // Look for await prisma / db calls inside map/forEach loops
        if (
          /\.map\s*\(\s*async[\s\S]*await\s+(db|prisma|conn)/.test(content) ||
          /\.forEach\s*\(\s*async[\s\S]*await\s+(db|prisma|conn)/.test(content)
        ) {
          hasNPlusOneSmell = true;
          n1Evidence.push(`Async DB query invoked inside array mapping loop in: ${relativePath}`);
        }
      } catch {}
    }

    if (hasNPlusOneSmell) {
      findings.push({
        id: 'db-n-plus-one-query',
        category: 'database',
        title: 'Database N+1 Query Pattern',
        description: 'Database requests are executed inside a loop. This results in N+1 database round-trips.',
        action: 'APPROVAL',
        evidence: n1Evidence,
        recommendation: getRecommendationFromMd(
          'database/n-plus-one.md',
          'Use relational join aggregation (e.g. eager load using include/joins) or compile results in a single batched query.'
        ),
        fixed: false,
        blocksDeployment: false,
        impact: {
          latency: 'Improves response latency of list endpoints by 50-80ms.'
        }
      });
    }

    // 4. Check for Dockerfile and CI/CD config
    const dockerfilePath = path.join(projectRoot, 'Dockerfile');
    if (!fs.existsSync(dockerfilePath)) {
      findings.push({
        id: 'arch-missing-dockerfile',
        category: 'architecture',
        title: 'Missing Production Dockerfile',
        description: 'No Dockerfile was detected in the root of the project.',
        action: 'AUTOFIX',
        evidence: ['Dockerfile does not exist in root directory.'],
        recommendation: 'Generate a multi-stage production Dockerfile matching the application runtime.',
        fixed: false,
        blocksDeployment: true,
        impact: {
          latency: 'Required for container image build.'
        }
      });
    }

    const deployWorkflowPath = path.join(projectRoot, '.github', 'workflows', 'mysystem-deploy.yml');
    if (!fs.existsSync(deployWorkflowPath)) {
      findings.push({
        id: 'arch-missing-workflow',
        category: 'architecture',
        title: 'Missing CI/CD Workflow',
        description: 'No GitHub Actions deployment pipeline workflow was detected.',
        action: 'AUTOFIX',
        evidence: ['.github/workflows/mysystem-deploy.yml does not exist.'],
        recommendation: 'Generate GitHub Actions build and deploy workflow modules.',
        fixed: false,
        blocksDeployment: true,
        impact: {
          latency: 'Required for automated deployments.'
        }
      });
    }

    return findings;
  }
};

function scanForSourceFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '.next', 'out', 'terraform', 'knowledge'].includes(entry)) {
        continue;
      }
      scanForSourceFiles(filePath, fileList);
    } else {
      if (/\.(js|ts|tsx|py)$/.test(entry)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}
