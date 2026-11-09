import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Fixes, on a session, the branch rule "an excused absence still uses a session" that applied when its register was
 * first saved. `null` means the register has not been saved yet. Changing the branch setting later then affects the
 * next sessions only, never a register that was already marked.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611090003_edu_buoi_hoc_rule_snapshot',

  async up({ builder }) {
    await builder.alterCollection('eduBuoiHoc', (c) => {
      c.boolean('truVangCoPhep', { nullable: true });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduBuoiHoc', (c) => {
      c.dropField('truVangCoPhep');
    });
  },
});

export default migration;
