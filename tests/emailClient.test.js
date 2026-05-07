import { afterEach, describe, expect, test } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { EmailClient } from '../src/email/client.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function makeClient(overrides = {}) {
  return new EmailClient({
    host: 'mock',
    port: 587,
    user: 'smtp-user',
    pass: 'smtp-pass',
    from: 'qa@example.com',
    to: 'team@example.com',
    ...overrides,
  });
}

describe('EmailClient', () => {
  test('writes a mock email preview with bug report body and screenshot attachments', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'email-client-'));
    const bugReportPath = path.join(runDir, 'bug-report.md');
    const screenshotPath = path.join(runDir, 'screenshots', 'home.png');
    await fs.ensureDir(path.dirname(screenshotPath));
    await fs.writeFile(bugReportPath, 'Bug details from QA');
    await fs.writeFile(screenshotPath, 'fake-png');

    const result = await makeClient().sendQaReport(
      { issue: { key: 'APP-123' }, runDir, bugReportPath },
      { overallStatus: 'FAIL', summary: 'Fallback summary', screenshots: [screenshotPath] },
    );

    const previewPath = path.join(runDir, 'email-preview.json');
    const preview = await fs.readJson(previewPath);

    expect(result).toEqual({ mocked: true, previewPath });
    expect(preview.text).toBe('Bug details from QA');
    expect(preview.attachments).toEqual([{ filename: 'home.png', path: screenshotPath }]);
  });

  test('uses QA report issue key and status in the subject', async () => {
    const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'email-client-'));

    await makeClient().sendQaReport(
      { runDir },
      { issueKey: 'WEB-7', overallStatus: 'PASS', summary: 'All checks passed', screenshots: [] },
    );

    const preview = await fs.readJson(path.join(runDir, 'email-preview.json'));

    expect(preview.subject).toBe('QA Report - WEB-7 - PASS');
  });
});
