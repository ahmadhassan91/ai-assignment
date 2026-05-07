import fs from 'fs-extra';
import path from 'node:path';
import nodemailer from 'nodemailer';

export class EmailClient {
  constructor(config) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }

  async sendQaReport(ctx, qaReport) {
    const body = await this.getReportBody(ctx, qaReport);
    const status = qaReport?.overallStatus;
    const issueKey = qaReport?.issueKey || ctx?.issue?.key || ctx?.issueKey;

    if (!issueKey) {
      throw new Error('Cannot send QA report email: missing Jira issue key.');
    }

    if (!status) {
      throw new Error(`Cannot send QA report email for ${issueKey}: missing QA status.`);
    }

    const message = {
      from: this.config.from,
      to: this.config.to,
      subject: `QA Report - ${issueKey} - ${status}`,
      text: body,
      attachments: this.makeAttachments(qaReport?.screenshots),
    };

    if (this.isMockMode()) {
      const previewPath = path.join(ctx.runDir, 'email-preview.json');
      await fs.writeJson(previewPath, message, { spaces: 2 });
      return { mocked: true, previewPath };
    }

    return this.transporter.sendMail(message);
  }

  async getReportBody(ctx, qaReport) {
    if (ctx?.bugReportPath && await fs.pathExists(ctx.bugReportPath)) {
      const body = await fs.readFile(ctx.bugReportPath, 'utf8');
      if (body.trim()) {
        return body;
      }
    }

    if (qaReport?.summary?.trim()) {
      return qaReport.summary;
    }

    throw new Error('Cannot send QA report email: missing report body. Expected a non-empty bug report file or qaReport.summary.');
  }

  makeAttachments(screenshots = []) {
    return screenshots.map((screenshot) => {
      if (typeof screenshot === 'string') {
        return {
          filename: path.basename(screenshot),
          path: screenshot,
        };
      }

      return screenshot;
    });
  }

  isMockMode() {
    return process.env.AGENT_COMMAND === 'mock'
      || process.env.EMAIL_HOST === 'mock'
      || this.config.host === 'mock';
  }
}
