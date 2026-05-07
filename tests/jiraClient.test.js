import { beforeEach, describe, expect, test, vi } from 'vitest';
import { JiraClient } from '../src/jira/client.js';

const jiraConfig = {
  baseUrl: 'https://example.atlassian.net/',
  email: 'bot@example.com',
  apiToken: 'secret-token',
  projectKey: 'AI',
  statuses: {
    todo: 'To Do',
  },
  transitions: {
    inProgress: 'In Progress',
    done: 'Done',
  },
};

describe('JiraClient', () => {
  let requests;
  let client;

  beforeEach(() => {
    requests = [];
    client = new JiraClient(jiraConfig);
    client.http.defaults.adapter = vi.fn(async (request) => {
      requests.push(request);
      return routeRequest(request);
    });
  });

  test('configures axios for Jira REST v3 with basic auth', () => {
    expect(client.http.defaults.baseURL).toBe('https://example.atlassian.net/rest/api/3');
    expect(client.http.defaults.auth).toEqual({
      username: 'bot@example.com',
      password: 'secret-token',
    });
  });

  test('findReadyIssues searches ai-ready To Do issues and returns simplified issues', async () => {
    const issues = await client.findReadyIssues();

    expect(requests[0].method).toBe('get');
    expect(requests[0].url).toBe('/search/jql');
    expect(requests[0].params).toEqual({
      jql: 'project = AI AND labels = ai-ready AND status = "To Do"',
      fields: 'summary,attachment',
    });
    expect(issues).toEqual([
      {
        key: 'AI-1',
        id: '10001',
        fields: {
          summary: 'Build a useful thing',
          attachment: [
            {
              filename: 'requirements.md',
              content: 'https://example.atlassian.net/secure/attachment/100/requirements.md',
            },
          ],
        },
      },
    ]);
  });

  test('downloadRequirements downloads requirements.md from issue attachments', async () => {
    const text = await client.downloadRequirements({
      key: 'AI-1',
      fields: {
        attachment: [
          {
            filename: 'requirements.md',
            content: 'https://example.atlassian.net/secure/attachment/100/requirements.md',
          },
        ],
      },
    });

    expect(requests[0].url).toBe('https://example.atlassian.net/secure/attachment/100/requirements.md');
    expect(requests[0].responseType).toBe('text');
    expect(text).toBe('# Requirements\nBuild the app.');
  });

  test('downloadRequirements fetches attachments when the issue payload does not include them', async () => {
    const text = await client.downloadRequirements({ key: 'AI-2', fields: { summary: 'No attachments loaded' } });

    expect(requests[0].url).toBe('/issue/AI-2');
    expect(requests[0].params).toEqual({ fields: 'attachment' });
    expect(requests[1].url).toBe('https://example.atlassian.net/secure/attachment/200/requirements.md');
    expect(text).toBe('# Loaded later');
  });

  test('downloadRequirements throws when requirements.md is missing', async () => {
    await expect(
      client.downloadRequirements({
        key: 'AI-3',
        fields: {
          attachment: [{ filename: 'notes.md', content: 'https://example.atlassian.net/notes.md' }],
        },
      }),
    ).rejects.toThrow('Missing requirements.md attachment for Jira issue AI-3.');
  });

  test('transitionIssue posts the matching transition id case-insensitively', async () => {
    await client.transitionIssue('AI-1', 'in progress');

    expect(requests[0].url).toBe('/issue/AI-1/transitions');
    expect(requests[1].method).toBe('post');
    expect(requests[1].url).toBe('/issue/AI-1/transitions');
    expect(JSON.parse(requests[1].data)).toEqual({
      transition: {
        id: '21',
      },
    });
  });

  test('transitionIssue throws with available transitions when no match exists', async () => {
    await expect(client.transitionIssue('AI-1', 'Blocked')).rejects.toThrow(
      'Transition "Blocked" was not found for Jira issue AI-1. Available transitions: In Progress, Done.',
    );
  });

  test('addComment posts Atlassian document format', async () => {
    await client.addComment('AI-1', 'First line\n\nSecond line');

    expect(requests[0].method).toBe('post');
    expect(requests[0].url).toBe('/issue/AI-1/comment');
    expect(JSON.parse(requests[0].data)).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
          { type: 'paragraph', content: [] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
        ],
      },
    });
  });
});

function routeRequest(request) {
  if (request.method === 'get' && request.url === '/search/jql') {
    return response(request, {
      issues: [
        {
          key: 'AI-1',
          id: '10001',
          fields: {
            summary: 'Build a useful thing',
            attachment: [
              {
                filename: 'requirements.md',
                content: 'https://example.atlassian.net/secure/attachment/100/requirements.md',
              },
            ],
          },
        },
      ],
    });
  }

  if (request.method === 'get' && request.url === '/issue/AI-2') {
    return response(request, {
      fields: {
        attachment: [
          {
            filename: 'requirements.md',
            content: 'https://example.atlassian.net/secure/attachment/200/requirements.md',
          },
        ],
      },
    });
  }

  if (
    request.method === 'get'
    && request.url === 'https://example.atlassian.net/secure/attachment/100/requirements.md'
  ) {
    return response(request, '# Requirements\nBuild the app.');
  }

  if (
    request.method === 'get'
    && request.url === 'https://example.atlassian.net/secure/attachment/200/requirements.md'
  ) {
    return response(request, '# Loaded later');
  }

  if (request.method === 'get' && request.url === '/issue/AI-1/transitions') {
    return response(request, {
      transitions: [
        { id: '21', name: 'In Progress' },
        { id: '31', name: 'Done' },
      ],
    });
  }

  if (request.method === 'post' && request.url === '/issue/AI-1/transitions') {
    return response(request, {});
  }

  if (request.method === 'post' && request.url === '/issue/AI-1/comment') {
    return response(request, {});
  }

  throw new Error(`Unexpected request: ${request.method?.toUpperCase()} ${request.url}`);
}

function response(config, data) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  };
}
