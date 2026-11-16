import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { temporaryCode } from '../../server/edu/names.js';

// The `ma` columns are 32 characters wide. SQLite does not enforce that, PostgreSQL does: a 40-character placeholder
// made creating a student fail on the deployed database while every local test passed.

it('a placeholder code fits the 32-character `ma` columns and is not repeated', () => {
  const codes = Array.from({ length: 200 }, () => temporaryCode());
  for (const code of codes) {
    expect(code.length).toBeLessThanOrEqual(32);
    expect(code).toMatch(/^TMP-[0-9a-f]{24}$/u);
  }
  expect(new Set(codes).size).toBe(codes.length);
});

it('no server code spells a placeholder code by hand', () => {
  const root = path.resolve(import.meta.dirname, '../../server');
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts')) files.push(full);
    }
  };
  walk(root);
  const offenders = files.filter(
    (file) =>
      /TMP-\$\{/u.test(readFileSync(file, 'utf8')) &&
      !file.endsWith(`${path.sep}names.ts`) &&
      !file.includes(`${path.sep}lark${path.sep}`),
  );
  expect(offenders).toEqual([]);
});
