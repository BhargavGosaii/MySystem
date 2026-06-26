import { runPlanner, PlannerConstraints, ExecutionPlan } from '../planner/planner';
import { runAdvisor } from '../advisor';
import { ProjectCharacteristics } from '../inspectors';

export interface PlanningService {
  plan(
    characteristics: ProjectCharacteristics,
    constraints: PlannerConstraints,
    awsRegion: string,
    domainName?: string,
    alertEmail?: string,
    sentryDsn?: string
  ): Promise<ExecutionPlan>;
}

export const planningService: PlanningService = {
  async plan(
    characteristics: ProjectCharacteristics,
    constraints: PlannerConstraints,
    awsRegion: string,
    domainName?: string,
    alertEmail?: string,
    sentryDsn?: string
  ): Promise<ExecutionPlan> {
    const review = await runAdvisor(characteristics);
    return await runPlanner(review, constraints, awsRegion, domainName, alertEmail, sentryDsn);
  }
};
