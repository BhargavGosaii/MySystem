import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../../inspectors';
import { EngineeringFinding } from '../review';

export async function scanArchitecture(characteristics: ProjectCharacteristics, projectRoot: string): Promise<EngineeringFinding[]> {
  const findings: EngineeringFinding[] = [];

  const dockerfilePath = path.join(projectRoot, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) {
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

  return findings;
}
