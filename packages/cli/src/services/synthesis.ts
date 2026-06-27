import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ProjectCharacteristics } from '../inspectors';
import { ExecutionPlan } from '../planner/planner';

export interface SynthesisService {
  synthesize(plan: ExecutionPlan, characteristics: ProjectCharacteristics, projectRoot: string): Promise<boolean>;
}

export const synthesisService: SynthesisService = {
  async synthesize(plan: ExecutionPlan, characteristics: ProjectCharacteristics, projectRoot: string): Promise<boolean> {
    try {
      console.log('   🎨 Synthesizing complete production runtime environment...');

      // 1. Gather original environment variables
      const originalEnvVars: Record<string, string> = {};
      const envFiles = ['.env', '.env.example', '.env.local', '.env.production', '.env.development'];
      for (const file of envFiles) {
        const filePath = path.join(projectRoot, file);
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            for (const line of lines) {
              const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(["']?)(.*?)\2\s*$/);
              if (match) {
                const key = match[1];
                const val = match[3];
                if (!originalEnvVars[key]) {
                  originalEnvVars[key] = val;
                }
              }
            }
          } catch {}
        }
      }

      // 2. Check for existing database endpoints
      let isExternalDb = false;
      let detectedExternalDbUrl = '';
      const dbUrlKeys = ['DATABASE_URL', 'DATABASE_URI', 'MONGO_URI', 'MONGODB_URI', 'MYSQL_URL', 'DB_HOST'];
      
      for (const key of dbUrlKeys) {
        if (originalEnvVars[key]) {
          const val = originalEnvVars[key];
          const hostIsRemote = val && !val.includes('localhost') && !val.includes('127.0.0.1') && !val.includes('postgres') && !val.includes('db');
          const isUrl = val.includes('://') || key === 'DB_HOST';
          const isPlaceholder = val.includes('your-') || val.includes('placeholder') || val.includes('my-') || val.includes('<');
          if (hostIsRemote && isUrl && !isPlaceholder) {
            isExternalDb = true;
            detectedExternalDbUrl = val;
            break;
          }
        }
      }

      // If Advisor recommends a database but an external database exists, reuse the external database
      const useDatabase = plan.config.database !== 'none';
      const useDockerPostgres = useDatabase && !isExternalDb && plan.config.hosting === 'ec2';

      // 3. Detect ORM and Migration Command
      let orm = 'None';
      let migrationCommand = '';

      let dependencies: Record<string, any> = {};
      const packageJsonPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          dependencies = { ...pJson.dependencies, ...pJson.devDependencies };
        } catch {}
      }

      let reqsText = '';
      const reqTxtPath = path.join(projectRoot, 'requirements.txt');
      if (fs.existsSync(reqTxtPath)) {
        try {
          reqsText = fs.readFileSync(reqTxtPath, 'utf8').toLowerCase();
        } catch {}
      }

      if (dependencies['prisma'] || dependencies['@prisma/client']) {
        orm = 'Prisma';
        migrationCommand = 'npx prisma migrate deploy';
      } else if (dependencies['drizzle-orm'] || dependencies['drizzle-kit']) {
        orm = 'Drizzle';
        migrationCommand = 'npx drizzle-kit migrate';
      } else if (dependencies['typeorm']) {
        orm = 'TypeORM';
        migrationCommand = 'npx typeorm migration:run';
      } else if (dependencies['sequelize'] || dependencies['sequelize-cli']) {
        orm = 'Sequelize';
        migrationCommand = 'npx sequelize-cli db:migrate';
      } else if (dependencies['knex']) {
        orm = 'Knex';
        migrationCommand = 'npx knex migrate:latest';
      } else if (reqsText.includes('sqlalchemy') || reqsText.includes('alembic')) {
        orm = 'SQLAlchemy (Alembic)';
        migrationCommand = 'alembic upgrade head';
      } else if (reqsText.includes('django')) {
        orm = 'Django ORM';
        migrationCommand = 'python manage.py migrate';
      }

      // 4. Generate Secrets
      const generateSecret = () => crypto.randomBytes(32).toString('hex');
      const generatedSecrets: Record<string, string> = {};
      const secretKeysToGenerate = ['JWT_SECRET', 'SESSION_SECRET', 'COOKIE_SECRET', 'ENCRYPTION_KEY'];

      for (const key of Object.keys(originalEnvVars)) {
        const val = originalEnvVars[key];
        const isPlaceholder = !val || val.includes('your-') || val.includes('placeholder') || val.includes('<') || val === 'secret' || val === 'password';
        if (isPlaceholder) {
          if (key.endsWith('_SECRET') || key.endsWith('_KEY') || key.endsWith('_PASSWORD') || key.endsWith('_TOKEN') || secretKeysToGenerate.includes(key)) {
            generatedSecrets[key] = generateSecret();
          }
        }
      }

      for (const key of secretKeysToGenerate) {
        if (!originalEnvVars[key] && !generatedSecrets[key]) {
          generatedSecrets[key] = generateSecret();
        }
      }

      const postgresPassword = generateSecret();

      // 5. Generate Environment Files in .mysystem/env/
      const mysystemDir = path.join(projectRoot, '.mysystem');
      const envDir = path.join(mysystemDir, 'env');
      fs.mkdirSync(envDir, { recursive: true });

      const envTypes = ['production', 'staging', 'development'];
      for (const envType of envTypes) {
        let envContent = `# Synthesized production runtime environment - ${envType.toUpperCase()}\n`;
        envContent += `# Generated automatically by MySystem Environment Synthesis Engine\n\n`;

        // PORT
        envContent += `PORT=${characteristics.port}\n`;

        // Database URL synthesis
        if (useDockerPostgres) {
          envContent += `POSTGRES_USER=app\n`;
          envContent += `POSTGRES_DB=appdb\n`;
          envContent += `POSTGRES_PASSWORD=${postgresPassword}\n`;
          envContent += `DATABASE_URL=postgresql://app:${postgresPassword}@postgres:5432/appdb\n`;
        } else if (isExternalDb) {
          envContent += `DATABASE_URL=${detectedExternalDbUrl}\n`;
        }

        // Add original variables and map generated secrets
        for (const key of Object.keys(originalEnvVars)) {
          if (['PORT', 'DATABASE_URL', 'DATABASE_URI', 'POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD'].includes(key)) {
            continue; // already handled
          }

          if (generatedSecrets[key]) {
            envContent += `${key}=${generatedSecrets[key]}\n`;
          } else {
            envContent += `${key}=${originalEnvVars[key]}\n`;
          }
        }

        fs.writeFileSync(path.join(envDir, `${envType}.env`), envContent, 'utf8');
      }

      // 6. Generate Docker Compose File (docker-compose.yml)
      let dockerCompose = `version: '3.8'

networks:
  mysystem-net:
    driver: bridge

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "\${PORT:-${characteristics.port}}:${characteristics.port}"
    env_file:
      - .mysystem/env/production.env
    restart: always
    networks:
      - mysystem-net
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '0.50'
          memory: 512M
`;

      if (useDockerPostgres) {
        // Add dependency to app service
        if (migrationCommand) {
          dockerCompose = dockerCompose.replace('restart: always', `restart: always
    depends_on:
      postgres:
        condition: service_healthy
      migration:
        condition: service_completed_successfully`);
        } else {
          dockerCompose = dockerCompose.replace('restart: always', `restart: always
    depends_on:
      postgres:
        condition: service_healthy`);
        }

        // Add Postgres service
        dockerCompose += `
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_DB: appdb
      POSTGRES_PASSWORD: "${postgresPassword}"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - mysystem-net
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d appdb"]
      interval: 5s
      timeout: 5s
      retries: 5
`;

        // Add Migration service
        if (migrationCommand) {
          dockerCompose += `
  migration:
    build:
      context: .
      dockerfile: Dockerfile
    command: ${migrationCommand}
    env_file:
      - .mysystem/env/production.env
    networks:
      - mysystem-net
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure
`;
        }

        // Add Volumes
        dockerCompose += `
volumes:
  postgres_data:
`;
      }

      fs.writeFileSync(path.join(projectRoot, 'docker-compose.yml'), dockerCompose, 'utf8');
      console.log('   ✅ docker-compose.yml generated in project root.');

      // 7. Generate Backup and Restore configuration
      const scriptsDir = path.join(mysystemDir, 'scripts');
      const docsDir = path.join(mysystemDir, 'docs');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });

      // Backup script
      const backupScript = `#!/bin/bash
# MySystem Database Backup Script
# Automatically dumps postgreSQL container database to named volume /backups

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./.mysystem/backups"
mkdir -p $BACKUP_DIR

echo "Starting database backup at $TIMESTAMP..."
docker exec -t $(docker ps -q -f name=postgres) pg_dump -U app -d appdb -F c -b -v -f "/var/lib/postgresql/data/db_backup_$TIMESTAMP.dump"

# Move file from postgres docker volume to backup directory
docker cp $(docker ps -q -f name=postgres):/var/lib/postgresql/data/db_backup_$TIMESTAMP.dump $BACKUP_DIR/
docker exec $(docker ps -q -f name=postgres) rm -f /var/lib/postgresql/data/db_backup_$TIMESTAMP.dump

echo "Backup completed: $BACKUP_DIR/db_backup_$TIMESTAMP.dump"

# Retention Policy: Keep last 7 days of backups
find $BACKUP_DIR -type f -name "db_backup_*.dump" -mtime +7 -delete
echo "Retention cleanup finished."
`;
      fs.writeFileSync(path.join(scriptsDir, 'backup.sh'), backupScript, 'utf8');
      // Set exec permissions
      try {
        fs.chmodSync(path.join(scriptsDir, 'backup.sh'), '755');
      } catch {}

      // Restore guide
      const restoreDoc = `# MySystem PostgreSQL Disaster Recovery & Restore Guide

This document details how to restore a database backup in your production Docker PostgreSQL runtime environment.

## Restoring a Backup

Follow these steps to restore a database dump:

1. Locate the backup dump file in your backups directory:
   \`\`\`bash
   ls .mysystem/backups/
   # Example: db_backup_20260627_120000.dump
   \`\`\`

2. Copy the backup file into the postgres container:
   \`\`\`bash
   docker cp .mysystem/backups/db_backup_20260627_120000.dump $(docker ps -q -f name=postgres):/var/lib/postgresql/data/restore.dump
   \`\`\`

3. Execute pg_restore inside the container to drop, clean, and restore the schema and data:
   \`\`\`bash
   docker exec -it $(docker ps -q -f name=postgres) pg_restore -U app -d appdb --clean --no-owner /var/lib/postgresql/data/restore.dump
   \`\`\`

4. Remove the temporary restore dump from the container:
   \`\`\`bash
   docker exec $(docker ps -q -f name=postgres) rm -f /var/lib/postgresql/data/restore.dump
   \`\`\`

---
*Generated by MySystem Environment Synthesis Engine.*
`;
      fs.writeFileSync(path.join(docsDir, 'restore.md'), restoreDoc, 'utf8');
      console.log('   ✅ Database backup scripts and restore documentation generated in .mysystem/');

      return true;
    } catch (err) {
      console.error('Failed to run environment synthesis:', err);
      return false;
    }
  }
};
