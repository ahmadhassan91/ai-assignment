import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

vi.mock('../src/utils/shell.js', () => ({
  runCommand: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    get: vi.fn(),
  },
}));

const { runCommand } = await import('../src/utils/shell.js');
const axios = (await import('axios')).default;
const { ReleaseAgent } = await import('../src/agents/releaseAgent.js');

describe('ReleaseAgent', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = {
      AGENT_COMMAND: process.env.AGENT_COMMAND,
      ALLOW_EMPTY_RELEASE: process.env.ALLOW_EMPTY_RELEASE,
      VERCEL_DEPLOY_MODE: process.env.VERCEL_DEPLOY_MODE,
      VERCEL_PROD: process.env.VERCEL_PROD,
      VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test('builds a Jira-keyed feature branch from the issue summary', () => {
    const agent = new ReleaseAgent();

    const branchName = agent.makeBranchName({
      key: 'WEB-42',
      fields: { summary: 'Add Checkout Flow: Apple Pay!' },
    });

    expect(branchName).toBe('feature/WEB-42-add-checkout-flow-apple-pay');
  });

  test('builds branch descriptions with a generated-app fallback', () => {
    const agent = new ReleaseAgent();

    expect(agent.makeBranchDescription('!!!')).toBe('generated-app');
    expect(agent.formatBranchName('APP-9', 'generated-app')).toBe('feature/APP-9-generated-app');
  });

  test('parses the deployment URL from Vercel CLI output', () => {
    const agent = new ReleaseAgent();

    expect(
      agent.parseVercelCliUrl(`
        Vercel CLI 39.0.0
        Inspect: https://vercel.com/acme/widgets/abc123
        Preview: https://widgets-abc123.vercel.app
      `),
    ).toBe('https://widgets-abc123.vercel.app');
  });

  test('parses Vercel deployment id from CLI output', () => {
    const agent = new ReleaseAgent();

    expect(agent.parseVercelDeploymentId('Queued: https://api.vercel.com/v13/deployments/dpl_abc123')).toBe(
      'dpl_abc123',
    );
  });

  test('throws a clear error when Vercel CLI output has no URL', () => {
    const agent = new ReleaseAgent();

    expect(() => agent.parseVercelCliUrl('Queued deployment without a url')).toThrow(
      'Vercel CLI did not return a deployment URL.',
    );
  });

  test('parses pull request URL from GitHub CLI output', () => {
    const agent = new ReleaseAgent();

    expect(agent.parseGitHubPullRequestUrl('Created pull request: https://github.com/acme/widgets/pull/12\n')).toBe(
      'https://github.com/acme/widgets/pull/12',
    );
  });

  test('mock mode returns deterministic release links and writes a summary without shelling out', async () => {
    process.env.AGENT_COMMAND = 'mock';
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-agent-'));
    const agent = new ReleaseAgent({
      githubRepo: 'acme/widgets',
      vercelProjectId: 'prj_123',
    });

    const release = await agent.release({
      runDir,
      issue: {
        key: 'APP-7',
        fields: { summary: 'Polish Dashboard Reports' },
      },
    });

    expect(release).toEqual({
      branchName: 'feature/APP-7-polish-dashboard-reports',
      prUrl: 'https://github.com/acme/widgets/pull/mock-feature-APP-7-polish-dashboard-reports',
      deploymentUrl: 'https://mock-feature-app-7-polish-dashboard-reports.vercel.app',
    });
    expect(runCommand).not.toHaveBeenCalled();
    await expect(fs.readJson(path.join(runDir, 'release-summary.json'))).resolves.toEqual(release);
  });

  test('throws instead of committing when staged release artifacts have no changes', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-agent-'));
    const agent = new ReleaseAgent();
    runCommand.mockImplementation(async (command, args) => ({
      code: 0,
      stdout: command === 'git' && args[0] === 'status' ? '' : '',
      stderr: '',
    }));

    await expect(
      agent.release({
        runDir,
        appDir: runDir,
        issue: {
          key: 'APP-10',
          fields: { summary: 'No artifact changes' },
        },
      }),
    ).rejects.toThrow('found no changes to release');

    expect(runCommand).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['commit']),
      expect.any(Object),
    );
    expect(runCommand).not.toHaveBeenCalledWith('gh', expect.any(Array), expect.any(Object));
  });

  test('can allow an empty release while skipping commit, push, and pull request', async () => {
    process.env.ALLOW_EMPTY_RELEASE = 'true';
    process.env.VERCEL_DEPLOY_MODE = 'cli';
    process.env.VERCEL_TOKEN = 'token_123';
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-agent-'));
    const agent = new ReleaseAgent({ githubRepo: 'acme/widgets' });
    axios.get.mockResolvedValue({ status: 200 });
    runCommand.mockImplementation(async (command, args) => {
      if (command === 'git' && args[0] === 'status') {
        return { code: 0, stdout: '', stderr: '' };
      }
      if (command === 'npx' && args[0] === 'vercel') {
        if (args[1] === 'inspect') {
          return { code: 0, stdout: 'url https://empty-release.vercel.app\n', stderr: '' };
        }
        return { code: 0, stdout: 'Preview: https://empty-release.vercel.app\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const release = await agent.release({
      runDir,
      appDir: runDir,
      issue: {
        key: 'APP-11',
        fields: { summary: 'Empty release' },
      },
    });

    expect(release).toEqual({
      branchName: 'feature/APP-11-empty-release',
      prUrl: null,
      deploymentUrl: 'https://empty-release.vercel.app',
    });
    expect(runCommand).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['commit']),
      expect.any(Object),
    );
    expect(runCommand).not.toHaveBeenCalledWith('git', expect.arrayContaining(['push']), expect.any(Object));
    expect(runCommand).not.toHaveBeenCalledWith('gh', expect.any(Array), expect.any(Object));
  });

  test('deploys with Vercel CLI mode and health checks the returned URL', async () => {
    process.env.VERCEL_DEPLOY_MODE = 'cli';
    process.env.VERCEL_PROD = 'true';
    process.env.VERCEL_TOKEN = 'token_123';
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-agent-'));
    const agent = new ReleaseAgent({ githubRepo: 'acme/widgets' });
    axios.get.mockResolvedValue({ status: 200 });
    runCommand.mockImplementation(async (command, args) => {
      if (command === 'git' && args[0] === 'status') {
        return { code: 0, stdout: 'A  generated/index.html\n', stderr: '' };
      }
      if (command === 'gh') {
        return { code: 0, stdout: 'https://github.com/acme/widgets/pull/12\n', stderr: '' };
      }
      if (command === 'npx' && args[0] === 'vercel') {
        if (args[1] === 'inspect') {
          return { code: 0, stdout: 'url https://widgets-prod.vercel.app\n', stderr: '' };
        }
        return { code: 0, stdout: 'Production: https://widgets-prod.vercel.app\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const release = await agent.release({
      runDir,
      appDir: runDir,
      issue: {
        key: 'APP-12',
        fields: { summary: 'Deploy with CLI' },
      },
    });

    expect(release.deploymentUrl).toBe('https://widgets-prod.vercel.app');
    expect(runCommand).toHaveBeenCalledWith(
      'git',
      ['add', '-f', path.resolve(runDir)],
      expect.any(Object),
    );
    expect(runCommand).toHaveBeenCalledWith(
      'npx',
      ['vercel', 'deploy', runDir, '--yes', '--token', 'token_123', '--prod'],
      expect.any(Object),
    );
    expect(axios.get).toHaveBeenCalledWith('https://widgets-prod.vercel.app', expect.any(Object));
    const ghCall = runCommand.mock.calls.find(([command]) => command === 'gh');
    expect(ghCall[1]).not.toContain('--json');
  });

  test('deploys with Vercel CLI mode using logged-in CLI when no token is configured', async () => {
    process.env.VERCEL_DEPLOY_MODE = 'cli';
    delete process.env.VERCEL_TOKEN;
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'release-agent-'));
    const agent = new ReleaseAgent();
    axios.get.mockResolvedValue({ status: 200 });
    runCommand.mockResolvedValue({
      code: 0,
      stdout: 'Preview: https://logged-in-cli.vercel.app\n',
      stderr: '',
    });

    const url = await agent.deployToVercel({ appDir: runDir }, 'feature/APP-14-cli-auth');

    expect(url).toBe('https://logged-in-cli.vercel.app');
    expect(runCommand).toHaveBeenCalledWith('npx', ['vercel', 'deploy', runDir, '--yes'], expect.any(Object));
  });

  test('reports missing Vercel API project configuration clearly', async () => {
    process.env.VERCEL_TOKEN = 'token_123';
    const agent = new ReleaseAgent();

    await expect(agent.deployToVercel({ appDir: '/tmp/app' }, 'feature/APP-13-test')).rejects.toThrow(
      'ReleaseAgent requires VERCEL_PROJECT_ID or config.vercel.projectId for Vercel API deployments.',
    );
  });
});
