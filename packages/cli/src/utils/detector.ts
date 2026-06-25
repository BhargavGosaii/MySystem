import * as fs from 'fs';
import * as path from 'path';

export interface ProjectInfo {
  type: 'nextjs' | 'react-vite' | 'node' | 'fastapi' | 'unknown';
  port: number;
  name: string;
}

export function detectProject(projectRoot: string): ProjectInfo {
  const info: ProjectInfo = {
    type: 'unknown',
    port: 3000,
    name: path.basename(projectRoot) || 'mysystem-app',
  };

  // 1. Scan for framework config files directly first
  const hasNextConfig = ['next.config.js', 'next.config.mjs', 'next.config.ts'].some(f => fs.existsSync(path.join(projectRoot, f)));
  const hasViteConfig = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].some(f => fs.existsSync(path.join(projectRoot, f)));

  if (hasNextConfig) {
    info.type = 'nextjs';
    info.port = 3000;
    return info;
  } else if (hasViteConfig) {
    info.type = 'react-vite';
    info.port = 80; // Served via Nginx in production container
    return info;
  }

  // 2. Read package.json if it exists
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name) {
        info.name = packageJson.name;
      }

      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      if (deps['next']) {
        info.type = 'nextjs';
        info.port = 3000;
      } else if (deps['vite'] || deps['react']) {
        info.type = 'react-vite';
        info.port = 80;
      } else if (deps['express'] || deps['koa'] || deps['fastify'] || deps['nest'] || deps['hapi']) {
        info.type = 'node';
        info.port = 3000;
      } else {
        info.type = 'node';
        info.port = 3000;
      }
      return info;
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  // 3. Read requirements.txt or main.py if Python
  const reqTxtPath = path.join(projectRoot, 'requirements.txt');
  const mainPyPath = path.join(projectRoot, 'main.py');
  const pyProjectToml = path.join(projectRoot, 'pyproject.toml');

  if (fs.existsSync(reqTxtPath) || fs.existsSync(mainPyPath) || fs.existsSync(pyProjectToml)) {
    info.type = 'fastapi';
    info.port = 8000;
  }

  return info;
}
