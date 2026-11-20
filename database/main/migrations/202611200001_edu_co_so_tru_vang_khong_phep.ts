import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The day from which a branch deducts a session for an absence without leave (`YYYY-MM-DD`; `null` = never), chosen by
 * the head coach in the branch dialog (docs/plans/2026-11-20-ke-hoach-hoc-thu-buoi-tang-vang-khong-phep.md). A session
 * held on or after that day fixes "an absence without leave deducts" when its register is first saved
 * (`eduBuoiHoc.truVangKhongPhep`); sessions already saved keep their rule.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611200001_edu_co_so_tru_vang_khong_phep',

  async up({ builder }) {
    await builder.alterCollection('eduCoSo', (c) => {
      c.string('truVangKhongPhepTuNgay', { length: 10, nullable: true });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduCoSo', (c) => {
      c.dropField('truVangKhongPhepTuNgay');
    });
  },
});

export default migration;
