import { LEVEL_KEYS, type LevelKey } from '../levels.js';
import { nameKey } from '../import-csv.js';
import type { AttendanceStatus } from '../so-du.js';
import {
  BRANCH_EXCUSED_DEDUCTS,
  BRANCH_NAMES,
  DEFAULT_BIRTH_YEAR,
  DEFAULT_STUDENT_LEVEL,
} from './chua-xac-nhan.js';
import {
  birthDateVn,
  birthYearVn,
  classLevel,
  levelFromLark,
  mindfulnessScore,
  normalizeFullName,
  relationFromLark,
  statusFromLark,
  toVnMobile,
} from './chuan-hoa.js';
import { attendanceFromCode } from './diem-danh.js';
import {
  dateVn,
  flatValues,
  linkIds,
  linkTexts,
  millisecondsOf,
  numberOf,
  textList,
  textOf,
  userEmails,
} from './gia-tri.js';
import type { LarkData, LarkRecord } from './nguon.js';
import { openingBalance, recomputeBalance } from './so-du.js';

/**
 * The plan of a Lark import: a pure function of the records read from Lark and a snapshot of what NocoEdu already
 * holds. `--dry-run` prints it; `--commit` writes exactly it (`ghi.ts`), so the two cannot differ. Nothing here reads a
 * database or calls Lark, and nothing here keeps a name, a phone number or a date of birth in an error: a problem is a
 * table, the Lark record id (`rec…`, or a derived key) and a reason code.
 *
 * Order: branches → classes and timetable → parents → students → opening packages → sessions and attendance. A row
 * that fails is left out together with every row that depends on it (a failed student takes its attendance with it).
 */

export type Action = 'tao' | 'trung' | 'ghep';

export const PLAN_TABLES = [
  'coSo',
  'lop',
  'lopLich',
  'phuHuynh',
  'hocVien',
  'goiHoc',
  'buoiHoc',
  'diemDanh',
] as const;
export type PlanTable = (typeof PLAN_TABLES)[number];

export interface Problem {
  readonly table: PlanTable;
  /** The Lark record id or derived key, never a name. */
  readonly id: string;
  readonly code: string;
}

export interface ExistingStudent {
  readonly id: number;
  readonly hoTen: string;
  readonly namSinh: number;
  readonly externalId: string | null;
  /** Normalized phone numbers of the parents linked to the student. */
  readonly phones: readonly string[];
  /** The student already holds a package or a non-zero balance: an opening balance from Lark must not be added. */
  readonly coSoDu: boolean;
}

/** What NocoEdu holds now. The command builds it from the database; the tests build it by hand. */
export interface ExistingState {
  readonly branches: readonly {
    id: number;
    ma: string;
    externalId: string | null;
  }[];
  readonly externalIds: Readonly<
    Record<Exclude<PlanTable, 'coSo'>, ReadonlySet<string>>
  >;
  readonly parentsByPhone: ReadonlyMap<
    string,
    { id: number; externalId: string | null }
  >;
  readonly students: readonly ExistingStudent[];
  /** NocoEdu user ids by lower-case email, to match "GV Phụ trách". */
  readonly usersByEmail: ReadonlyMap<string, string>;
  /**
   * Sessions NocoEdu already holds for a class that came from Lark, as `<Lark class id>|<day>|<start time>`: the unique
   * index (class, day, start) refuses a second one, so the plan reports it instead of letting the whole run fail.
   */
  readonly sessions: ReadonlySet<string>;
}

export const EMPTY_STATE: ExistingState = {
  branches: [],
  externalIds: {
    lop: new Set(),
    lopLich: new Set(),
    phuHuynh: new Set(),
    hocVien: new Set(),
    goiHoc: new Set(),
    buoiHoc: new Set(),
    diemDanh: new Set(),
  },
  parentsByPhone: new Map(),
  students: [],
  usersByEmail: new Map(),
  sessions: new Set(),
};

export interface PlanOptions {
  /** `EDU_TRU_BUOI_VANG_KHONG_PHEP` at the time of the import; fixed on every imported session. */
  readonly unexcusedAbsenceDeducts: boolean;
}

