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

describeMigration('202611180002_create_edu_lop_nhom', {
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
    await expectCollection('eduLopNhom').toExist();
    await expectCollection('eduLopNhom').toHaveIndex(['lopId', 'ten'], {
      unique: true,
    });
    await expectCollection('eduHocVien').toHaveField('nhomId', {
      nullable: true,
    });
    await expectCollection('eduHocVien').toHaveIndex(['nhomId']);
    await expectCollection('eduHocVienChuyenNhom').toHaveField('hocVienId', {
      nullable: false,
    });
    await expectCollection('eduHocVienChuyenNhom').toHaveIndex(['hocVienId']);

    // A name is unique inside a class, and a name may repeat in another class.
    const q = connection.query;
    await q
      .insertInto('eduCoSo')
      .values({ ma: 'CS-NH', ten: 'Cơ sở Mẫu' })
      .execute();
    const coSo = await q
      .selectFrom('eduCoSo')
      .select('id')
      .where('ma', '=', 'CS-NH')
      .executeTakeFirstOrThrow();
    for (const ma of ['L-NH1', 'L-NH2']) {
      await q
        .insertInto('eduLop')
        .values({
          ma,
          ten: `Lớp ${ma}`,
          coSoId: coSo.id,
          levelKey: 'tot',
          levelOrder: 1,
        })
        .execute();
    }
    const lops = await q
      .selectFrom('eduLop')
      .select('id')
      .where('ma', 'in', ['L-NH1', 'L-NH2'])
      .execute();
    const [first, second] = lops.map((lop) => Number(lop.id)) as [
      number,
      number,
    ];
    await q
      .insertInto('eduLopNhom')
      .values({ lopId: first, ten: 'Nhóm A' })
      .execute();
    await q
      .insertInto('eduLopNhom')
      .values({ lopId: second, ten: 'Nhóm A' })
      .execute();
    await expect(
      q
        .insertInto('eduLopNhom')
        .values({ lopId: first, ten: 'Nhóm A' })
        .execute(),
    ).rejects.toThrow();
    const group = await q
      .selectFrom('eduLopNhom')
      .select(['trangThai', 'thuTu'])
      .where('lopId', '=', first)
      .executeTakeFirstOrThrow();
    expect(group).toMatchObject({ trangThai: 'hoat_dong', thuTu: 0 });
    // The check runs again after the migration is rolled back and applied once more: leave nothing behind.
    await q.deleteFrom('eduLopNhom').allowAllRows().execute();
    await q.deleteFrom('eduLop').where('coSoId', '=', coSo.id).execute();
    await q.deleteFrom('eduCoSo').where('id', '=', coSo.id).execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduLopNhom').not.toExist();
    await expectCollection('eduHocVienChuyenNhom').not.toExist();
    await expectCollection('eduHocVien').toExist();
    await expectCollection('eduHocVien').not.toHaveField('nhomId');
  },
});

