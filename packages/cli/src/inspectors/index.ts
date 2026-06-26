import { inspectFramework, FrameworkFacts } from './framework';
import { inspectPackages, PackageFacts } from './packages';
import { inspectPatterns, PatternFacts } from './patterns';
import { inspectEnvironment, EnvFacts } from './environment';

export interface ProjectCharacteristics {
  name: string;
  framework: 'nextjs' | 'react-vite' | 'node' | 'fastapi' | 'unknown';
  runtime: 'node' | 'python' | 'go' | 'unknown';
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'unknown';
  port: number;
  databaseLib: string | null;
  ormLib: string | null;
  redisLib: string | null;
  sentryLib: string | null;
  queueLib: string | null;
  hasWebsockets: boolean;
  hasFileUploads: boolean;
  hasDirectDbConnections: boolean;
  hasEnvFile: boolean;
  databaseUrlConfigured: boolean;
  redisUrlConfigured: boolean;
  sentryDsnConfigured: boolean;
  variables: string[];
}

export async function runInspectors(projectRoot: string): Promise<ProjectCharacteristics> {
  const frameworkFacts = await inspectFramework(projectRoot);
  const packageFacts = await inspectPackages(projectRoot);
  const patternFacts = await inspectPatterns(projectRoot);
  const envFacts = await inspectEnvironment(projectRoot);

  return {
    name: frameworkFacts.framework !== 'unknown' ? frameworkFacts.framework : 'mysystem-app',
    ...frameworkFacts,
    ...packageFacts,
    ...patternFacts,
    ...envFacts,
  };
}
