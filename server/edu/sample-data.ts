import type { DatabaseManager } from '@nocobase/db';

import { codeFromId } from './names.js';
import { levelOrder } from './levels.js';
import { addDays, todayVn } from './so-du.js';

/**
 * Made-up sample data for trying NocoEdu: 2 branches, 3 classes, 10 students with a parent each. Every name says it is
 * a sample ("Học viên Mẫu 01"), phone numbers are the reserved-looking `09000000xx`, and nothing is real. It is
 * loaded only on request (`APP_SAMPLE_DATA`, see `cli/commands/edu/sample-data.ts`) and is safe to run twice: it stops
 * if the sample branch already exists.
 */
export interface SampleAccounts {
  readonly managerId?: string;
  readonly coachId?: string;
}

const CLASSES = [
  { ma: 'MAU-L1', ten: 'Lớp Mẫu Tốt', branch: 0, level: 'tot', thu: [2, 4] },
  { ma: 'MAU-L2', ten: 'Lớp Mẫu Mã', branch: 0, level: 'ma', thu: [3, 5] },
  { ma: 'MAU-L3', ten: 'Lớp Mẫu Xe', branch: 1, level: 'xe', thu: [7] },
] as const;

export async function seedSampleData(
  database: DatabaseManager,
  accounts: SampleAccounts = {},
): Promise<{ created: boolean; students: number }> {
  const query = database.connection().query;
  const exists = await query
    .selectFrom('eduCoSo')
    .select('id')
    .where('ma', '=', 'MAU-CS1')
    .executeTakeFirst();
  if (exists) return { created: false, students: 0 };

  return database.transaction(async (connection) => {
    const q = connection.query;
    const branchIds: number[] = [];
    for (const [index, ma] of ['MAU-CS1', 'MAU-CS2'].entries()) {
      await q
        .insertInto('eduCoSo')
        .values({
          ma,
          ten: `Cơ sở Mẫu ${index + 1}`,
          diaChi: 'Địa chỉ mẫu (không có thật)',
          truBuoiVangCoPhep: false,
        })
        .execute();
      const row = await q
        .selectFrom('eduCoSo')
        .select('id')
        .where('ma', '=', ma)
        .executeTakeFirstOrThrow();
      branchIds.push(Number(row.id));
    }
    if (accounts.managerId) {
      await q
        .insertInto('eduCoSoQuanLy')
        .values({ coSoId: branchIds[0], userId: accounts.managerId })
        .execute();
    }
    const classIds: number[] = [];
    for (const lop of CLASSES) {
      await q
        .insertInto('eduLop')
        .values({
          ma: lop.ma,
          ten: lop.ten,
          coSoId: branchIds[lop.branch],
          hlvId: lop.branch === 0 ? (accounts.coachId ?? null) : null,
          levelKey: lop.level,
          levelOrder: levelOrder(lop.level) ?? 1,
        })
        .execute();
      const row = await q
        .selectFrom('eduLop')
        .select('id')
        .where('ma', '=', lop.ma)
        .executeTakeFirstOrThrow();
      classIds.push(Number(row.id));
      for (const thu of lop.thu) {
        await q
          .insertInto('eduLopLich')
          .values({
            lopId: Number(row.id),
            thu,
            gioBatDau: '17:30',
            gioKetThuc: '19:00',
          })
          .execute();
      }
    }
    const today = todayVn();
    for (let i = 1; i <= 10; i += 1) {
      const nn = String(i).padStart(2, '0');
      const classIndex = i <= 4 ? 0 : i <= 7 ? 1 : 2;
      const lop = CLASSES[classIndex];
      const student = await connection.repository('eduHocVien').createOne({
        values: {
          ma: `TMP-${crypto.randomUUID()}`,
          hoTen: `Học viên Mẫu ${nn}`,
          namSinh: 2014 + (i % 5),
          levelKey: lop.level,
          levelOrder: levelOrder(lop.level) ?? 1,
          lopId: classIds[classIndex],
          coSoId: branchIds[lop.branch],
          trangThai: 'dang_hoc',
          ghiChuHlv: null,
          soBuoiConLai: 0,
        },
      });
      const studentId = Number(student.record.id);
      await q
        .updateTable('eduHocVien')
        .set({ ma: codeFromId('HS', studentId) })
        .where('id', '=', studentId)
        .execute();
      // The balance comes from a package and the ledger, like a real one: 10 sessions bought, then an adjustment
      // down to the sample value (a few students are close to running out so the warnings show).
      const target = i % 4 === 0 ? 2 : i % 5 === 0 ? 1 : 8;
      await q
        .insertInto('eduGoiHoc')
        .values({
          hocVienId: studentId,
          soBuoi: 10,
          donGia: 150000,
          thanhTien: 1500000,
          ngayMua: addDays(today, -30),
          nguoiTaoId: 'mau',
        })
        .execute();
      const pack = await q
        .selectFrom('eduGoiHoc')
        .select('id')
        .where('hocVienId', '=', studentId)
        .executeTakeFirstOrThrow();
      const ledger = [
        {
          thayDoi: 10,
          soDuSau: 10,
          lyDo: 'mua_goi',
          goiHocId: Number(pack.id),
          ghiChu: null,
        },
        ...(target < 10
          ? [
              {
                thayDoi: target - 10,
                soDuSau: target,
                lyDo: 'dieu_chinh',
                goiHocId: null,
                ghiChu: 'Số dư mẫu',
              },
            ]
          : []),
      ];
      for (const entry of ledger) {
        await q
          .insertInto('eduSoDuNhatKy')
          .values({
            hocVienId: studentId,
            ...entry,
            nguoiThucHienId: 'mau',
            createdAt: new Date(),
          })
          .execute();
      }
      await q
        .updateTable('eduHocVien')
        .set({ soBuoiConLai: target })
        .where('id', '=', studentId)
        .execute();
      const parent = await connection.repository('eduPhuHuynh').createOne({
        values: {
          ma: `TMP-${crypto.randomUUID()}`,
          hoTen: `Phụ huynh Mẫu ${nn}`,
          soDienThoai: `090000${String(1000 + i).slice(1)}0`.slice(0, 10),
          zalo: null,
          ghiChu: null,
        },
      });
      const parentId = Number(parent.record.id);
      await q
        .updateTable('eduPhuHuynh')
        .set({ ma: codeFromId('PH', parentId) })
        .where('id', '=', parentId)
        .execute();
      await q
        .insertInto('eduHocVienPhuHuynh')
        .values({
          hocVienId: studentId,
          phuHuynhId: parentId,
          quanHe: i % 2 ? 'me' : 'bo',
          lienHeChinh: true,
        })
        .execute();
      await q
        .insertInto('eduDongY')
        .values({
          hocVienId: studentId,
          phuHuynhId: parentId,
          mucDich: 'hoc_tap',
          dongY: true,
          treDongY: false,
          phienBanDieuKhoan: 'mau-1',
          thoiDiem: new Date(),
          kenh: 'giay',
          nguoiGhiNhanId: 'mau',
        })
        .execute();
    }
    // One session per class: the first today (to show on the home page), one a few days ago left unmarked.
    for (const lopId of classIds) {
      for (const ngay of [today, addDays(today, -3)]) {
        await q
          .insertInto('eduBuoiHoc')
          .values({
            lopId,
            ngay,
            gioBatDau: '17:30',
            gioKetThuc: '19:00',
            hlvId: null,
            loai: 'thuong',
            trangThai: 'du_kien',
          })
          .execute();
      }
    }
    return { created: true, students: 10 };
  });
}
