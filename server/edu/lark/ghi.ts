import type { DatabaseManager } from '@nocobase/db';

import { levelOrder } from '../levels.js';
import { asText, codeFromId } from '../names.js';
import type {
  ExistingState,
  ExistingStudent,
  Plan,
  PlanTable,
} from './ke-hoach.js';
import { EMPTY_STATE } from './ke-hoach.js';

type Query = ReturnType<DatabaseManager['connection']>['query'];

/** Chunk size of a bulk insert: SQLite allows 999 bound values per statement, and no table here has more than 17 columns. */
const CHUNK = 50;

const MEMORY_TABLES = {
  lop: 'eduLop',
  lopLich: 'eduLopLich',
  phuHuynh: 'eduPhuHuynh',
  hocVien: 'eduHocVien',
  goiHoc: 'eduGoiHoc',
  buoiHoc: 'eduBuoiHoc',
  diemDanh: 'eduDiemDanh',
} as const;

/** An empty or blank external id is stored as `NULL`, never as `''`: a second `''` would break the unique index. */
export function externalIdOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** What NocoEdu holds now, read in a handful of queries (no query per row). */
export async function docTrangThaiHienCo(
  database: DatabaseManager,
): Promise<ExistingState> {
  const query = database.connection().query;
  const branches = (
    await query
      .selectFrom('eduCoSo')
      .select(['id', 'ma', 'externalId'])
      .execute()
  ).map((row) => ({
    id: Number(row.id),
    ma: asText(row.ma),
    externalId: externalIdOrNull(row.externalId),
  }));
  const sets: Record<string, Set<string>> = {};
  for (const [key, table] of Object.entries(MEMORY_TABLES)) {
    const rows = await query
      .selectFrom(table)
      .select('externalId')
      .where('externalId', 'is not', null)
      .execute();
    sets[key] = new Set(
      rows
        .map((row) => externalIdOrNull(row.externalId))
        .filter((id): id is string => id !== null),
    );
  }
  const parents = await query
    .selectFrom('eduPhuHuynh')
    .select(['id', 'soDienThoai', 'externalId'])
    .execute();
  const parentsByPhone = new Map(
    parents.map((row) => [
      asText(row.soDienThoai),
      { id: Number(row.id), externalId: externalIdOrNull(row.externalId) },
    ]),
  );
  const phoneOf = new Map(
    parents.map((row) => [Number(row.id), asText(row.soDienThoai)]),
  );
  const links = await query
    .selectFrom('eduHocVienPhuHuynh')
    .select(['hocVienId', 'phuHuynhId'])
    .execute();
  const withPackage = new Set(
    (await query.selectFrom('eduGoiHoc').select('hocVienId').execute()).map(
      (row) => Number(row.hocVienId),
    ),
  );
  const students: ExistingStudent[] = (
    await query
      .selectFrom('eduHocVien')
      .select(['id', 'hoTen', 'namSinh', 'externalId', 'soBuoiConLai'])
      .execute()
  ).map((row) => ({
    id: Number(row.id),
    hoTen: asText(row.hoTen),
    namSinh: Number(row.namSinh),
    externalId: externalIdOrNull(row.externalId),
    phones: links
      .filter((link) => Number(link.hocVienId) === Number(row.id))
      .map((link) => phoneOf.get(Number(link.phuHuynhId)) ?? '')
      .filter((phone) => phone !== ''),
    coSoDu: withPackage.has(Number(row.id)) || Number(row.soBuoiConLai) !== 0,
  }));
  const importedClasses = new Map(
    (
      await query
        .selectFrom('eduLop')
        .select(['id', 'externalId'])
        .where('externalId', 'is not', null)
        .execute()
    ).map((row) => [Number(row.id), asText(row.externalId)]),
  );
  const sessions = new Set<string>();
  for (const row of await query
    .selectFrom('eduBuoiHoc')
    .select(['lopId', 'ngay', 'gioBatDau'])
    .execute()) {
    const lop = importedClasses.get(Number(row.lopId));
    if (lop)
      sessions.add(`${lop}|${asText(row.ngay)}|${asText(row.gioBatDau)}`);
  }
  const usersByEmail = new Map<string, string>();
  for (const row of await query
    .selectFrom('user')
    .select(['id', 'email'])
    .execute()) {
    const email = asText(row.email).trim().toLowerCase();
    if (email) usersByEmail.set(email, asText(row.id));
  }
  return {
    ...EMPTY_STATE,
    branches,
    externalIds: sets as unknown as ExistingState['externalIds'],
    parentsByPhone,
    students,
    usersByEmail,
    sessions,
  };
}

