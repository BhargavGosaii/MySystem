import * as fs from 'fs';
import * as path from 'path';

export interface FrameworkFacts {
  framework: 'nextjs' | 'react-vite' | 'node' | 'fastapi' | 'unknown';
  runtime: 'node' | 'python' | 'go' | 'unknown';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'unknown';
  port: number;
}

export async function inspectFramework(projectRoot: string): Promise<FrameworkFacts> {
  const facts: FrameworkFacts = {
    framework: 'unknown',
    runtime: 'unknown',
    packageManager: 'unknown',
    port: 3000,
  };

  // 1. Detect Next.js and Vite config files directly
  const hasNextConfig = ['next.config.js', 'next.config.mjs', 'next.config.ts'].some(f => fs.existsSync(path.join(projectRoot, f)));
  const hasViteConfig = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].some(f => fs.existsSync(path.join(projectRoot, f)));

  if (hasNextConfig) {
    facts.framework = 'nextjs';
    facts.runtime = 'node';
    facts.port = 3000;
  } else if (hasViteConfig) {
    facts.framework = 'react-vite';
    facts.runtime = 'node';
    facts.port = 80;
  }

  // 2. Scan package.json for Node dependencies
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    facts.runtime = 'node';
    
    // Detect package manager lock files
    if (fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
      facts.packageManager = 'npm';
    } else if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
      facts.packageManager = 'yarn';
    } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
      facts.packageManager = 'pnpm';
    } else {
      facts.packageManager = 'npm';
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (facts.framework === 'unknown') {
        if (deps['next']) {
          facts.framework = 'nextjs';
          facts.port = 3000;
        } else if (deps['vite'] || deps['react']) {
          facts.framework = 'react-vite';
          facts.port = 80;
        } else if (deps['express'] || deps['koa'] || deps['fastify'] || deps['nest'] || deps['hapi']) {
          facts.framework = 'node';
          facts.port = 3000;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // 3. Scan Python requirements
  const reqTxtPath = path.join(projectRoot, 'requirements.txt');
  const pyProjectToml = path.join(projectRoot, 'pyproject.toml');
  const mainPyPath = path.join(projectRoot, 'main.py');

  if (fs.existsSync(reqTxtPath) || fs.existsSync(pyProjectToml) || fs.existsSync(mainPyPath)) {
    facts.runtime = 'python';
    if (fs.existsSync(pyProjectToml)) {
      facts.packageManager = 'poetry';
    } else {
      facts.packageManager = 'pip';
    }

    if (facts.framework === 'unknown') {
      facts.framework = 'fastapi';
      facts.port = 8000;
    }
  }

  return facts;
}
