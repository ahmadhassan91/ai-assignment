#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'node:path';
import { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import { BuildAgent } from '../agents/buildAgent.js';
import { TestAgent } from '../agents/testAgent.js';
import { ReleaseAgent } from '../agents/releaseAgent.js';
import { QaAgent } from '../agents/qaAgent.js';
import { EmailClient } from '../email/client.js';

async function main() {
  process.env.AGENT_COMMAND = 'mock';
  process.env.EMAIL_HOST = 'mock';

  const runsDir = path.resolve(process.cwd(), 'runs');
  const requirementsPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), 'fixtures', 'requirements.todo.md');
  const requirements = await fs.readFile(requirementsPath, 'utf8');
  const jiraClient = new MockJiraClient(requirements);
  const config = {
    runsDir,
    agentCommand: 'mock',
    jira: {
      transitions: {
        inProgress: 'In Progress',
        done: 'Done',
        bugReported: 'Bug Reported',
      },
    },
    github: {
      repo: 'mock/zero-human-touch-pipeline',
    },
  };

  const orchestrator = new PipelineOrchestrator({
    jiraClient,
    buildAgent: new BuildAgent(config),
    testAgent: new TestAgent(config),
    releaseAgent: new ReleaseAgent(config),
    qaAgent: new QaAgent(config),
    emailClient: new EmailClient({
      host: 'mock',
      port: 587,
      user: 'mock',
      pass: 'mock',
      from: 'qa@example.com',
      to: 'manager@example.com',
    }),
    config,
  });

  await orchestrator.processReadyIssues();
  console.log(`Mock pipeline complete. Artifacts: ${path.join(runsDir, 'AI-MOCK-1')}`);
  console.log(`Final Jira transition: ${jiraClient.transitions.at(-1)}`);
}

class MockJiraClient {
  constructor(requirements) {
    this.requirements = requirements;
    this.comments = [];
    this.transitions = [];
    this.issue = {
      key: 'AI-MOCK-1',
      id: '10001',
      fields: {
        summary: 'Simple Todo App',
        attachment: [{ filename: 'requirements.md', content: 'mock://requirements' }],
      },
    };
  }

  async findReadyIssues() {
    return [this.issue];
  }

  async downloadRequirements() {
    return this.requirements;
  }

  async transitionIssue(_issueKey, transitionName) {
    this.transitions.push(transitionName);
  }

  async addComment(_issueKey, body) {
    this.comments.push(body);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
