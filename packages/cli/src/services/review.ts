import * as path from 'path';
import { ProjectCharacteristics } from '../inspectors';
import { scanArchitecture } from './review/architecture';
import { scanSecurity } from './review/security';
import { scanDatabase } from './review/database';
import { scanObservability } from './review/observability';

export type ExecutionAction = 'AUTOFIX' | 'APPROVAL' | 'MANUAL' | 'IGNORE';

export interface EngineeringFinding {
  id: string;
  category: 'architecture' | 'security' | 'database' | 'api' | 'performance' | 'cost' | 'observability' | 'quality' | 'testing';
  title: string;
  description: string;
  action: ExecutionAction;
  evidence: string[];
  recommendation: string;
  fixed: boolean;
  blocksDeployment: boolean;
  impact?: {
    latency?: string;
    costSavings?: string;
    securityRisk?: 'Low' | 'Medium' | 'High' | 'Critical';
  };
}

export interface ReviewService {
  review(characteristics: ProjectCharacteristics, projectRoot: string): Promise<EngineeringFinding[]>;
}

export const reviewService: ReviewService = {
  async review(characteristics: ProjectCharacteristics, projectRoot: string): Promise<EngineeringFinding[]> {
    const knowledgeBaseDir = path.join(__dirname, '../knowledge');

    const arcFindings = await scanArchitecture(characteristics, projectRoot);
    const secFindings = await scanSecurity(characteristics, projectRoot, knowledgeBaseDir);
    const dbFindings = await scanDatabase(characteristics, projectRoot, knowledgeBaseDir);
    const obsFindings = await scanObservability(characteristics, projectRoot, knowledgeBaseDir);

    return [
      ...arcFindings,
      ...secFindings,
      ...dbFindings,
      ...obsFindings
    ];
  }
};
