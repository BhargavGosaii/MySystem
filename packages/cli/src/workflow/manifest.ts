import * as fs from 'fs';
import * as path from 'path';

export interface ProjectManifest {
  version: number;
  framework: string;
  provider: string;
  deployment: 'ec2' | 'ecs-fargate';
  lastReview: string;
  lastDeployment?: string;
  workflowVersion: number;
  deploymentType: 'production' | 'hobbyist';
  awsRegion: string;
  healthStatus: string;
  currentInfrastructure: {
    hosting: 'ec2' | 'ecs-fargate';
    database: 'postgresql' | 'none';
    redis: boolean;
    pgBouncer: boolean;
    waf: boolean;
  };
  manifestVersion?: string;
}

export function readManifest(projectRoot: string): ProjectManifest | null {
  try {
    const manifestPath = path.join(projectRoot, '.mysystem', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      return JSON.parse(content) as ProjectManifest;
    }
  } catch {}
  return null;
}

export function writeManifest(projectRoot: string, manifest: ProjectManifest): void {
  try {
    const dir = path.join(projectRoot, '.mysystem');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  } catch {}
}

export function writeReviewHistory(projectRoot: string, reviewSession: any): void {
  try {
    const dir = path.join(projectRoot, '.mysystem', 'history');
    fs.mkdirSync(dir, { recursive: true });
    const historyFile = path.join(dir, 'review.json');
    let history: any[] = [];
    if (fs.existsSync(historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      } catch {}
    }
    history.push(reviewSession);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
  } catch {}
}

export function writeDeploymentHistory(projectRoot: string, deploymentSession: any): void {
  try {
    const dir = path.join(projectRoot, '.mysystem', 'history');
    fs.mkdirSync(dir, { recursive: true });
    const historyFile = path.join(dir, 'deployment.json');
    let history: any[] = [];
    if (fs.existsSync(historyFile)) {
      try {
        history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      } catch {}
    }
    history.push(deploymentSession);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
  } catch {}
}
