import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../../inspectors';
import { EngineeringFinding } from '../review';
import { parseKnowledgeFile } from '../../advisor/interpreter';

export async function scanSecurity(characteristics: ProjectCharacteristics, projectRoot: string, knowledgeBaseDir: string): Promise<EngineeringFinding[]> {
  const findings: EngineeringFinding[] = [];
  const sourceFiles = scanForSourceFiles(projectRoot);

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
    let recommendation = 'Refactor raw queries to use parameterized values (e.g. database placeholders) instead of string interpolation.';
    try {
      const parsed = parseKnowledgeFile(path.join(knowledgeBaseDir, 'security/A03-injection.md'));
      recommendation = parsed.purpose || recommendation;
    } catch {}

    findings.push({
      id: 'sec-sql-injection',
      category: 'security',
      title: 'Potential SQL Injection Risk',
      description: 'Code contains raw database queries constructed using string concatenation/templates.',
      action: 'APPROVAL',
      evidence: sqliEvidence,
      recommendation,
      fixed: false,
      blocksDeployment: true,
      impact: {
        securityRisk: 'Critical',
        costSavings: 'Prevents data breaches and database unauthorized access.'
      }
    });
  }

  // 1. Secure HTTP Headers check
  let hasSecureHeaders = false;
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.helmet || deps.cors || characteristics.framework === 'nextjs') {
        hasSecureHeaders = true;
      }
    }
  } catch {}

  if (!hasSecureHeaders) {
    findings.push({
      id: 'sec-missing-secure-headers',
      category: 'security',
      title: 'Missing Secure HTTP Headers',
      description: 'No secure HTTP headers middleware (like helmet) was detected in package configurations.',
      action: 'MANUAL',
      evidence: ['Checked package.json dependencies. Helmet or cors packages not found.'],
      recommendation: 'Install and configure helmet or secure response header filters to guard against XSS and clickjacking.',
      fixed: false,
      blocksDeployment: false,
      impact: {
        securityRisk: 'Medium',
        latency: 'Improves application security posture at zero cost.'
      }
    });
  }

  // 2. Structured Input Validation check
  let hasInputValidation = false;
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.zod || deps.joi || deps.yup || deps.pydantic || deps['class-validator'] || characteristics.framework === 'nextjs') {
        hasInputValidation = true;
      }
    }
  } catch {}

  if (!hasInputValidation) {
    findings.push({
      id: 'sec-missing-input-validation',
      category: 'security',
      title: 'Missing Structured Input Validation',
      description: 'No schema-based input validation libraries (Zod, Joi, Yup, Pydantic) were found in package dependencies.',
      action: 'MANUAL',
      evidence: ['Checked package.json dependencies for Zod, Joi, Yup, Pydantic.'],
      recommendation: 'Implement structured schema validation (e.g. via Zod) for all API endpoints to protect against malformed payloads.',
      fixed: false,
      blocksDeployment: false,
      impact: {
        securityRisk: 'Low',
        latency: 'Guards against bad user request input injection errors.'
      }
    });
  }

  return findings;
}

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
