/**
 * Import of one kind of record from a CSV file (branches, classes, books, coach profiles, admissions contacts, books
 * handed out, packages, attendance).
 *
 * Every row is written through the policy of the action the caller holds for that kind of record, and anything it
 * refers to (a branch, a class, a student) is looked up through the caller's own `view` policy: a code outside the
 * caller's scope reads as unknown, exactly like a code that does not exist. A package and an attendance row move the
 * balance only through `ghi-so-du.ts`; a book handed out goes through `ghi-sach.ts`.
 *
 * `runImport` writes each row in its own savepoint inside the caller's transaction and reports the rows that could
 * not be written by line number and reason code, never by name or phone number. The caller rolls the transaction
 * back for a preview, and for a confirmation when a single row has a problem: an import is all or nothing.
 */
import { ApiError } from '@nocobase/app-server/router';
import type { DatabaseConnection, RepositoryPolicy } from '@nocobase/db';

import { handOutBook } from './ghi-sach.js';
import { recordPayment, saveAttendance, sellPackage } from './ghi-so-du.js';
import { LEVEL_KEYS, levelOrder } from './levels.js';
import { asText } from './names.js';
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
  todayVn,
  weekdayOf,
} from './so-du.js';
import { STATUSES } from './sua-ban-ghi.js';

export const IMPORT_KINDS = [
  'coSo',
  'lop',
  'sach',
  'hoSoGv',
  'tuyenSinh',
  'phatSach',
  'goiHoc',
  'diemDanh',
] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** A file holds at most this many rows (the students import has the same limit). */
export const MAX_IMPORT_ROWS = 2000;

interface Definition {
  /** Columns the file may have; the first `required` ones must be there. */
  readonly columns: readonly string[];
  readonly required: readonly string[];
  /** Made-up rows of the template. */
  readonly sample: readonly (readonly string[])[];
  /** The action that opens this import, and the collection it writes. */
  readonly gate: {
    readonly resource: string;
    readonly action: string;
    readonly collection: string;
  };
}

