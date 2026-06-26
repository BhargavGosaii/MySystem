import { WorkflowEngine } from '../workflow/engine';

export async function runInit(projectRoot: string) {
  console.log('\n\x1b[1m⚡ Starting MySystem Autonomous AI Production Engineer...\x1b[0m');
  const engine = new WorkflowEngine(projectRoot);
  const success = await engine.run();
  if (!success) {
    console.log('\n\x1b[31m❌ AI Production Engineer workflow failed or was aborted.\x1b[0m\n');
    process.exit(1);
  }
}
