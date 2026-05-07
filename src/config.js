import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ quiet: true });

export const REQUIRED_ENV_NAMES = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY',
  'GITHUB_REPO',
  'VERCEL_TOKEN',
  'VERCEL_PROJECT_ID',
  'EMAIL_HOST',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_FROM',
  'EMAIL_TO',
];

export function getConfig() {
  const runsDir = process.env.RUNS_DIR || 'runs';

  return {
    jira: {
      baseUrl: requireEnv('JIRA_BASE_URL'),
      email: requireEnv('JIRA_EMAIL'),
      apiToken: requireEnv('JIRA_API_TOKEN'),
      projectKey: requireEnv('JIRA_PROJECT_KEY'),
      statuses: {
        todo: process.env.JIRA_TO_DO_STATUS || 'To Do',
      },
      transitions: {
        inProgress: process.env.JIRA_IN_PROGRESS_TRANSITION || 'In Progress',
        done: process.env.JIRA_DONE_TRANSITION || 'Done',
        bugReported: process.env.JIRA_BUG_REPORTED_TRANSITION || 'Bug Reported',
      },
    },
    github: {
      repo: requireEnv('GITHUB_REPO'),
    },
    vercel: {
      token: requireEnv('VERCEL_TOKEN'),
      projectId: requireEnv('VERCEL_PROJECT_ID'),
      orgId: process.env.VERCEL_ORG_ID,
    },
    email: {
      host: requireEnv('EMAIL_HOST'),
      port: Number(process.env.EMAIL_PORT || 587),
      user: requireEnv('EMAIL_USER'),
      pass: requireEnv('EMAIL_PASS'),
      from: requireEnv('EMAIL_FROM'),
      to: requireEnv('EMAIL_TO'),
    },
    agentCommand: process.env.AGENT_COMMAND || 'codex',
    cron: process.env.PIPELINE_CRON || '*/5 * * * *',
    runsDir: path.resolve(process.cwd(), runsDir),
  };
}

export function getMissingEnv(requiredNames, processEnv = process.env) {
  return requiredNames.filter((name) => !processEnv[name]);
}

export function validateConfigForMode(mode = process.env.AGENT_COMMAND || 'codex', processEnv = process.env) {
  const normalizedMode = mode || 'codex';
  const requiredNames = normalizedMode === 'mock' ? [] : REQUIRED_ENV_NAMES;
  const missingRequired = getMissingEnv(requiredNames, processEnv);

  return {
    mode: normalizedMode,
    ready: missingRequired.length === 0,
    requiredNames,
    missingRequired,
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
