import { describe, expect, test } from 'vitest';
import { runCommand } from '../src/utils/shell.js';

describe('runCommand', () => {
  test('closes child stdin so commands waiting on stdin can exit', async () => {
    const result = await runCommand(process.execPath, [
      '--input-type=module',
      '-e',
      'let data = ""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => console.log(`ended:${data.length}`));',
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('ended:0');
  });
});
