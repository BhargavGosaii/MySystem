import * as fs from 'fs';
import * as path from 'path';

export interface PackageFacts {
  databaseLib: string | null;
  ormLib: string | null;
  redisLib: string | null;
  sentryLib: string | null;
  queueLib: string | null;
}

export async function inspectPackages(projectRoot: string): Promise<PackageFacts> {
  const facts: PackageFacts = {
    databaseLib: null,
    ormLib: null,
    redisLib: null,
    sentryLib: null,
    queueLib: null,
  };

  // Node packages scanning
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // DB libraries
      const dbLibs = ['pg', 'postgres', 'mysql2', 'mongodb', 'mssql', 'mariadb', 'better-sqlite3', 'sqlite3'];
      for (const lib of dbLibs) {
        if (deps[lib]) {
          facts.databaseLib = lib;
          break;
        }
      }

      // ORM libraries
      const ormLibs = ['prisma', 'sequelize', 'typeorm', 'drizzle-orm', 'mongoose', 'knex'];
      for (const lib of ormLibs) {
        if (deps[lib] || (lib === 'prisma' && deps['@prisma/client'])) {
          facts.ormLib = lib;
          break;
        }
      }

      // Redis libraries
      const redisLibs = ['redis', 'ioredis', 'handy-redis', 'redis-om'];
      for (const lib of redisLibs) {
        if (deps[lib]) {
          facts.redisLib = lib;
          break;
        }
      }

      // Queue libraries
      const queueLibs = ['bull', 'bullmq', 'bee-queue'];
      for (const lib of queueLibs) {
        if (deps[lib]) {
          facts.queueLib = lib;
          break;
        }
      }

      // Sentry libraries
      const sentryLibs = ['@sentry/nextjs', '@sentry/node', '@sentry/react', 'raven'];
      for (const lib of sentryLibs) {
        if (deps[lib]) {
          facts.sentryLib = lib;
          break;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Python packages scanning
  const reqTxtPath = path.join(projectRoot, 'requirements.txt');
  if (fs.existsSync(reqTxtPath)) {
    try {
      const reqs = fs.readFileSync(reqTxtPath, 'utf8').toLowerCase();

      if (reqs.includes('psycopg2') || reqs.includes('asyncpg')) {
        facts.databaseLib = 'psycopg2';
      } else if (reqs.includes('pymongo')) {
        facts.databaseLib = 'pymongo';
      } else if (reqs.includes('mysqlclient') || reqs.includes('pymysql')) {
        facts.databaseLib = 'mysqlclient';
      }

      if (reqs.includes('sqlalchemy')) {
        facts.ormLib = 'sqlalchemy';
      } else if (reqs.includes('tortoise-orm')) {
        facts.ormLib = 'tortoise-orm';
      } else if (reqs.includes('peewee')) {
        facts.ormLib = 'peewee';
      } else if (reqs.includes('mongoengine')) {
        facts.ormLib = 'mongoengine';
      }

      if (reqs.includes('redis')) {
        facts.redisLib = 'redis';
      }

      if (reqs.includes('celery')) {
        facts.queueLib = 'celery';
      }

      if (reqs.includes('sentry-sdk')) {
        facts.sentryLib = 'sentry-sdk';
      }
    } catch {
      // Ignore file reading errors
    }
  }

  return facts;
}