describeMigration('202611180004_create_edu_kien_thuc', {
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
      'eduChuDe',
      'eduKyNang',
      'eduBuoiHocKyNang',
      'eduHocVienKyNang',
    ]) {
      await expectCollection(name).toExist();
    }
    // Nothing is seeded: the head coach loads the curriculum from a CSV file.
    for (const name of ['eduChuDe', 'eduKyNang']) {
      expect(
        await connection.query.selectFrom(name).select('id').execute(),
      ).toHaveLength(0);
    }
    await expectCollection('eduChuDe').toHaveIndex(['ma'], { unique: true });
    await expectCollection('eduKyNang').toHaveIndex(['ma'], { unique: true });
    await expectCollection('eduHocVienKyNang').toHaveIndex(
      ['hocVienId', 'kyNangId'],
      { unique: true },
    );
    await expectCollection('eduBuoiHocKyNang').toHaveField('nhomId', {
      nullable: true,
    });

    // A topic, a skill and its state; a code and a (student, skill) pair are taken once.
    await connection.query
      .insertInto('eduChuDe')
      .values({ levelKey: 'tot', ma: 'CD-MAU', ten: 'Chủ đề Mẫu' })
      .execute();
    const topic = await connection.query
      .selectFrom('eduChuDe')
      .select(['id', 'thuTu', 'trangThai'])
      .where('ma', '=', 'CD-MAU')
      .executeTakeFirstOrThrow();
    expect(Number(topic.thuTu)).toBe(0);
    expect(topic.trangThai).toBe('hoat_dong');
    await expect(
      connection.query
        .insertInto('eduChuDe')
        .values({ levelKey: 'ma', ma: 'CD-MAU', ten: 'Trùng mã' })
        .execute(),
    ).rejects.toThrow();
    await connection.query
      .insertInto('eduKyNang')
      .values({ chuDeId: Number(topic.id), ma: 'KN-MAU', ten: 'Kỹ năng Mẫu' })
      .execute();
    const skill = await connection.query
      .selectFrom('eduKyNang')
      .select('id')
      .where('ma', '=', 'KN-MAU')
      .executeTakeFirstOrThrow();
    await expect(
      connection.query
        .insertInto('eduKyNang')
        .values({ chuDeId: 999_999, ma: 'KN-LAC', ten: 'Chủ đề không có' })
        .execute(),
    ).rejects.toThrow();
    await connection.query
      .insertInto('eduCoSo')
      .values({ ma: 'CS-KT', ten: 'Cơ sở Mẫu' })
      .execute();
    const branch = await connection.query
      .selectFrom('eduCoSo')
      .select('id')
      .where('ma', '=', 'CS-KT')
      .executeTakeFirstOrThrow();
    await connection.query
      .insertInto('eduHocVien')
      .values({
        ma: 'HS-KT',
        hoTen: 'Học viên Mẫu 01',
        namSinh: 2016,
        levelKey: 'tot',
        levelOrder: 1,
        coSoId: Number(branch.id),
      })
      .execute();
    const student = await connection.query
      .selectFrom('eduHocVien')
      .select('id')
      .where('ma', '=', 'HS-KT')
      .executeTakeFirstOrThrow();
    const state = {
      hocVienId: Number(student.id),
      kyNangId: Number(skill.id),
      mucDo: 'da_hoc',
      nguon: 'buoi_hoc',
      capNhatLuc: new Date('2026-11-02T10:00:00.000Z'),
    };
    await connection.query
      .insertInto('eduHocVienKyNang')
      .values(state)
      .execute();
    await expect(
      connection.query.insertInto('eduHocVienKyNang').values(state).execute(),
    ).rejects.toThrow();
    // The check runs again after the roll back: leave the students and branches as they were.
    await connection.query
      .deleteFrom('eduHocVienKyNang')
      .allowAllRows()
      .execute();
    await connection.query
      .deleteFrom('eduHocVien')
      .where('ma', '=', 'HS-KT')
      .execute();
    await connection.query
      .deleteFrom('eduCoSo')
      .where('ma', '=', 'CS-KT')
      .execute();
  },
  down: async ({ expectCollection }) => {
    for (const name of [
      'eduChuDe',
      'eduKyNang',
      'eduBuoiHocKyNang',
      'eduHocVienKyNang',
    ]) {
      await expectCollection(name).not.toExist();
    }
    // The tables the knowledge system points at are untouched.
    await expectCollection('eduHocVien').toExist();
    await expectCollection('eduBuoiHoc').toExist();
    await expectCollection('eduLopNhom').toExist();
  },
});

describeMigration('202611200001_edu_co_so_tru_vang_khong_phep', {
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
    await expectCollection('eduCoSo').toHaveField('truVangKhongPhepTuNgay', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    // The branch keeps its other setting.
    await expectCollection('eduCoSo').toHaveField('truBuoiVangCoPhep', {
      nullable: false,
    });
  },
});

describeMigration('202611190001_create_edu_phieu_bao', {
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
    await expectCollection('eduPhieuBao').toExist();
    // A term that is a manual adjustment has no package.
    await expectCollection('eduPhieuBao').toHaveField('goiHocId', {
      nullable: true,
    });
    await expectCollection('eduPhieuBao').toHaveField('ngay', {
      nullable: false,
    });
    await expectCollection('eduPhieuBao').toHaveIndex(['hocVienId', 'ngay']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('eduPhieuBao').not.toExist();
    // The tables the marks point at are untouched.
    await expectCollection('eduHocVien').toExist();
    await expectCollection('eduGoiHoc').toExist();
  },
});

