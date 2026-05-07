import cron from 'node-cron';
import { getConfig } from './config.js';
import { PipelineOrchestrator } from './pipeline/orchestrator.js';
import { JiraClient } from './jira/client.js';
import { BuildAgent } from './agents/buildAgent.js';
import { TestAgent } from './agents/testAgent.js';
import { ReleaseAgent } from './agents/releaseAgent.js';
import { QaAgent } from './agents/qaAgent.js';
import { EmailClient } from './email/client.js';

async function main() {
  const config = getConfig();
  const orchestrator = new PipelineOrchestrator({
    jiraClient: new JiraClient(config.jira),
    buildAgent: new BuildAgent(config),
    testAgent: new TestAgent(config),
    releaseAgent: new ReleaseAgent(config),
    qaAgent: new QaAgent(config),
    emailClient: new EmailClient(config.email),
    config,
  });

  if (process.argv.includes('--once')) {
    const count = await orchestrator.processReadyIssues();
    console.log(`Processed ${count} ready issue(s).`);
    return;
  }

  console.log(`Starting cron pipeline: ${config.cron}`);
  cron.schedule(config.cron, async () => {
    try {
      const count = await orchestrator.processReadyIssues();
      console.log(`[${new Date().toISOString()}] Processed ${count} ready issue(s).`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Poll failed`, error);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
