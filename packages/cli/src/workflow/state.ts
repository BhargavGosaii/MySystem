import { ProjectCharacteristics } from '../inspectors';
import { EngineeringFinding } from '../services/review';
import { ExecutionPlan } from '../planner/planner';

export type WorkflowState = 
  | 'IDLE' 
  | 'INSPECTING' 
  | 'REVIEWING' 
  | 'FIXING' 
  | 'DECIDING' 
  | 'PLANNING' 
  | 'PREPARING_ASSETS' 
  | 'DEPLOYING' 
  | 'VERIFYING' 
  | 'ROLLING_BACK'
  | 'COMPLETED' 
  | 'FAILED';

export interface WorkflowContext {
  currentState: WorkflowState;
  projectRoot: string;
  projectName: string;
  awsRegion: string;
  maxBudget: number;
  needsDatabase?: boolean;
  characteristics?: ProjectCharacteristics;
  findings: EngineeringFinding[];
  plan?: ExecutionPlan;
}

export function createInitialContext(projectRoot: string): WorkflowContext {
  return {
    currentState: 'IDLE',
    projectRoot,
    projectName: 'mysystem-app',
    awsRegion: 'us-east-1',
    maxBudget: 50.00,
    findings: []
  };
}
