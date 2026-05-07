import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { QaAgent } from '../src/agents/qaAgent.js';

async function makeCtx(requirements) {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-agent-'));
  const ctx = {
    runDir,
    requirementsPath: path.join(runDir, 'requirements.md'),
    screenshotsDir: path.join(runDir, 'screenshots'),
    bugReportPath: path.join(runDir, 'bug-report.md'),
  };
  await fs.ensureDir(ctx.screenshotsDir);
  await fs.writeFile(ctx.requirementsPath, requirements);
  return ctx;
}

describe('QaAgent', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('creates a deterministic PASS report in mock mode from acceptance criteria', async () => {
    vi.stubEnv('AGENT_COMMAND', 'mock');
    const ctx = await makeCtx([
      '# Todo App',
      '',
      '## Acceptance Criteria',
      '- User can add a todo item',
      '- User can mark a todo complete',
      '- User can delete a todo item',
    ].join('\n'));

    const result = await new QaAgent({}).run(ctx, 'https://example.test/app');

    expect(result).toEqual({
      overallStatus: 'PASS',
      summary: 'QA mock passed 3 acceptance criteria for https://example.test/app.',
      reportPath: ctx.bugReportPath,
      screenshots: [path.join(ctx.screenshotsDir, 'initial-page.txt')],
    });

    const report = await fs.readFile(ctx.bugReportPath, 'utf8');
    expect(report).toContain('# QA Bug Report');
    expect(report).toContain('Overall Status: PASS');
    expect(report).toContain('| PASS | User can add a todo item | Mock mode deterministic pass. |');
    expect(report).toContain('| PASS | User can mark a todo complete | Mock mode deterministic pass. |');
    expect(report).toContain('| PASS | User can delete a todo item | Mock mode deterministic pass. |');

    const placeholder = await fs.readFile(result.screenshots[0], 'utf8');
    expect(placeholder).toBe('Mock screenshot placeholder for https://example.test/app\n');
  });

  test('falls back to numbered requirement bullets when no acceptance heading exists', async () => {
    vi.stubEnv('AGENT_COMMAND', 'mock');
    const ctx = await makeCtx([
      '# Requirements',
      '',
      '1. Login form accepts email and password',
      '2. Dashboard shows account summary',
    ].join('\n'));

    await new QaAgent().run(ctx, 'https://example.test');

    const report = await fs.readFile(ctx.bugReportPath, 'utf8');
    expect(report).toContain('| PASS | Login form accepts email and password | Mock mode deterministic pass. |');
    expect(report).toContain('| PASS | Dashboard shows account summary | Mock mode deterministic pass. |');
  });
});
