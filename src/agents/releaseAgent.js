import axios from 'axios';
import fs from 'fs-extra';
import path from 'node:path';
import slugify from 'slugify';
import { runCommand } from '../utils/shell.js';

export class ReleaseAgent {
  constructor(config = {}) {
    this.config = config;
  }

  makeBranchName(ctxOrIssue) {
    const issue = this.getIssue(ctxOrIssue);
    const issueKey = this.getIssueKey(issue);
    const description = this.makeBranchDescription(issue.fields?.summary);

    return this.formatBranchName(issueKey, description);
  }

  makeBranchDescription(summary = 'generated-app') {
    return slugify(summary, {
      lower: true,
      strict: true,
      trim: true,
    }) || 'generated-app';
  }

  formatBranchName(issueKey, description) {
    return `feature/${issueKey}-${description}`;
  }

  async release(ctx) {
    if (!ctx?.runDir) {
      throw new Error('ReleaseAgent requires ctx.runDir to release artifacts.');
    }

    const issue = this.getIssue(ctx);
    const issueKey = this.getIssueKey(issue);
    const branchName = this.makeBranchName(issue);

    if (process.env.AGENT_COMMAND === 'mock') {
      return this.releaseMock(ctx, branchName);
    }

    await this.runCli('git', ['checkout', '-b', branchName], 'create release branch');
    await this.runCli('git', ['add', '-f', path.resolve(ctx.runDir)], 'stage release artifacts');

    let prUrl = null;
    if (await this.hasReleaseChanges(ctx.runDir)) {
      await this.runCli(
        'git',
        ['commit', '-m', `${issueKey}: release generated app`],
        'commit release artifacts',
      );
      await this.runCli('git', ['push', '-u', 'origin', branchName], 'push release branch');
      prUrl = await this.openPullRequest(issue, branchName);
    } else if (!this.allowEmptyRelease()) {
      throw new Error(
        'ReleaseAgent found no changes to release after staging artifacts. Set ALLOW_EMPTY_RELEASE=true to deploy without creating a commit, push, or pull request.',
      );
    }

    const deploymentUrl = await this.deployToVercel(ctx, branchName);
    await this.healthCheck(deploymentUrl);

    const release = { branchName, prUrl, deploymentUrl };
    await this.writeSummary(ctx.runDir, release);
    return release;
  }

  async releaseMock(ctx, branchName) {
    const safeBranch = branchName.replaceAll('/', '-');
    const repo = this.getGithubRepo() || 'mock/repo';
    const release = {
      branchName,
      prUrl: `https://github.com/${repo}/pull/mock-${safeBranch}`,
      deploymentUrl: `https://mock-${safeBranch.toLowerCase()}.vercel.app`,
    };

    await this.writeSummary(ctx.runDir, release);
    return release;
  }

  async openPullRequest(issue, branchName) {
    const repo = this.getGithubRepo();
    const args = [
      'pr',
      'create',
      '--head',
      branchName,
      '--title',
      `${this.getIssueKey(issue)}: ${issue?.fields?.summary || 'Generated app'}`,
      '--body',
      `Automated release for ${this.getIssueKey(issue)}.`,
    ];

    if (repo) {
      args.splice(2, 0, '--repo', repo);
    }

    const result = await this.runCli('gh', args, 'open GitHub pull request');
    const prUrl = this.parseGitHubPullRequestUrl(result.stdout);
    if (!prUrl) {
      throw new Error('GitHub CLI did not return a pull request URL.');
    }
    return prUrl;
  }

  async deployToVercel(ctx, branchName) {
    if (this.getVercelDeployMode() === 'cli') {
      return this.deployToVercelCli(ctx);
    }
    return this.deployToVercelApi(branchName);
  }

  async deployToVercelCli(ctx) {
    const vercel = this.config.vercel || {};
    const token = vercel.token || this.config.vercelToken || process.env.VERCEL_TOKEN;

    if (!ctx?.appDir) {
      throw new Error('ReleaseAgent requires ctx.appDir for Vercel CLI deployments.');
    }
    const args = ['deploy', ctx.appDir, '--yes'];
    if (token) {
      args.push('--token', token);
    }
    if (this.isVercelProd()) {
      args.push('--prod');
    }

    const result = await this.runCli('npx', ['vercel', ...args], 'deploy to Vercel with the CLI');
    return this.parseVercelCliUrl(result.stdout);
  }

