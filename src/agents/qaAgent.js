import fs from 'fs-extra';
import path from 'node:path';
import { chromium } from 'playwright';

export class QaAgent {
  constructor(config = {}) {
    this.config = config;
  }

  async run(ctx, deploymentUrl) {
    if (!ctx?.requirementsPath) {
      throw new Error('QaAgent requires ctx.requirementsPath.');
    }
    if (!ctx?.screenshotsDir) {
      throw new Error('QaAgent requires ctx.screenshotsDir.');
    }
    if (!deploymentUrl) {
      throw new Error('QaAgent requires a deployment URL.');
    }

    await fs.ensureDir(ctx.screenshotsDir);
    const requirements = await fs.readFile(ctx.requirementsPath, 'utf8').catch(() => '');
    const criteria = parseAcceptanceCriteria(requirements);

    if (process.env.AGENT_COMMAND === 'mock') {
      return this.runMock(ctx, deploymentUrl, criteria);
    }

    return this.runBrowserQa(ctx, deploymentUrl, criteria);
  }

  async runMock(ctx, deploymentUrl, criteria) {
    const screenshotPath = path.join(ctx.screenshotsDir, 'initial-page.txt');
    await fs.writeFile(screenshotPath, `Mock screenshot placeholder for ${deploymentUrl}\n`);

    const results = criteria.map((criterion) => ({
      status: 'PASS',
      criterion,
      notes: 'Mock mode deterministic pass.',
    }));
    const summary = `QA mock passed ${criteria.length} acceptance criteria for ${deploymentUrl}.`;
    const reportPath = await writeBugReport(ctx, {
      deploymentUrl,
      overallStatus: 'PASS',
      summary,
      results,
      consoleErrors: [],
      pageErrors: [],
      screenshots: [screenshotPath],
    });

    return {
      overallStatus: 'PASS',
      summary,
      reportPath,
      screenshots: [screenshotPath],
    };
  }

  async runBrowserQa(ctx, deploymentUrl, criteria) {
    const screenshots = [];
    const consoleErrors = [];
    const pageErrors = [];
    let browser;
    let navigationError;

    try {
      browser = await chromium.launch({ headless: this.config.headless ?? true });
      const page = await browser.newPage({
        viewport: this.config.viewport ?? { width: 1440, height: 900 },
      });

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });
      page.on('pageerror', (error) => {
        pageErrors.push(error.stack || error.message);
      });

      await page.goto(deploymentUrl, {
        waitUntil: this.config.waitUntil ?? 'networkidle',
        timeout: this.config.timeoutMs ?? 30000,
      });

      const screenshotPath = path.join(ctx.screenshotsDir, 'initial-page.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshots.push(screenshotPath);
    } catch (error) {
      navigationError = error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    const results = criteria.map((criterion) => ({
      status: navigationError ? 'FAIL' : 'PARTIAL',
      criterion,
      notes: navigationError
        ? `Could not inspect the deployed page: ${navigationError.message}`
        : 'Generic QA inspected the live page, console, and initial render. This criterion needs product-specific automation or human review.',
    }));

    const hasRuntimeErrors = consoleErrors.length > 0 || pageErrors.length > 0;
    const overallStatus = navigationError || hasRuntimeErrors ? 'FAIL' : 'PARTIAL';
    const summary = makeSummary({
      overallStatus,
      criteriaCount: criteria.length,
      consoleErrors,
      pageErrors,
      navigationError,
      deploymentUrl,
    });
    const reportPath = await writeBugReport(ctx, {
      deploymentUrl,
      overallStatus,
      summary,
      results,
      consoleErrors,
      pageErrors,
      screenshots,
      navigationError,
    });

    return {
      overallStatus,
      summary,
      reportPath,
      screenshots,
    };
  }
}

export function parseAcceptanceCriteria(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => /acceptance\s+criteria/i.test(line));
  const scanLines = headingIndex >= 0 ? lines.slice(headingIndex + 1) : lines;
  const criteria = [];

  for (const line of scanLines) {
    if (headingIndex >= 0 && criteria.length > 0 && /^#{1,6}\s+/.test(line)) {
      break;
    }

    const bullet = line.match(/^\s*(?:[-*+]|(?:\d+\.))\s+\[?\s*[x ]?\]?\s*(.+?)\s*$/i);
    if (!bullet) {
      continue;
    }

    const text = bullet[1].trim();
    if (text) {
      criteria.push(text);
    }
  }

  return criteria.length > 0 ? criteria : ['No explicit acceptance criteria found in requirements.md'];
}

async function writeBugReport(ctx, data) {
  const reportPath = ctx.bugReportPath || path.join(ctx.runDir, 'bug-report.md');
  await fs.ensureDir(path.dirname(reportPath));
  await fs.writeFile(reportPath, formatBugReport(data));
  return reportPath;
}

function formatBugReport({
  deploymentUrl,
  overallStatus,
  summary,
  results,
  consoleErrors,
  pageErrors,
  screenshots,
  navigationError,
}) {
  const resultRows = results.map(({ status, criterion, notes }) => (
    `| ${status} | ${escapeMarkdownTable(criterion)} | ${escapeMarkdownTable(notes)} |`
  ));
  const screenshotLines = screenshots.length > 0
    ? screenshots.map((screenshot) => `- ${screenshot}`)
    : ['- No screenshots captured.'];

  return [
    '# QA Bug Report',
    '',
    `Overall Status: ${overallStatus}`,
    `Deployment URL: ${deploymentUrl}`,
    '',
    '## Summary',
    summary,
    '',
    '## Acceptance Criteria Results',
    '| Status | Criterion | Notes |',
    '| --- | --- | --- |',
    ...resultRows,
    '',
    '## Browser Errors',
    formatErrorList('Navigation', navigationError ? [navigationError.message] : []),
    formatErrorList('Console', consoleErrors),
    formatErrorList('Page', pageErrors),
    '',
    '## Screenshots',
    ...screenshotLines,
    '',
  ].join('\n');
}

function formatErrorList(label, errors) {
  if (errors.length === 0) {
    return `- ${label}: none`;
  }

  return errors.map((error) => `- ${label}: ${error}`).join('\n');
}

function makeSummary({ overallStatus, criteriaCount, consoleErrors, pageErrors, navigationError, deploymentUrl }) {
  if (navigationError) {
    return `QA failed to open ${deploymentUrl}: ${navigationError.message}`;
  }

  const errorCount = consoleErrors.length + pageErrors.length;
  if (errorCount > 0) {
    return `QA inspected ${deploymentUrl}, found ${errorCount} browser error(s), and marked ${criteriaCount} acceptance criteria for follow-up.`;
  }

  return `QA inspected ${deploymentUrl}, captured the initial page, and marked ${criteriaCount} acceptance criteria as ${overallStatus}.`;
}

function escapeMarkdownTable(value) {
  return String(value).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}
