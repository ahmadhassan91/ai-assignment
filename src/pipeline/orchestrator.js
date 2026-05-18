import fs from 'fs-extra';
import {
  createRunContext,
  appendLog,
  recordStageCompleted,
  recordStageFailed,
  recordStageStarted,
} from '../utils/runContext.js';

export class PipelineOrchestrator {
  constructor({ jiraClient, buildAgent, testAgent, releaseAgent, qaAgent, emailClient, config }) {
    this.jiraClient = jiraClient;
    this.buildAgent = buildAgent;
    this.testAgent = testAgent;
    this.releaseAgent = releaseAgent;
    this.qaAgent = qaAgent;
    this.emailClient = emailClient;
    this.config = config;
  }

  async processReadyIssues() {
    const issues = await this.jiraClient.findReadyIssues();
    for (const issue of issues) {
      await this.processIssue(issue);
    }
    return issues.length;
  }

  async processIssue(issue) {
    const ctx = await createRunContext(this.config.runsDir, issue);
    try {
      await appendLog(ctx, `Starting ${issue.key}`);
      await this.runStage(ctx, 'intake', async () => {
        const requirements = await this.jiraClient.downloadRequirements(issue);
        await fs.writeFile(ctx.requirementsPath, requirements);
      });
      await this.runStage(ctx, 'transition in progress', async () => {
        await this.jiraClient.transitionIssue(issue.key, this.config.jira.transitions.inProgress);
      });

      await this.runStage(ctx, 'build', async () => this.buildAgent.build(ctx));
      await this.runStage(ctx, 'tests', async () => this.testAgent.runUntilPassing(ctx));
      const release = await this.runStage(ctx, 'release', async () => this.releaseAgent.release(ctx));
      const qaReport = await this.runStage(ctx, 'qa', async () => this.qaAgent.run(ctx, release.deploymentUrl));
      await this.runStage(ctx, 'email', async () => this.emailClient.sendQaReport(ctx, qaReport));

      const transition = qaReport.overallStatus === 'PASS'
        ? this.config.jira.transitions.done
        : this.config.jira.transitions.bugReported;
      await this.runStage(ctx, 'jira closeout', async () => {
        await this.jiraClient.addComment(issue.key, this.makeFinalComment(release, qaReport));
        await this.jiraClient.transitionIssue(issue.key, transition);
      });
      await appendLog(ctx, `Completed ${issue.key} with ${qaReport.overallStatus}`);
    } catch (error) {
      await appendLog(ctx, `Failed: ${error.stack || error.message}`);
      await this.closeFailedIssue(issue.key, ctx, error);
    }
  }

  async runStage(ctx, stageName, action) {
    await appendLog(ctx, `Stage started: ${stageName}`);
    await recordStageStarted(ctx, stageName);
    try {
      const result = await action();
      await recordStageCompleted(ctx, stageName);
      await appendLog(ctx, `Stage completed: ${stageName}`);
      return result;
    } catch (error) {
      error.failedStage = error.failedStage || stageName;
      await recordStageFailed(ctx, stageName, error);
      await appendLog(ctx, `Stage failed: ${stageName}`);
      throw error;
    }
  }

  async closeFailedIssue(issueKey, ctx, error) {
    const body = [
      `Pipeline failed for ${issueKey}.`,
      '',
      `Failed stage: ${error.failedStage || 'unknown'}`,
      '',
      `Error: ${truncate(error.message, 1800)}`,
      '',
      `Run directory: ${ctx.runDir}`,
    ].join('\n');
    await this.jiraClient.addComment(issueKey, body);
    await this.jiraClient.transitionIssue(issueKey, this.config.jira.transitions.bugReported);
  }

  makeFinalComment(release, qaReport) {
    return [
      `Pipeline completed with status: ${qaReport.overallStatus}`,
      '',
      `Deployment URL: ${release.deploymentUrl}`,
      `Pull Request: ${release.prUrl}`,
      '',
      qaReport.summary,
    ].join('\n');
  }
}

function truncate(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}... [truncated]`;
}
