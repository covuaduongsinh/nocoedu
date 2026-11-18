import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The attendance register (`POST /diemDanh/traCuu`) reads the rows of one student or of a set of students across many
 * sessions. `uq_edu_diem_danh_cap` starts with `buoiHocId`, so it does not help a lookup by `hocVienId`; this index does.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611180001_edu_diem_danh_hoc_vien_index',

  async up({ builder }) {
    await builder.alterCollection('eduDiemDanh', (c) => {
      c.index('hocVienId', { name: 'ix_edu_diem_danh_hoc_vien' });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduDiemDanh', (c) => {
      c.dropIndex('ix_edu_diem_danh_hoc_vien');
    });
  },
});

export default migration;
