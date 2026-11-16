import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Reminder threshold per branch. A student with this many sessions left or fewer is warned about (attendance, the
 * "sắp hết buổi" report, the home page and the tuition reminder). It was a fixed 2; every branch keeps 2 until its
 * manager changes it.
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
