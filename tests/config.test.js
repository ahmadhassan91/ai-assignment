import { describe, expect, test } from 'vitest';
import { getMissingEnv, validateConfigForMode } from '../src/config.js';

describe('config validation helpers', () => {
  test('getMissingEnv returns names with empty or missing values', () => {
    expect(getMissingEnv(['PRESENT', 'EMPTY', 'MISSING'], { PRESENT: 'ok', EMPTY: '' })).toEqual([
      'EMPTY',
      'MISSING',
    ]);
  });

  test('validateConfigForMode reports missing real-mode secrets', () => {
    const result = validateConfigForMode('codex', {
      JIRA_BASE_URL: 'https://example.atlassian.net',
      JIRA_EMAIL: 'bot@example.com',
      JIRA_API_TOKEN: 'token',
    });

    expect(result.ready).toBe(false);
    expect(result.mode).toBe('codex');
    expect(result.missingRequired).toEqual([
      'JIRA_PROJECT_KEY',
      'GITHUB_REPO',
      'EMAIL_HOST',
      'EMAIL_USER',
      'EMAIL_PASS',
      'EMAIL_FROM',
      'EMAIL_TO',
      'VERCEL_TOKEN',
      'VERCEL_PROJECT_ID',
    ]);
  });

  test('validateConfigForMode requires Vercel API fields in API deploy mode', () => {
    const result = validateConfigForMode('codex', {
      ...makeRequiredEnv(),
      VERCEL_DEPLOY_MODE: 'api',
      VERCEL_TOKEN: '',
      VERCEL_PROJECT_ID: '',
    });

    expect(result.ready).toBe(false);
    expect(result.missingRequired).toEqual(['VERCEL_TOKEN', 'VERCEL_PROJECT_ID']);
  });

  test('validateConfigForMode accepts all real-mode required env vars', () => {
    const result = validateConfigForMode('codex', makeRequiredEnv());

    expect(result).toEqual({
      mode: 'codex',
      ready: true,
      requiredNames: [
        'JIRA_BASE_URL',
        'JIRA_EMAIL',
        'JIRA_API_TOKEN',
        'JIRA_PROJECT_KEY',
        'GITHUB_REPO',
        'EMAIL_HOST',
        'EMAIL_USER',
        'EMAIL_PASS',
        'EMAIL_FROM',
        'EMAIL_TO',
      ],
      missingRequired: [],
    });
  });

  test('validateConfigForMode does not require service secrets in mock mode', () => {
    expect(validateConfigForMode('mock', {})).toEqual({
      mode: 'mock',
      ready: true,
      requiredNames: [],
      missingRequired: [],
    });
  });
});

function makeRequiredEnv() {
  return {
    JIRA_BASE_URL: 'https://example.atlassian.net',
    JIRA_EMAIL: 'bot@example.com',
    JIRA_API_TOKEN: 'token',
    JIRA_PROJECT_KEY: 'AI',
    GITHUB_REPO: 'owner/repo',
    VERCEL_DEPLOY_MODE: 'cli',
    EMAIL_HOST: 'smtp.example.com',
    EMAIL_USER: 'smtp-user',
    EMAIL_PASS: 'smtp-pass',
    EMAIL_FROM: 'qa@example.com',
    EMAIL_TO: 'manager@example.com',
  };
}