export interface CoSoRow {
  readonly externalId: string;
  readonly ma: string;
  readonly ten: string;
  readonly action: Action;
  readonly existingId?: number;
}
export interface LopRow {
  readonly externalId: string;
  readonly ten: string;
  readonly coSoKey: string;
  readonly hlvId: string | null;
  readonly levelKey: LevelKey;
  readonly action: Action;
}
export interface LichRow {
  readonly externalId: string;
  readonly lopKey: string;
  readonly thu: number;
  readonly gioBatDau: string;
  readonly gioKetThuc: string;
  readonly action: Action;
}
export interface PhuHuynhRow {
  readonly externalId: string;
  readonly hoTen: string;
  readonly soDienThoai: string;
  readonly email: string | null;
  readonly action: Action;
  readonly existingId?: number;
}
export interface HocVienRow {
  readonly externalId: string;
  readonly externalCode: string | null;
  readonly hoTen: string;
  readonly namSinh: number;
  readonly ngaySinh: string | null;
  readonly coSoKey: string;
  readonly lopKey: string | null;
  readonly levelKey: LevelKey;
  readonly trangThai: string;
  readonly parents: readonly {
    key: string;
    quanHe: string;
    lienHeChinh: boolean;
  }[];
  readonly action: Action;
  readonly existingId?: number;
}
export interface GoiRow {
  readonly externalId: string;
  readonly hocVienKey: string;
  readonly soBuoi: number;
  readonly ngayChot: string;
  readonly action: Action;
}
export interface BuoiRow {
  readonly externalId: string;
  readonly lopKey: string;
  readonly ngay: string;
  readonly gioBatDau: string;
  readonly gioKetThuc: string;
  readonly keHoachDay: string | null;
  readonly kienThucMoi: string | null;
  readonly giaoBtvn: string | null;
  readonly keHoachBuoiSau: string | null;
  readonly truVangCoPhep: boolean;
  readonly truVangKhongPhep: boolean;
  readonly action: Action;
}
export interface DiemDanhRow {
  readonly externalId: string;
  readonly buoiKey: string;
  readonly hocVienKey: string;
  readonly trangThai: AttendanceStatus;
  readonly daLamBtvn: boolean;
  readonly nhanXet: string | null;
  readonly yThucDiem: number | null;
  readonly tinhVaoSoDu: boolean;
  readonly soBuoiDaTru: number;
  readonly action: Action;
}
export interface BalanceRow {
  /** The old code on Lark (`HV-…`): enough to find the student there, not a name. */
  readonly externalCode: string;
  readonly hocVienKey: string;
  readonly larkBalance: number | null;
  readonly recomputed: number;
  readonly difference: number | null;
}

export interface Plan {
  readonly coSo: readonly CoSoRow[];
  readonly lop: readonly LopRow[];
  readonly lopLich: readonly LichRow[];
  readonly phuHuynh: readonly PhuHuynhRow[];
  readonly hocVien: readonly HocVienRow[];
  readonly goiHoc: readonly GoiRow[];
  readonly buoiHoc: readonly BuoiRow[];
  readonly diemDanh: readonly DiemDanhRow[];
  readonly balances: readonly BalanceRow[];
  /** Rows left out: the row, and every row that depended on it. */
  readonly problems: readonly Problem[];
  /** Rows imported with something missing (`THIEU_PHU_HUYNH`, `KHONG_CO_SO_DU`, …). */
  readonly warnings: readonly Problem[];
  /** A structural problem: `--commit` refuses a plan that has any. */
  readonly structural: readonly string[];
}

const THU_PATTERN = /^thứ\s*([2-7])$/iu;
const CA_PATTERN = /\(\s*(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})\s*\)/u;
const pad = (value: string): string => value.padStart(2, '0');

/** "Thứ 2" → 2 … "Thứ 7" → 7. */
export function parseThu(raw: unknown): number | null {
  const match = THU_PATTERN.exec(textOf(raw).normalize('NFC'));
  return match?.[1] ? Number(match[1]) : null;
}

