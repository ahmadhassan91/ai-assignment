#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'node:path';
import { QaAgent } from '../agents/qaAgent.js';

async function main() {
  const [, , deploymentUrl, runDirArg] = process.argv;

  if (!deploymentUrl) {
    console.error('Usage: node src/cli/runQa.js <deployment-url> [run-dir]');
    process.exitCode = 1;
    return;
  }

  const runDir = path.resolve(runDirArg || path.join(process.cwd(), 'runs', `manual-qa-${Date.now()}`));
  const ctx = {
    runDir,
    requirementsPath: path.join(runDir, 'requirements.md'),
    screenshotsDir: path.join(runDir, 'screenshots'),
    bugReportPath: path.join(runDir, 'bug-report.md'),
  };

  await fs.ensureDir(ctx.screenshotsDir);
  if (!(await fs.pathExists(ctx.requirementsPath))) {
    await fs.writeFile(ctx.requirementsPath, '# Requirements\n\n- Smoke test deployed page\n');
  }

  const result = await new QaAgent().run(ctx, deploymentUrl);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