describeMigration('202611180005_create_edu_kiem_tra', {
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
      'eduBaiKiemTra',
      'eduBaiKiemTraKyNang',
      'eduKetQuaKiemTra',
    ]) {
      await expectCollection(name).toExist();
    }
    await expectCollection('eduBaiKiemTraKyNang').toHaveIndex(
      ['baiKiemTraId', 'kyNangId'],
      { unique: true },
    );
    await expectCollection('eduKetQuaKiemTra').toHaveIndex(
      ['baiKiemTraId', 'hocVienId', 'kyNangId'],
      { unique: true },
    );
    await expectCollection('eduKetQuaKiemTra').toHaveIndex(['hocVienId']);
    await expectCollection('eduBaiKiemTra').toHaveIndex(['lopId']);
    await expectCollection('eduBaiKiemTra').toHaveField('chotLuc', {
      nullable: true,
    });

    // A branch, a class, a student and a skill to point at.
    const q = connection.query;
    await q
      .insertInto('eduCoSo')
      .values({ ma: 'CS-KTR', ten: 'Cơ sở Mẫu' })
      .execute();
    const branch = Number(
      (
        await q
          .selectFrom('eduCoSo')
          .select('id')
          .where('ma', '=', 'CS-KTR')
          .executeTakeFirstOrThrow()
      ).id,
    );
    await q
      .insertInto('eduLop')
      .values({
        ma: 'L-KTR',
        ten: 'Lớp Mẫu',
        coSoId: branch,
        levelKey: 'tot',
        levelOrder: 1,
      })
      .execute();
    const lop = Number(
      (
        await q
          .selectFrom('eduLop')
          .select('id')
          .where('ma', '=', 'L-KTR')
          .executeTakeFirstOrThrow()
      ).id,
    );
    await q
      .insertInto('eduHocVien')
      .values({
        ma: 'HS-KTR',
        hoTen: 'Học viên Mẫu 01',
        namSinh: 2016,
        levelKey: 'tot',
        levelOrder: 1,
        lopId: lop,
        coSoId: branch,
      })
      .execute();
    const student = Number(
      (
        await q
          .selectFrom('eduHocVien')
          .select('id')
          .where('ma', '=', 'HS-KTR')
          .executeTakeFirstOrThrow()
      ).id,
    );
    await q
      .insertInto('eduChuDe')
      .values({ levelKey: 'tot', ma: 'CD-KTR', ten: 'Chủ đề Mẫu' })
      .execute();
    const topic = Number(
      (
        await q
          .selectFrom('eduChuDe')
          .select('id')
          .where('ma', '=', 'CD-KTR')
          .executeTakeFirstOrThrow()
      ).id,
    );
    await q
      .insertInto('eduKyNang')
      .values({ chuDeId: topic, ma: 'KN-KTR', ten: 'Kỹ năng Mẫu' })
      .execute();
    const skill = Number(
      (
        await q
          .selectFrom('eduKyNang')
          .select('id')
          .where('ma', '=', 'KN-KTR')
          .executeTakeFirstOrThrow()
      ).id,
    );

    // A test starts as a draft with no closing time; its skills and marks are unique per test.
    await q
      .insertInto('eduBaiKiemTra')
      .values({
        ten: 'Bài kiểm tra Mẫu',
        loai: 'len_cap',
        levelKey: 'tot',
        lopId: lop,
        coSoId: branch,
        ngay: '2026-11-18',
        diemDat: 70,
        createdAt: new Date('2026-11-18T03:00:00.000Z'),
      })
      .execute();
    const test = await q
      .selectFrom('eduBaiKiemTra')
      .select(['id', 'trangThai', 'chotLuc'])
      .where('lopId', '=', lop)
      .executeTakeFirstOrThrow();
    expect(test.trangThai).toBe('nhap');
    expect(test.chotLuc).toBeNull();
    const testId = Number(test.id);
    await q
      .insertInto('eduBaiKiemTraKyNang')
      .values({ baiKiemTraId: testId, kyNangId: skill, diemToiDa: 10 })
      .execute();
    await expect(
      q
        .insertInto('eduBaiKiemTraKyNang')
        .values({ baiKiemTraId: testId, kyNangId: skill, diemToiDa: 5 })
        .execute(),
    ).rejects.toThrow();
    const mark = {
      baiKiemTraId: testId,
      hocVienId: student,
      kyNangId: skill,
      diem: 8,
      capNhatLuc: new Date('2026-11-18T04:00:00.000Z'),
    };
    await q.insertInto('eduKetQuaKiemTra').values(mark).execute();
    await expect(
      q.insertInto('eduKetQuaKiemTra').values(mark).execute(),
    ).rejects.toThrow();
    // A mark of a test or a skill that does not exist is refused.
    await expect(
      q
        .insertInto('eduKetQuaKiemTra')
        .values({ ...mark, baiKiemTraId: 999_999 })
        .execute(),
    ).rejects.toThrow();
    await expect(
      q
        .insertInto('eduBaiKiemTraKyNang')
        .values({ baiKiemTraId: testId, kyNangId: 999_999, diemToiDa: 1 })
        .execute(),
    ).rejects.toThrow();

    // The check runs again after the roll back: leave nothing behind.
    await q.deleteFrom('eduKetQuaKiemTra').allowAllRows().execute();
    await q.deleteFrom('eduBaiKiemTraKyNang').allowAllRows().execute();
    await q.deleteFrom('eduBaiKiemTra').allowAllRows().execute();
    await q.deleteFrom('eduKyNang').where('id', '=', skill).execute();
    await q.deleteFrom('eduChuDe').where('id', '=', topic).execute();
    await q.deleteFrom('eduHocVien').where('id', '=', student).execute();
    await q.deleteFrom('eduLop').where('id', '=', lop).execute();
    await q.deleteFrom('eduCoSo').where('id', '=', branch).execute();
  },
  down: async ({ expectCollection }) => {
    for (const name of [
      'eduBaiKiemTra',
      'eduBaiKiemTraKyNang',
      'eduKetQuaKiemTra',
    ]) {
      await expectCollection(name).not.toExist();
    }
    // The tables the tests point at are untouched.
    await expectCollection('eduLop').toExist();
    await expectCollection('eduHocVien').toExist();
    await expectCollection('eduKyNang').toExist();
  },
});
