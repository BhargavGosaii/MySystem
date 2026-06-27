import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../../inspectors';
import { EngineeringFinding } from '../review';
import { scanProjectFiles, getIgnorePatterns } from '../../utils/scanner';

export async function scanArchitecture(characteristics: ProjectCharacteristics, projectRoot: string): Promise<EngineeringFinding[]> {
  const findings: EngineeringFinding[] = [];

  const dockerfilePath = path.join(projectRoot, 'Dockerfile');
  if (fs.existsSync(dockerfilePath)) {
    try {
      const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
      if (!dockerfileContent.includes('USER ')) {
        findings.push({
          id: 'arch-root-container',
          category: 'architecture',
          title: 'Docker Container Runs as Root',
          description: 'The Dockerfile does not specify a non-root USER. Running as root in production poses a container escape security risk.',
          action: 'MANUAL',
          evidence: ['Dockerfile exists but does not contain a USER instruction.'],
          recommendation: 'Add a non-root USER instruction to the Dockerfile (e.g. USER node or USER 1001) before launching commands.',
          fixed: false,
          blocksDeployment: false,
          impact: {
            securityRisk: 'Medium',
            latency: 'Decreases vulnerability radius during container security compromises.'
          }
        });
      }
    } catch {}
  } else {
    findings.push({
      id: 'arch-missing-dockerfile',
      category: 'architecture',
      title: 'Missing Production Dockerfile',
      description: 'No Dockerfile was detected in the root of the project.',
      action: 'AUTOFIX',
      evidence: ['Dockerfile does not exist in root directory.'],
      recommendation: 'Generate a multi-stage production Dockerfile matching the application runtime.',
      fixed: false,
      blocksDeployment: true,
      impact: {
        securityRisk: 'Low',
        latency: 'Required for container image build.'
      }
    });
  }

  const deployWorkflowPath = path.join(projectRoot, '.github', 'workflows', 'mysystem-deploy.yml');
  if (!fs.existsSync(deployWorkflowPath)) {
    findings.push({
      id: 'arch-missing-workflow',
      category: 'architecture',
      title: 'Missing CI/CD Workflow',
      description: 'No GitHub Actions deployment pipeline workflow was detected.',
      action: 'AUTOFIX',
      evidence: ['.github/workflows/mysystem-deploy.yml does not exist.'],
      recommendation: 'Generate GitHub Actions build and deploy workflow modules.',
      fixed: false,
      blocksDeployment: true,
      impact: {
        securityRisk: 'Low',
        latency: 'Required for automated deployments.'
      }
    });
  }

  // Graceful Shutdown check
  const ignorePatterns = getIgnorePatterns(projectRoot);
  const sourceFiles = scanProjectFiles(projectRoot, projectRoot, ignorePatterns);
  let hasGracefulShutdown = false;
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('SIGTERM') || content.includes('SIGINT')) {
        hasGracefulShutdown = true;
        break;
      }
    } catch {}
  }

  if (!hasGracefulShutdown && characteristics.framework !== 'unknown') {
    findings.push({
      id: 'reliability-graceful-shutdown',
      category: 'quality',
      title: 'No SIGTERM Graceful Shutdown Handler',
      description: 'No SIGTERM or SIGINT event listener was detected in the application source code.',
      action: 'MANUAL',
      evidence: ['Scanned code files. Did not find event listener configurations for SIGTERM or SIGINT.'],
      recommendation: 'Implement a listener for SIGTERM signals to close database connections and finish active requests before exiting.',
      fixed: false,
      blocksDeployment: false,
      impact: {
        latency: 'Reduces request drops during deployment scaling updates.'
      }
    });
  }

  return findings;
}

