import axios from 'axios';

export class JiraClient {
  constructor(config) {
    this.config = config;
    this.http = axios.create({
      baseURL: `${config.baseUrl.replace(/\/$/, '')}/rest/api/3`,
      auth: {
        username: config.email,
        password: config.apiToken,
      },
    });
  }

  async findReadyIssues() {
    const status = this.config.statuses?.todo || 'To Do';
    const jql = `project = ${this.config.projectKey} AND labels = ai-ready AND status = "${status}"`;
    const response = await this.http.get('/search/jql', {
      params: {
        jql,
        fields: 'summary,attachment',
      },
    });

    return (response.data.issues || []).map((issue) => ({
      key: issue.key,
      id: issue.id,
      fields: {
        summary: issue.fields?.summary,
        attachment: issue.fields?.attachment,
      },
    }));
  }

  async downloadRequirements(issue) {
    const attachments = await this.getAttachments(issue);
    const requirements = attachments.find((attachment) => attachment.filename === 'requirements.md');
    if (!requirements) {
      throw new Error(`Missing requirements.md attachment for Jira issue ${issue.key}.`);
    }

    const response = await this.http.get(requirements.content, {
      responseType: 'text',
      transformResponse: [(data) => data],
    });
    return response.data;
  }

  async transitionIssue(issueKey, transitionName) {
    const response = await this.http.get(`/issue/${issueKey}/transitions`);
    const transitions = response.data.transitions || [];
    const transition = transitions.find(
      (item) => item.name.toLowerCase() === transitionName.toLowerCase(),
    );

    if (!transition) {
      const available = transitions.map((item) => item.name).join(', ') || 'none';
      throw new Error(
        `Transition "${transitionName}" was not found for Jira issue ${issueKey}. Available transitions: ${available}.`,
      );
    }

    await this.http.post(`/issue/${issueKey}/transitions`, {
      transition: {
        id: transition.id,
      },
    });
  }

  async addComment(issueKey, body) {
    await this.http.post(`/issue/${issueKey}/comment`, {
      body: textToAtlassianDocument(body),
    });
  }

  async getAttachments(issue) {
    const existingAttachments = issue.fields?.attachment;
    if (Array.isArray(existingAttachments)) {
      return existingAttachments;
    }

    const response = await this.http.get(`/issue/${issue.key}`, {
      params: {
        fields: 'attachment',
      },
    });
    return response.data.fields?.attachment || [];
  }
}

function textToAtlassianDocument(text) {
  const lines = String(text).split('\n');
  return {
    type: 'doc',
    version: 1,
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  };
}
