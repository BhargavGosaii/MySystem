import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../../inspectors';
import { EngineeringFinding } from '../review';
import { parseKnowledgeFile } from '../../advisor/interpreter';
import { scanProjectFiles, getIgnorePatterns } from '../../utils/scanner';

export async function scanObservability(characteristics: ProjectCharacteristics, projectRoot: string, knowledgeBaseDir: string): Promise<EngineeringFinding[]> {
  const findings: EngineeringFinding[] = [];
  const ignorePatterns = getIgnorePatterns(projectRoot);
  const sourceFiles = scanProjectFiles(projectRoot, projectRoot, ignorePatterns);

  let hasHealthEndpoint = false;
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
    let recommendation = 'Expose an unauthenticated GET /health endpoint returning a 200 OK status to let the AWS ALB verify container vitality.';
    try {
      const parsed = parseKnowledgeFile(path.join(knowledgeBaseDir, 'observability/health.md'));
      recommendation = parsed.purpose || recommendation;
    } catch {}

    findings.push({
      id: 'obs-missing-healthcheck',
      category: 'observability',
      title: 'Missing Health Check Endpoint',
      description: 'No unauthenticated GET /health or /healthz endpoint was detected in the codebase.',
      action: 'AUTOFIX',
      evidence: ['Scanned code files. No health route registration found.'],
      recommendation,
      fixed: false,
      blocksDeployment: true,
      impact: {
        securityRisk: 'Low',
        latency: 'Prevents routing failures during deployments.'
      }
    });
  }

  // 1. Structured Logging check
  let hasStructuredLogging = false;
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.pino || deps.winston || deps.bunyan || characteristics.framework === 'nextjs') {
        hasStructuredLogging = true;
      }
    }
  } catch {}

  if (!hasStructuredLogging && characteristics.framework !== 'unknown') {
    findings.push({
      id: 'obs-missing-structured-logging',
      category: 'observability',
      title: 'Missing Structured Logging',
      description: 'The project does not use structured JSON logging libraries like Pino.',
      action: 'MANUAL',
      evidence: ['Checked package.json dependencies. Pino, Winston, or Bunyan not found.'],
      recommendation: 'Integrate pino or winston to format production logs as structured JSON, making them queryable in CloudWatch.',
      fixed: false,
      blocksDeployment: false,
      impact: {
        latency: 'Reduces log parsing overhead and enables advanced CloudWatch queries.'
      }
    });
  }

  return findings;
}

