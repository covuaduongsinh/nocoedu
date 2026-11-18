import { describe, expect, it } from 'vitest';

import { codeFromId, tempCode } from '../../server/edu/names.js';

describe('codes written before their id is known', () => {
  it('fit the 32-character `ma` columns (PostgreSQL enforces the length) and never repeat', () => {
    const codes = Array.from({ length: 500 }, () => tempCode());
    for (const code of codes) {
      expect(code.length).toBeLessThanOrEqual(32);
      expect(code).toMatch(/^TMP-[0-9a-f]{24}$/u);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect(codeFromId('HS', 7)).toBe('HS00007');
  });
});
