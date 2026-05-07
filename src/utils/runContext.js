import fs from 'fs-extra';
import path from 'node:path';

export async function createRunContext(runsDir, issue) {
  const runDir = path.join(runsDir, issue.key);
  await fs.ensureDir(runDir);
  await fs.ensureDir(path.join(runDir, 'screenshots'));
  await fs.writeJson(path.join(runDir, 'issue.json'), issue, { spaces: 2 });
  await fs.writeJson(path.join(runDir, 'stage-results.json'), {
    failedStage: null,
    stages: [],
  }, { spaces: 2 });

  return {
    issue,
    runDir,
    requirementsPath: path.join(runDir, 'requirements.md'),
    appDir: path.join(runDir, 'app'),
    screenshotsDir: path.join(runDir, 'screenshots'),
    logsPath: path.join(runDir, 'logs.txt'),
    stageResultsPath: path.join(runDir, 'stage-results.json'),
    testResultsPath: path.join(runDir, 'test-results.txt'),
    bugReportPath: path.join(runDir, 'bug-report.md'),
  };
}

export async function appendLog(ctx, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(ctx.logsPath, line);
}

export async function recordStageStarted(ctx, stageName) {
  await upsertStageResult(ctx, stageName, {
    status: 'started',
    startedAt: new Date().toISOString(),
  });
}

export async function recordStageCompleted(ctx, stageName) {
  await upsertStageResult(ctx, stageName, {
    status: 'completed',
    completedAt: new Date().toISOString(),
  });
}

export async function recordStageFailed(ctx, stageName, error) {
  await upsertStageResult(ctx, stageName, {
    status: 'failed',
    failedAt: new Date().toISOString(),
    error: error.message,
  }, stageName);
}

async function upsertStageResult(ctx, stageName, updates, failedStage = undefined) {
  const results = await readStageResults(ctx);
  const stage = results.stages.find((entry) => entry.name === stageName);

  if (stage) {
    Object.assign(stage, updates);
  } else {
    results.stages.push({ name: stageName, ...updates });
  }

  if (failedStage !== undefined) {
    results.failedStage = failedStage;
  }

  await fs.writeJson(ctx.stageResultsPath, results, { spaces: 2 });
}

async function readStageResults(ctx) {
  if (await fs.pathExists(ctx.stageResultsPath)) {
    return fs.readJson(ctx.stageResultsPath);
  }

  return {
    failedStage: null,
    stages: [],
  };
}
