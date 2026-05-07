import { describe, expect, test } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { createRunContext, appendLog, recordStageCompleted, recordStageStarted } from '../src/utils/runContext.js';

describe('run context', () => {
  test('creates isolated issue artifact paths and log file', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-run-'));
    const ctx = await createRunContext(tmp, { key: 'AI-123', fields: { summary: 'Todo app' } });

    await fs.writeFile(ctx.requirementsPath, '# Requirements');
    await appendLog(ctx, 'hello');

    expect(await fs.pathExists(ctx.runDir)).toBe(true);
    expect(await fs.pathExists(ctx.screenshotsDir)).toBe(true);
    expect(await fs.readJson(ctx.stageResultsPath)).toEqual({ failedStage: null, stages: [] });
    expect(await fs.readFile(ctx.requirementsPath, 'utf8')).toContain('Requirements');
    expect(await fs.readFile(ctx.logsPath, 'utf8')).toContain('hello');
  });

  test('records stage status timestamps', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-run-'));
    const ctx = await createRunContext(tmp, { key: 'AI-123', fields: { summary: 'Todo app' } });

    await recordStageStarted(ctx, 'build');
    await recordStageCompleted(ctx, 'build');

    const results = await fs.readJson(ctx.stageResultsPath);
    expect(results.failedStage).toBeNull();
    expect(results.stages).toHaveLength(1);
    expect(results.stages[0]).toMatchObject({ name: 'build', status: 'completed' });
    expect(results.stages[0].startedAt).toBeTruthy();
    expect(results.stages[0].completedAt).toBeTruthy();
  });
});
