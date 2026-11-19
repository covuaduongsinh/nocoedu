import { DEAL_RULES } from './chua-xac-nhan.js';
import { dateVn, linkIds, numberOf } from './gia-tri.js';
import type { LarkRecord } from './nguon.js';
import {
  sessionsToDeduct,
  ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from '../so-du.js';

/**
 * Loading the tuition history (docs/plans/2026-11-19-ke-hoach-nap-lich-su-hoc-phi.md), kept free of any database
 * access: given what Lark says and what NocoEdu holds, it decides every row to write.
 *
 * Why it exists: the first imports wrote the attendance of 104 students as "inside an opening balance"
 * (`tinhVaoSoDu = false`) with an opening package `lark:sodu:<student>`, and later imports then left their `Deal HP`
 * rows out (`DIEM_DANH_CU_KHONG_TRU`, `GOI_CU_LARK_SODU`) so as not to count a session twice. The club decided on
 * 19/11/2026 (Q1, Q5 of the plan) to correct that once:
 *
 * - every paid `Deal HP` row is a term (`eduGoiHoc`, `lark:deal:<rec>`), its sessions minus "chưa thống kê";
 * - the opening package `lark:sodu:<student>` of such a student is cancelled (`trangThai = da_huy`) and its balance
 *   taken back by one ledger row;
 * - his attendance written as history becomes counted (`tinhVaoSoDu = true`) with one ledger row per deducted session;
 * - every tuition payment of `Tổng Deal` is written (`lark:tongdeal:<rec>`) and linked to its term by
 *   {@link ghepTienVaoKy}; a term with a payment gets its price, a term without one keeps 0 and is shown "unknown".
 *
 * A student with no paid `Deal HP` row is left alone, apart from a payment of his not written yet. Running it again
 * changes nothing: every row it writes is recognised by its key or its state.
 */

export const GOI_DA_HUY = 'da_huy';
/** `eduSoDuNhatKy.lyDo` of the row that takes back the balance of a cancelled opening package. */
export const LY_DO_HUY_GOI = 'huy_goi_mo_dau';
export const LY_DO_GOI = 'chuyen_tu_lark';
export const LY_DO_DIEM_DANH = 'diem_danh';

/** How a payment found its term, in the order the rules are tried. */
export type CachGhep = 'lien_ket' | 'ngay_so_buoi' | 'ngay' | 'so_buoi_30_ngay';
export const CACH_GHEP: readonly CachGhep[] = [
  'lien_ket',
  'ngay_so_buoi',
  'ngay',
  'so_buoi_30_ngay',
];

export interface KyLark {
  /** Record id of the `Deal HP` row. */
  readonly rec: string;
  readonly hocVienKey: string;
  /** `Ngày nộp HP`, else `Ngày bắt đầu`. */
  readonly ngay: string;
  /** `Ngày bắt đầu`, also accepted when a payment is matched by day. */
  readonly ngayBatDau: string | null;
  /** `Số buổi nộp` as written on Lark (what a payment row repeats). */
  readonly soBuoiNop: number;
  /** The sessions of the term: `Số buổi nộp` − `Số buổi đã học chưa thống kê`. */
  readonly soBuoi: number;
  /** `Số buổi còn tồn` of Lark, only to compare. */
  readonly tonLark: number;
}

export interface TienLark {
  /** Record id of the `Tổng Deal` row. */
  readonly rec: string;
  readonly hocVienKey: string | null;
  readonly ngay: string | null;
  readonly soBuoi: number | null;
  readonly soTien: number;
  /** `Link với Lần nộp HP`. */
  readonly lienKet: readonly string[];
}

export interface VanDe {
  readonly id: string;
  readonly code: string;
  readonly soTien?: number;
}

export interface DuLieuLark {
  readonly ky: readonly KyLark[];
  /** `Số buổi còn tồn` of the student's `Deal HP` rows that are not terms (not paid, or unusable), only to compare. */
  readonly tonKhac?: ReadonlyMap<string, number>;
  readonly tien: readonly TienLark[];
  readonly vanDe: readonly VanDe[];
}

/** Reads the paid terms of `Deal HP` and the tuition of `Tổng Deal`. */
export function docDuLieuLark(
  dealHp: readonly LarkRecord[],
  tongDeal: readonly LarkRecord[],
): DuLieuLark {
  const ky: KyLark[] = [];
  const vanDe: VanDe[] = [];
  const tonKhac = new Map<string, number>();
  for (const record of dealHp) {
    const f = record.fields;
    const student = linkIds(f['Học viên'])[0];
    const ton = numberOf(f['Số buổi còn tồn']) ?? 0;
    const other = () => {
      if (student !== undefined && ton !== 0)
        tonKhac.set(student, (tonKhac.get(student) ?? 0) + ton);
    };
    if (numberOf(f['Đã nộp']) !== 1) {
      other();
      continue;
    }
    const ngay = dateVn(f['Ngày nộp HP']) ?? dateVn(f['Ngày bắt đầu']);
    const soBuoiNop = numberOf(f['Số buổi nộp']);
    if (student === undefined) {
      vanDe.push({ id: record.recordId, code: 'DEAL_THIEU_HOC_VIEN' });
      continue;
    }
    if (!ngay) {
      vanDe.push({ id: record.recordId, code: 'DEAL_THIEU_NGAY' });
      other();
      continue;
    }
    if (soBuoiNop === null || !Number.isInteger(soBuoiNop) || soBuoiNop <= 0) {
      vanDe.push({ id: record.recordId, code: 'DEAL_SO_BUOI_SAI' });
      other();
      continue;
    }
    const chuaThongKe = DEAL_RULES.subtractUnrecorded
      ? Math.max(0, numberOf(f['Số buổi đã học chưa thống kê']) ?? 0)
      : 0;
    const soBuoi = soBuoiNop - chuaThongKe;
    if (soBuoi <= 0) {
      vanDe.push({ id: record.recordId, code: 'DEAL_HET_SAU_TRU' });
      other();
      continue;
    }
    ky.push({
      rec: record.recordId,
      hocVienKey: student,
      ngay,
      ngayBatDau: dateVn(f['Ngày bắt đầu']),
      soBuoiNop,
      soBuoi,
      tonLark: numberOf(f['Số buổi còn tồn']) ?? 0,
    });
  }
  const tien: TienLark[] = [];
  for (const record of tongDeal) {
    const f = record.fields;
    const soTien = numberOf(f['Học phí']) ?? 0;
    if (soTien <= 0) continue;
    if (!Number.isInteger(soTien)) {
      vanDe.push({
        id: record.recordId,
        code: 'TONG_DEAL_SO_TIEN_SAI',
        soTien,
      });
      continue;
    }
    tien.push({
      rec: record.recordId,
      hocVienKey: linkIds(f['Tên HS link'])[0] ?? null,
      ngay: dateVn(f['Ngày nộp']) ?? dateVn(f['Ngày']),
      soBuoi: numberOf(f['Số buổi nộp']),
      soTien,
      lienKet: linkIds(f['Link với Lần nộp HP']),
    });
  }
  return { ky, tien, vanDe, tonKhac };
}

const DAY = 86_400_000;
const daysApart = (a: string, b: string): number =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;

/**
 * Which term each payment pays for. Rules, each pass over every payment still unmatched (oldest first, then by record
 * id, so a repeat run matches the same way) before the next rule is tried:
 *
 * 1. `lien_ket`: the `Deal HP` row the payment links to (a term may take several linked payments);
 * 2. `ngay_so_buoi`: a term of the same student, the same day (payment day or start day) and the same `Số buổi nộp`;
 * 3. `ngay`: a term of the same student and the same day;
 * 4. `so_buoi_30_ngay`: a term of the same student with the same `Số buổi nộp`, at most 30 days apart (the nearest).
 *
 * Rules 2–4 give a term at most one payment and never a term that already has one. A payment none of them places has
 * no term (`null`): it still counts in the revenue.
 */
export function ghepTienVaoKy(
  ky: readonly KyLark[],
  tien: readonly TienLark[],
): Map<string, { ky: string; cach: CachGhep } | null> {
  const result = new Map<string, { ky: string; cach: CachGhep } | null>();
  const byRec = new Map(ky.map((term) => [term.rec, term]));
  const paid = new Set<string>();
  const ordered = [...tien].sort(
    (a, b) =>
      (a.ngay ?? '').localeCompare(b.ngay ?? '') || a.rec.localeCompare(b.rec),
  );
  const termsOf = new Map<string, KyLark[]>();
  for (const term of [...ky].sort(
    (a, b) => a.ngay.localeCompare(b.ngay) || a.rec.localeCompare(b.rec),
  ))
    termsOf.set(term.hocVienKey, [
      ...(termsOf.get(term.hocVienKey) ?? []),
      term,
    ]);

  for (const payment of ordered) {
    const linked = payment.lienKet
      .map((rec) => byRec.get(rec))
      .find(
        (term) =>
          term !== undefined &&
          (payment.hocVienKey === null ||
            term.hocVienKey === payment.hocVienKey),
      );
    if (linked) {
      result.set(payment.rec, { ky: linked.rec, cach: 'lien_ket' });
      paid.add(linked.rec);
    }
  }
  const sameDay = (term: KyLark, day: string | null) =>
    day !== null && (term.ngay === day || term.ngayBatDau === day);
  const passes: [CachGhep, (term: KyLark, p: TienLark) => boolean][] = [
    [
      'ngay_so_buoi',
      (term, p) => sameDay(term, p.ngay) && term.soBuoiNop === p.soBuoi,
    ],
    ['ngay', (term, p) => sameDay(term, p.ngay)],
    [
      'so_buoi_30_ngay',
      (term, p) =>
        p.ngay !== null &&
        term.soBuoiNop === p.soBuoi &&
        daysApart(term.ngay, p.ngay) <= 30,
    ],
  ];
  for (const [cach, fits] of passes)
    for (const payment of ordered) {
      if (result.has(payment.rec) || payment.hocVienKey === null) continue;
      const candidates = (termsOf.get(payment.hocVienKey) ?? []).filter(
        (term) => !paid.has(term.rec) && fits(term, payment),
      );
      const best =
        cach === 'so_buoi_30_ngay' && payment.ngay !== null
          ? [...candidates].sort(
              (a, b) =>
                daysApart(a.ngay, payment.ngay as string) -
                  daysApart(b.ngay, payment.ngay as string) ||
                a.rec.localeCompare(b.rec),
            )[0]
          : candidates[0];
      if (best) {
        result.set(payment.rec, { ky: best.rec, cach });
        paid.add(best.rec);
      }
    }
  for (const payment of ordered)
    if (!result.has(payment.rec)) result.set(payment.rec, null);
  return result;
}

// --- What NocoEdu holds ---------------------------------------------------------------------------------------------

export interface HocVienHienCo {
  readonly id: number;
  readonly ma: string;
  readonly coSoId: number;
  readonly soBuoiConLai: number;
}

export interface GoiHienCo {
  readonly id: number;
  readonly hocVienId: number;
  readonly externalId: string | null;
  readonly loai: string;
  readonly soBuoi: number;
  readonly thanhTien: number;
  readonly trangThai: string;
  /** Σ `thayDoi` of the ledger rows that name this package. */
  readonly soDuDaGhi: number;
}

export interface DiemDanhLichSu {
  readonly id: number;
  readonly hocVienId: number;
  readonly trangThai: string;
  readonly truVangCoPhep: boolean;
  readonly truVangKhongPhep: boolean;
}

export interface ThanhToanHienCo {
  readonly id: number;
  readonly hocVienId: number;
  readonly externalId: string | null;
  readonly goiHocId: number | null;
}

export interface TrangThaiHienCo {
  /** Students with a Lark id, by that id. */
  readonly hocVien: ReadonlyMap<string, HocVienHienCo>;
  readonly goi: readonly GoiHienCo[];
  /** Attendance rows with `tinhVaoSoDu = false`. */
  readonly diemDanhLichSu: readonly DiemDanhLichSu[];
  readonly thanhToan: readonly ThanhToanHienCo[];
}

// --- The plan -------------------------------------------------------------------------------------------------------

export interface GoiMoi {
  readonly externalId: string;
  readonly hocVienId: number;
  readonly soBuoi: number;
  readonly ngayMua: string;
  readonly donGia: number;
  readonly thanhTien: number;
}

export interface KeHoachHocVien {
  readonly hocVienId: number;
  readonly ma: string;
  readonly soDuTruoc: number;
  readonly soDuSau: number;
  /** Σ `Số buổi còn tồn` of his `Deal HP` rows, only to compare. */
  readonly tonLark: number;
  readonly goiMoi: readonly GoiMoi[];
  /** Deal packages already written whose price is still 0 and that now have a payment. */
  readonly giaGoi: readonly {
    readonly goiHocId: number;
    readonly donGia: number;
    readonly thanhTien: number;
  }[];
  /** Opening packages to cancel, with the ledger change that takes their balance back. */
  readonly huyGoi: readonly {
    readonly goiHocId: number;
    readonly thayDoi: number;
  }[];
  /** Attendance rows to count, with the sessions each deducts. */
  readonly diemDanh: readonly {
    readonly id: number;
    readonly soBuoiDaTru: number;
  }[];
}

export interface ThanhToanMoi {
  readonly externalId: string;
  readonly hocVienId: number;
  readonly coSoId: number;
  readonly soTien: number;
  readonly ngay: string;
  /** `lark:deal:<rec>` of its term, or `null`. */
  readonly goiKey: string | null;
}

export interface KeHoachHocPhi {
  readonly hocVien: readonly KeHoachHocVien[];
  readonly thanhToanMoi: readonly ThanhToanMoi[];
  /** Payments already written whose term changes. */
  readonly ganLai: readonly {
    readonly id: number;
    readonly goiKey: string | null;
  }[];
  readonly vanDe: readonly VanDe[];
  /** How the payments of Lark found a term, by rule (and `khong_gan`). */
  readonly ghep: Readonly<Record<CachGhep | 'khong_gan', number>>;
  /** Tuition on Lark, by year of payment; `NocoEdu` is what NocoEdu holds once the plan is written. */
  readonly tienTheoNam: Readonly<
    Record<string, { readonly lark: number; readonly nocoEdu: number }>
  >;
}

const asStatus = (value: string): AttendanceStatus | null =>
  (ATTENDANCE_STATUSES as readonly string[]).includes(value)
    ? (value as AttendanceStatus)
    : null;

/**
 * The whole correction. `tienDaGhi` holds the amount and day of every `lark:tongdeal:*` payment already in NocoEdu, so
 * the money by year can be compared with Lark.
 */
export function lapKeHoachHocPhi(
  lark: DuLieuLark,
  hienCo: TrangThaiHienCo,
  tienDaGhi: ReadonlyMap<string, { soTien: number; ngay: string }> = new Map(),
): KeHoachHocPhi {
  const vanDe: VanDe[] = [...lark.vanDe];
  const termsOf = new Map<string, KyLark[]>();
  for (const term of lark.ky) {
    if (!hienCo.hocVien.has(term.hocVienKey)) {
      vanDe.push({ id: term.rec, code: 'DEAL_HOC_VIEN_KHONG_CO' });
      continue;
    }
    termsOf.set(term.hocVienKey, [
      ...(termsOf.get(term.hocVienKey) ?? []),
      term,
    ]);
  }
  const ghepMap = ghepTienVaoKy([...termsOf.values()].flat(), lark.tien);
  const tienOfKy = new Map<string, number>();
  for (const payment of lark.tien) {
    const match = ghepMap.get(payment.rec);
    if (match)
      tienOfKy.set(match.ky, (tienOfKy.get(match.ky) ?? 0) + payment.soTien);
  }

  const goiByKey = new Map(
    hienCo.goi
      .filter((goi) => goi.externalId !== null)
      .map((goi) => [goi.externalId as string, goi]),
  );
  const price = (term: KyLark) => {
    const thanhTien = tienOfKy.get(term.rec) ?? 0;
    return {
      thanhTien,
      donGia: thanhTien > 0 ? Math.round(thanhTien / term.soBuoiNop) : 0,
    };
  };

  const hocVien: KeHoachHocVien[] = [];
  for (const [key, terms] of [...termsOf].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const student = hienCo.hocVien.get(key) as HocVienHienCo;
    const goiMoi: GoiMoi[] = [];
    const giaGoi: KeHoachHocVien['giaGoi'][number][] = [];
    for (const term of terms) {
      const externalId = `lark:deal:${term.rec}`;
      const written = goiByKey.get(externalId);
      const { thanhTien, donGia } = price(term);
      if (!written) {
        goiMoi.push({
          externalId,
          hocVienId: student.id,
          soBuoi: term.soBuoi,
          ngayMua: term.ngay,
          donGia,
          thanhTien,
        });
        continue;
      }
      if (written.hocVienId !== student.id)
        vanDe.push({ id: term.rec, code: 'DEAL_DOI_HOC_VIEN' });
      else if (written.thanhTien === 0 && thanhTien > 0)
        giaGoi.push({ goiHocId: written.id, donGia, thanhTien });
    }
    const huyGoi = hienCo.goi
      .filter(
        (goi) =>
          goi.hocVienId === student.id &&
          goi.externalId === `lark:sodu:${key}` &&
          goi.trangThai !== GOI_DA_HUY,
      )
      .map((goi) => ({ goiHocId: goi.id, thayDoi: -goi.soDuDaGhi }));
    const diemDanh = hienCo.diemDanhLichSu
      .filter((row) => row.hocVienId === student.id)
      .map((row) => {
        const status = asStatus(row.trangThai);
        return {
          id: row.id,
          soBuoiDaTru:
            status === null
              ? 0
              : sessionsToDeduct(
                  status,
                  row.truVangCoPhep,
                  row.truVangKhongPhep,
                ),
        };
      });
    const change =
      goiMoi.reduce((sum, goi) => sum + goi.soBuoi, 0) +
      huyGoi.reduce((sum, goi) => sum + goi.thayDoi, 0) -
      diemDanh.reduce((sum, row) => sum + row.soBuoiDaTru, 0);
    if (goiMoi.length + giaGoi.length + huyGoi.length + diemDanh.length === 0)
      continue;
    hocVien.push({
      hocVienId: student.id,
      ma: student.ma,
      soDuTruoc: student.soBuoiConLai,
      soDuSau: student.soBuoiConLai + change,
      tonLark:
        terms.reduce((sum, term) => sum + term.tonLark, 0) +
        (lark.tonKhac?.get(key) ?? 0),
      goiMoi,
      giaGoi,
      huyGoi,
      diemDanh,
    });
  }

  // Payments: write the missing ones, and point the written ones of a student with terms at the right term.
  const studentsWithTerms = new Set(termsOf.keys());
  const paymentByKey = new Map(
    hienCo.thanhToan
      .filter((row) => row.externalId !== null)
      .map((row) => [row.externalId as string, row]),
  );
  const goiIdOf = (key: string | null): number | null =>
    key === null ? null : (goiByKey.get(key)?.id ?? null);
  const thanhToanMoi: ThanhToanMoi[] = [];
  const ganLai: { id: number; goiKey: string | null }[] = [];
  const ghep: Record<CachGhep | 'khong_gan', number> = {
    lien_ket: 0,
    ngay_so_buoi: 0,
    ngay: 0,
    so_buoi_30_ngay: 0,
    khong_gan: 0,
  };
  const tienTheoNam: Record<string, { lark: number; nocoEdu: number }> = {};
  const year = (day: string | null) => (day ?? '????').slice(0, 4);
  const addYear = (
    day: string | null,
    field: 'lark' | 'nocoEdu',
    n: number,
  ) => {
    const y = year(day);
    tienTheoNam[y] ??= { lark: 0, nocoEdu: 0 };
    tienTheoNam[y][field] += n;
  };
  for (const value of tienDaGhi.values())
    addYear(value.ngay, 'nocoEdu', value.soTien);

  for (const payment of lark.tien) {
    addYear(payment.ngay, 'lark', payment.soTien);
    if (payment.hocVienKey === null) {
      vanDe.push({
        id: payment.rec,
        code: 'TONG_DEAL_THIEU_HOC_VIEN',
        soTien: payment.soTien,
      });
      continue;
    }
    const student = hienCo.hocVien.get(payment.hocVienKey);
    if (!student) {
      vanDe.push({
        id: payment.rec,
        code: 'TONG_DEAL_HOC_VIEN_KHONG_CO',
        soTien: payment.soTien,
      });
      continue;
    }
    if (!payment.ngay) {
      vanDe.push({
        id: payment.rec,
        code: 'TONG_DEAL_THIEU_NGAY',
        soTien: payment.soTien,
      });
      continue;
    }
    const match = ghepMap.get(payment.rec) ?? null;
    ghep[match?.cach ?? 'khong_gan'] += 1;
    const goiKey = match ? `lark:deal:${match.ky}` : null;
    const externalId = `lark:tongdeal:${payment.rec}`;
    const written = paymentByKey.get(externalId);
    if (!written) {
      thanhToanMoi.push({
        externalId,
        hocVienId: student.id,
        coSoId: student.coSoId,
        soTien: payment.soTien,
        ngay: payment.ngay,
        goiKey,
      });
      addYear(payment.ngay, 'nocoEdu', payment.soTien);
      continue;
    }
    if (!studentsWithTerms.has(payment.hocVienKey)) continue;
    // A written payment keeps its term when it is already the right one; a new term has no id yet, so compare keys.
    const current = hienCo.goi.find((goi) => goi.id === written.goiHocId);
    const currentKey = current?.externalId ?? null;
    if (written.goiHocId !== null && goiIdOf(goiKey) === written.goiHocId)
      continue;
    if (written.goiHocId === null && goiKey === null) continue;
    if (currentKey === goiKey) continue;
    ganLai.push({ id: written.id, goiKey });
  }

  return {
    hocVien,
    thanhToanMoi,
    ganLai,
    vanDe,
    ghep,
    tienTheoNam,
  };
}
