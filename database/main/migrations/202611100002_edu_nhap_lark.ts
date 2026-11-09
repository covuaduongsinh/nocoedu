import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * What the Lark import (DS-60 phase 3) needs on top of `202611100001_edu_lark_mapping`. Everything is added:
 * - `eduNhapLarkNhatKy`: one row per `--commit` run (when, who, outcome and the totals per table). The totals hold
 *   counts and reason codes only, never a name, a phone number, an email or a date of birth (knowledge document 05).
 * - `eduBuoiHoc.truVangKhongPhep`: fixes, on a session, whether an absence without leave deducts a session, the same
 *   way `truVangCoPhep` fixes the excused-absence rule. `null` means "not fixed yet": the next save of the register
 *   fixes it. Sessions that were saved before this column existed keep deducting as they already did.
 *
 * The log table is not listed in any permission, so no role reads or writes it through the API.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611100002_edu_nhap_lark',

  async up({ builder }) {
    await builder.createCollection('eduNhapLarkNhatKy', (c) => {
      c.increments('id');
      c.datetime('batDauLuc', { nullable: false });
      c.datetime('ketThucLuc', { nullable: true });
      c.string('nguoiChayId', { length: 64, nullable: false });
      c.string('trangThai', { length: 16, nullable: false });
      c.json('tongKet', { nullable: true });
    });
    await builder.alterCollection('eduBuoiHoc', (c) => {
      c.boolean('truVangKhongPhep', { nullable: true });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduBuoiHoc', (c) => {
      c.dropField('truVangKhongPhep');
    });
    await builder.dropCollection('eduNhapLarkNhatKy');
  },
});

export default migration;
