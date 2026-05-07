import fs from 'fs-extra';
import path from 'node:path';
import { runCommand } from '../utils/shell.js';

export class BuildAgent {
  constructor(config = {}) {
    this.config = config;
  }

  async build(ctx) {
    const requirements = await fs.readFile(ctx.requirementsPath, 'utf8');
    await fs.ensureDir(ctx.appDir);

    if (isMockCommand(this.config)) {
      await writeMockTodoApp(ctx, requirements);
      return;
    }

    const { command, args } = parseAgentCommand(this.config.agentCommand);
    const prompt = [
      'You are the BuildAgent in a zero-human-touch app delivery pipeline.',
      'Read requirements.md in the current working directory context and produce a deployable app in this directory.',
      'The app must be runnable from the generated files without manual follow-up.',
      '',
      `Requirements path: ${ctx.requirementsPath}`,
      `App directory: ${ctx.appDir}`,
      '',
      'Requirements:',
      requirements,
    ].join('\n');

    await fs.copy(ctx.requirementsPath, path.join(ctx.appDir, 'requirements.md'));

    const { command: expandedCommand, args: expandedArgs } = expandAgentCommand({ command, args }, {
      prompt,
      appDir: ctx.appDir,
      requirementsPath: ctx.requirementsPath,
      runDir: ctx.runDir,
    });
    const result = await runCommand(expandedCommand, expandedArgs, { cwd: ctx.appDir });
    if (result.code !== 0) {
      throw new Error(formatFailure('BuildAgent command failed', result));
    }

    await verifyBuildOutput(ctx);
  }
}

function isMockCommand(config) {
  return process.env.AGENT_COMMAND === 'mock' || config.agentCommand === 'mock';
}

function parseAgentCommand(agentCommand) {
  if (!agentCommand) {
    throw new Error('BuildAgent requires config.agentCommand for real mode.');
  }

  const parts = splitCommand(agentCommand);
  if (parts.length === 0) {
    throw new Error('BuildAgent received an empty agent command.');
  }

  const [command, ...args] = parts;
  return { command, args };
}

function splitCommand(commandLine) {
  const matches = commandLine.matchAll(/"([^"]*)"|'([^']*)'|[^\s]+/g);
  return [...matches].map((match) => match[1] ?? match[2] ?? match[0]);
}

function expandAgentCommand(parsedCommand, values) {
  const hasPromptToken = commandHasToken(parsedCommand, 'prompt');
  const expanded = {
    command: expandTemplate(parsedCommand.command, values),
    args: parsedCommand.args.map((arg) => expandTemplate(arg, values)),
  };

  if (!hasPromptToken) {
    expanded.args.push(values.prompt);
  }

  return expanded;
}

function commandHasToken(parsedCommand, token) {
  const needle = `{${token}}`;
  return parsedCommand.command.includes(needle) || parsedCommand.args.some((arg) => arg.includes(needle));
}

function expandTemplate(value, values) {
  return value.replaceAll('{prompt}', values.prompt)
    .replaceAll('{appDir}', values.appDir)
    .replaceAll('{requirementsPath}', values.requirementsPath)
    .replaceAll('{runDir}', values.runDir);
}

function formatFailure(prefix, result) {
  return [
    `${prefix} with exit code ${result.code}.`,
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : '',
  ].filter(Boolean).join('\n\n');
}

async function verifyBuildOutput(ctx) {
  const indexPath = path.join(ctx.appDir, 'index.html');
  const packagePath = path.join(ctx.appDir, 'package.json');
  const hasDeployableOutput = await fs.pathExists(indexPath) || await fs.pathExists(packagePath);

  if (!hasDeployableOutput) {
    throw new Error(
      `BuildAgent completed but did not create a deployable app in ${ctx.appDir}. Expected index.html or package.json.`,
    );
  }
}

async function writeMockTodoApp(ctx, requirements) {
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Todo App</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f4f7fb; color: #1f2937; }
    main { max-width: 720px; margin: 48px auto; padding: 24px; background: #ffffff; border: 1px solid #d8dee9; border-radius: 8px; }
    h1 { margin-top: 0; }
    form { display: flex; gap: 8px; }
    input { flex: 1; padding: 10px 12px; border: 1px solid #b8c2d1; border-radius: 6px; font-size: 16px; }
    button { padding: 10px 14px; border: 0; border-radius: 6px; background: #2563eb; color: #ffffff; font-weight: 700; cursor: pointer; }
    ul { padding: 0; list-style: none; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    li.done span { text-decoration: line-through; color: #6b7280; }
    .secondary { background: #e5e7eb; color: #1f2937; }
  </style>
</head>
<body>
  <main>
    <h1>Todo App</h1>
    <form id="todo-form">
      <input id="todo-input" name="todo" placeholder="Add a task" autocomplete="off" required>
      <button type="submit">Add</button>
    </form>
    <ul id="todo-list" aria-label="Todo list"></ul>
  </main>
  <script>
    const storageKey = 'mock-build-agent-todos';
    const form = document.querySelector('#todo-form');
    const input = document.querySelector('#todo-input');
    const list = document.querySelector('#todo-list');
    let todos = JSON.parse(localStorage.getItem(storageKey) || '[]');

    function save() {
      localStorage.setItem(storageKey, JSON.stringify(todos));
    }

    function render() {
      list.innerHTML = '';
      todos.forEach((todo, index) => {
        const item = document.createElement('li');
        item.className = todo.done ? 'done' : '';
        const label = document.createElement('span');
        label.textContent = todo.text;
        const actions = document.createElement('div');
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'secondary';
        toggle.textContent = todo.done ? 'Undo' : 'Done';
        toggle.addEventListener('click', () => {
          todos[index].done = !todos[index].done;
          save();
          render();
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => {
          todos.splice(index, 1);
          save();
          render();
        });
        actions.append(toggle, remove);
        item.append(label, actions);
        list.append(item);
      });
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      todos.push({ text, done: false });
      input.value = '';
      save();
      render();
    });

    render();
  </script>
</body>
</html>
`;
  const summary = [
    '# Build Summary',
    '',
    'Mock build complete.',
    '',
    `Generated ${path.join(ctx.appDir, 'index.html')}.`,
    '',
    'Requirements snapshot:',
    '',
    requirements,
  ].join('\n');

  await fs.writeFile(path.join(ctx.appDir, 'index.html'), indexHtml);
  await fs.writeFile(path.join(ctx.appDir, 'build-summary.md'), summary);
}
