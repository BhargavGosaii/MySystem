import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../../inspectors';
import { EngineeringFinding } from '../review';
import { parseKnowledgeFile } from '../../advisor/interpreter';

export async function scanDatabase(characteristics: ProjectCharacteristics, projectRoot: string, knowledgeBaseDir: string): Promise<EngineeringFinding[]> {
  const findings: EngineeringFinding[] = [];
  const sourceFiles = scanForSourceFiles(projectRoot);

  let hasNPlusOneSmell = false;
  const n1Evidence: string[] = [];
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(projectRoot, file);
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
    let recommendation = 'Use relational join aggregation (e.g. eager load using include/joins) or compile results in a single batched query.';
    try {
      const parsed = parseKnowledgeFile(path.join(knowledgeBaseDir, 'database/n-plus-one.md'));
      recommendation = parsed.purpose || recommendation;
    } catch {}

    findings.push({
      id: 'db-n-plus-one-query',
      category: 'database',
      title: 'Database N+1 Query Pattern',
      description: 'Database requests are executed inside a loop. This results in N+1 database round-trips.',
      action: 'APPROVAL',
      evidence: n1Evidence,
      recommendation,
      fixed: false,
      blocksDeployment: false,
      impact: {
        latency: 'Improves response latency of list endpoints by 50-80ms.'
      }
    });
  }

  // Database Indexing check
  if (characteristics.ormLib || characteristics.databaseLib) {
    findings.push({
      id: 'db-missing-indexing',
      category: 'database',
      title: 'Database Index Optimization',
      description: 'Ensure that columns frequently used in WHERE, JOIN, or ORDER BY clauses have database indexes.',
      action: 'MANUAL',
      evidence: ['Database ORM/libraries found in use.'],
      recommendation: 'Verify database schemas and add indexes for foreign keys and lookup fields to prevent slow query performance.',
      fixed: false,
      blocksDeployment: false,
      impact: {
        latency: 'Reduces database query latency and prevents full-table scans.'
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
