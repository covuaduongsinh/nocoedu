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

describeMigration('202611130001_edu_thanh_toan_external_id', {
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
    await expectCollection('eduThanhToan').toHaveField('externalId', {
      nullable: true,
    });
    await expectCollection('eduThanhToan').toHaveIndex(['externalId'], {
      unique: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduThanhToan').toExist();
    await expectCollection('eduThanhToan').not.toHaveField('externalId');
  },
});

describeMigration('202611130002_create_edu_sach', {
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
    await expectCollection('eduSach').toHaveField('kyHieu', {
      nullable: false,
    });
    await expectCollection('eduSach').toHaveIndex(['kyHieu'], { unique: true });
    await expectCollection('eduSach').toHaveIndex(['externalId'], {
      unique: true,
    });
    await connection.query
      .insertInto('eduSach')
      .values({ kyHieu: 'MAU1', ten: 'Sách Mẫu 1' })
      .execute();
    await expect(
      connection.query
        .insertInto('eduSach')
        .values({ kyHieu: 'MAU1', ten: 'Sách Mẫu khác' })
        .execute(),
    ).rejects.toThrow();
    await connection.query.deleteFrom('eduSach').allowAllRows().execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduSach').not.toExist();
  },
});

describeMigration('202611140001_create_edu_phat_sach', {
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
    await expectCollection('eduPhatSach').toHaveField('hocVienId', {
      nullable: false,
    });
    await expectCollection('eduPhatSach').toHaveField('tienSach', {
      nullable: false,
    });
    await expectCollection('eduPhatSach').toHaveIndex(['externalId'], {
      unique: true,
    });
    await expectCollection('eduPhatSach').toHaveIndex(['hocVienId', 'ngay']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduPhatSach').not.toExist();
  },
});

describeMigration('202611140003_create_edu_nop_sach', {
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
    await expectCollection('eduNopSach').toHaveField('soTien', {
      nullable: false,
    });
    await expectCollection('eduNopSach').toHaveIndex(['externalId'], {
      unique: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduNopSach').not.toExist();
  },
});

describeMigration('202611140004_create_edu_lien_he', {
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
    await expectCollection('eduLienHe').toHaveField('hoTen', {
      nullable: false,
    });
    await expectCollection('eduLienHe').toHaveField('coSoId', {
      nullable: false,
    });
    await expectCollection('eduLienHe').toHaveIndex(['coSoId', 'trangThai']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduLienHe').not.toExist();
  },
});

describeMigration('202611140005_create_edu_ho_so_gv', {
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
    await expectCollection('eduHoSoGv').toHaveField('thuLaoMotBuoi', {
      nullable: false,
    });
    await expectCollection('eduHoSoGv').toHaveIndex(['userId'], {
      unique: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduHoSoGv').not.toExist();
  },
});

describeMigration('202611140006_edu_thanh_toan_goi_hoc_nullable', {
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
    await expectCollection('eduThanhToan').toHaveField('goiHocId', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduThanhToan').toHaveField('goiHocId', {
      nullable: false,
    });
  },
});

describeMigration('202611140007_create_edu_sach_hoc', {
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
    await expectCollection('eduSachHoc').toHaveField('trangThai', {
      nullable: false,
    });
    await expectCollection('eduSachHoc').toHaveIndex(['hocVienId', 'sachId'], {
      unique: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduSachHoc').not.toExist();
  },
});

describeMigration('202611180001_edu_diem_danh_hoc_vien_index', {
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
    await expectCollection('eduDiemDanh').toHaveIndex(['hocVienId']);
    // The unique pair that already existed is untouched.
    await expectCollection('eduDiemDanh').toHaveIndex(
      ['buoiHocId', 'hocVienId'],
      { unique: true },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduDiemDanh').toExist();
    await expectCollection('eduDiemDanh').not.toHaveIndex(['hocVienId']);
    await expectCollection('eduDiemDanh').toHaveIndex(
      ['buoiHocId', 'hocVienId'],
      { unique: true },
    );
  },
});

describeMigration('202611180002_edu_lop_nhom', {
  sources: [
    {
      packageName: 'nocoedu-migrations-test',
      directory: path.resolve(
        import.meta.dirname,
        '../../database/main/migrations',
      ),
    },
  ],
  // Two classes exist before the migration: both must come out with the three standard groups.
  before: async ({ connection }) => {
    await connection.query
      .insertInto('eduCoSo')
      .values({ ma: 'CS-NHOM', ten: 'Cơ sở Mẫu' })
      .execute();
    const branch = await connection.query
      .selectFrom('eduCoSo')
      .select('id')
      .where('ma', '=', 'CS-NHOM')
      .executeTakeFirstOrThrow();
    for (const ma of ['L-NHOM-1', 'L-NHOM-2']) {
      await connection.query
        .insertInto('eduLop')
        .values({
          ma,
          ten: `Lớp Mẫu ${ma}`,
          coSoId: Number(branch.id),
          levelKey: 'tot',
          levelOrder: 1,
        })
        .execute();
    }
  },
  up: async ({ connection, expectCollection }) => {
    await expectCollection('eduLopNhom').toHaveField('ten', {
      nullable: false,
    });
    await expectCollection('eduLopNhom').toHaveIndex(['lopId', 'ten'], {
      unique: true,
    });
    await expectCollection('eduLopNhom').toHaveForeignKey(['lopId'], 'eduLop');
    await expectCollection('eduHocVien').toHaveField('nhomId', {
      nullable: true,
    });
    await expectCollection('eduHocVien').toHaveForeignKey(
      ['nhomId'],
      'eduLopNhom',
    );
    await expectCollection('eduHocVienChuyenNhom').toHaveField('denNhomId', {
      nullable: true,
    });
    await expectCollection('eduHocVienChuyenNhom').toHaveIndex(['hocVienId']);

    const groups = await connection.query
      .selectFrom('eduLopNhom')
      .select(['lopId', 'ten', 'thuTu', 'trangThai'])
      .orderBy('lopId')
      .orderBy('thuTu')
      .execute();
    expect(groups).toHaveLength(6);
    const perClass = new Map<number, string[]>();
    for (const group of groups) {
      expect(group.trangThai).toBe('hoat_dong');
      perClass.set(Number(group.lopId), [
        ...(perClass.get(Number(group.lopId)) ?? []),
        String(group.ten),
      ]);
    }
    expect(perClass.size).toBe(2);
    for (const names of perClass.values()) {
      expect(names).toEqual(['Nhập môn', 'Cơ bản', 'Nâng cao']);
    }
    // A name is unique inside a class.
    const first = groups[0];
    await expect(
      connection.query
        .insertInto('eduLopNhom')
        .values({ lopId: Number(first.lopId), ten: String(first.ten) })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduLopNhom').not.toExist();
    await expectCollection('eduHocVienChuyenNhom').not.toExist();
    await expectCollection('eduHocVien').toExist();
    await expectCollection('eduHocVien').not.toHaveField('nhomId');
  },
});