async function insertAll(
  query: Query,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK)
    await query
      .insertInto(table)
      .values(rows.slice(i, i + CHUNK))
      .execute();
}

const tmpCode = () =>
  `TMP-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;

async function idsByExternalId(
  query: Query,
  table: string,
): Promise<Map<string, number>> {
  const rows = await query
    .selectFrom(table)
    .select(['id', 'externalId'])
    .where('externalId', 'is not', null)
    .execute();
  return new Map(rows.map((row) => [asText(row.externalId), Number(row.id)]));
}

export interface WriteTotals {
  readonly written: Readonly<Record<PlanTable, number>>;
  readonly ledgerRows: number;
}

/**
 * Writes the plan, all in one transaction. Rows marked `trung` are not touched; `ghep` rows only get the Lark ids
 * (`externalId`, `externalCode`) on the student, branch or parent that already exists, and only where they are still
 * empty. A failure anywhere rolls the whole transaction back.
 */
export async function ghiKeHoach(
  database: DatabaseManager,
  plan: Plan,
  options: { userId: string },
): Promise<WriteTotals> {
  const written = Object.fromEntries(
    [
      'coSo',
      'lop',
      'lopLich',
      'phuHuynh',
      'hocVien',
      'goiHoc',
      'buoiHoc',
      'diemDanh',
    ].map((table) => [table, 0]),
  ) as Record<PlanTable, number>;
  let ledgerRows = 0;

  await database.transaction(async (connection) => {
    const q = connection.query;

    // 1. Branches
    const branchIds = new Map<string, number>();
    for (const row of plan.coSo) {
      if (row.action === 'tao') {
        await q
          .insertInto('eduCoSo')
          .values({ ma: row.ma, ten: row.ten, externalId: row.externalId })
          .execute();
        written.coSo += 1;
      } else if (row.action === 'ghep' && row.existingId !== undefined) {
        await q
          .updateTable('eduCoSo')
          .set({ externalId: row.externalId })
          .where('id', '=', row.existingId)
          .where('externalId', 'is', null)
          .execute();
      }
    }
    for (const [externalId, id] of await idsByExternalId(q, 'eduCoSo'))
      branchIds.set(externalId, id);

    // 2. Classes, then their timetable
    const newClasses = plan.lop.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduLop',
      newClasses.map((row) => ({
        ma: tmpCode(),
        ten: row.ten,
        coSoId: branchIds.get(row.coSoKey),
        hlvId: row.hlvId,
        levelKey: row.levelKey,
        levelOrder: levelOrder(row.levelKey) ?? 1,
        externalId: row.externalId,
      })),
    );
    written.lop = newClasses.length;
    const classIds = await idsByExternalId(q, 'eduLop');
    for (const row of newClasses)
      await q
        .updateTable('eduLop')
        .set({ ma: codeFromId('L', classIds.get(row.externalId) ?? 0) })
        .where('externalId', '=', row.externalId)
        .execute();
    const newLich = plan.lopLich.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduLopLich',
      newLich.map((row) => ({
        lopId: classIds.get(row.lopKey),
        thu: row.thu,
        gioBatDau: row.gioBatDau,
        gioKetThuc: row.gioKetThuc,
        externalId: row.externalId,
      })),
    );
    written.lopLich = newLich.length;

    // 3. Parents
    const newParents = plan.phuHuynh.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduPhuHuynh',
      newParents.map((row) => ({
        ma: tmpCode(),
        hoTen: row.hoTen,
        soDienThoai: row.soDienThoai,
        email: row.email,
        externalId: row.externalId,
      })),
    );
    written.phuHuynh = newParents.length;
    for (const row of plan.phuHuynh.filter(
      (item) => item.action === 'ghep' && item.existingId !== undefined,
    ))
      await q
        .updateTable('eduPhuHuynh')
        .set({ externalId: row.externalId })
        .where('id', '=', row.existingId as number)
        .where('externalId', 'is', null)
        .execute();
    const parentIds = await idsByExternalId(q, 'eduPhuHuynh');
    for (const row of newParents)
      await q
        .updateTable('eduPhuHuynh')
        .set({ ma: codeFromId('PH', parentIds.get(row.externalId) ?? 0) })
        .where('externalId', '=', row.externalId)
        .execute();
    const parentIdOf = (key: string): number | undefined => {
      const row = plan.phuHuynh.find((item) => item.externalId === key);
      return row?.action === 'ghep' ? row.existingId : parentIds.get(key);
    };

    // 4. Students and the link to their parents
    const newStudents = plan.hocVien.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduHocVien',
      newStudents.map((row) => ({
        ma: tmpCode(),
        hoTen: row.hoTen,
        namSinh: row.namSinh,
        ngaySinh: row.ngaySinh,
        levelKey: row.levelKey,
        levelOrder: levelOrder(row.levelKey) ?? 1,
        lopId: row.lopKey ? (classIds.get(row.lopKey) ?? null) : null,
        coSoId: branchIds.get(row.coSoKey),
        trangThai: row.trangThai,
        soBuoiConLai: 0,
        externalId: row.externalId,
        externalCode: row.externalCode,
      })),
    );
    written.hocVien = newStudents.length;
    for (const row of plan.hocVien.filter(
      (item) => item.action === 'ghep' && item.existingId !== undefined,
    ))
      await q
        .updateTable('eduHocVien')
        .set({ externalId: row.externalId, externalCode: row.externalCode })
        .where('id', '=', row.existingId as number)
        .where('externalId', 'is', null)
        .execute();
    const studentIds = await idsByExternalId(q, 'eduHocVien');
    for (const row of newStudents)
      await q
        .updateTable('eduHocVien')
        .set({ ma: codeFromId('HS', studentIds.get(row.externalId) ?? 0) })
        .where('externalId', '=', row.externalId)
        .execute();
    await insertAll(
      q,
      'eduHocVienPhuHuynh',
      newStudents.flatMap((row) =>
        row.parents.flatMap((parent) => {
          const phuHuynhId = parentIdOf(parent.key);
          return phuHuynhId === undefined
            ? []
            : [
                {
                  hocVienId: studentIds.get(row.externalId),
                  phuHuynhId,
                  quanHe: parent.quanHe,
                  lienHeChinh: parent.lienHeChinh,
                },
              ];
        }),
      ),
    );

    // 5. Opening packages
    const newPackages = plan.goiHoc.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduGoiHoc',
      newPackages.map((row) => ({
        hocVienId: studentIds.get(row.hocVienKey),
        soBuoi: row.soBuoi,
        donGia: 0,
        thanhTien: 0,
        ngayMua: row.ngayChot,
        trangThai: 'hieu_luc',
        nguoiTaoId: options.userId,
        loai: 'chuyen_so_du',
        ghiChu: 'chuyen_tu_lark',
        externalId: row.externalId,
      })),
    );
    written.goiHoc = newPackages.length;
    const packageIds = await idsByExternalId(q, 'eduGoiHoc');

    // 6. Sessions and attendance
    const classHlv = new Map(
      plan.lop.map((row) => [row.externalId, row.hlvId]),
    );
    const newSessions = plan.buoiHoc.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduBuoiHoc',
      newSessions.map((row) => ({
        lopId: classIds.get(row.lopKey),
        ngay: row.ngay,
        gioBatDau: row.gioBatDau,
        gioKetThuc: row.gioKetThuc,
        hlvId: classHlv.get(row.lopKey) ?? null,
        loai: 'thuong',
        trangThai: 'da_diem_danh',
        keHoachDay: row.keHoachDay,
        kienThucMoi: row.kienThucMoi,
        giaoBtvn: row.giaoBtvn,
        keHoachBuoiSau: row.keHoachBuoiSau,
        truVangCoPhep: row.truVangCoPhep,
        truVangKhongPhep: row.truVangKhongPhep,
        externalId: row.externalId,
      })),
    );
    written.buoiHoc = newSessions.length;
    const sessionIds = await idsByExternalId(q, 'eduBuoiHoc');
    const newAttendance = plan.diemDanh.filter((row) => row.action === 'tao');
    await insertAll(
      q,
      'eduDiemDanh',
      newAttendance.map((row) => ({
        buoiHocId: sessionIds.get(row.buoiKey),
        hocVienId: studentIds.get(row.hocVienKey),
        trangThai: row.trangThai,
        daLamBtvn: row.daLamBtvn,
        nhanXet: row.nhanXet,
        yThucDiem: row.yThucDiem,
        soBuoiDaTru: row.soBuoiDaTru,
        tinhVaoSoDu: row.tinhVaoSoDu,
        nguoiDiemDanhId: options.userId,
        externalId: row.externalId,
      })),
    );
    written.diemDanh = newAttendance.length;
    const attendanceIds = await idsByExternalId(q, 'eduDiemDanh');

    // 7. Balance: the opening package, then one deduction per new attendance row, each with its ledger row.
    const sessionDate = new Map(
      plan.buoiHoc.map((row) => [row.externalId, row.ngay]),
    );
    const students = new Set<string>([
      ...newPackages.map((row) => row.hocVienKey),
      ...newAttendance
        .filter((row) => row.soBuoiDaTru > 0)
        .map((row) => row.hocVienKey),
    ]);
    for (const key of students) {
      const hocVienId = studentIds.get(key);
      if (hocVienId === undefined) continue;
      const current = await q
        .selectFrom('eduHocVien')
        .select('soBuoiConLai')
        .where('id', '=', hocVienId)
        .executeTakeFirstOrThrow();
      const before = Number(current.soBuoiConLai);
      let balance = before;
      const ledger: Record<string, unknown>[] = [];
      const entry = (
        thayDoi: number,
        lyDo: string,
        extra: Record<string, unknown>,
      ) => {
        balance += thayDoi;
        ledger.push({
          hocVienId,
          thayDoi,
          soDuSau: balance,
          lyDo,
          nguoiThucHienId: options.userId,
          createdAt: new Date(),
          ...extra,
        });
      };
      for (const pack of newPackages.filter((row) => row.hocVienKey === key))
        entry(pack.soBuoi, 'chuyen_tu_lark', {
          goiHocId: packageIds.get(pack.externalId) ?? null,
        });
      const deductions = newAttendance
        .filter((row) => row.hocVienKey === key && row.soBuoiDaTru > 0)
        .sort((a, b) =>
          (sessionDate.get(a.buoiKey) ?? '').localeCompare(
            sessionDate.get(b.buoiKey) ?? '',
          ),
        );
      for (const row of deductions)
        entry(-row.soBuoiDaTru, 'diem_danh', {
          diemDanhId: attendanceIds.get(row.externalId) ?? null,
        });
      if (ledger.length === 0) continue;
      await insertAll(q, 'eduSoDuNhatKy', ledger);
      ledgerRows += ledger.length;
      // Guarded by the balance it was computed from: a save from the application in between stops the import.
      const updated = await q
        .updateTable('eduHocVien')
        .set({ soBuoiConLai: balance })
        .where('id', '=', hocVienId)
        .where('soBuoiConLai', '=', before)
        .execute();
      if (updated.updatedCount !== 1)
        throw new Error(
          'EDU_BALANCE_CONFLICT: a balance changed during the import.',
        );
    }
  });
  return { written, ledgerRows };
}

/** One row of `eduNhapLarkNhatKy`: counts and reason codes only. Written in its own transaction so a failure is kept. */
export async function ghiNhatKy(
  database: DatabaseManager,
  entry: {
    batDauLuc: Date;
    nguoiChayId: string;
    trangThai: 'thanh_cong' | 'that_bai';
    tongKet: unknown;
  },
): Promise<void> {
  await database.transaction(async (connection) => {
    await connection.query
      .insertInto('eduNhapLarkNhatKy')
      .values({
        batDauLuc: entry.batDauLuc,
        ketThucLuc: new Date(),
        nguoiChayId: entry.nguoiChayId,
        trangThai: entry.trangThai,
        tongKet: entry.tongKet as never,
      })
      .execute();
  });
}

/** True when the user id exists in the application's user table. */
export async function userExists(
  database: DatabaseManager,
  userId: string,
): Promise<boolean> {
  const row = await database
    .connection()
    .query.selectFrom('user')
    .select('id')
    .where('id', '=', userId)
    .executeTakeFirst();
  return row !== undefined;
}
