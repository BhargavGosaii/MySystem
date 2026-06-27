import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns a list of default and project-defined ignore patterns.
 */
export function getIgnorePatterns(projectRoot: string): string[] {
  const ignorePatterns: string[] = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'out',
    'terraform',
    'knowledge',
    '.mysystem',
    '.github'
  ];

  // Try to read .gitignore
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const lines = content.split('\n');
      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          let clean = line;
          if (clean.startsWith('/')) clean = clean.slice(1);
          if (clean.endsWith('/')) clean = clean.slice(0, -1);
          if (clean && !ignorePatterns.includes(clean)) {
            ignorePatterns.push(clean);
          }
        }
      }
    } catch {}
  }

  return ignorePatterns;
}

/**
 * Recursively scans directory for source files, respecting ignore patterns and excluding self-audits.
 */
export function scanProjectFiles(
  dir: string,
  projectRoot: string,
  ignorePatterns: string[],
  fileList: string[] = []
): string[] {
  if (!fs.existsSync(dir)) return fileList;

  // Self-auditing exclusion: check if package.json in projectRoot has name "mysystem-cli"
  // If so, skip scanning files inside the CLI package folder to prevent self-audit false positives
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkg.name === 'mysystem-cli' && (dir.includes('packages/cli') || dir.includes('packages\\cli'))) {
        return fileList;
      }
    } catch {}
  }

  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

    const isIgnored = ignorePatterns.some(pattern => {
      if (entry === pattern) return true;
      if (relativePath === pattern || relativePath.startsWith(pattern + '/')) return true;
      return false;
    });

    if (isIgnored) {
      continue;
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        scanProjectFiles(filePath, projectRoot, ignorePatterns, fileList);
      } else {
        if (/\.(js|ts|tsx|py)$/.test(entry)) {
          fileList.push(filePath);
        }
      }
    } catch {}
  }

  return fileList;
}