export const IMPORTS: Readonly<Record<ImportKind, Definition>> = {
  coSo: {
    columns: ['ma', 'ten', 'diaChi', 'truBuoiVangCoPhep', 'trangThai'],
    required: ['ma', 'ten'],
    sample: [
      ['CS-MAU-1', 'Cơ sở Mẫu 1', 'Số 1 đường Mẫu', 'false', 'hoat_dong'],
    ],
    gate: { resource: 'edu.coSo', action: 'manage', collection: 'eduCoSo' },
  },
  lop: {
    columns: ['ma', 'ten', 'coSoMa', 'levelKey', 'trangThai'],
    required: ['ma', 'ten', 'coSoMa'],
    sample: [['LOP-MAU-1', 'Lớp Mẫu 1', 'CS-MAU-1', 'tot', 'dang_mo']],
    gate: { resource: 'edu.lop', action: 'manage', collection: 'eduLop' },
  },
  sach: {
    columns: ['kyHieu', 'ten', 'giaBia', 'giaBan', 'trangThai'],
    required: ['kyHieu', 'ten'],
    sample: [['CT-MAU-1', 'Giáo trình Mẫu 1', '60000', '50000', 'dang_ban']],
    gate: { resource: 'edu.sach', action: 'manage', collection: 'eduSach' },
  },
  hoSoGv: {
    columns: ['email', 'tenVietTat', 'viTri', 'thuLaoMotBuoi', 'tinhTrang'],
    required: ['email'],
    sample: [['hlv.mau@example.com', 'HLV Mẫu', 'HLV', '150000', 'dang_lam']],
    gate: { resource: 'edu.hoSoGv', action: 'manage', collection: 'eduHoSoGv' },
  },
  tuyenSinh: {
    columns: [
      'hoTen',
      'soDienThoai',
      'coSoMa',
      'kenh',
      'trangThai',
      'ghiChu',
      'ngayNhac',
    ],
    required: ['hoTen', 'coSoMa'],
    sample: [
      [
        'Phụ huynh Mẫu 1',
        '0900000001',
        'CS-MAU-1',
        'Giới thiệu',
        'moi',
        '',
        '2026-12-01',
      ],
    ],
    gate: {
      resource: 'edu.tuyenSinh',
      action: 'manage',
      collection: 'eduLienHe',
    },
  },
  phatSach: {
    columns: ['hocVienMa', 'kyHieuSach', 'ngay', 'uuDai', 'ghiChu'],
    required: ['hocVienMa', 'kyHieuSach'],
    sample: [['HS00001', 'CT-MAU-1', '2026-11-15', '0', '']],
    gate: {
      resource: 'edu.phatSach',
      action: 'manage',
      collection: 'eduPhatSach',
    },
  },
  goiHoc: {
    columns: [
      'hocVienMa',
      'soBuoi',
      'donGia',
      'thanhTien',
      'ngayMua',
      'daThuTien',
      'hinhThuc',
      'ghiChu',
    ],
    required: ['hocVienMa', 'soBuoi', 'donGia'],
    sample: [
      [
        'HS00001',
        '12',
        '120000',
        '1440000',
        '2026-11-15',
        'true',
        'chuyen_khoan',
        '',
      ],
    ],
    gate: { resource: 'edu.goiHoc', action: 'manage', collection: 'eduGoiHoc' },
  },
  diemDanh: {
    columns: [
      'lopMa',
      'ngay',
      'gioBatDau',
      'gioKetThuc',
      'hocVienMa',
      'trangThai',
      'daLamBtvn',
      'nhanXet',
    ],
    required: ['lopMa', 'ngay', 'gioBatDau', 'hocVienMa'],
    sample: [
      [
        'LOP-MAU-1',
        '2026-11-15',
        '18:00',
        '19:30',
        'HS00001',
        'co_mat',
        'true',
        'Tập trung',
      ],
    ],
    gate: {
      resource: 'edu.diemDanh',
      action: 'record',
      collection: 'eduDiemDanh',
    },
  },
};

/** The policies an import works with; all but `write` are the caller's own, and may be missing. */
export interface ImportPolicies {
  /** The gate's policy over the collection the import writes. */
  readonly write: RepositoryPolicy;
  readonly branchView?: RepositoryPolicy;
  readonly classView?: RepositoryPolicy;
  readonly studentView?: RepositoryPolicy;
  readonly sessionView?: RepositoryPolicy;
  readonly sessionManage?: RepositoryPolicy;
  readonly packageView?: RepositoryPolicy;
  readonly paymentManage?: RepositoryPolicy;
}

export interface ImportProblem {
  /** Line of the file (the header is line 1). */
  readonly dong: number;
  /** A reason code the page translates; never a name or a phone number. */
  readonly ma: string;
  readonly cot?: string;
}

export interface ImportReport {
  readonly tongDong: number;
  readonly hopLe: number;
  readonly loi: readonly ImportProblem[];
}

class RowProblem extends Error {
  constructor(
    readonly code: string,
    readonly column?: string,
  ) {
    super(code);
  }
}

type Row = Readonly<Record<string, string>>;
type Tx = DatabaseConnection;
/** What a column of a record may hold. */
type Values = Record<string, string | number | boolean | null>;

interface Context {
  readonly tx: Tx;
  readonly policies: ImportPolicies;
  readonly userId: string;
  /** Columns the file has: a column that is absent never overwrites what is stored. */
  readonly has: (column: string) => boolean;
}

const need = (row: Row, column: string, max: number): string => {
  const value = row[column] ?? '';
  if (!value) throw new RowProblem('MISSING', column);
  if (value.length > max) throw new RowProblem('INVALID_VALUE', column);
  return value;
};

const optional = (row: Row, column: string, max: number): string | null => {
  const value = row[column] ?? '';
  if (value.length > max) throw new RowProblem('INVALID_VALUE', column);
  return value || null;
};