  async deployToVercelApi(branchName) {
    const vercel = this.config.vercel || {};
    const token = vercel.token || this.config.vercelToken || process.env.VERCEL_TOKEN;
    const projectId = vercel.projectId || this.config.vercelProjectId || process.env.VERCEL_PROJECT_ID;

    if (!token) {
      throw new Error('ReleaseAgent requires VERCEL_TOKEN or config.vercel.token for Vercel API deployments.');
    }
    if (!projectId) {
      throw new Error(
        'ReleaseAgent requires VERCEL_PROJECT_ID or config.vercel.projectId for Vercel API deployments. Set VERCEL_DEPLOY_MODE=cli to deploy a local app directory with the Vercel CLI instead.',
      );
    }

    const client = axios.create({
      baseURL: 'https://api.vercel.com',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      params: vercel.orgId ? { teamId: vercel.orgId } : undefined,
    });

    const payload = {
      name: projectId,
      project: projectId,
      target: vercel.target || 'production',
      gitSource: {
        type: 'github',
        ref: branchName,
      },
      ...(vercel.deploymentPayload || this.config.vercelDeploymentPayload || {}),
    };

    let created;
    try {
      created = await client.post('/v13/deployments', payload);
    } catch (error) {
      throw new Error(`Vercel deployment creation failed: ${this.apiError(error)}`);
    }

    const deploymentId = created.data?.id || created.data?.uid;
    if (!deploymentId) {
      throw new Error('Vercel deployment creation did not return a deployment id.');
    }

    const deployment = await this.pollDeployment(client, deploymentId);
    const url = deployment.url || created.data?.url;
    if (!url) {
      throw new Error('Vercel deployment reached READY without returning a URL.');
    }
    return this.normalizeUrl(url);
  }

  async pollDeployment(client, deploymentId) {
    const attempts = this.config.vercel?.pollAttempts || this.config.vercelPollAttempts || 30;
    const intervalMs = this.config.vercel?.pollIntervalMs || this.config.vercelPollIntervalMs || 5000;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await client.get(`/v13/deployments/${deploymentId}`);
      } catch (error) {
        throw new Error(`Vercel deployment polling failed: ${this.apiError(error)}`);
      }

      const deployment = response.data || {};
      const state = deployment.readyState || deployment.state;
      if (state === 'READY') {
        return deployment;
      }
      if (state === 'ERROR' || state === 'CANCELED') {
        throw new Error(`Vercel deployment ended with status ${state}.`);
      }

      if (attempt < attempts) {
        await this.sleep(intervalMs);
      }
    }

    throw new Error(`Vercel deployment ${deploymentId} did not become READY after ${attempts} attempts.`);
  }

  async healthCheck(deploymentUrl) {
    try {
      const response = await axios.get(deploymentUrl, {
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return response;
    } catch (error) {
      throw new Error(`Deployment health check failed for ${deploymentUrl}: ${this.apiError(error)}`);
    }
  }

  async runCli(command, args, action) {
    const result = await runCommand(command, args, { cwd: process.cwd() });
    if (result.code !== 0) {
      throw new Error(
        `Failed to ${action}: ${command} ${args.join(' ')} exited ${result.code}. ${result.stderr || result.stdout}`.trim(),
      );
    }
    return result;
  }

  async writeSummary(runDir, release) {
    await fs.outputJson(path.join(runDir, 'release-summary.json'), release, { spaces: 2 });
  }

  async hasReleaseChanges(runDir) {
    const result = await this.runCli(
      'git',
      ['status', '--porcelain', '--', path.resolve(runDir)],
      'inspect staged release changes',
    );
    return result.stdout.trim().length > 0;
  }

  getIssue(ctxOrIssue) {
    return ctxOrIssue?.issue || ctxOrIssue;
  }

  getIssueKey(issue) {
    if (!issue?.key) {
      throw new Error('ReleaseAgent requires issue.key to create a release branch.');
    }
    return issue.key;
  }

  getGithubRepo() {
    return this.config.github?.repo || this.config.githubRepo || process.env.GITHUB_REPO;
  }

  normalizeUrl(url) {
    return /^https?:\/\//.test(url) ? url : `https://${url}`;
  }

  parseVercelCliUrl(stdout = '') {
    const urls = (stdout.match(/https?:\/\/[^\s\]]+/g) || []).map((url) => url.replace(/[),.]+$/, ''));
    const deploymentUrl = urls.find((url) => /\.vercel\.app(?:\/)?$/i.test(url)) || urls.at(-1);
    if (!deploymentUrl) {
      throw new Error('Vercel CLI did not return a deployment URL.');
    }
    return this.normalizeUrl(deploymentUrl);
  }

  parseGitHubPullRequestUrl(stdout = '') {
    return (stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/) || [])[0] || stdout.trim();
  }

  getVercelDeployMode() {
    return this.config.vercel?.deployMode || this.config.vercelDeployMode || process.env.VERCEL_DEPLOY_MODE || 'api';
  }

  isVercelProd() {
    return String(this.config.vercel?.prod ?? this.config.vercelProd ?? process.env.VERCEL_PROD).toLowerCase() === 'true';
  }

  allowEmptyRelease() {
    return String(this.config.allowEmptyRelease ?? process.env.ALLOW_EMPTY_RELEASE).toLowerCase() === 'true';
  }

  apiError(error) {
    if (error.response) {
      return `${error.response.status} ${JSON.stringify(error.response.data)}`;
    }
    return error.message;
  }

  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
