import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The balance at which a branch starts reminding about tuition: a student of the branch with this many sessions left
 * or fewer is listed as "to collect" and named in the daily reminder. Two sessions, as the application used so far.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611160004_edu_co_so_nguong_nhac',

  async up({ builder }) {
    await builder.alterCollection('eduCoSo', (c) => {
      c.integer('nguongNhacBuoi', { nullable: false, defaultValue: 2 });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduCoSo', (c) => {
      c.dropField('nguongNhacBuoi');
    });
  },
});

export default migration;
