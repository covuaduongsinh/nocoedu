import path from 'node:path';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

describeMigration('202611090001_create_edu_tables', {
  sources: [
    {
      packageName: 'nocoedu-migrations-test',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    },
  ],
  up: async ({ connection, expectCollection }) => {
    for (const name of [
      'eduCoSo',
      'eduCoSoQuanLy',
      'eduLop',
      'eduLopLich',
      'eduHocVien',
      'eduHocVienLenCap',
      'eduPhuHuynh',
      'eduHocVienPhuHuynh',
      'eduDongY',
      'eduBuoiHoc',
      'eduDiemDanh',
      'eduGoiHoc',
      'eduThanhToan',
      'eduSoDuNhatKy',
      'eduNhanXetThang',
      'eduXuatDuLieuNhatKy',
    ]) {
      await expectCollection(name).toExist();
    }
    await expectCollection('eduHocVien').toHaveField('namSinh', {
      nullable: false,
    });
    await expectCollection('eduHocVien').toHaveIndex(['ma'], { unique: true });

    // A branch defaults to "an excused absence is not deducted", written as a real boolean.
    await connection.query
      .insertInto('eduCoSo')
      .values({ ma: 'CS-MAU', ten: 'Cơ sở Mẫu' })
      .execute();
    const row = await connection.query
      .selectFrom('eduCoSo')
      .select(['truBuoiVangCoPhep', 'trangThai'])
      .where('ma', '=', 'CS-MAU')
      .executeTakeFirstOrThrow();
    expect(Boolean(row.truBuoiVangCoPhep)).toBe(false);
    expect(row.trangThai).toBe('hoat_dong');
    await expect(
      connection.query
        .insertInto('eduCoSo')
        .values({ ma: 'CS-MAU', ten: 'Trùng mã' })
        .execute(),
    ).rejects.toThrow();
    await connection.query
      .deleteFrom('eduCoSo')
      .where('ma', '=', 'CS-MAU')
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduCoSo').not.toExist();
    await expectCollection('eduXuatDuLieuNhatKy').not.toExist();
  },
});

describeMigration('202611090003_edu_buoi_hoc_rule_snapshot', {
  sources: [
    {
      packageName: 'nocoedu-migrations-test',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    },
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('eduBuoiHoc').toHaveField('truVangCoPhep', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduBuoiHoc').toExist();
    await expectCollection('eduBuoiHoc').not.toHaveField('truVangCoPhep');
  },
});