/** "Ca1 (18h15-19h15)" → `{ 18:15, 19:15 }`: the hours inside the brackets, never the name of the shift. */
export function parseCa(
  raw: unknown,
): { gioBatDau: string; gioKetThuc: string } | null {
  const match = CA_PATTERN.exec(textOf(raw));
  if (!match) return null;
  const [, h1 = '', m1 = '', h2 = '', m2 = ''] = match;
  if (Number(h1) > 23 || Number(h2) > 23 || Number(m1) > 59 || Number(m2) > 59)
    return null;
  return { gioBatDau: `${pad(h1)}:${m1}`, gioKetThuc: `${pad(h2)}:${m2}` };
}

/** `dd/MM/yyyy` (the text of the primary field "Ngày học") → `YYYY-MM-DD`. */
export function parseDayMonthYear(raw: unknown): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(textOf(raw));
  if (!match) return null;
  const [, d = '', m = '', y = ''] = match;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso
    ? null
    : iso;
}

/** A phone cell: a text, or a number whose leading 0 the spreadsheet dropped (nine digits → `0` + digits). */
function phoneOf(raw: string | number | boolean): string | null {
  const text = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw);
  const digits =
    typeof raw === 'number' && /^[35789]\d{8}$/u.test(text) ? `0${text}` : text;
  const converted = toVnMobile(digits);
  return converted.ok ? converted.value : null;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;

interface RawAttendance {
  readonly id: string;
  readonly studentKey: string;
  readonly lopKey: string;
  readonly ngay: string;
  readonly record: LarkRecord;
}

