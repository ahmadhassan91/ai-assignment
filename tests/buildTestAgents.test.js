import { describe, expect, test } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { BuildAgent } from '../src/agents/buildAgent.js';
import { TestAgent } from '../src/agents/testAgent.js';

async function makeCtx() {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'build-test-agents-'));
  const ctx = {
    runDir,
    requirementsPath: path.join(runDir, 'requirements.md'),
    appDir: path.join(runDir, 'app'),
    testResultsPath: path.join(runDir, 'test-results.txt'),
  };
  await fs.writeFile(ctx.requirementsPath, '# Todo app\n\nBuild a local todo list.');
  return ctx;
}

describe('BuildAgent and TestAgent', () => {
  test('mock BuildAgent creates a deployable single-file todo app', async () => {
    const ctx = await makeCtx();
    const agent = new BuildAgent({ agentCommand: 'mock' });

    await agent.build(ctx);

    const indexHtml = await fs.readFile(path.join(ctx.appDir, 'index.html'), 'utf8');
    const summary = await fs.readFile(path.join(ctx.appDir, 'build-summary.md'), 'utf8');
    expect(indexHtml).toContain('<!doctype html>');
    expect(indexHtml).toContain('Todo');
    expect(indexHtml).toContain('localStorage');
    expect(summary).toContain('Mock build complete');
  });

  test('mock TestAgent writes a smoke test and PASS result', async () => {
    const ctx = await makeCtx();
    await new BuildAgent({ agentCommand: 'mock' }).build(ctx);
    const agent = new TestAgent({ agentCommand: 'mock' });

    const result = await agent.runUntilPassing(ctx);

    const smokeTest = await fs.readFile(path.join(ctx.appDir, 'tests', 'smoke.test.js'), 'utf8');
    expect(result).toEqual({ passed: true, attempts: 1 });
    expect(smokeTest).toContain('index.html');
    expect(await fs.readFile(ctx.testResultsPath, 'utf8')).toBe('PASS\n');
  });

  test('BuildAgent throws a descriptive error when the real command fails', async () => {
    const ctx = await makeCtx();
    const failingScript = path.join(ctx.runDir, 'fail-build.js');
    await fs.writeFile(
      failingScript,
      "console.error('build exploded'); process.exit(7);\n",
    );
    const agent = new BuildAgent({ agentCommand: `node ${failingScript}` });

    await expect(agent.build(ctx)).rejects.toThrow(
      /BuildAgent command failed with exit code 7[\s\S]*build exploded/,
    );
  });

  test('BuildAgent expands real command templates and copies requirements into the app cwd', async () => {
    const ctx = await makeCtx();
    const script = path.join(ctx.runDir, 'template-build.js');
    await fs.writeFile(
      script,
      [
        "import fs from 'node:fs/promises';",
        "import path from 'node:path';",
        'const [prompt, appDir, requirementsPath, runDir, unexpected] = process.argv.slice(2);',
        "if (unexpected) throw new Error('prompt was appended despite {prompt} template');",
        "if (!prompt.includes('BuildAgent')) throw new Error('missing build prompt');",
        "if (await fs.realpath(appDir) !== await fs.realpath(process.cwd())) throw new Error('appDir token did not match cwd');",
        "if (!requirementsPath.endsWith('requirements.md')) throw new Error('requirementsPath token missing');",
        "if (runDir !== path.dirname(requirementsPath)) throw new Error('runDir token missing');",
        "await fs.access(path.join(process.cwd(), 'requirements.md'));",
        "await fs.writeFile(path.join(process.cwd(), 'index.html'), '<!doctype html><h1>ok</h1>');",
        "await fs.writeFile(path.join(process.cwd(), 'template-args.json'), JSON.stringify({ prompt, appDir, requirementsPath, runDir }));",
      ].join('\n'),
    );
    const agent = new BuildAgent({
      agentCommand: `node ${script} "{prompt}" "{appDir}" "{requirementsPath}" "{runDir}"`,
    });

    await agent.build(ctx);

    const captured = await fs.readJson(path.join(ctx.appDir, 'template-args.json'));
    expect(captured.prompt).toContain(ctx.appDir);
    expect(captured.appDir).toBe(ctx.appDir);
    expect(captured.requirementsPath).toBe(ctx.requirementsPath);
    expect(captured.runDir).toBe(ctx.runDir);
    expect(await fs.readFile(path.join(ctx.appDir, 'requirements.md'), 'utf8')).toContain('Todo app');
  });

  test('BuildAgent validates real command output contains a deployable entrypoint', async () => {
    const ctx = await makeCtx();
    const script = path.join(ctx.runDir, 'empty-build.js');
    await fs.writeFile(script, "console.log('finished without output');\n");
    const agent = new BuildAgent({ agentCommand: `node ${script}` });

    await expect(agent.build(ctx)).rejects.toThrow(
      /did not create a deployable app[\s\S]*Expected index\.html or package\.json/,
    );
  });

  test('TestAgent retries real command failures and writes combined output', async () => {
    const ctx = await makeCtx();
    await fs.ensureDir(ctx.appDir);
    const failingScript = path.join(ctx.runDir, 'fail-tests.js');
    await fs.writeFile(
      failingScript,
      "console.log('test attempt output'); console.error('tests failed'); process.exit(2);\n",
    );
    const agent = new TestAgent({ agentCommand: `node ${failingScript}`, retryLimit: 2 });

    await expect(agent.runUntilPassing(ctx)).rejects.toThrow(
      /TestAgent failed after 2 attempts/,
    );
    const results = await fs.readFile(ctx.testResultsPath, 'utf8');
    expect(results).toContain('Attempt 1');
    expect(results).toContain('Attempt 2');
    expect(results).toContain('test attempt output');
    expect(results).toContain('tests failed');
  });

  test('TestAgent expands templates and asks the real command to write test results', async () => {
    const ctx = await makeCtx();
    await fs.ensureDir(ctx.appDir);
    const script = path.join(ctx.runDir, 'template-tests.js');
    await fs.writeFile(
      script,
      [
        "import fs from 'node:fs/promises';",
        'const [prompt, appDir, requirementsPath, runDir, unexpected] = process.argv.slice(2);',
        "if (unexpected) throw new Error('prompt was appended despite {prompt} template');",
        "if (!prompt.includes('Test results path:')) throw new Error('missing test results path');",
        "if (!prompt.includes('Write the final test report')) throw new Error('missing write instruction');",
        "if (await fs.realpath(appDir) !== await fs.realpath(process.cwd())) throw new Error('appDir token did not match cwd');",
        "await fs.writeFile(prompt.match(/Test results path: (.+)/)[1], `agent wrote results\\n${requirementsPath}\\n${runDir}\\n`);",
      ].join('\n'),
    );
    const agent = new TestAgent({
      agentCommand: `node ${script} "{prompt}" "{appDir}" "{requirementsPath}" "{runDir}"`,
      retryLimit: 1,
    });

    const result = await agent.runUntilPassing(ctx);

    expect(result).toEqual({ passed: true, attempts: 1 });
    const results = await fs.readFile(ctx.testResultsPath, 'utf8');
    expect(results).toContain('agent wrote results');
    expect(results).toContain(ctx.requirementsPath);
    expect(results).toContain(ctx.runDir);
  });
});
