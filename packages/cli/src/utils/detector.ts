import * as fs from 'fs';
import * as path from 'path';

export interface ProjectInfo {
  type: 'nextjs' | 'react-vite' | 'node' | 'fastapi' | 'unknown';
  port: number;
  hasDatabase: boolean;
  hasRedis: boolean;
  name: string;
}

export function detectProject(projectRoot: string): ProjectInfo {
  const info: ProjectInfo = {
    type: 'unknown',
    port: 3000,
    hasDatabase: false,
    hasRedis: false,
    name: path.basename(projectRoot) || 'mysystem-app',
  };

  // 1. Read package.json if it exists
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

      // Detect database dependencies (pg, prisma, typeorm, sequelize, knex, sqlite3, mysql2)
      const dbDeps = ['pg', 'postgres', 'prisma', 'typeorm', 'sequelize', 'knex', 'sqlite3', 'mysql2'];
      if (Object.keys(deps).some(dep => dbDeps.includes(dep))) {
        info.hasDatabase = true;
      }

      // Detect Redis dependencies
      const redisDeps = ['redis', 'ioredis', 'bull', 'bullmq', 'handy-redis', 'keyv'];
      if (Object.keys(deps).some(dep => redisDeps.includes(dep))) {
        info.hasRedis = true;
      }

      // Framework detection
      if (deps['next']) {
        info.type = 'nextjs';
        info.port = 3000;
      } else if (deps['vite'] || deps['react']) {
        // A Vite React app (or standard React)
        info.type = 'react-vite';
        info.port = 80; // React SPAs get served on port 80 via Nginx in production
      } else if (deps['express'] || deps['koa'] || deps['fastify'] || deps['nest']) {
        info.type = 'node';
        info.port = 3000;
      } else {
        info.type = 'node';
        info.port = 3000;
      }
    } catch (e) {
      // Ignore JSON parse errors and continue
    }
  }

  // 2. Read requirements.txt or main.py if Python
  const reqTxtPath = path.join(projectRoot, 'requirements.txt');
  const mainPyPath = path.join(projectRoot, 'main.py');
  if (fs.existsSync(reqTxtPath) || fs.existsSync(mainPyPath)) {
    info.type = 'fastapi';
    info.port = 8000;

    if (fs.existsSync(reqTxtPath)) {
      const reqs = fs.readFileSync(reqTxtPath, 'utf8');
      const dbTerms = ['postgresql', 'psycopg2', 'sqlalchemy', 'tortoise-orm', 'peewee', 'asyncpg'];
      if (dbTerms.some(term => reqs.toLowerCase().includes(term))) {
        info.hasDatabase = true;
      }

      const redisTerms = ['redis', 'django-redis', 'celery'];
      if (redisTerms.some(term => reqs.toLowerCase().includes(term))) {
        info.hasRedis = true;
      }
    }
  }

  return info;
}