export function lapKeHoach(
  data: LarkData,
  existing: ExistingState,
  options: PlanOptions,
): Plan {
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const structural: string[] = [];
  const fail = (table: PlanTable, id: string, code: string) =>
    problems.push({ table, id, code });
  const warn = (table: PlanTable, id: string, code: string) =>
    warnings.push({ table, id, code });

  // ── Level names, for a link that carries only the record id ──────────────────────────────────────────────
  const levelNames = new Map<string, string>();
  for (const record of data.level)
    levelNames.set(
      record.recordId,
      textOf(record.fields['Tên viết tắt level']),
    );

  // ── 1. Branches ──────────────────────────────────────────────────────────────────────────────────────────
  const branchKey = (raw: unknown): string | null => {
    const entry = BRANCH_NAMES[textOf(raw).normalize('NFC').toLowerCase()];
    return entry ? `lark:coSo:${entry.ten}` : null;
  };
  const wanted = new Set<string>();
  for (const record of [...data.lopHoc, ...data.hocVien]) {
    const key = branchKey(record.fields['cơ sở']);
    if (key) wanted.add(key);
  }
  if (data.nhanXet2024.length > 0 || data.nhanXet2025.length > 0) {
    for (const entry of Object.values(BRANCH_NAMES)) {
      wanted.add(`lark:coSo:${entry.ten}`);
    }
  }
  const coSo: CoSoRow[] = [];
  for (const entry of Object.values(BRANCH_NAMES)) {
    const externalId = `lark:coSo:${entry.ten}`;
    if (!wanted.has(externalId)) continue;
    const byId = existing.branches.find((b) => b.externalId === externalId);
    const byCode = existing.branches.find(
      (b) => b.externalId === null && b.ma === entry.ma,
    );
    coSo.push(
      byId
        ? { externalId, ...entry, action: 'trung', existingId: byId.id }
        : byCode
          ? { externalId, ...entry, action: 'ghep', existingId: byCode.id }
          : { externalId, ...entry, action: 'tao' },
    );
  }
  const branchMa = new Map(coSo.map((row) => [row.externalId, row.ma]));

  // ── 2. Classes and their timetable ───────────────────────────────────────────────────────────────────────
  const lopRows = new Map<
    string,
    { ten: string; coSoKey: string; hlvId: string | null }
  >();
  const lich: LichRow[] = [];

  for (const record of data.lopHoc) {
    const id = record.recordId;
    const ten = normalizeFullName(textOf(record.fields['Tên lớp']));
    const coSoKey = branchKey(record.fields['cơ sở']);
    if (!ten) {
      fail('lop', id, 'LOP_THIEU_TEN');
      continue;
    }
    if (!coSoKey) {
      fail('lop', id, 'CO_SO_KHONG_RO');
      continue;
    }
    let hlvId: string | null = null;
    for (const email of userEmails(record.fields['GV Phụ trách'])) {
      const found = existing.usersByEmail.get(email);
      if (found) {
        hlvId = found;
        break;
      }
    }
    if (!hlvId) warn('lop', id, 'HLV_CHUA_GHEP');
    lopRows.set(id, { ten, coSoKey, hlvId });
    const thu = parseThu(record.fields['Thứ']);
    const ca = parseCa(record.fields['Ca dạy']);
    if (thu === null || ca === null) {
      fail('lopLich', id, 'LICH_KHONG_RO');
      continue;
    }
    const externalId = `${id}:lich`;
    lich.push({
      externalId,
      lopKey: id,
      thu,
      ...ca,
      action: existing.externalIds.lopLich.has(externalId) ? 'trung' : 'tao',
    });
  }

  // ── 3. Attendance rows of Lark, read once ────────────────────────────────────────────────────────────────
  const studentBranch = new Map<string, string>();
  for (const record of data.hocVien) {
    const rawBranch = textOf(record.fields['cơ sở']).normalize('NFC').toLowerCase();
    studentBranch.set(record.recordId, rawBranch);
  }

  const fallbackClassesNeeded = new Set<'lark:lop:kem-kl' | 'lark:lop:kem-vp'>();
  const raw: RawAttendance[] = [];
  for (const record of [...data.nhanXet2024, ...data.nhanXet2025]) {
    const id = record.recordId;
    const studentKey = linkIds(record.fields['Tên HS'])[0];
    let lopKey = linkIds(record.fields['Lớp'])[0];
    const ngay =
      dateVn(record.fields['Ngày học - Day format']) ??
      parseDayMonthYear(record.fields['Ngày học']);
    if (!studentKey) {
      fail('diemDanh', id, 'HOC_VIEN_KHONG_RO');
      continue;
    }
    if (!lopKey) {
      const sBranch = studentBranch.get(studentKey) ?? '';
      const isVp = sBranch.includes('vĩnh phúc') || sBranch.includes('vp');
      const fallbackKey = isVp ? 'lark:lop:kem-vp' : 'lark:lop:kem-kl';
      fallbackClassesNeeded.add(fallbackKey);
      lopKey = fallbackKey;
      warn('diemDanh', id, 'LOP_MAC_DINH');
    }
    if (!ngay) {
      fail('diemDanh', id, 'NGAY_KHONG_RO');
      continue;
    }
    raw.push({ id, studentKey, lopKey, ngay, record });
  }

  // Register fallback classes if needed by unassigned attendances
  if (fallbackClassesNeeded.has('lark:lop:kem-kl')) {
    lopRows.set('lark:lop:kem-kl', {
      ten: 'Lớp kèm / Học bù (Kim Liên)',
      coSoKey: 'lark:coSo:Kim Liên',
      hlvId: null,
    });
    const lichId = 'lark:lop:kem-kl:lich';
    lich.push({
      externalId: lichId,
      lopKey: 'lark:lop:kem-kl',
      thu: 2,
      gioBatDau: '08:00',
      gioKetThuc: '21:00',
      action: existing.externalIds.lopLich.has(lichId) ? 'trung' : 'tao',
    });
  }
  if (fallbackClassesNeeded.has('lark:lop:kem-vp')) {
    lopRows.set('lark:lop:kem-vp', {
      ten: 'Lớp kèm / Học bù (Vĩnh Phúc)',
      coSoKey: 'lark:coSo:Vĩnh Phúc',
      hlvId: null,
    });
    const lichId = 'lark:lop:kem-vp:lich';
    lich.push({
      externalId: lichId,
      lopKey: 'lark:lop:kem-vp',
      thu: 2,
      gioBatDau: '08:00',
      gioKetThuc: '21:00',
      action: existing.externalIds.lopLich.has(lichId) ? 'trung' : 'tao',
    });
  }
  const lichOf = new Map(lich.map((row) => [row.lopKey, row]));
  raw.sort((a, b) =>
    a.ngay === b.ngay ? a.id.localeCompare(b.id) : a.ngay.localeCompare(b.ngay),
  );
  const latestOf = new Map<string, RawAttendance>();
  for (const row of raw) latestOf.set(row.studentKey, row);

  // ── 4. Students and their parents ────────────────────────────────────────────────────────────────────────
  const students: HocVienRow[] = [];
  const phuHuynh = new Map<string, PhuHuynhRow>();
  const studentLevel = new Map<string, LevelKey>();
  const studentPhones = new Map<string, readonly string[]>();
  const claimedExisting = new Set<number>();
  const byNameYear = new Map<string, ExistingStudent[]>();
  for (const s of existing.students)
    if (s.externalId === null) {
      const k = `${nameKey(s.hoTen)}|${s.namSinh}`;
      byNameYear.set(k, [...(byNameYear.get(k) ?? []), s]);
    }

  for (const record of data.hocVien) {
    const id = record.recordId;
    const f = record.fields;
    const hoTen = normalizeFullName(textOf(f['Học viên']));
    if (!hoTen) {
      fail('hocVien', id, 'THIEU_HO_TEN');
      continue;
    }
    const ms = millisecondsOf(f['Ngày sinh']);
    const year = birthYearVn(ms);
    const day = birthDateVn(ms);
    let namSinh: number;
    let ngaySinh: string | null;
    if (year.ok && day.ok) {
      namSinh = year.value;
      ngaySinh = day.value;
    } else {
      namSinh = DEFAULT_BIRTH_YEAR;
      ngaySinh = null;
      warn('hocVien', id, 'THIEU_NAM_SINH');
    }
    const coSoKey = branchKey(f['cơ sở']);
    if (!coSoKey) {
      fail('hocVien', id, 'CO_SO_KHONG_RO');
      continue;
    }
    // The level: the text of the link, or the name of the linked record when the API sends only its id.
    const levelText =
      linkTexts(f['Trình độ hiện tại'])[0] ??
      levelNames.get(linkIds(f['Trình độ hiện tại'])[0] ?? '') ??
      '';
    let level: { ok: true; value: LevelKey } | { ok: false; code: string };
    if (!levelText) {
      const pastTexts = [
        ...linkTexts(f['Các trình độ đã học tại CLB']),
        textOf(f['Các trình độ đã học tại CLB']),
      ]
        .flatMap((t) => t.split(','))
        .map((t) => t.trim())
        .filter(Boolean);
      let found: { ok: true; value: LevelKey } | null = null;
      for (let i = pastTexts.length - 1; i >= 0; i--) {
        const candidate = levelFromLark(pastTexts[i]);
        if (candidate.ok) {
          found = candidate;
          break;
        }
      }
      if (found) {
        level = found;
      } else {
        level = { ok: true, value: DEFAULT_STUDENT_LEVEL };
        warn('hocVien', id, 'CAP_MAC_DINH');
      }
    } else {
      level = levelFromLark(levelText);
      if (!level.ok) {
        fail('hocVien', id, level.code);
        continue;
      }
    }
    const status = statusFromLark(f['Tình trạng học']);
    if (!status.ok) {
      fail('hocVien', id, status.code);
      continue;
    }

    // Parents: names and phones are paired by position; a count that differs pairs nothing.
    const names = textList(f['Họ tên PH']).map(normalizeFullName);
    const phoneCells = flatValues(f['SDT PH']);
    const phones = phoneCells.map(phoneOf);
    const relation = relationFromLark(f['Quan hệ']);
    const parents: { key: string; quanHe: string; lienHeChinh: boolean }[] = [];
    if (names.length === 0 && phoneCells.length === 0) {
      warn('phuHuynh', id, 'THIEU_PHU_HUYNH');
    } else if (names.length !== phoneCells.length) {
      fail('phuHuynh', id, 'PH_KHONG_GHEP_DUOC');
      warn('phuHuynh', id, 'THIEU_PHU_HUYNH');
    } else {
      const emailText = textOf(f['email PH']).toLowerCase();
      const email = EMAIL_PATTERN.test(emailText) ? emailText : null;
      if (emailText && !email) warn('phuHuynh', id, 'EMAIL_SAI');
      if (!relation.ok) warn('phuHuynh', id, relation.code);
      for (const [index, name] of names.entries()) {
        const phone = phones[index];
        if (!phone) {
          fail('phuHuynh', id, 'SDT_SAI');
          continue;
        }
        const key = `lark:ph:${phone}`;
        if (!name) {
          fail('phuHuynh', id, 'PH_THIEU_TEN');
          continue;
        }
        if (!phuHuynh.has(key)) {
          const known = existing.parentsByPhone.get(phone);
          phuHuynh.set(key, {
            externalId: key,
            hoTen: name,
            soDienThoai: phone,
            // The email on the student row belongs to the first parent.
            email: index === 0 ? email : null,
            action: existing.externalIds.phuHuynh.has(key)
              ? 'trung'
              : known
                ? 'ghep'
                : 'tao',
            ...(known ? { existingId: known.id } : {}),
          });
        }
        parents.push({
          key,
          quanHe: index === 0 && relation.ok ? relation.value : 'khac',
          lienHeChinh: parents.length === 0,
        });
      }
      if (parents.length === 0) warn('phuHuynh', id, 'THIEU_PHU_HUYNH');
    }

    const latest = latestOf.get(id);
    const lopKey = latest && lopRows.has(latest.lopKey) ? latest.lopKey : null;
    const studentPhoneList = parents
      .map((p) => phuHuynh.get(p.key)?.soDienThoai)
      .filter((p): p is string => !!p);

    // Same student already in NocoEdu: by Lark id → nothing to do; by name, birth year and parent phone → merge.
    let action: Action = 'tao';
    let existingId: number | undefined;
    const already = existing.students.find((s) => s.externalId === id);
    if (already) {
      action = 'trung';
      existingId = already.id;
    } else {
      const candidates = (
        byNameYear.get(`${nameKey(hoTen)}|${namSinh}`) ?? []
      ).filter(
        (s) =>
          !claimedExisting.has(s.id) &&
          s.phones.some((phone) => studentPhoneList.includes(phone)),
      );
      if (candidates.length > 1) {
        fail('hocVien', id, 'TRUNG_NHIEU');
        continue;
      }
      if (candidates[0]) {
        action = 'ghep';
        existingId = candidates[0].id;
        claimedExisting.add(candidates[0].id);
      }
    }
    studentLevel.set(id, level.value);
    studentPhones.set(id, studentPhoneList);
    students.push({
      externalId: id,
      externalCode: textOf(f['ID Học viên']).slice(0, 32) || null,
      hoTen,
      namSinh,
      ngaySinh,
      coSoKey,
      lopKey,
      levelKey: level.value,
      trangThai: status.value,
      parents,
      action,
      ...(existingId !== undefined ? { existingId } : {}),
    });
  }
  const studentByKey = new Map(students.map((s) => [s.externalId, s]));
  const fieldsOf = new Map(data.hocVien.map((r) => [r.recordId, r.fields]));

  // A class takes the level most of its students have (question 7: still a default).
  const lop: LopRow[] = [...lopRows].map(([externalId, row]) => ({
    externalId,
    ...row,
    levelKey: classLevel(
      students
        .filter((s) => s.lopKey === externalId)
        .map((s) => studentLevel.get(s.externalId) ?? 'tot'),
      LEVEL_KEYS,
    ),
    action: existing.externalIds.lop.has(externalId) ? 'trung' : 'tao',
  }));

  // ── 5. Sessions, attendance, opening packages and the recomputed balance ─────────────────────────────────
  const goiHoc: GoiRow[] = [];
  const buoiHoc = new Map<string, BuoiRow>();
  const diemDanh: DiemDanhRow[] = [];
  const balances: BalanceRow[] = [];
  const seenPairs = new Set<string>();
  const conflictingSessions = new Set<string>();

  const byStudent = new Map<string, RawAttendance[]>();
  for (const row of raw)
    byStudent.set(row.studentKey, [
      ...(byStudent.get(row.studentKey) ?? []),
      row,
    ]);

  // A student left out takes every attendance row of his with him.
  for (const [studentKey, rows] of byStudent)
    if (!studentByKey.has(studentKey))
      for (const row of rows) fail('diemDanh', row.id, 'HOC_VIEN_BI_BO');

  for (const student of students) {
    const f = fieldsOf.get(student.externalId) ?? {};
    const existingStudent = existing.students.find(
      (s) => s.id === student.existingId,
    );
    const branch = branchMa.get(student.coSoKey) ?? '';
    const excusedDeducts = BRANCH_EXCUSED_DEDUCTS[branch] ?? false;

    // Opening package from "số buổi tồn update" at "Ngày update gần nhất về HP".
    const opening = openingBalance(
      flatValues(f['số buổi tồn update (vào ngày thống kê)']),
      dateVn(f['Ngày update gần nhất về HP']),
    );
    let packageToUse = opening.ok ? opening.value : null;
    if (!opening.ok) fail('goiHoc', student.externalId, opening.code);
    if (packageToUse && student.action === 'ghep' && existingStudent?.coSoDu) {
      // A student already in NocoEdu with a package or a balance: Lark's balance is not added on top of it.
      warn('goiHoc', student.externalId, 'GHEP_BO_QUA_SO_DU');
      packageToUse = null;
    } else if (!packageToUse && opening.ok) {
      warn('goiHoc', student.externalId, 'KHONG_CO_SO_DU');
    }
    if (packageToUse) {
      const externalId = `lark:sodu:${student.externalId}`;
      goiHoc.push({
        externalId,
        hocVienKey: student.externalId,
        soBuoi: packageToUse.soBuoi,
        ngayChot: packageToUse.ngayChot,
        action: existing.externalIds.goiHoc.has(externalId) ? 'trung' : 'tao',
      });
    }

    // Attendance of this student: valid rows only, with a session, in date order.
    const accepted: {
      row: RawAttendance;
      status: AttendanceStatus;
    }[] = [];
    for (const row of byStudent.get(student.externalId) ?? []) {
      const status = attendanceFromCode(row.record.fields['có mặt']);
      if (!status.ok) {
        fail('diemDanh', row.id, status.code);
        continue;
      }
      const klass = lopRows.get(row.lopKey);
      if (!klass) {
        fail('diemDanh', row.id, 'LOP_BI_BO');
        continue;
      }
      const time = lichOf.get(row.lopKey);
      if (!time) {
        fail('diemDanh', row.id, 'GIO_BUOI_KHONG_RO');
        continue;
      }
      const buoiKey = `lark:buoi:${row.lopKey}:${row.ngay}`;
      if (
        existing.sessions.has(`${row.lopKey}|${row.ngay}|${time.gioBatDau}`) &&
        !existing.externalIds.buoiHoc.has(buoiKey)
      ) {
        // The school already holds a session of this class, day and hour that did not come from this import.
        if (!conflictingSessions.has(buoiKey)) {
          conflictingSessions.add(buoiKey);
          fail('buoiHoc', buoiKey, 'BUOI_DA_CO');
        }
        fail('diemDanh', row.id, 'BUOI_DA_CO');
        continue;
      }
      const pair = `${row.lopKey}|${row.ngay}|${student.externalId}`;
      if (seenPairs.has(pair)) {
        fail('diemDanh', row.id, 'TRUNG_DONG');
        continue;
      }
      seenPairs.add(pair);
      accepted.push({ row, status: status.value });
    }
    const recomputed = recomputeBalance(
      packageToUse,
      accepted.map(({ row, status }) => ({
        ngay: row.ngay,
        trangThai: status,
      })),
      excusedDeducts,
      options.unexcusedAbsenceDeducts,
    );

    accepted.forEach(({ row, status }, index) => {
      const outcome = recomputed.rows[index];
      if (!outcome) return;
      const time = lichOf.get(row.lopKey);
      if (!time) return;
      const buoiKey = `lark:buoi:${row.lopKey}:${row.ngay}`;
      const f2 = row.record.fields;
      const text = (name: string): string | null => textOf(f2[name]) || null;
      if (!buoiHoc.has(buoiKey))
        buoiHoc.set(buoiKey, {
          externalId: buoiKey,
          lopKey: row.lopKey,
          ngay: row.ngay,
          gioBatDau: time.gioBatDau,
          gioKetThuc: time.gioKetThuc,
          keHoachDay: text('Kế hoạch dạy'),
          kienThucMoi: text('Kiến thức / lý thuyết mới'),
          giaoBtvn: text('Giao BTVN'),
          keHoachBuoiSau: text('KH buổi sau'),
          truVangCoPhep: excusedDeducts,
          truVangKhongPhep: options.unexcusedAbsenceDeducts,
          action: existing.externalIds.buoiHoc.has(buoiKey) ? 'trung' : 'tao',
        });
      const comment = textOf(f2['Nhận xét']);
      if (comment.length > 500) warn('diemDanh', row.id, 'NHAN_XET_CAT');
      diemDanh.push({
        externalId: row.id,
        buoiKey,
        hocVienKey: student.externalId,
        trangThai: status,
        daLamBtvn: numberOf(f2['Làm BTVN']) === 1,
        nhanXet: comment ? comment.slice(0, 500) : null,
        yThucDiem: mindfulnessScore(textOf(f2['Ý thức'])),
        tinhVaoSoDu: outcome.tinhVaoSoDu,
        soBuoiDaTru: outcome.soBuoiDaTru,
        action: existing.externalIds.diemDanh.has(row.id) ? 'trung' : 'tao',
      });
    });

    const latest = latestOf.get(student.externalId);
    const larkBalance = latest
      ? numberOf(latest.record.fields['Số buổi còn lại'])
      : null;
    balances.push({
      externalCode: student.externalCode ?? student.externalId,
      hocVienKey: student.externalId,
      larkBalance,
      recomputed: recomputed.soBuoiConLai,
      difference:
        larkBalance === null ? null : recomputed.soBuoiConLai - larkBalance,
    });
  }

  // Parents that no accepted student uses are not written.
  const usedParents = new Set(
    students.flatMap((s) => s.parents.map((p) => p.key)),
  );
  const parentRows = [...phuHuynh.values()].filter((p) =>
    usedParents.has(p.externalId),
  );

  if (coSo.length === 0 && (data.hocVien.length > 0 || data.lopHoc.length > 0))
    structural.push('KHONG_CO_SO_NAO');

  return {
    coSo,
    lop,
    lopLich: lich,
    phuHuynh: parentRows,
    hocVien: students,
    goiHoc,
    buoiHoc: [...buoiHoc.values()],
    diemDanh,
    balances,
    problems,
    warnings,
    structural,
  };
}

