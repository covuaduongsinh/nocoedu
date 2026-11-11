/**
 * Rewrites the literal permission-set data of `database/main/seeds/202611090002_edu_permission_sets.ts` from
 * `database/seed-data/edu-permission-sets.ts`. A seed is loaded on its own and cannot import application code, so
 * the grants are copied into it. Run `pnpm exec tsx scripts/generate-edu-permission-seed.mts` after changing the
 * declarations, then `pnpm exec prettier --write` the seed. `tests/server/edu-permission-sets.test.ts` fails when
 * the two differ. Edit the seed only before it has run anywhere; afterwards write a new seed or a data migration.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { EDU_PERMISSION_SETS } from '../database/seed-data/edu-permission-sets.ts';

const file = path.resolve(
  import.meta.dirname,
  '../database/main/seeds/202611090002_edu_permission_sets.ts',
);
// Written as a TypeScript literal (bare keys, single quotes) so it passes the project's lint rules unchanged.
// The CSV `import` and `export` actions of `edu.hocVien` were added after this seed had run on real databases, so they are granted by
// `202611110001_edu_hoc_vien_import_grant` and `202611110002_edu_hoc_vien_export_grant` instead. Leaving it out keeps this seed what it was when it first ran.
const withoutLaterActions = (grants: readonly unknown[]): unknown[] =>
  grants.map((grant) => {
    const g = grant as {
      resource: { type: string; id: string };
      actions: { action: string }[];
    };
    return g.resource.type === 'composite' && g.resource.id === 'edu.hocVien'
      ? {
          ...g,
          actions: g.actions.filter(
            (a) => !['import', 'export'].includes(a.action),
          ),
        }
      : g;
  });
const literal = JSON.stringify(
  EDU_PERMISSION_SETS.map(({ key, title, grants }) => ({
    key,
    title,
    grants: withoutLaterActions(grants),
  })),
  null,
  2,
)
  .replace(/"([A-Za-z_][A-Za-z0-9_]*)":/gu, '$1:')
  .replace(/"([^"\\]*)"/gu, "'$1'");
const source = readFileSync(file, 'utf8');
const marker = '}[] = ';
const begin = source.indexOf(marker) + marker.length;
const end = source.indexOf(';\n\nexport default');
if (begin < marker.length || end < 0) throw new Error('Seed markers not found');
writeFileSync(file, source.slice(0, begin) + literal + source.slice(end));
