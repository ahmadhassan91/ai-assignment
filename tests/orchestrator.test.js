import { describe, expect, test } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { PipelineOrchestrator } from '../src/pipeline/orchestrator.js';

describe('PipelineOrchestrator', () => {
  test('closes a successful issue with Done after all stages complete', async () => {
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-orchestrator-'));
    const jiraClient = new FakeJiraClient();
    const orchestrator = new PipelineOrchestrator({
      jiraClient,
      buildAgent: { build: async (ctx) => fs.outputFile(path.join(ctx.appDir, 'index.html'), '<h1>ok</h1>') },
      testAgent: { runUntilPassing: async () => ({ passed: true, attempts: 1 }) },
      releaseAgent: { release: async () => ({ prUrl: 'https://github.test/pr/1', deploymentUrl: 'https://app.test' }) },
      qaAgent: { run: async () => ({ overallStatus: 'PASS', summary: 'All good.', screenshots: [] }) },
      emailClient: { sendQaReport: async () => ({ accepted: ['qa@example.com'] }) },
      config: makeConfig(runsDir),
    });

    const count = await orchestrator.processReadyIssues();

    expect(count).toBe(1);
    expect(jiraClient.transitions).toEqual(['In Progress', 'Done']);
    expect(jiraClient.comments.at(-1)).toContain('Deployment URL: https://app.test');

    const stageResults = await fs.readJson(path.join(runsDir, 'AI-1', 'stage-results.json'));
    expect(stageResults.failedStage).toBeNull();
    expect(stageResults.stages.map((stage) => stage.name)).toEqual([
      'intake',
      'transition in progress',
      'build',
      'tests',
      'release',
      'qa',
      'email',
      'jira closeout',
    ]);
    expect(stageResults.stages.every((stage) => stage.status === 'completed')).toBe(true);
    expect(stageResults.stages.every((stage) => stage.startedAt && stage.completedAt)).toBe(true);
  });

  test('moves issue to Bug Reported when a stage throws', async () => {
    const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-orchestrator-'));
    const jiraClient = new FakeJiraClient();
    const orchestrator = new PipelineOrchestrator({
      jiraClient,
      buildAgent: { build: async () => { throw new Error('build exploded'); } },
      testAgent: { runUntilPassing: async () => ({ passed: true }) },
      releaseAgent: { release: async () => ({}) },
      qaAgent: { run: async () => ({}) },
      emailClient: { sendQaReport: async () => ({}) },
      config: makeConfig(runsDir),
    });

    await orchestrator.processReadyIssues();

    expect(jiraClient.transitions).toEqual(['In Progress', 'Bug Reported']);
    expect(jiraClient.comments.at(-1)).toContain('build exploded');
    expect(jiraClient.comments.at(-1)).toContain('Failed stage: build');

    const stageResults = await fs.readJson(path.join(runsDir, 'AI-1', 'stage-results.json'));
    expect(stageResults.failedStage).toBe('build');
    expect(stageResults.stages.find((stage) => stage.name === 'build')).toMatchObject({
      name: 'build',
      status: 'failed',
    });
  });
});

class FakeJiraClient {
  constructor() {
    this.transitions = [];
    this.comments = [];
    this.issue = {
      key: 'AI-1',
      id: '1',
      fields: {
        summary: 'Todo app',
        attachment: [{ filename: 'requirements.md', content: 'mock://requirements' }],
      },
    };
  }

  async findReadyIssues() {
    return [this.issue];
  }

  async downloadRequirements() {
    return '# Requirements\n\n## Acceptance criteria\n- It works';
  }

  async transitionIssue(_key, transition) {
    this.transitions.push(transition);
  }

  async addComment(_key, body) {
    this.comments.push(body);
  }
}

function makeConfig(runsDir) {
  return {
    runsDir,
    jira: {
      transitions: {
        inProgress: 'In Progress',
        done: 'Done',
        bugReported: 'Bug Reported',
      },
    },
  };
}
