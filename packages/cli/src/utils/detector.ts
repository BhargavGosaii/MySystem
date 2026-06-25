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

  // 1. Scan for framework config files directly first
  const hasNextConfig = ['next.config.js', 'next.config.mjs', 'next.config.ts'].some(f => fs.existsSync(path.join(projectRoot, f)));
  const hasViteConfig = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs'].some(f => fs.existsSync(path.join(projectRoot, f)));
  const hasPrismaSchema = fs.existsSync(path.join(projectRoot, 'prisma', 'schema.prisma')) || fs.existsSync(path.join(projectRoot, 'schema.prisma'));

  if (hasNextConfig) {
    info.type = 'nextjs';
    info.port = 3000;
  } else if (hasViteConfig) {
    info.type = 'react-vite';
    info.port = 80; // Served via Nginx in production container
  }

  if (hasPrismaSchema) {
    info.hasDatabase = true;
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

      // Detect database dependencies (including MongoDB, SQLite, Postgres, MySQL, MariaDB, SQL Server, Drizzle, etc.)
      const dbDeps = [
        'pg', 'postgres', 'prisma', 'typeorm', 'sequelize', 'knex', 'sqlite3', 
        'mysql2', 'mongodb', 'mongoose', 'mssql', 'mariadb', 'pg-promise', 
        'drizzle-orm', 'better-sqlite3'
      ];
      if (Object.keys(deps).some(dep => dbDeps.includes(dep) || dep.startsWith('@prisma/'))) {
        info.hasDatabase = true;
      }

      // Detect Redis dependencies
      const redisDeps = ['redis', 'ioredis', 'bull', 'bullmq', 'handy-redis', 'keyv', 'redis-om'];
      if (Object.keys(deps).some(dep => redisDeps.includes(dep))) {
        info.hasRedis = true;
      }

      // Fallback Framework detection if config files weren't matched
      if (info.type === 'unknown') {
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
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  // 3. Read requirements.txt or main.py if Python
  const reqTxtPath = path.join(projectRoot, 'requirements.txt');
  const mainPyPath = path.join(projectRoot, 'main.py');
  const pyProjectToml = path.join(projectRoot, 'pyproject.toml');

  if (fs.existsSync(reqTxtPath) || fs.existsSync(mainPyPath) || fs.existsSync(pyProjectToml)) {
    if (info.type === 'unknown') {
      info.type = 'fastapi';
      info.port = 8000;
    }

    const checkPythonDeps = (content: string) => {
      const dbTerms = ['postgresql', 'psycopg2', 'sqlalchemy', 'tortoise-orm', 'peewee', 'asyncpg', 'pymongo', 'mongoengine', 'mysqlclient'];
      if (dbTerms.some(term => content.toLowerCase().includes(term))) {
        info.hasDatabase = true;
      }

      const redisTerms = ['redis', 'django-redis', 'celery'];
      if (redisTerms.some(term => content.toLowerCase().includes(term))) {
        info.hasRedis = true;
      }
    };

    if (fs.existsSync(reqTxtPath)) {
      checkPythonDeps(fs.readFileSync(reqTxtPath, 'utf8'));
    }
    if (fs.existsSync(pyProjectToml)) {
      checkPythonDeps(fs.readFileSync(pyProjectToml, 'utf8'));
    }
  }

  // 4. Scan .env, .env.example, .env.local for database/redis keywords (CRITICAL fallback)
  const envFiles = ['.env', '.env.example', '.env.local', '.env.development', '.env.production'];
  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const dbKeywords = [
          'DATABASE_URL', 'DATABASE_URI', 'POSTGRES_', 'MONGODB_URI', 'MONGO_URI', 
          'DB_HOST', 'DB_PASSWORD', 'DB_CONNECTION', 'MYSQL_URL', 'DATABASE_NAME'
        ];
        const redisKeywords = ['REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'];

        if (dbKeywords.some(kw => content.includes(kw))) {
          info.hasDatabase = true;
        }
        if (redisKeywords.some(kw => content.includes(kw))) {
          info.hasRedis = true;
        }
      } catch {
        // Ignore file read errors
      }
    }
  }

  return info;
}
