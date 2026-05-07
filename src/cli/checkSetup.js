#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { validateConfigForMode } from '../config.js';

const OPTIONAL_TOOLS = ['git', 'gh', 'node', 'npm'];

function main() {
  const mode = process.env.AGENT_COMMAND || 'codex';
  const validation = validateConfigForMode(mode, process.env);
  const toolResults = checkTools(mode);

  printChecklist(validation, toolResults);

  if (!validation.ready) {
    process.exitCode = 1;
  }
}

function checkTools(mode) {
  const tools = OPTIONAL_TOOLS.map((name) => ({
    name,
    available: commandExists(name),
  }));

  return [
    ...tools,
    {
      name: `agent command (${mode})`,
      available: mode === 'mock' || commandExists(mode),
    },
  ];
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: false,
  });

  return result.status === 0;
}

function printChecklist(validation, toolResults) {
  console.log('Setup checklist');
  console.log(`Mode: ${validation.mode}`);
  console.log('');

  console.log('Required environment variables:');
  if (validation.requiredNames.length === 0) {
    console.log('  [ok] none required for mock mode');
  } else {
    for (const name of validation.requiredNames) {
      const present = !validation.missingRequired.includes(name);
      console.log(`  ${present ? '[ok]' : '[missing]'} ${name}`);
    }
  }

  console.log('');
  console.log('Optional tools:');
  for (const tool of toolResults) {
    console.log(`  ${tool.available ? '[ok]' : '[missing]'} ${tool.name}`);
  }

  console.log('');
  if (validation.ready) {
    if (validation.mode === 'mock') {
      console.log('Mock mode is ready. Jira, GitHub, Vercel, and SMTP secrets are not required.');
    } else {
      console.log('Required setup is ready.');
    }
    return;
  }

  console.log(`Missing required config: ${validation.missingRequired.join(', ')}`);
}

main();
