import { runInspectors, ProjectCharacteristics } from '../inspectors';

export interface InspectionService {
  inspect(projectRoot: string): Promise<ProjectCharacteristics>;
}

export const inspectService: InspectionService = {
  async inspect(projectRoot: string): Promise<ProjectCharacteristics> {
    return await runInspectors(projectRoot);
  }
};
