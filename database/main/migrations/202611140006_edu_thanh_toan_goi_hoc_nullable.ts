import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A payment may have no package (DS-61 phase B). The money of the club's Lark Base is imported for students who have no
 * package in NocoEdu (their Deal was left out, or only an opening balance was kept); the revenue report adds up
 * `soTien` by month and branch and never looks at the package, so the payment is kept whole instead of being dropped.
 * A payment recorded in the application still names its package (the route requires it). The foreign key stays.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140006_edu_thanh_toan_goi_hoc_nullable',

  async up({ builder }) {
    await builder.alterCollection('eduThanhToan', (c) => {
      c.alterField('goiHocId', { type: 'integer', nullable: true });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduThanhToan', (c) => {
      c.alterField('goiHocId', { type: 'integer', nullable: false });
    });
  },
});

export default migration;
