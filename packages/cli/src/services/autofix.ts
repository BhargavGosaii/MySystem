import * as fs from 'fs';
import * as path from 'path';
import { ProjectCharacteristics } from '../inspectors';
import { EngineeringFinding } from './review';

export interface AutoFixService {
  fix(finding: EngineeringFinding, characteristics: ProjectCharacteristics, projectRoot: string): Promise<boolean>;
}

export const autoFixService: AutoFixService = {
  async fix(finding: EngineeringFinding, characteristics: ProjectCharacteristics, projectRoot: string): Promise<boolean> {
    try {
      // Find templates directory
      let templatesDir = '';
      const pathsToCheck = [
        path.join(__dirname, '../../templates'),
        path.join(__dirname, '../../../templates'),
        path.join(__dirname, '../../../../templates'),
      ];
      for (const p of pathsToCheck) {
        if (fs.existsSync(p)) {
          templatesDir = p;
          break;
        }
      }

      if (finding.id === 'arch-missing-dockerfile') {
        if (!templatesDir) return false;
        let dockerfileTemplate = 'node.Dockerfile';
        if (characteristics.framework === 'nextjs') dockerfileTemplate = 'nextjs.Dockerfile';
        else if (characteristics.framework === 'react-vite') dockerfileTemplate = 'react.Dockerfile';
        else if (characteristics.framework === 'fastapi') dockerfileTemplate = 'fastapi.Dockerfile';

        const srcDockerfile = path.join(templatesDir, 'docker', dockerfileTemplate);
        const destDockerfile = path.join(projectRoot, 'Dockerfile');
        if (fs.existsSync(srcDockerfile)) {
          fs.copyFileSync(srcDockerfile, destDockerfile);
          return true;
        }
      }

      if (finding.id === 'arch-missing-workflow') {
        if (!templatesDir) return false;
        const githubWorkflowDir = path.join(projectRoot, '.github', 'workflows');
        fs.mkdirSync(githubWorkflowDir, { recursive: true });
        
        // Copy standard workflows
        const srcDeployWorkflow = path.join(templatesDir, 'github', 'deploy.yml');
        const destDeployWorkflow = path.join(githubWorkflowDir, 'mysystem-deploy.yml');
        if (fs.existsSync(srcDeployWorkflow)) {
          fs.copyFileSync(srcDeployWorkflow, destDeployWorkflow);
        }

        const srcDestroyWorkflow = path.join(templatesDir, 'github', 'destroy.yml');
        const destDestroyWorkflow = path.join(githubWorkflowDir, 'mysystem-destroy.yml');
        if (fs.existsSync(srcDestroyWorkflow)) {
          fs.copyFileSync(srcDestroyWorkflow, destDestroyWorkflow);
        }
        return true;
      }

      if (finding.id === 'obs-missing-healthcheck') {
        // Expose route GET /health
        if (characteristics.framework === 'nextjs') {
          // Check if App Router is used (has app folder or src/app folder)
          const hasSrcApp = fs.existsSync(path.join(projectRoot, 'src', 'app'));
          const hasApp = fs.existsSync(path.join(projectRoot, 'app'));
          
          let healthDir = '';
          if (hasSrcApp) {
            healthDir = path.join(projectRoot, 'src', 'app', 'health');
          } else if (hasApp) {
            healthDir = path.join(projectRoot, 'app', 'health');
          } else {
            // Check if Pages Router is used
            const hasSrcPages = fs.existsSync(path.join(projectRoot, 'src', 'pages'));
            const hasPages = fs.existsSync(path.join(projectRoot, 'pages'));
            if (hasSrcPages) {
              healthDir = path.join(projectRoot, 'src', 'pages', 'api');
            } else if (hasPages) {
              healthDir = path.join(projectRoot, 'pages', 'api');
            } else {
              // Fallback: create app/health
              healthDir = path.join(projectRoot, 'app', 'health');
            }
          }

          fs.mkdirSync(healthDir, { recursive: true });

          const isAppRouter = !healthDir.endsWith('api');
          if (isAppRouter) {
            const code = `import { NextResponse } from 'next/server';\n\nexport async function GET() {\n  return NextResponse.json({ status: 'healthy' });\n}\n`;
            fs.writeFileSync(path.join(healthDir, 'route.ts'), code, 'utf8');
          } else {
            const code = `import type { NextApiRequest, NextApiResponse } from 'next';\n\nexport default function handler(req: NextApiRequest, res: NextApiResponse) {\n  res.status(200).json({ status: 'healthy' });\n}\n`;
            fs.writeFileSync(path.join(healthDir, 'health.ts'), code, 'utf8');
          }
          return true;
        } else {
          // Generic Node application fallback
          const healthFile = path.join(projectRoot, 'health-check.js');
          const code = `module.exports = function(req, res) {\n  res.writeHead(200, { 'Content-Type': 'application/json' });\n  res.end(JSON.stringify({ status: 'healthy' }));\n};\n`;
          fs.writeFileSync(healthFile, code, 'utf8');
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }
};
