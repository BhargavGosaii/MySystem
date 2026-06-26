import * as fs from 'fs';
import * as path from 'path';

export interface VerificationService {
  verify(projectRoot: string): Promise<{ success: boolean; errors: string[] }>;
}

export const verificationService: VerificationService = {
  async verify(projectRoot: string): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    const dockerfile = path.join(projectRoot, 'Dockerfile');
    if (!fs.existsSync(dockerfile)) {
      errors.push('Verification Fail: Dockerfile was not successfully generated.');
    }

    const configJson = path.join(projectRoot, 'mysystem.json');
    if (!fs.existsSync(configJson)) {
      errors.push('Verification Fail: mysystem.json metadata config was not generated.');
    }

    const deployWorkflow = path.join(projectRoot, '.github', 'workflows', 'mysystem-deploy.yml');
    if (!fs.existsSync(deployWorkflow)) {
      errors.push('Verification Fail: GitHub Actions deployment workflow is missing.');
    }

    const terraformDir = path.join(projectRoot, 'terraform');
    if (!fs.existsSync(terraformDir) || fs.readdirSync(terraformDir).filter(f => f.endsWith('.tf')).length === 0) {
      errors.push('Verification Fail: Terraform modules are missing or empty.');
    }

    return {
      success: errors.length === 0,
      errors
    };
  }
};