/** Rows, new, duplicate, merged and failed, per table. */
export interface TableTotals {
  readonly rows: number;
  readonly tao: number;
  readonly trung: number;
  readonly ghep: number;
  readonly loi: number;
}

export function tongKetTheoBang(plan: Plan): Record<PlanTable, TableTotals> {
  const out = {} as Record<PlanTable, TableTotals>;
  for (const table of PLAN_TABLES) {
    const rows = plan[table] as readonly { action: Action }[];
    const count = (action: Action) =>
      rows.filter((row) => row.action === action).length;
    const loi = plan.problems.filter((p) => p.table === table).length;
    out[table] = {
      rows: rows.length + loi,
      tao: count('tao'),
      trung: count('trung'),
      ghep: count('ghep'),
      loi,
    };
  }
  return out;
}

/** Problems grouped by table and code, with up to `limit` Lark ids each; never a name. */
export function nhomLoi(
  items: readonly Problem[],
  limit = 20,
): { table: PlanTable; code: string; count: number; ids: string[] }[] {
  const groups = new Map<
    string,
    { table: PlanTable; code: string; count: number; ids: string[] }
  >();
  for (const item of items) {
    const key = `${item.table}|${item.code}`;
    const group = groups.get(key) ?? {
      table: item.table,
      code: item.code,
      count: 0,
      ids: [],
    };
    group.count += 1;
    if (group.ids.length < limit) group.ids.push(item.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}
