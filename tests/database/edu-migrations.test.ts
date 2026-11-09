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

describeMigration('202611100001_edu_lark_mapping', {
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
      'eduLop',
      'eduLopLich',
      'eduHocVien',
      'eduPhuHuynh',
      'eduGoiHoc',
      'eduBuoiHoc',
      'eduDiemDanh',
    ]) {
      await expectCollection(name).toHaveField('externalId', {
        nullable: true,
      });
      await expectCollection(name).toHaveIndex(['externalId'], {
        unique: true,
      });
    }
    await expectCollection('eduHocVien').toHaveField('externalCode');
    await expectCollection('eduHocVien').toHaveField('ngaySinh', {
      nullable: true,
    });
    await expectCollection('eduPhuHuynh').toHaveField('email');
    await expectCollection('eduBuoiHoc').toHaveField('keHoachDay');
    await expectCollection('eduDiemDanh').toHaveField('yThucDiem');
    await expectCollection('eduDiemDanh').toHaveField('tinhVaoSoDu', {
      nullable: false,
    });
    await expectCollection('eduGoiHoc').toHaveField('loai', {
      nullable: false,
    });

    // Rows without an external id never collide; two rows with the same one do.
    await connection.query
      .insertInto('eduCoSo')
      .values([
        { ma: 'CS-A', ten: 'Cơ sở A' },
        { ma: 'CS-B', ten: 'Cơ sở B' },
      ])
      .execute();
    await connection.query
      .insertInto('eduCoSo')
      .values({ ma: 'CS-C', ten: 'Cơ sở C', externalId: 'lark:coSo:C' })
      .execute();
    await expect(
      connection.query
        .insertInto('eduCoSo')
        .values({ ma: 'CS-D', ten: 'Cơ sở D', externalId: 'lark:coSo:C' })
        .execute(),
    ).rejects.toThrow();
    await connection.query
      .deleteFrom('eduCoSo')
      .where('ma', 'in', ['CS-A', 'CS-B', 'CS-C'])
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduCoSo').toExist();
    await expectCollection('eduCoSo').not.toHaveField('externalId');
    await expectCollection('eduDiemDanh').not.toHaveField('tinhVaoSoDu');
    await expectCollection('eduGoiHoc').not.toHaveField('loai');
  },
});

describeMigration('202611100002_edu_nhap_lark', {
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
    await expectCollection('eduNhapLarkNhatKy').toExist();
    await expectCollection('eduNhapLarkNhatKy').toHaveField('trangThai', {
      nullable: false,
    });
    await expectCollection('eduBuoiHoc').toHaveField('truVangKhongPhep', {
      nullable: true,
    });
    // A log row keeps its totals as JSON; an old session has no fixed setting yet.
    await connection.query
      .insertInto('eduNhapLarkNhatKy')
      .values({
        batDauLuc: new Date(),
        nguoiChayId: 'user-mau',
        trangThai: 'thanh_cong',
        tongKet: { hocVien: { tao: 1 } },
      })
      .execute();
    const row = await connection.query
      .selectFrom('eduNhapLarkNhatKy')
      .select(['tongKet', 'ketThucLuc'])
      .executeTakeFirstOrThrow();
    expect(row.ketThucLuc).toBeNull();
    expect(row.tongKet).toEqual({ hocVien: { tao: 1 } });
    await connection.query
      .deleteFrom('eduNhapLarkNhatKy')
      .allowAllRows()
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduNhapLarkNhatKy').not.toExist();
    await expectCollection('eduBuoiHoc').toExist();
    await expectCollection('eduBuoiHoc').not.toHaveField('truVangKhongPhep');
    // The column added by the previous migration stays.
    await expectCollection('eduBuoiHoc').toHaveField('truVangCoPhep');
  },
});
