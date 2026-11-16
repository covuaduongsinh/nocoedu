import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Receipts. A payment recorded in the application gets a receipt number, `PT-<year>-<six digits>`, counted per year of
 * the payment's day. The number is kept on the payment (`eduThanhToan.soPhieu`, unique; a payment imported from Lark
 * has none) and the last number of each year in `eduSoPhieu`, one row per year, moved inside the transaction that
 * records the payment so two receipts never share a number.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611160003_edu_phieu_thu',

  async up({ builder }) {
    await builder.alterCollection('eduThanhToan', (c) => {
      c.string('soPhieu', { length: 32, nullable: true });
      c.unique('soPhieu', { name: 'uq_edu_thanh_toan_so_phieu' });
    });
    await builder.createCollection('eduSoPhieu', (c) => {
      c.increments('id');
      c.integer('nam', { nullable: false });
      c.integer('soCuoi', { nullable: false, defaultValue: 0 });
      c.unique('nam', { name: 'uq_edu_so_phieu_nam' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduSoPhieu');
    await builder.alterCollection('eduThanhToan', (c) => {
      c.dropConstraint('uq_edu_thanh_toan_so_phieu');
    });
    await builder.alterCollection('eduThanhToan', (c) => {
      c.dropField('soPhieu');
    });
  },
});

export default migration;
