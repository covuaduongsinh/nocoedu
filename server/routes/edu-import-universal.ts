import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import {
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { databaseManagerToken } from '@nocobase/db';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import {
  balanceOf,
  lockSessionRule,
  moveBalance,
  saveAttendanceRow,
} from '../edu/balance.js';
import { parseCsv } from '../edu/import-csv.js';
import { LEVEL_KEYS, levelOrder } from '../edu/levels.js';
import { ATTENDANCE_STATUSES, todayVn } from '../edu/so-du.js';
import type { AttendanceStatus } from '../edu/so-du.js';
import { STATUSES } from '../edu/sua-ban-ghi.js';
import {
  currentUserId,
  eduError,
  policiesOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Universal CSV import of the lists of the club (classes, branches, coaches, books, handouts, packages, attendance,
 * admissions), previewed and then confirmed.
 *
 * Every entity is guarded by the composite action that owns it (`ENTITY_GATES`: the `manage` action of its resource,
 * `record` for attendance), checked before the request body is read. Every lookup and every write goes through the
 * policies of that action (and of the `view` actions of what it points at), so a branch manager imports only into their
 * own branches and a code that exists outside the scope is "not found", exactly like a code that does not exist. A
 * balance moves only through `moveBalance` (a package adds its sessions, an attendance row deducts them by the rule
 * fixed on its session), in the same transaction as the row that caused it. Each row is its own transaction; a row that
 * is refused is reported by line number and reason code, never by a name or a phone number.
 */
const MAX_CSV_SIZE = 5 * 1024 * 1024; // 5MB
/** Rows of one file: every row needs lookups, so a larger file is split by the person importing it. */
export const MAX_IMPORT_ROWS = 5000;

const ENTITY_CONFIGS: Record<
  string,
  {
    name: string;
    sampleHeader: string;
    sampleRows: string[];
    columns: string[];
  }
> = {
  lop: {
    name: 'Lớp học',
    sampleHeader: 'ma,ten,coSoMa,levelKey,trangThai',
    sampleRows: [
      'LOP-01,Lớp Cờ Vua Cơ Bản K1,CS01,tot,dang_mo',
      'LOP-02,Lớp Cờ Vua Nâng Cao K2,CS01,ma,dang_mo',
    ],
    columns: ['ma', 'ten', 'coSoMa', 'levelKey', 'trangThai'],
  },
  coSo: {
    name: 'Cơ sở đào tạo',
    sampleHeader: 'ma,ten,diaChi,truBuoiVangCoPhep,trangThai',
    sampleRows: [
      'CS01,Cơ sở Cầu Giấy,Số 10 Dịch Vọng Hậu Cầu Giấy Hà Nội,false,hoat_dong',
      'CS02,Cơ sở Thanh Xuân,Số 20 Nguyễn Trãi Thanh Xuân Hà Nội,false,hoat_dong',
    ],
    columns: ['ma', 'ten', 'diaChi', 'truBuoiVangCoPhep', 'trangThai'],
  },
  hoSoGv: {
    name: 'Hồ sơ giáo viên / HLV',
    sampleHeader: 'emailOrUserId,tenVietTat,viTri,thuLaoMotBuoi,tinhTrang',
    sampleRows: [
      'admin,Thầy Minh,HLV Trưởng,250000,dang_lam',
      'gv01,Cô Lan,HLV Trợ giảng,150000,dang_lam',
    ],
    columns: [
      'emailOrUserId',
      'tenVietTat',
      'viTri',
      'thuLaoMotBuoi',
      'tinhTrang',
    ],
  },
  sach: {
    name: 'Danh mục sách',
    sampleHeader: 'kyHieu,ten,giaBia,giaBan,trangThai',
    sampleRows: [
      'CT1,Giáo trình Cờ Vua Tập 1,60000,50000,dang_ban',
      'CT2,Giáo trình Cờ Vua Tập 2,70000,60000,dang_ban',
    ],
    columns: ['kyHieu', 'ten', 'giaBia', 'giaBan', 'trangThai'],
  },
  phatSach: {
    name: 'Phát sách học sinh',
    sampleHeader: 'hocVienMa,kyHieuSach,coSoMa,ngay,uuDai,tienSach,ghiChu',
    sampleRows: [
      'HV-0001,CT1,CS01,2026-11-15,0,50000,Phát sách nhập học',
      'HV-0002,CT2,CS01,2026-11-15,10000,50000,Giảm giá 10k',
    ],
    columns: [
      'hocVienMa',
      'kyHieuSach',
      'coSoMa',
      'ngay',
      'uuDai',
      'tienSach',
      'ghiChu',
    ],
  },
  goiHoc: {
    name: 'Gói học & Học phí',
    sampleHeader:
      'hocVienMa,soBuoi,donGia,thanhTien,ngayMua,daThuTien,hinhThuc,ghiChu',
    sampleRows: [
      'HV-0001,12,150000,1800000,2026-11-15,true,chuyen_khoan,Nộp học phí quý 4',
      'HV-0002,24,140000,3360000,2026-11-15,true,tien_mat,Gói ưu đãi 24 buổi',
    ],
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
  },
  diemDanh: {
    name: 'Điểm danh buổi học',
    sampleHeader: 'lopMa,ngay,gioBatDau,hocVienMa,trangThai,daLamBtvn,nhanXet',
    sampleRows: [
      'LOP-01,2026-11-15,18:00,HV-0001,co_mat,true,Học tập tích cực',
      'LOP-01,2026-11-15,18:00,HV-0002,vang_co_phep,false,Bị ốm',
    ],
    columns: [
      'lopMa',
      'ngay',
      'gioBatDau',
      'hocVienMa',
      'trangThai',
      'daLamBtvn',
      'nhanXet',
    ],
  },
  tuyenSinh: {
    name: 'Tuyển sinh & Khách hàng tiềm năng',
    sampleHeader: 'hoTen,soDienThoai,coSoMa,kenh,trangThai,ghiChu,ngayNhac',
    sampleRows: [
      'Nguyễn Văn A,0987654321,CS01,Facebook,moi,Quan tâm lớp U8,2026-11-20',
      'Trần Thị B,0912345678,CS01,GioiThieu,dang_cham_soc,Hẹn test cờ thứ 7,2026-11-18',
    ],
    columns: [
      'hoTen',
      'soDienThoai',
      'coSoMa',
      'kenh',
      'trangThai',
      'ghiChu',
      'ngayNhac',
    ],
  },
};

type LookupName =
  | 'branch'
  | 'student'
  | 'book'
  | 'class'
  | 'payment'
  | 'sessionView'
  | 'sessionCreate';

/** What an entity's lookups may read or write besides its own collection: the composite action that grants it. */
const LOOKUPS: Record<
  LookupName,
  { resource: string; action: string; collection: string }
> = {
  branch: { resource: 'edu.coSo', action: 'view', collection: 'eduCoSo' },
  student: {
    resource: 'edu.hocVien',
    action: 'view',
    collection: 'eduHocVien',
  },
  book: { resource: 'edu.sach', action: 'view', collection: 'eduSach' },
  class: { resource: 'edu.lop', action: 'view', collection: 'eduLop' },
  payment: {
    resource: 'edu.thanhToan',
    action: 'manage',
    collection: 'eduThanhToan',
  },
  sessionView: {
    resource: 'edu.buoiHoc',
    action: 'view',
    collection: 'eduBuoiHoc',
  },
  sessionCreate: {
    resource: 'edu.buoiHoc',
    action: 'manage',
    collection: 'eduBuoiHoc',
  },
};

/** The action that owns each entity, the collection it writes and the lookups it needs. */
export const ENTITY_GATES: Record<
  string,
  {
    resource: string;
    action: string;
    collection: string;
    lookups: readonly LookupName[];
  }
> = {
  lop: {
    resource: 'edu.lop',
    action: 'manage',
    collection: 'eduLop',
    lookups: ['branch'],
  },
  coSo: {
    resource: 'edu.coSo',
    action: 'manage',
    collection: 'eduCoSo',
    lookups: [],
  },
  hoSoGv: {
    resource: 'edu.hoSoGv',
    action: 'manage',
    collection: 'eduHoSoGv',
    lookups: [],
  },
  sach: {
    resource: 'edu.sach',
    action: 'manage',
    collection: 'eduSach',
    lookups: [],
  },
  phatSach: {
    resource: 'edu.phatSach',
    action: 'manage',
    collection: 'eduPhatSach',
    lookups: ['student', 'book', 'branch'],
  },
  goiHoc: {
    resource: 'edu.goiHoc',
    action: 'manage',
    collection: 'eduGoiHoc',
    lookups: ['student', 'payment'],
  },
  diemDanh: {
    resource: 'edu.diemDanh',
    action: 'record',
    collection: 'eduDiemDanh',
    lookups: ['class', 'student', 'sessionView', 'sessionCreate'],
  },
  tuyenSinh: {
    resource: 'edu.tuyenSinh',
    action: 'manage',
    collection: 'eduLienHe',
    lookups: ['branch'],
  },
};

const BodySchema = z.object({
  csv: z.string().min(1).max(MAX_CSV_SIZE),
});

type Row = Record<string, unknown>;
type Conn = ReturnType<DatabaseManager['connection']>;
interface Repo {
  findOne(input: unknown): Promise<Row | null>;
  createOne(input: unknown): Promise<{ record: Row }>;
  updateOne(input: unknown): Promise<unknown>;
}
const repo = (conn: Conn, name: string, policy: RepositoryPolicy): Repo =>
  conn.repository(name).withPolicy(policy) as unknown as Repo;

interface Env {
  readonly conn: Conn;
  readonly userId: string;
  readonly gate: (typeof ENTITY_GATES)[string];
  readonly primary: RepositoryPolicy;
  readonly lookups: Partial<Record<LookupName, RepositoryPolicy>>;
}

/** One reason a row cannot be imported: `code` for the report, `message` for the preview. */
interface Problem {
  readonly code: string;
  readonly message: string;
}
const bad = (code: string, message: string): Problem => ({ code, message });

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^\d{2}:\d{2}$/u;
const flag = (value: string | undefined): boolean =>
  value === 'true' || value === '1';

/** A whole number of the file, or the problem with it. An empty cell is `fallback`. */
function whole(
  value: string | undefined,
  field: string,
  min: number,
  max: number,
  fallback: number,
  problems: Problem[],
): number {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    problems.push(bad('BAD_NUMBER', `Giá trị cột ${field} không hợp lệ`));
    return fallback;
  }
  return number;
}

/** Longest text each column of the file may hold (the database columns' lengths). */
function text(
  value: string | undefined,
  field: string,
  max: number,
  problems: Problem[],
): string {
  const out = value ?? '';
  if (out.length > max) {
    problems.push(bad('TOO_LONG', `Cột ${field} dài quá ${max} ký tự`));
  }
  return out;
}

const MAX_PACKAGE_TOTAL = 2_000_000_000;

/** Looks a row up by one text column through a policy; `null` when it does not exist or is out of the caller's scope. */
async function byText(
  conn: Conn,
  collection: string,
  policy: RepositoryPolicy | undefined,
  field: string,
  value: string,
): Promise<Row | null> {
  if (!policy) return null;
  return repo(conn, collection, policy).findOne({
    filter: (f: { string: (n: string) => { eq: (v: string) => unknown } }) =>
      f.string(field).eq(value),
  });
}

/**
 * Checks one row of the file and, when `apply` is set and nothing is wrong, writes it (inside the caller's
 * transaction). Returns the problems; an empty list means the row is valid (and, with `apply`, written).
 */
async function handleRow(
  entity: string,
  data: Record<string, string>,
  env: Env,
  apply: boolean,
): Promise<Problem[]> {
  const { conn, userId, primary } = env;
  const problems: Problem[] = [];
  const find = (
    name: LookupName,
    field: string,
    value: string,
  ): Promise<Row | null> =>
    byText(conn, LOOKUPS[name].collection, env.lookups[name], field, value);
  const own = (field: string, value: string): Promise<Row | null> =>
    byText(conn, env.gate.collection, primary, field, value);
  const created = async (
    collection: string,
    policy: RepositoryPolicy,
    values: Row,
  ): Promise<number> => {
    const target = repo(conn, collection, policy);
    const id = Number((await target.createOne({ values })).record.id);
    // A new row must be one the caller may see; otherwise it points outside their scope and the row is refused.
    if (!(await target.findOne({ filter: { id } }))) {
      throw eduError(
        'PERMISSION_DENIED',
        'EDU_OUT_OF_SCOPE',
        'You may not import here.',
      );
    }
    return id;
  };

  if (entity === 'lop') {
    if (!data.ma) problems.push(bad('MISSING_CODE', 'Thiếu mã lớp'));
    if (!data.ten) problems.push(bad('MISSING_NAME', 'Thiếu tên lớp'));
    const ma = text(data.ma, 'ma', 32, problems);
    const ten = text(data.ten, 'ten', 191, problems);
    const levelKey = data.levelKey || 'tot';
    if (!(LEVEL_KEYS as readonly string[]).includes(levelKey)) {
      problems.push(bad('BAD_LEVEL', `Cấp không hợp lệ: ${levelKey}`));
    }
    const trangThai = data.trangThai || 'dang_mo';
    if (!(STATUSES.lop as readonly string[]).includes(trangThai)) {
      problems.push(bad('BAD_STATUS', `Trạng thái không hợp lệ: ${trangThai}`));
    }
    let branch: Row | null = null;
    if (!data.coSoMa) {
      problems.push(bad('MISSING_BRANCH', 'Thiếu mã cơ sở'));
    } else {
      branch = await find('branch', 'ma', data.coSoMa);
      if (!branch) {
        problems.push(
          bad('UNKNOWN_BRANCH', `Không tìm thấy cơ sở có mã: ${data.coSoMa}`),
        );
      }
    }
    if (problems.length > 0 || !apply || !branch) return problems;
    const values = {
      ten,
      coSoId: Number(branch.id),
      levelKey,
      levelOrder: levelOrder(levelKey),
      trangThai,
    };
    const existing = await own('ma', ma);
    if (existing) {
      await repo(conn, 'eduLop', primary).updateOne({
        filter: { id: Number(existing.id) },
        values,
      });
    } else {
      await created('eduLop', primary, { ma, ...values });
    }
    return problems;
  }

  if (entity === 'coSo') {
    if (!data.ma) problems.push(bad('MISSING_CODE', 'Thiếu mã cơ sở'));
    if (!data.ten) problems.push(bad('MISSING_NAME', 'Thiếu tên cơ sở'));
    const ma = text(data.ma, 'ma', 32, problems);
    const ten = text(data.ten, 'ten', 191, problems);
    const diaChi = text(data.diaChi, 'diaChi', 500, problems);
    const trangThai = data.trangThai || 'hoat_dong';
    if (!(STATUSES.coSo as readonly string[]).includes(trangThai)) {
      problems.push(bad('BAD_STATUS', `Trạng thái không hợp lệ: ${trangThai}`));
    }
    if (problems.length > 0 || !apply) return problems;
    const values = {
      ten,
      diaChi: diaChi || null,
      truBuoiVangCoPhep: flag(data.truBuoiVangCoPhep),
      trangThai,
    };
    const existing = await own('ma', ma);
    if (existing) {
      await repo(conn, 'eduCoSo', primary).updateOne({
        filter: { id: Number(existing.id) },
        values,
      });
    } else {
      await created('eduCoSo', primary, { ma, ...values });
    }
    return problems;
  }

  if (entity === 'sach') {
    if (!data.kyHieu) problems.push(bad('MISSING_CODE', 'Thiếu ký hiệu sách'));
    if (!data.ten) problems.push(bad('MISSING_NAME', 'Thiếu tên sách'));
    const kyHieu = text(data.kyHieu, 'kyHieu', 32, problems);
    const ten = text(data.ten, 'ten', 191, problems);
    const giaBia = whole(data.giaBia, 'giaBia', 0, 100_000_000, 0, problems);
    const giaBan = whole(data.giaBan, 'giaBan', 0, 100_000_000, 0, problems);
    const trangThai = data.trangThai || 'dang_ban';
    if (!['dang_ban', 'ngung'].includes(trangThai)) {
      problems.push(bad('BAD_STATUS', `Trạng thái không hợp lệ: ${trangThai}`));
    }
    if (problems.length > 0 || !apply) return problems;
    const values = { ten, giaBia, giaBan, trangThai };
    const existing = await own('kyHieu', kyHieu);
    if (existing) {
      await repo(conn, 'eduSach', primary).updateOne({
        filter: { id: Number(existing.id) },
        values,
      });
    } else {
      await created('eduSach', primary, { kyHieu, ...values });
    }
    return problems;
  }

  if (entity === 'hoSoGv') {
    if (!data.emailOrUserId) {
      problems.push(
        bad('MISSING_USER', 'Thiếu email hoặc userId của giáo viên'),
      );
    }
    const tenVietTat = text(data.tenVietTat, 'tenVietTat', 64, problems);
    const viTri = text(data.viTri, 'viTri', 64, problems);
    const thuLao = whole(
      data.thuLaoMotBuoi,
      'thuLaoMotBuoi',
      0,
      100_000_000,
      0,
      problems,
    );
    const tinhTrang = data.tinhTrang || 'dang_lam';
    if (!['dang_lam', 'da_nghi_viec'].includes(tinhTrang)) {
      problems.push(bad('BAD_STATUS', `Tình trạng không hợp lệ: ${tinhTrang}`));
    }
    // The account the profile belongs to. The user directory is not an NocoEdu collection; only the administrator
    // holds this action, and the lookup answers an id and nothing else.
    let targetUserId: string | undefined;
    if (data.emailOrUserId) {
      const user = await conn.query
        .selectFrom('user')
        .select('id')
        .where((eb) =>
          eb.or([
            eb('id', '=', data.emailOrUserId),
            eb('email', '=', data.emailOrUserId.toLowerCase()),
          ]),
        )
        .executeTakeFirst();
      if (!user) {
        problems.push(
          bad('UNKNOWN_USER', 'Không tìm thấy tài khoản giáo viên này'),
        );
      } else {
        targetUserId = String(user.id);
      }
    }
    if (problems.length > 0 || !apply || !targetUserId) return problems;
    const values = {
      tenVietTat: tenVietTat || null,
      viTri: viTri || null,
      thuLaoMotBuoi: thuLao,
      tinhTrang,
    };
    const existing = await own('userId', targetUserId);
    if (existing) {
      await repo(conn, 'eduHoSoGv', primary).updateOne({
        filter: { id: Number(existing.id) },
        values,
      });
    } else {
      await created('eduHoSoGv', primary, { userId: targetUserId, ...values });
    }
    return problems;
  }

  if (entity === 'phatSach') {
    let student: Row | null = null;
    let book: Row | null = null;
    if (!data.hocVienMa) {
      problems.push(bad('MISSING_STUDENT', 'Thiếu mã học viên'));
    } else {
      student = await find('student', 'ma', data.hocVienMa);
      if (!student) {
        problems.push(
          bad(
            'UNKNOWN_STUDENT',
            `Không tìm thấy học viên có mã: ${data.hocVienMa}`,
          ),
        );
      }
    }
    if (!data.kyHieuSach) {
      problems.push(bad('MISSING_BOOK', 'Thiếu ký hiệu sách'));
    } else {
      book = await find('book', 'kyHieu', data.kyHieuSach);
      if (!book) {
        problems.push(
          bad(
            'UNKNOWN_BOOK',
            `Không tìm thấy sách có ký hiệu: ${data.kyHieuSach}`,
          ),
        );
      }
    }
    // The branch of a handout is the student's, as in `/phatSach/ghi`; a branch code in the file must agree.
    if (data.coSoMa && student) {
      const branch = await find('branch', 'ma', data.coSoMa);
      if (!branch || Number(branch.id) !== Number(student.coSoId)) {
        problems.push(
          bad('BRANCH_MISMATCH', 'Cơ sở không khớp với cơ sở của học viên'),
        );
      }
    }
    const ngay = data.ngay || todayVn();
    if (!DATE.test(ngay)) {
      problems.push(bad('BAD_DATE', 'Ngày phải có dạng YYYY-MM-DD'));
    }
    const uuDai = whole(data.uuDai, 'uuDai', 0, 100_000_000, 0, problems);
    const ghiChu = text(data.ghiChu, 'ghiChu', 500, problems);
    const tienSach = whole(
      data.tienSach,
      'tienSach',
      0,
      100_000_000,
      Math.max(0, Number(book?.giaBan ?? 0) - uuDai),
      problems,
    );
    if (problems.length > 0 || !apply || !student || !book) return problems;
    await created('eduPhatSach', primary, {
      hocVienId: Number(student.id),
      sachId: Number(book.id),
      coSoId: Number(student.coSoId),
      ngay,
      uuDai,
      tienSach: data.tienSach
        ? tienSach
        : Math.max(0, Number(book.giaBan) - uuDai),
      ghiChu: ghiChu || null,
      nguoiTaoId: userId,
      createdAt: new Date(),
    });
    return problems;
  }

  if (entity === 'goiHoc') {
    let student: Row | null = null;
    if (!data.hocVienMa) {
      problems.push(bad('MISSING_STUDENT', 'Thiếu mã học viên'));
    } else {
      student = await find('student', 'ma', data.hocVienMa);
      if (!student) {
        problems.push(
          bad(
            'UNKNOWN_STUDENT',
            `Không tìm thấy học viên có mã: ${data.hocVienMa}`,
          ),
        );
      }
    }
    const soBuoi = whole(data.soBuoi, 'soBuoi', 1, 500, 0, problems);
    if (soBuoi <= 0) {
      problems.push(bad('BAD_SESSIONS', 'Số buổi học phải là số dương'));
    }
    const donGia = whole(data.donGia, 'donGia', 0, 100_000_000, 0, problems);
    const thanhTien = whole(
      data.thanhTien,
      'thanhTien',
      0,
      MAX_PACKAGE_TOTAL,
      soBuoi * donGia,
      problems,
    );
    if (thanhTien > MAX_PACKAGE_TOTAL) {
      problems.push(bad('BAD_TOTAL', 'Tổng tiền của gói quá lớn'));
    }
    const ngayMua = data.ngayMua || todayVn();
    if (!DATE.test(ngayMua)) {
      problems.push(bad('BAD_DATE', 'Ngày phải có dạng YYYY-MM-DD'));
    }
    const daThuTien = flag(data.daThuTien);
    const hinhThuc = data.hinhThuc || 'chuyen_khoan';
    if (!['tien_mat', 'chuyen_khoan'].includes(hinhThuc)) {
      problems.push(bad('BAD_PAYMENT_METHOD', 'Hình thức thu không hợp lệ'));
    }
    if (daThuTien && thanhTien > 0 && !env.lookups.payment) {
      problems.push(
        bad('NO_PAYMENT_PERMISSION', 'Bạn không có quyền ghi nhận thanh toán'),
      );
    }
    const ghiChu = text(data.ghiChu, 'ghiChu', 191, problems);
    if (problems.length > 0 || !apply || !student) return problems;
    const hocVienId = Number(student.id);
    const goiHocId = await created('eduGoiHoc', primary, {
      hocVienId,
      soBuoi,
      donGia,
      thanhTien,
      ngayMua,
      trangThai: 'hieu_luc',
      nguoiTaoId: userId,
    });
    // The sessions of the package join the balance with their ledger row, like selling a package at the desk.
    const before = await balanceOf(conn, hocVienId);
    await moveBalance(conn, {
      hocVienId,
      before,
      after: before + soBuoi,
      reason: 'mua_goi',
      goiHocId,
      userId,
    });
    const payment = env.lookups.payment;
    if (daThuTien && thanhTien > 0 && payment) {
      await created('eduThanhToan', payment, {
        goiHocId,
        hocVienId,
        coSoId: Number(student.coSoId),
        soTien: thanhTien,
        hinhThuc,
        ngay: ngayMua,
        thang: ngayMua.slice(0, 7),
        noiDungCk: ghiChu || `Thu học phí gói ${soBuoi} buổi`,
        nguoiGhiNhanId: userId,
      });
    }
    return problems;
  }

  if (entity === 'diemDanh') {
    if (!data.lopMa) problems.push(bad('MISSING_CLASS', 'Thiếu mã lớp'));
    if (!data.ngay || !DATE.test(data.ngay)) {
      problems.push(bad('BAD_DATE', 'Thiếu ngày học (YYYY-MM-DD)'));
    }
    if (!data.gioBatDau || !TIME.test(data.gioBatDau)) {
      problems.push(bad('BAD_TIME', 'Thiếu giờ bắt đầu (HH:mm)'));
    }
    if (!data.hocVienMa) {
      problems.push(bad('MISSING_STUDENT', 'Thiếu mã học viên'));
    }
    const trangThai = (data.trangThai || 'co_mat') as AttendanceStatus;
    if (!ATTENDANCE_STATUSES.includes(trangThai)) {
      problems.push(bad('BAD_STATUS', `Trạng thái không hợp lệ: ${trangThai}`));
    }
    const nhanXet = text(data.nhanXet, 'nhanXet', 500, problems);
    const gioKetThuc = data.gioKetThuc || '20:00';
    if (!TIME.test(gioKetThuc)) {
      problems.push(bad('BAD_TIME', 'Giờ kết thúc phải có dạng HH:mm'));
    }
    const lop = data.lopMa ? await find('class', 'ma', data.lopMa) : null;
    if (data.lopMa && !lop) {
      problems.push(
        bad('UNKNOWN_CLASS', `Không tìm thấy lớp có mã: ${data.lopMa}`),
      );
    }
    const student = data.hocVienMa
      ? await find('student', 'ma', data.hocVienMa)
      : null;
    if (data.hocVienMa && !student) {
      problems.push(
        bad(
          'UNKNOWN_STUDENT',
          `Không tìm thấy học viên có mã: ${data.hocVienMa}`,
        ),
      );
    }
    if (lop && student && Number(student.coSoId) !== Number(lop.coSoId)) {
      problems.push(
        bad('STUDENT_OTHER_BRANCH', 'Học viên không thuộc cơ sở của lớp này'),
      );
    }
    const sessionPolicy = env.lookups.sessionView;
    const session =
      lop && sessionPolicy && DATE.test(data.ngay ?? '')
        ? await repo(conn, 'eduBuoiHoc', sessionPolicy).findOne({
            filter: (f: {
              and: (nodes: unknown[]) => unknown;
              number: (n: string) => { eq: (v: number) => unknown };
              string: (n: string) => { eq: (v: string) => unknown };
            }) =>
              f.and([
                f.number('lopId').eq(Number(lop.id)),
                f.string('ngay').eq(data.ngay),
                f.string('gioBatDau').eq(data.gioBatDau ?? ''),
              ]),
          })
        : null;
    if (lop && !session && !env.lookups.sessionCreate) {
      problems.push(
        bad('SESSION_NOT_FOUND', 'Chưa có buổi học này và bạn không được tạo'),
      );
    }
    if (problems.length > 0 || !apply || !lop || !student) return problems;

    let buoiHocId: number;
    if (session) {
      buoiHocId = Number(session.id);
    } else {
      const policy = env.lookups.sessionCreate as RepositoryPolicy;
      buoiHocId = await created('eduBuoiHoc', policy, {
        lopId: Number(lop.id),
        ngay: data.ngay,
        gioBatDau: data.gioBatDau,
        gioKetThuc,
        hlvId: lop.hlvId ?? null,
        loai: 'thuong',
        trangThai: 'da_diem_danh',
      });
    }
    // The rule in force is fixed on the session at its first save, exactly as for the register.
    const rule = await lockSessionRule(conn, buoiHocId, Number(lop.coSoId));
    await saveAttendanceRow(
      conn,
      primary,
      {
        buoiHocId,
        hocVienId: Number(student.id),
        trangThai,
        daLamBtvn: flag(data.daLamBtvn),
        nhanXet: nhanXet || null,
        keepNote: true,
      },
      rule,
      userId,
    );
    await conn.query
      .updateTable('eduBuoiHoc')
      .set({ trangThai: 'da_diem_danh' })
      .where('id', '=', buoiHocId)
      .execute();
    return problems;
  }

  if (entity === 'tuyenSinh') {
    if (!data.hoTen) {
      problems.push(bad('MISSING_NAME', 'Thiếu họ tên khách hàng'));
    }
    const hoTen = text(data.hoTen, 'hoTen', 191, problems);
    const soDienThoai = text(data.soDienThoai, 'soDienThoai', 20, problems);
    const kenh = text(data.kenh || 'Trực tiếp', 'kenh', 64, problems);
    const ghiChu = text(data.ghiChu, 'ghiChu', 500, problems);
    const trangThai = data.trangThai || 'moi';
    if (
      !['moi', 'dang_cham_soc', 'da_chot', 'khong_chot'].includes(trangThai)
    ) {
      problems.push(bad('BAD_STATUS', `Trạng thái không hợp lệ: ${trangThai}`));
    }
    if (data.ngayNhac && !DATE.test(data.ngayNhac)) {
      problems.push(bad('BAD_DATE', 'Ngày nhắc phải có dạng YYYY-MM-DD'));
    }
    let branch: Row | null = null;
    if (!data.coSoMa) {
      problems.push(bad('MISSING_BRANCH', 'Thiếu mã cơ sở'));
    } else {
      branch = await find('branch', 'ma', data.coSoMa);
      if (!branch) {
        problems.push(
          bad('UNKNOWN_BRANCH', `Không tìm thấy cơ sở có mã: ${data.coSoMa}`),
        );
      }
    }
    if (problems.length > 0 || !apply || !branch) return problems;
    await created('eduLienHe', primary, {
      hoTen,
      soDienThoai: soDienThoai || null,
      coSoId: Number(branch.id),
      kenh,
      trangThai,
      ngayNhac: data.ngayNhac || null,
      ghiChu: ghiChu || null,
      ngayTao: todayVn(),
    });
    return problems;
  }

  return [bad('EDU_IMPORT_UNKNOWN', 'Không hỗ trợ import cho mục này')];
}

/** A refused row stops its own transaction; the rows before and after it are not affected. */
class RowRefused extends Error {
  constructor(readonly problems: readonly Problem[]) {
    super('row refused');
  }
}

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const router = new Hono<EduEnv>();
    const database =
      app.container.resolve<DatabaseManager>(databaseManagerToken);
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);

    for (const path of [
      '/edu/import/mau/:entity',
      '/edu/import/xem-truoc/:entity',
      '/edu/import/xac-nhan/:entity',
    ]) {
      router.use(path, auth.required(), authz.middleware());
    }

    /**
     * Authorizes the composite action of the entity named in the path before anything else runs, and keeps the
     * policies of that action and of the actions its lookups need (a lookup the caller does not hold finds nothing).
     */
    const forEntity: MiddlewareHandler<
      EduEnv & {
        Variables: {
          importEnv: Pick<Env, 'gate' | 'primary' | 'lookups'>;
        };
      }
    > = async (c, next) => {
      const entity = c.req.param('entity') ?? '';
      const gate = ENTITY_GATES[entity];
      if (!gate || !ENTITY_CONFIGS[entity]) {
        throw eduError(
          'NOT_FOUND',
          'EDU_IMPORT_UNKNOWN',
          `Không hỗ trợ import cho mục "${entity}"`,
        );
      }
      const policies = await policiesOf(
        c as unknown as Context<EduEnv>,
        gate.resource,
        gate.action,
      );
      const primary = policies[gate.collection];
      if (!primary) {
        throw eduError(
          'PERMISSION_DENIED',
          'EDU_PERMISSION_DENIED',
          'This action is not allowed.',
        );
      }
      const lookups: Partial<Record<LookupName, RepositoryPolicy>> = {};
      for (const name of gate.lookups) {
        const spec = LOOKUPS[name];
        try {
          const granted = await policiesOf(
            c as unknown as Context<EduEnv>,
            spec.resource,
            spec.action,
          );
          const policy = granted[spec.collection];
          if (policy) lookups[name] = policy;
        } catch (error) {
          if (!(error instanceof AuthorizationDeniedError)) throw error;
        }
      }
      c.set('importEnv', { gate, primary, lookups });
      await next();
    };

    type ImportContext = Context<
      EduEnv & {
        Variables: {
          importEnv: Pick<Env, 'gate' | 'primary' | 'lookups'>;
        };
      }
    >;

    const readRows = (csv: string): { headers: string[]; rows: string[][] } => {
      const parsedRows = parseCsv(csv);
      if (parsedRows.length <= 1) {
        throw eduError(
          'INVALID_ARGUMENT',
          'EDU_IMPORT_EMPTY',
          'Tập tin CSV không có dòng dữ liệu nào',
        );
      }
      if (parsedRows.length - 1 > MAX_IMPORT_ROWS) {
        throw eduError(
          'FAILED_PRECONDITION',
          'EDU_IMPORT_TOO_LARGE',
          `Tập tin có hơn ${MAX_IMPORT_ROWS} dòng: hãy chia nhỏ rồi nhập từng phần`,
        );
      }
      return {
        headers: (parsedRows[0] ?? []).map((h) => h.trim()),
        rows: parsedRows.slice(1),
      };
    };
    const toData = (
      headers: readonly string[],
      raw: readonly string[],
    ): Record<string, string> => {
      const data: Record<string, string> = {};
      headers.forEach((header, j) => {
        data[header] = (raw[j] ?? '').trim();
      });
      return data;
    };

    // 1. Tải mẫu CSV
    router.get(
      '/edu/import/mau/:entity',
      describeRoute({
        tags: ['NocoEdu Universal Import'],
        summary: 'Tải nội dung CSV mẫu theo entity',
        operationId: 'getImportCsvTemplate',
        responses: {
          '200': dataResponse(
            z.object({
              entity: z.string(),
              name: z.string(),
              csv: z.string(),
              columns: z.array(z.string()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      forEntity,
      async (c) => {
        const entity = c.req.param('entity');
        const cfg = ENTITY_CONFIGS[entity];
        const csvContent =
          '﻿' + [cfg.sampleHeader, ...cfg.sampleRows].join('\r\n');
        return c.json({
          data: {
            entity,
            name: cfg.name,
            csv: csvContent,
            columns: cfg.columns,
          },
        });
      },
    );

    // 2. Xem trước (Preview & Validate): reads only, writes nothing.
    router.post(
      '/edu/import/xem-truoc/:entity',
      forEntity,
      bodyLimit({ maxSize: MAX_CSV_SIZE }),
      apiValidator('json', BodySchema),
      describeRoute({
        tags: ['NocoEdu Universal Import'],
        summary: 'Xem trước và validate dữ liệu CSV trước khi import',
        operationId: 'previewImportCsv',
        responses: {
          '200': dataResponse(
            z.object({
              totalRows: z.number(),
              validCount: z.number(),
              errorCount: z.number(),
              rows: z.array(z.any()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (c: ImportContext) => {
        const entity = c.req.param('entity') ?? '';
        const { csv } = (
          c.req as unknown as { valid(t: 'json'): { csv: string } }
        ).valid('json');
        const { headers, rows } = readRows(csv);
        const env: Env = {
          conn: database.connection(),
          userId: currentUserId(c as unknown as Context<EduEnv>),
          ...c.get('importEnv'),
        };
        const previewRows: {
          line: number;
          data: Record<string, string>;
          isValid: boolean;
          errors: string[];
        }[] = [];
        let validCount = 0;
        for (let i = 0; i < rows.length; i++) {
          const data = toData(headers, rows[i] ?? []);
          const problems = await handleRow(entity, data, env, false);
          if (problems.length === 0) validCount += 1;
          previewRows.push({
            line: i + 2,
            data,
            isValid: problems.length === 0,
            errors: problems.map((p) => p.message),
          });
        }
        return c.json({
          data: {
            totalRows: rows.length,
            validCount,
            errorCount: rows.length - validCount,
            rows: previewRows,
          },
        });
      },
    );

    // 3. Xác nhận nạp dữ liệu (Commit): one transaction per row.
    router.post(
      '/edu/import/xac-nhan/:entity',
      forEntity,
      bodyLimit({ maxSize: MAX_CSV_SIZE }),
      apiValidator('json', BodySchema),
      describeRoute({
        tags: ['NocoEdu Universal Import'],
        summary: 'Xác nhận ghi dữ liệu CSV vào database',
        operationId: 'commitImportCsv',
        responses: {
          '200': dataResponse(
            z.object({
              totalRows: z.number(),
              importedCount: z.number(),
              message: z.string(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (c: ImportContext) => {
        const entity = c.req.param('entity') ?? '';
        const cfg = ENTITY_CONFIGS[entity];
        const { csv } = (
          c.req as unknown as { valid(t: 'json'): { csv: string } }
        ).valid('json');
        const { headers, rows } = readRows(csv);
        const userId = currentUserId(c as unknown as Context<EduEnv>);
        const importEnv = c.get('importEnv');
        let importedCount = 0;
        const skipped: { line: number; code: string }[] = [];
        for (let i = 0; i < rows.length; i++) {
          const data = toData(headers, rows[i] ?? []);
          try {
            await database.transaction(async (conn) => {
              const problems = await handleRow(
                entity,
                data,
                { conn, userId, ...importEnv },
                true,
              );
              if (problems.length > 0) throw new RowRefused(problems);
            });
            importedCount += 1;
          } catch (error) {
            const code =
              error instanceof RowRefused
                ? (error.problems[0]?.code ?? 'EDU_IMPORT_REFUSED')
                : ((error as { reason?: string }).reason ??
                  'EDU_IMPORT_WRITE_FAILED');
            skipped.push({ line: i + 2, code });
          }
        }
        // Lines and reason codes only, never a name or a phone number.
        const detail = skipped
          .slice(0, 20)
          .map((row) => `dòng ${row.line} (${row.code})`)
          .join(', ');
        return c.json({
          data: {
            totalRows: rows.length,
            importedCount,
            skipped,
            message:
              `Đã nhập thành công ${importedCount}/${rows.length} dòng dữ liệu vào ${cfg.name}.` +
              (skipped.length > 0
                ? ` Bỏ qua ${skipped.length} dòng: ${detail}${skipped.length > 20 ? ', ...' : ''}.`
                : ''),
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
