import fs from 'fs-extra';
import path from 'node:path';
import { runCommand } from '../utils/shell.js';

export class TestAgent {
  constructor(config = {}) {
    this.config = config;
    this.retryLimit = config.retryLimit ?? 3;
  }

  async runUntilPassing(ctx) {
    await fs.ensureDir(ctx.appDir);
    await fs.ensureDir(path.dirname(ctx.testResultsPath));

    if (isMockCommand(this.config)) {
      await writeMockSmokeTest(ctx);
      await fs.writeFile(ctx.testResultsPath, 'PASS\n');
      return { passed: true, attempts: 1 };
    }

    const { command, args } = parseAgentCommand(this.config.agentCommand);
    const outputs = [];

    for (let attempt = 1; attempt <= this.retryLimit; attempt += 1) {
      const prompt = [
        'You are the TestAgent in a zero-human-touch app delivery pipeline.',
        'Generate and run meaningful tests for the deployable app in the current directory.',
        'If tests fail, fix the app or tests as needed and run them again.',
        '',
        `Attempt: ${attempt} of ${this.retryLimit}`,
        `Requirements path: ${ctx.requirementsPath}`,
        `App directory: ${ctx.appDir}`,
        `Test results path: ${ctx.testResultsPath}`,
        'Write the final test report to test-results.txt at the test results path before exiting.',
      ].join('\n');
      const { command: expandedCommand, args: expandedArgs } = expandAgentCommand({ command, args }, {
        prompt,
        appDir: ctx.appDir,
        requirementsPath: ctx.requirementsPath,
        runDir: ctx.runDir,
      });
      const result = await runCommand(expandedCommand, expandedArgs, { cwd: ctx.appDir });
      outputs.push(formatAttempt(attempt, result));
      await writeFallbackResults(ctx.testResultsPath, outputs);

      if (result.code === 0) {
        const existingResults = await readResultsIfPresent(ctx.testResultsPath);
        if (!existingResults.includes('PASS')) {
          await fs.appendFile(ctx.testResultsPath, '\n\nPASS\n');
        }
        return { passed: true, attempts: attempt };
      }
    }

    const combinedOutput = outputs.join('\n\n');
    throw new Error(`TestAgent failed after ${this.retryLimit} attempts.\n\n${combinedOutput}`);
  }
}

function isMockCommand(config) {
  return process.env.AGENT_COMMAND === 'mock' || config.agentCommand === 'mock';
}

function parseAgentCommand(agentCommand) {
  if (!agentCommand) {
    throw new Error('TestAgent requires config.agentCommand for real mode.');
  }

  const parts = splitCommand(agentCommand);
  if (parts.length === 0) {
    throw new Error('TestAgent received an empty agent command.');
  }

  const [command, ...args] = parts;
  return { command, args };
}

function splitCommand(commandLine) {
  const matches = commandLine.matchAll(/"([^"]*)"|'([^']*)'|[^\s]+/g);
  return [...matches].map((match) => match[1] ?? match[2] ?? match[0]);
}

function expandAgentCommand(parsedCommand, values) {
  const hasPromptToken = commandHasToken(parsedCommand, 'prompt');
  const expanded = {
    command: expandTemplate(parsedCommand.command, values),
    args: parsedCommand.args.map((arg) => expandTemplate(arg, values)),
  };

  if (!hasPromptToken) {
    expanded.args.push(values.prompt);
  }

  return expanded;
}

function commandHasToken(parsedCommand, token) {
  const needle = `{${token}}`;
  return parsedCommand.command.includes(needle) || parsedCommand.args.some((arg) => arg.includes(needle));
}

function expandTemplate(value, values) {
  return value.replaceAll('{prompt}', values.prompt)
    .replaceAll('{appDir}', values.appDir)
    .replaceAll('{requirementsPath}', values.requirementsPath)
    .replaceAll('{runDir}', values.runDir);
}

function formatAttempt(attempt, result) {
  return [
    `Attempt ${attempt}`,
    `Exit code: ${result.code}`,
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : '',
  ].filter(Boolean).join('\n');
}

async function writeFallbackResults(testResultsPath, outputs) {
  const existingResults = await readResultsIfPresent(testResultsPath);
  if (existingResults.trim() && !existingResults.startsWith('Attempt ')) {
    return;
  }

  await fs.writeFile(testResultsPath, outputs.join('\n\n'));
}

async function readResultsIfPresent(testResultsPath) {
  if (!(await fs.pathExists(testResultsPath))) {
    return '';
  }

  return fs.readFile(testResultsPath, 'utf8');
}

async function writeMockSmokeTest(ctx) {
  const testsDir = path.join(ctx.appDir, 'tests');
  await fs.ensureDir(testsDir);
const smokeTest = `import { describe, expect, test } from 'vitest';
import fs from 'fs-extra';

describe('mock todo app smoke test', () => {
  test('index.html is deployable and contains todo behavior', async () => {
    const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Todo');
    expect(html).toContain('localStorage');
  });
});
`;

  await fs.writeFile(path.join(testsDir, 'smoke.test.js'), smokeTest);
}
