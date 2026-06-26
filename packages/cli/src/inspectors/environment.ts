import * as fs from 'fs';
import * as path from 'path';

export interface EnvFacts {
  hasEnvFile: boolean;
  databaseUrlConfigured: boolean;
  redisUrlConfigured: boolean;
  sentryDsnConfigured: boolean;
  variables: string[];
}

export async function inspectEnvironment(projectRoot: string): Promise<EnvFacts> {
  const facts: EnvFacts = {
    hasEnvFile: false,
    databaseUrlConfigured: false,
    redisUrlConfigured: false,
    sentryDsnConfigured: false,
    variables: [],
  };

  const envFiles = ['.env', '.env.example', '.env.local', '.env.development', '.env.production'];
  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      facts.hasEnvFile = true;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        for (const line of lines) {
          const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=/);
          if (match) {
            const varName = match[1];
            if (!facts.variables.includes(varName)) {
              facts.variables.push(varName);
            }

            if (['DATABASE_URL', 'DATABASE_URI', 'MONGO_URI', 'MONGODB_URI', 'MYSQL_URL', 'DB_HOST'].includes(varName)) {
              facts.databaseUrlConfigured = true;
            }
            if (['REDIS_URL', 'REDIS_HOST', 'REDIS_URI'].includes(varName)) {
              facts.redisUrlConfigured = true;
            }
            if (varName === 'SENTRY_DSN') {
              facts.sentryDsnConfigured = true;
            }
          }
        }
      } catch {
        // Ignore file read errors
      }
    }
  }

  return facts;
}