const integer = (
  row: Row,
  column: string,
  range: { min: number; max: number; otherwise?: number },
): number => {
  const raw = row[column] ?? '';
  if (!raw) {
    if (range.otherwise === undefined) throw new RowProblem('MISSING', column);
    return range.otherwise;
  }
  if (!/^-?\d+$/u.test(raw)) throw new RowProblem('INVALID_VALUE', column);
  const value = Number(raw);
  if (value < range.min || value > range.max)
    throw new RowProblem('INVALID_VALUE', column);
  return value;
};

const flag = (row: Row, column: string): boolean => {
  const raw = (row[column] ?? '').toLowerCase();
  if (raw === '' || raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  throw new RowProblem('INVALID_VALUE', column);
};

const oneOf = <T extends string>(
  row: Row,
  column: string,
  allowed: readonly T[],
  otherwise: T,
): T => {
  const raw = row[column] ?? '';
  if (!raw) return otherwise;
  if (!(allowed as readonly string[]).includes(raw))
    throw new RowProblem('INVALID_VALUE', column);
  return raw as T;
};

const isDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const date = (row: Row, column: string, required: boolean): string | null => {
  const raw = row[column] ?? '';
  if (!raw) {
    if (required) throw new RowProblem('MISSING', column);
    return null;
  }
  if (!isDate(raw)) throw new RowProblem('INVALID_VALUE', column);
  return raw;
};

const time = (row: Row, column: string, required: boolean): string | null => {
  const raw = row[column] ?? '';
  if (!raw) {
    if (required) throw new RowProblem('MISSING', column);
    return null;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(raw))
    throw new RowProblem('INVALID_VALUE', column);
  return raw;
};

/** One record by a text field, through a policy; without the policy nothing is visible. */
async function findBy(
  tx: Tx,
  collection: string,
  policy: RepositoryPolicy | undefined,
  field: string,
  value: string,
): Promise<Record<string, unknown> | null> {
  if (!policy) return null;
  return (await tx
    .repository(collection)
    .withPolicy(policy)
    .findOne({ filter: (f) => f.string(field).eq(value) })) as Record<
    string,
    unknown
  > | null;
}

/** Creates or updates the record with this code through the write policy; a new record must stay visible. */
async function upsertByCode(
  context: Context,
  collection: string,
  field: string,
  code: string,
  create: Values,
  update: Values,
): Promise<void> {
  const repository = context.tx
    .repository(collection)
    .withPolicy(context.policies.write);
  const existing = await repository.findOne({
    filter: (f) => f.string(field).eq(code),
  });
  if (existing) {
    if (Object.keys(update).length > 0) {
      await repository.updateOne({
        filter: { id: Number(existing.id) },
        values: update,
      });
    }
    return;
  }
  const created = await repository.createOne({ values: create });
  if (
    !(await repository.findOne({ filter: { id: Number(created.record.id) } }))
  )
    throw new RowProblem('OUT_OF_SCOPE');
}

/** Only the columns the file has are written to a record that already exists. */
const present = (context: Context, values: Values): Values =>
  Object.fromEntries(
    Object.entries(values).filter(([column]) => context.has(column)),
  );

const BOOK_STATUSES = ['dang_ban', 'ngung'] as const;
const COACH_STATUSES = ['dang_lam', 'da_nghi_viec'] as const;
const CONTACT_STATUSES = [
  'moi',
  'dang_cham_soc',
  'da_chot',
  'khong_chot',
] as const;

const APPLY: Readonly<
  Record<ImportKind, (context: Context, row: Row) => Promise<void>>
> = {
  async coSo(context, row) {
    const ma = need(row, 'ma', 32);
    const values = {
      ten: need(row, 'ten', 191),
      diaChi: optional(row, 'diaChi', 255),
      truBuoiVangCoPhep: flag(row, 'truBuoiVangCoPhep'),
      trangThai: oneOf(row, 'trangThai', STATUSES.coSo, 'hoat_dong'),
    };
    await upsertByCode(
      context,
      'eduCoSo',
      'ma',
      ma,
      { ma, ...values },
      present(context, values),
    );
  },

  async lop(context, row) {
    const ma = need(row, 'ma', 32);
    const branch = await findBy(
      context.tx,
      'eduCoSo',
      context.policies.branchView,
      'ma',
      need(row, 'coSoMa', 32),
    );
    if (!branch) throw new RowProblem('UNKNOWN_BRANCH', 'coSoMa');
    const levelKey = oneOf(row, 'levelKey', LEVEL_KEYS, 'tot');
    const order = levelOrder(levelKey) ?? 1;
    const ten = need(row, 'ten', 191);
    const coSoId = Number(branch.id);
    const trangThai = oneOf(row, 'trangThai', STATUSES.lop, 'dang_mo');
    await upsertByCode(
      context,
      'eduLop',
      'ma',
      ma,
      { ma, ten, coSoId, levelKey, levelOrder: order, trangThai },
      {
        // The name and the branch are required columns; the others change only when the file has them.
        ten,
        coSoId,
        ...(context.has('levelKey') ? { levelKey, levelOrder: order } : {}),
        ...(context.has('trangThai') ? { trangThai } : {}),
      },
    );
  },

  async sach(context, row) {
    const kyHieu = need(row, 'kyHieu', 32);
    const values = {
      ten: need(row, 'ten', 191),
      giaBia: integer(row, 'giaBia', {
        min: 0,
        max: 100_000_000,
        otherwise: 0,
      }),
      giaBan: integer(row, 'giaBan', {
        min: 0,
        max: 100_000_000,
        otherwise: 0,
      }),
      trangThai: oneOf(row, 'trangThai', BOOK_STATUSES, 'dang_ban'),
    };
    await upsertByCode(
      context,
      'eduSach',
      'kyHieu',
      kyHieu,
      { kyHieu, ...values },
      present(context, values),
    );
  },

  async hoSoGv(context, row) {
    const email = need(row, 'email', 191).toLowerCase();
    // A profile belongs to an account that holds the coach role, like the coach of a class (`edu-data.ts`).
    const user = await context.tx.query
      .selectFrom('user')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst();
    if (!user) throw new RowProblem('UNKNOWN_USER', 'email');
    const userId = asText(user.id);
    const coach = await context.tx.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', userId)
      .where('permissionSetKey', '=', 'edu_hlv')
      .executeTakeFirst();
    if (!coach) throw new RowProblem('NOT_A_COACH', 'email');
    const values = {
      tenVietTat: optional(row, 'tenVietTat', 64),
      viTri: optional(row, 'viTri', 64),
      thuLaoMotBuoi: integer(row, 'thuLaoMotBuoi', {
        min: 0,
        max: 100_000_000,
        otherwise: 0,
      }),
      tinhTrang: oneOf(row, 'tinhTrang', COACH_STATUSES, 'dang_lam'),
    };
    await upsertByCode(
      context,
      'eduHoSoGv',
      'userId',
      userId,
      { userId, ...values },
      present(context, values),
    );
  },

  async tuyenSinh(context, row) {
    const hoTen = need(row, 'hoTen', 191);
    const branch = await findBy(
      context.tx,
      'eduCoSo',
      context.policies.branchView,
      'ma',
      need(row, 'coSoMa', 32),
    );
    if (!branch) throw new RowProblem('UNKNOWN_BRANCH', 'coSoMa');
    const soDienThoai = optional(row, 'soDienThoai', 20);
    if (soDienThoai && !/^[0-9+ ().-]{6,20}$/u.test(soDienThoai))
      throw new RowProblem('INVALID_VALUE', 'soDienThoai');
    const coSoId = Number(branch.id);
    const contacts = context.tx
      .repository('eduLienHe')
      .withPolicy(context.policies.write);
    // The same phone number in the same branch is the same family: importing a file twice adds nobody.
    if (soDienThoai) {
      const same = await contacts.findOne({
        filter: (f) =>
          f.and([
            f.string('soDienThoai').eq(soDienThoai),
            f.number('coSoId').eq(coSoId),
          ]),
      });
      if (same) throw new RowProblem('DUPLICATE', 'soDienThoai');
    }
    const created = await contacts.createOne({
      values: {
        hoTen,
        soDienThoai,
        coSoId,
        kenh: optional(row, 'kenh', 64),
        trangThai: oneOf(row, 'trangThai', CONTACT_STATUSES, 'moi'),
        ghiChu: optional(row, 'ghiChu', 500),
        ngayNhac: date(row, 'ngayNhac', false),
        ngayTao: todayVn(),
      },
    });
    if (
      !(await contacts.findOne({ filter: { id: Number(created.record.id) } }))
    )
      throw new RowProblem('OUT_OF_SCOPE');
  },

  async phatSach(context, row) {
    const student = await findBy(
      context.tx,
      'eduHocVien',
      context.policies.studentView,
      'ma',
      need(row, 'hocVienMa', 32),
    );
    if (!student) throw new RowProblem('UNKNOWN_STUDENT', 'hocVienMa');
    // The catalogue is one for the whole club; every role may read it.
    const book = await context.tx.query
      .selectFrom('eduSach')
      .select('id')
      .where('kyHieu', '=', need(row, 'kyHieuSach', 32))
      .executeTakeFirst();
    if (!book) throw new RowProblem('UNKNOWN_BOOK', 'kyHieuSach');
    const ngay = date(row, 'ngay', false) ?? todayVn();
    const hocVienId = Number(student.id);
    const sachId = Number(book.id);
    const same = await context.tx
      .repository('eduPhatSach')
      .withPolicy(context.policies.write)
      .findOne({
        filter: (f) =>
          f.and([
            f.number('hocVienId').eq(hocVienId),
            f.number('sachId').eq(sachId),
            f.string('ngay').eq(ngay),
          ]),
      });
    if (same) throw new RowProblem('DUPLICATE');
    await handOutBook(context.tx, {
      hocVienId,
      sachId,
      ngay,
      uuDai: integer(row, 'uuDai', {
        min: 0,
        max: 100_000_000,
        otherwise: 0,
      }),
      ghiChu: optional(row, 'ghiChu', 500),
      userId: context.userId,
      policies: {
        handout: context.policies.write,
        student: context.policies.studentView,
      },
    });
  },

  async goiHoc(context, row) {
    const student = await findBy(
      context.tx,
      'eduHocVien',
      context.policies.studentView,
      'ma',
      need(row, 'hocVienMa', 32),
    );
    if (!student) throw new RowProblem('UNKNOWN_STUDENT', 'hocVienMa');
    const hocVienId = Number(student.id);
    const soBuoi = integer(row, 'soBuoi', { min: 1, max: 500 });
    const donGia = integer(row, 'donGia', { min: 0, max: 100_000_000 });
    const thanhTien = integer(row, 'thanhTien', {
      min: 0,
      max: 2_000_000_000,
      otherwise: soBuoi * donGia,
    });
    if (thanhTien > 2_000_000_000)
      throw new RowProblem('INVALID_VALUE', 'donGia');
    const ngayMua = date(row, 'ngayMua', false) ?? todayVn();
    const paid = flag(row, 'daThuTien');
    const hinhThuc = oneOf(
      row,
      'hinhThuc',
      ['tien_mat', 'chuyen_khoan'] as const,
      'chuyen_khoan',
    );
    // A package has no code of its own: the same student, day, sessions and total is the same sale. Without this
    // check a file imported twice would sell every package twice and double the balance.
    const same = await context.tx
      .repository('eduGoiHoc')
      .withPolicy(context.policies.write)
      .findOne({
        filter: (f) =>
          f.and([
            f.number('hocVienId').eq(hocVienId),
            f.string('ngayMua').eq(ngayMua),
            f.number('soBuoi').eq(soBuoi),
            f.number('thanhTien').eq(thanhTien),
          ]),
      });
    if (same) throw new RowProblem('DUPLICATE');
    const pack = await sellPackage(context.tx, {
      hocVienId,
      soBuoi,
      donGia,
      thanhTien,
      ngayMua,
      userId: context.userId,
      policies: {
        package: context.policies.write,
        student: context.policies.studentView,
      },
    });
    if (paid && thanhTien > 0) {
      // Recording money is its own permission (`edu.thanhToan` `manage`).
      if (!context.policies.paymentManage)
        throw new RowProblem('PAYMENT_NOT_ALLOWED', 'daThuTien');
      await recordPayment(context.tx, {
        goiHocId: pack.id,
        soTien: thanhTien,
        hinhThuc,
        ngay: ngayMua,
        noiDungCk: optional(row, 'ghiChu', 191),
        userId: context.userId,
        policies: {
          payment: context.policies.paymentManage,
          package: context.policies.packageView,
        },
      });
    }
  },

  async diemDanh(context, row) {
    const lop = await findBy(
      context.tx,
      'eduLop',
      context.policies.classView,
      'ma',
      need(row, 'lopMa', 32),
    );
    if (!lop) throw new RowProblem('UNKNOWN_CLASS', 'lopMa');
    const ngay = date(row, 'ngay', true) as string;
    const gioBatDau = time(row, 'gioBatDau', true) as string;
    const gioKetThucGiven = time(row, 'gioKetThuc', false);
    const student = await findBy(
      context.tx,
      'eduHocVien',
      context.policies.studentView,
      'ma',
      need(row, 'hocVienMa', 32),
    );
    if (!student) throw new RowProblem('UNKNOWN_STUDENT', 'hocVienMa');
    const trangThai: AttendanceStatus = oneOf(
      row,
      'trangThai',
      ATTENDANCE_STATUSES,
      'co_mat',
    );
    const lopId = Number(lop.id);
    const sessions = context.policies.sessionView
      ? context.tx
          .repository('eduBuoiHoc')
          .withPolicy(context.policies.sessionView)
      : null;
    const bySlot = (f: {
      and: (parts: unknown[]) => unknown;
      number: (n: string) => { eq: (v: number) => unknown };
      string: (n: string) => { eq: (v: string) => unknown };
    }) =>
      f.and([
        f.number('lopId').eq(lopId),
        f.string('ngay').eq(ngay),
        f.string('gioBatDau').eq(gioBatDau),
      ]);
    let session = sessions
      ? await sessions.findOne({ filter: bySlot as never })
      : null;
    if (!session) {
      // A session that is not there yet is created only by a person who may manage sessions, with the end of the
      // class's timetable for that weekday (or ninety minutes) when the file gives none.
      if (!context.policies.sessionManage)
        throw new RowProblem('UNKNOWN_SESSION', 'ngay');
      const slot = await context.tx.query
        .selectFrom('eduLopLich')
        .select('gioKetThuc')
        .where('lopId', '=', lopId)
        .where('thu', '=', weekdayOf(ngay))
        .where('gioBatDau', '=', gioBatDau)
        .executeTakeFirst();
      const [hour, minute] = gioBatDau.split(':').map(Number) as [
        number,
        number,
      ];
      const later = Math.min(hour * 60 + minute + 90, 23 * 60 + 59);
      const fallback = `${String(Math.floor(later / 60)).padStart(2, '0')}:${String(later % 60).padStart(2, '0')}`;
      const managed = context.tx
        .repository('eduBuoiHoc')
        .withPolicy(context.policies.sessionManage);
      const created = await managed.createOne({
        values: {
          lopId,
          ngay,
          gioBatDau,
          gioKetThuc:
            gioKetThucGiven ?? (slot ? asText(slot.gioKetThuc) : fallback),
          hlvId: lop.hlvId ?? null,
          loai: 'thuong',
          trangThai: 'du_kien',
        },
      });
      session = await managed.findOne({
        filter: { id: Number(created.record.id) },
      });
      if (!session) throw new RowProblem('OUT_OF_SCOPE', 'lopMa');
    }
    await saveAttendance(context.tx, {
      buoiHocId: Number(session.id),
      danhSach: [
        {
          hocVienId: Number(student.id),
          trangThai,
          ...(context.has('daLamBtvn')
            ? { daLamBtvn: flag(row, 'daLamBtvn') }
            : {}),
          ...(context.has('nhanXet') && row.nhanXet
            ? { nhanXet: optional(row, 'nhanXet', 500) }
            : {}),
        },
      ],
      userId: context.userId,
      policies: {
        attendance: context.policies.write,
        session: context.policies.sessionView,
        student: context.policies.studentView,
      },
    });
  },
};

/** What is wrong with the header, or `undefined`: an unknown column, a missing required one, a column twice. */
export function headerProblem(
  kind: ImportKind,
  header: readonly string[],
): { ma: string; cot: string } | undefined {
  const definition = IMPORTS[kind];
  const seen = new Set<string>();
  for (const column of header) {
    if (!definition.columns.includes(column))
      return { ma: 'UNKNOWN_COLUMN', cot: column };
    if (seen.has(column)) return { ma: 'DUPLICATE_COLUMN', cot: column };
    seen.add(column);
  }
  for (const column of definition.required) {
    if (!seen.has(column)) return { ma: 'MISSING_COLUMN', cot: column };
  }
  return undefined;
}

/** The template: the header and made-up rows. */
export function templateOf(kind: ImportKind): string {
  const definition = IMPORTS[kind];
  const cell = (value: string): string =>
    /[",\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
  // A byte order mark first, so a spreadsheet opens the Vietnamese text as UTF-8.
  const body = [definition.columns, ...definition.sample]
    .map((line) => line.map(cell).join(','))
    .join('\r\n');
  return `${String.fromCharCode(0xfeff)}${body}\r\n`;
}

/**
 * Writes every row of the file in the caller's transaction, each in its own savepoint, and reports the ones that
 * could not be written. The caller decides whether the transaction stays.
 */
export async function runImport(
  tx: Tx,
  kind: ImportKind,
  header: readonly string[],
  lines: readonly (readonly string[])[],
  options: { readonly userId: string; readonly policies: ImportPolicies },
): Promise<ImportReport> {
  const columns = new Set(header);
  const apply = APPLY[kind];
  const loi: ImportProblem[] = [];
  let hopLe = 0;
  for (const [index, cells] of lines.entries()) {
    const row: Record<string, string> = {};
    for (const [position, column] of header.entries())
      row[column] = (cells[position] ?? '').trim();
    try {
      await tx.transaction((savepoint) =>
        apply(
          {
            tx: savepoint,
            policies: options.policies,
            userId: options.userId,
            has: (column) => columns.has(column),
          },
          row,
        ),
      );
      hopLe += 1;
    } catch (error) {
      const dong = index + 2;
      if (error instanceof RowProblem) {
        loi.push({
          dong,
          ma: error.code,
          ...(error.column ? { cot: error.column } : {}),
        });
      } else if (error instanceof ApiError) {
        // A refusal of a shared writer (student not found, discount too large…) is a problem of this row.
        loi.push({ dong, ma: error.reason });
      } else if (
        error instanceof Error &&
        /unique|duplicate/iu.test(error.message)
      ) {
        // The code belongs to a record the caller does not see, or appears twice in the file.
        loi.push({ dong, ma: 'DUPLICATE' });
      } else {
        throw error;
      }
    }
  }
  return { tongDong: lines.length, hopLe, loi };
}
