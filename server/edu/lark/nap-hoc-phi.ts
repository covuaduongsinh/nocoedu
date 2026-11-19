import type { DatabaseManager } from '@nocobase/db';

import { asText } from '../names.js';
import { asBoolean } from '../so-du.js';
import { externalIdOrNull, ghiNhatKy, userExists } from './ghi.js';
import {
  docDuLieuLark,
  GOI_DA_HUY,
  lapKeHoachHocPhi,
  LY_DO_DIEM_DANH,
  LY_DO_GOI,
  LY_DO_HUY_GOI,
  type CachGhep,
  type KeHoachHocPhi,
  type TrangThaiHienCo,
} from './hoc-phi.js';
import {
  LARK_TABLES,
  LARK_TONG_DEAL,
  LarkImportError,
  READ_FIELDS,
  REQUIRED_FIELDS,
  TONG_DEAL_READ_FIELDS,
  TONG_DEAL_REQUIRED_FIELDS,
  type LarkRecord,
  type LarkSource,
} from './nguon.js';
import { identifiersOf } from './nhap.js';
import { PAYMENT_METHOD_UNKNOWN } from './thanh-toan.js';

/**
 * `app edu nap-hoc-phi`: reads `Deal HP` and `Tổng Deal (HP + book)`, plans the correction of `hoc-phi.ts` against the
 * database and writes it in one transaction. The dry run writes the same thing in a transaction and rolls it back, so
 * the balances it prints are the ones the commit leaves. Output and log: counts, student codes, Lark record ids and
 * reason codes; never a name or a phone.
 */

type Connection = Parameters<Parameters<DatabaseManager['transaction']>[0]>[0];
type Query = Connection['query'];

const CHUNK = 50;

export interface NapHocPhiOptions {
  readonly commit: boolean;
  readonly userId: string | null;
}

export interface DongSoDu {
  readonly ma: string;
  readonly truoc: number;
  readonly sau: number;
  readonly lark: number;
}

export interface BaoCaoHocPhi {
  readonly mode: 'dry-run' | 'commit';
  readonly hocVien: number;
  readonly goiMoi: number;
  readonly giaGoi: number;
  readonly huyGoi: number;
  readonly diemDanh: number;
  readonly buoiTru: number;
  readonly thanhToanMoi: number;
  readonly tienMoi: number;
  readonly ganLai: number;
  readonly kyChuaRoTien: number;
  readonly ghep: Readonly<Record<CachGhep | 'khong_gan', number>>;
  readonly tienTheoNam: KeHoachHocPhi['tienTheoNam'];
  readonly vanDe: Readonly<
    Record<
      string,
      {
        readonly n: number;
        readonly soTien: number;
        readonly ids: readonly string[];
      }
    >
  >;
  readonly soDu: readonly DongSoDu[];
  /** The balances read back from the database after the (simulated or real) write. */
  readonly soDuKiemTra: 'khop' | 'lech';
}

/** Reads the two tables of the Base the correction needs, after checking their fields. */
export async function docHocPhiLark(
  source: LarkSource,
  log: (line: string) => void = () => {},
): Promise<{ dealHp: readonly LarkRecord[]; tongDeal: readonly LarkRecord[] }> {
  const listed = new Set((await source.tables()).map((table) => table.id));
  const wanted = [
    {
      label: 'dealHp',
      id: LARK_TABLES.dealHp.id,
      required: REQUIRED_FIELDS.dealHp,
      read: READ_FIELDS.dealHp,
    },
    {
      label: 'tongDeal',
      id: LARK_TONG_DEAL.id,
      required: TONG_DEAL_REQUIRED_FIELDS,
      read: TONG_DEAL_READ_FIELDS,
    },
  ];
  const hidden = wanted.filter((table) => !listed.has(table.id));
  if (hidden.length > 0)
    throw new LarkImportError(
      'LARK_KHONG_DOC_DUOC',
      `Tables not in the list the app can read: ${hidden.map((t) => t.label).join(', ')}`,
    );
  const changed: string[] = [];
  for (const table of wanted) {
    const names = new Set(await source.fieldNames(table.id));
    for (const field of table.required)
      if (!names.has(field)) changed.push(`${table.label}: ${field}`);
  }
  if (changed.length > 0)
    throw new LarkImportError(
      'LARK_CAU_TRUC_DOI',
      `The Lark structure changed; missing or renamed fields: ${changed.join('; ')}`,
    );
  const out: Record<string, readonly LarkRecord[]> = {};
  for (const table of wanted) {
    out[table.label] = await source.records(table.id, table.read);
    log(`read ${table.label}: ${out[table.label].length} records`);
  }
  return {
    dealHp: out.dealHp,
    tongDeal: out.tongDeal,
  };
}

/** What NocoEdu holds that the plan needs, read in a few queries. */
export async function docHienCo(q: Query): Promise<{
  hienCo: TrangThaiHienCo;
  tienDaGhi: Map<string, { soTien: number; ngay: string }>;
}> {
  const hocVien = new Map<
    string,
    { id: number; ma: string; coSoId: number; soBuoiConLai: number }
  >();
  for (const row of await q
    .selectFrom('eduHocVien')
    .select(['id', 'ma', 'coSoId', 'soBuoiConLai', 'externalId'])
    .where('externalId', 'is not', null)
    .execute()) {
    const key = externalIdOrNull(row.externalId);
    if (key)
      hocVien.set(key, {
        id: Number(row.id),
        ma: asText(row.ma),
        coSoId: Number(row.coSoId),
        soBuoiConLai: Number(row.soBuoiConLai),
      });
  }
  const ledger = new Map<number, number>();
  for (const row of await q
    .selectFrom('eduSoDuNhatKy')
    .select(['goiHocId', 'thayDoi'])
    .where('goiHocId', 'is not', null)
    .execute())
    ledger.set(
      Number(row.goiHocId),
      (ledger.get(Number(row.goiHocId)) ?? 0) + Number(row.thayDoi),
    );
  const goi = (
    await q
      .selectFrom('eduGoiHoc')
      .select([
        'id',
        'hocVienId',
        'externalId',
        'loai',
        'soBuoi',
        'thanhTien',
        'trangThai',
      ])
      .execute()
  ).map((row) => ({
    id: Number(row.id),
    hocVienId: Number(row.hocVienId),
    externalId: externalIdOrNull(row.externalId),
    loai: asText(row.loai),
    soBuoi: Number(row.soBuoi),
    thanhTien: Number(row.thanhTien),
    trangThai: asText(row.trangThai),
    soDuDaGhi: ledger.get(Number(row.id)) ?? 0,
  }));
  const history = (
    await q
      .selectFrom('eduDiemDanh')
      .select(['id', 'hocVienId', 'buoiHocId', 'trangThai', 'tinhVaoSoDu'])
      .execute()
  ).filter((row) => !asBoolean(row.tinhVaoSoDu));
  const rules = new Map<number, { coPhep: boolean; khongPhep: boolean }>();
  const sessionIds = [...new Set(history.map((row) => Number(row.buoiHocId)))];
  for (let i = 0; i < sessionIds.length; i += 500)
    for (const row of await q
      .selectFrom('eduBuoiHoc')
      .select(['id', 'truVangCoPhep', 'truVangKhongPhep'])
      .where('id', 'in', sessionIds.slice(i, i + 500))
      .execute())
      rules.set(Number(row.id), {
        coPhep: asBoolean(row.truVangCoPhep),
        khongPhep: asBoolean(row.truVangKhongPhep),
      });
  const diemDanhLichSu = history.map((row) => ({
    id: Number(row.id),
    hocVienId: Number(row.hocVienId),
    trangThai: asText(row.trangThai),
    truVangCoPhep: rules.get(Number(row.buoiHocId))?.coPhep ?? false,
    truVangKhongPhep: rules.get(Number(row.buoiHocId))?.khongPhep ?? false,
  }));
  const tienDaGhi = new Map<string, { soTien: number; ngay: string }>();
  const thanhToan = (
    await q
      .selectFrom('eduThanhToan')
      .select(['id', 'hocVienId', 'externalId', 'goiHocId', 'soTien', 'ngay'])
      .execute()
  ).map((row) => {
    const externalId = externalIdOrNull(row.externalId);
    if (externalId?.startsWith('lark:tongdeal:'))
      tienDaGhi.set(externalId, {
        soTien: Number(row.soTien),
        ngay: asText(row.ngay),
      });
    return {
      id: Number(row.id),
      hocVienId: Number(row.hocVienId),
      externalId,
      goiHocId: row.goiHocId == null ? null : Number(row.goiHocId),
    };
  });
  return {
    hienCo: { hocVien, goi, diemDanhLichSu, thanhToan },
    tienDaGhi,
  };
}

/** Writes the plan inside the open transaction. */
export async function ghiHocPhi(
  q: Query,
  plan: KeHoachHocPhi,
  userId: string,
): Promise<void> {
  const now = new Date();
  // 1. New terms, then the ids of every Deal term.
  const newPackages = plan.hocVien.flatMap((row) => row.goiMoi);
  for (let i = 0; i < newPackages.length; i += CHUNK)
    await q
      .insertInto('eduGoiHoc')
      .values(
        newPackages.slice(i, i + CHUNK).map((goi) => ({
          hocVienId: goi.hocVienId,
          soBuoi: goi.soBuoi,
          donGia: goi.donGia,
          thanhTien: goi.thanhTien,
          ngayMua: goi.ngayMua,
          trangThai: 'hieu_luc',
          nguoiTaoId: userId,
          loai: 'mua',
          ghiChu: 'chuyen_tu_lark',
          externalId: goi.externalId,
        })),
      )
      .execute();
  const goiId = new Map<string, number>();
  for (const row of await q
    .selectFrom('eduGoiHoc')
    .select(['id', 'externalId'])
    .where('externalId', 'like', 'lark:deal:%')
    .execute())
    goiId.set(asText(row.externalId), Number(row.id));

  for (const student of plan.hocVien) {
    // 2. Prices of terms written earlier with 0.
    for (const gia of student.giaGoi)
      await q
        .updateTable('eduGoiHoc')
        .set({ donGia: gia.donGia, thanhTien: gia.thanhTien })
        .where('id', '=', gia.goiHocId)
        .where('thanhTien', '=', 0)
        .execute();
    // 3. Opening packages cancelled.
    for (const huy of student.huyGoi)
      await q
        .updateTable('eduGoiHoc')
        .set({ trangThai: GOI_DA_HUY })
        .where('id', '=', huy.goiHocId)
        .execute();
    // 4. History attendance becomes counted.
    for (const row of student.diemDanh)
      await q
        .updateTable('eduDiemDanh')
        .set({ tinhVaoSoDu: true, soBuoiDaTru: row.soBuoiDaTru })
        .where('id', '=', row.id)
        .execute();

    // 5. The ledger: terms, cancelled packages, then the sessions in the order of their day.
    let balance = student.soDuTruoc;
    const ledger: Record<string, unknown>[] = [];
    const entry = (
      thayDoi: number,
      lyDo: string,
      extra: Record<string, unknown>,
    ) => {
      if (thayDoi === 0) return;
      balance += thayDoi;
      ledger.push({
        hocVienId: student.hocVienId,
        thayDoi,
        soDuSau: balance,
        lyDo,
        nguoiThucHienId: userId,
        createdAt: now,
        ...extra,
      });
    };
    for (const goi of student.goiMoi)
      entry(goi.soBuoi, LY_DO_GOI, {
        goiHocId: goiId.get(goi.externalId) ?? null,
      });
    for (const huy of student.huyGoi)
      entry(huy.thayDoi, LY_DO_HUY_GOI, { goiHocId: huy.goiHocId });
    const days = new Map<number, string>();
    const ids = student.diemDanh.map((row) => row.id);
    for (let i = 0; i < ids.length; i += 500)
      for (const row of await q
        .selectFrom('eduDiemDanh')
        .innerJoin('eduBuoiHoc', 'eduBuoiHoc.id', 'eduDiemDanh.buoiHocId')
        .select([
          'eduDiemDanh.id as id',
          'eduBuoiHoc.ngay as ngay',
          'eduBuoiHoc.gioBatDau as gio',
        ])
        .where('eduDiemDanh.id', 'in', ids.slice(i, i + 500))
        .execute())
        days.set(Number(row.id), `${asText(row.ngay)} ${asText(row.gio)}`);
    for (const row of [...student.diemDanh].sort(
      (a, b) =>
        (days.get(a.id) ?? '').localeCompare(days.get(b.id) ?? '') ||
        a.id - b.id,
    ))
      entry(-row.soBuoiDaTru, LY_DO_DIEM_DANH, { diemDanhId: row.id });
    for (let i = 0; i < ledger.length; i += CHUNK)
      await q
        .insertInto('eduSoDuNhatKy')
        .values(ledger.slice(i, i + CHUNK))
        .execute();
    if (balance !== student.soDuSau)
      throw new LarkImportError(
        'HOC_PHI_SO_DU_SAI',
        `The ledger of ${student.ma} does not add up to the planned balance.`,
      );
    const updated = await q
      .updateTable('eduHocVien')
      .set({ soBuoiConLai: balance })
      .where('id', '=', student.hocVienId)
      .where('soBuoiConLai', '=', student.soDuTruoc)
      .execute();
    if (Number(updated.updatedCount) !== 1)
      throw new LarkImportError(
        'EDU_BALANCE_CONFLICT',
        `The balance of ${student.ma} changed while the tuition was loaded.`,
      );
  }

  // 6. Payments: new ones, then the term of the ones already written.
  const values = plan.thanhToanMoi.map((row) => ({
    goiHocId: row.goiKey === null ? null : (goiId.get(row.goiKey) ?? null),
    hocVienId: row.hocVienId,
    coSoId: row.coSoId,
    soTien: row.soTien,
    hinhThuc: PAYMENT_METHOD_UNKNOWN,
    ngay: row.ngay,
    thang: row.ngay.slice(0, 7),
    noiDungCk: null,
    nguoiGhiNhanId: userId,
    externalId: row.externalId,
  }));
  for (let i = 0; i < values.length; i += CHUNK)
    await q
      .insertInto('eduThanhToan')
      .values(values.slice(i, i + CHUNK))
      .execute();
  for (const row of plan.ganLai)
    await q
      .updateTable('eduThanhToan')
      .set({
        goiHocId: row.goiKey === null ? null : (goiId.get(row.goiKey) ?? null),
      })
      .where('id', '=', row.id)
      .execute();
}

class MoPhongXong extends Error {
  constructor(readonly soDu: ReadonlyMap<number, number>) {
    super('simulation done');
  }
}

async function balancesOf(q: Query, ids: readonly number[]) {
  const out = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 500)
    for (const row of await q
      .selectFrom('eduHocVien')
      .select(['id', 'soBuoiConLai'])
      .where('id', 'in', ids.slice(i, i + 500))
      .execute())
      out.set(Number(row.id), Number(row.soBuoiConLai));
  return out;
}

export function taoBaoCaoHocPhi(
  plan: KeHoachHocPhi,
  mode: 'dry-run' | 'commit',
  soDuDoc: ReadonlyMap<number, number>,
): BaoCaoHocPhi {
  const vanDe: Record<string, { n: number; soTien: number; ids: string[] }> =
    {};
  for (const item of plan.vanDe) {
    vanDe[item.code] ??= { n: 0, soTien: 0, ids: [] };
    vanDe[item.code].n += 1;
    vanDe[item.code].soTien += item.soTien ?? 0;
    vanDe[item.code].ids.push(item.id);
  }
  const all = plan.hocVien;
  return {
    mode,
    hocVien: all.length,
    goiMoi: all.reduce((n, s) => n + s.goiMoi.length, 0),
    giaGoi: all.reduce((n, s) => n + s.giaGoi.length, 0),
    huyGoi: all.reduce((n, s) => n + s.huyGoi.length, 0),
    diemDanh: all.reduce((n, s) => n + s.diemDanh.length, 0),
    buoiTru: all.reduce(
      (n, s) => n + s.diemDanh.reduce((m, r) => m + r.soBuoiDaTru, 0),
      0,
    ),
    thanhToanMoi: plan.thanhToanMoi.length,
    tienMoi: plan.thanhToanMoi.reduce((n, r) => n + r.soTien, 0),
    ganLai: plan.ganLai.length,
    kyChuaRoTien: all.reduce(
      (n, s) => n + s.goiMoi.filter((g) => g.thanhTien === 0).length,
      0,
    ),
    ghep: plan.ghep,
    tienTheoNam: plan.tienTheoNam,
    vanDe,
    soDu: all
      .map((s) => ({
        ma: s.ma,
        truoc: s.soDuTruoc,
        sau: s.soDuSau,
        lark: s.tonLark,
      }))
      .sort((a, b) => a.ma.localeCompare(b.ma)),
    soDuKiemTra: all.every((s) => soDuDoc.get(s.hocVienId) === s.soDuSau)
      ? 'khop'
      : 'lech',
  };
}

const dong = (n: number) => `${n.toLocaleString('vi-VN')} đ`;

export function inBaoCaoHocPhi(report: BaoCaoHocPhi, maxRows = 300): string[] {
  const lines = [
    report.mode === 'dry-run'
      ? 'CHẠY THỬ nạp học phí: đã ghi trong một transaction rồi hoàn tác, không lưu gì.'
      : 'ĐÃ GHI nạp học phí.',
    `Học viên được sửa: ${report.hocVien}. Kỳ mới: ${report.goiMoi} (chưa rõ tiền: ${report.kyChuaRoTien}). Kỳ cũ được gắn giá: ${report.giaGoi}. Gói mở đầu huỷ: ${report.huyGoi}.`,
    `Điểm danh chuyển sang tính số dư: ${report.diemDanh} dòng, trừ ${report.buoiTru} buổi.`,
    `Khoản tiền mới: ${report.thanhToanMoi} (${dong(report.tienMoi)}). Khoản đã có gắn lại kỳ: ${report.ganLai}.`,
    `Ghép tiền ↔ kỳ: ${Object.entries(report.ghep)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}.`,
    'Học phí theo năm (Lark / NocoEdu sau khi nạp):',
    ...Object.entries(report.tienTheoNam)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([year, v]) =>
          `  ${year}: ${dong(v.lark)} / ${dong(v.nocoEdu)}${v.lark === v.nocoEdu ? '' : `  (chênh ${dong(v.lark - v.nocoEdu)})`}`,
      ),
    'Vấn đề (mã: số dòng, số tiền, mã bản ghi Lark):',
    ...Object.entries(report.vanDe).map(
      ([code, v]) =>
        `  ${code}: ${v.n}${v.soTien ? `, ${dong(v.soTien)}` : ''}: ${v.ids.join(' ')}`,
    ),
    `Số dư đọc lại sau khi ghi: ${report.soDuKiemTra === 'khop' ? 'khớp kế hoạch' : 'LỆCH kế hoạch'}.`,
    'Số dư (mã HV: trước → sau | Lark còn tồn):',
    ...report.soDu
      .slice(0, maxRows)
      .map((r) => `  ${r.ma}: ${r.truoc} → ${r.sau} | ${r.lark}`),
  ];
  if (report.soDu.length > maxRows)
    lines.push(`  … và ${report.soDu.length - maxRows} học viên nữa.`);
  return lines;
}

export async function chayNapHocPhi(
  database: DatabaseManager,
  source: LarkSource,
  options: NapHocPhiOptions,
  log: (line: string) => void = () => {},
): Promise<BaoCaoHocPhi> {
  if (options.commit && !(await userExists(database, options.userId ?? '')))
    throw new LarkImportError(
      'LARK_USER_KHONG_TON_TAI',
      '--user does not match any user of this application.',
    );
  const larkRows = await docHocPhiLark(source, log);
  const lark = docDuLieuLark(larkRows.dealHp, larkRows.tongDeal);
  const userId = options.commit ? (options.userId as string) : 'dry-run';
  let plan: KeHoachHocPhi | undefined;
  const startedAt = new Date();

  const run = async (connection: Connection) => {
    const { hienCo, tienDaGhi } = await docHienCo(connection.query);
    plan = lapKeHoachHocPhi(lark, hienCo, tienDaGhi);
    await ghiHocPhi(connection.query, plan, userId);
    return balancesOf(
      connection.query,
      plan.hocVien.map((s) => s.hocVienId),
    );
  };

  if (!options.commit) {
    try {
      await database.transaction(async (connection) => {
        throw new MoPhongXong(await run(connection));
      });
    } catch (error) {
      if (error instanceof MoPhongXong)
        return taoBaoCaoHocPhi(plan as KeHoachHocPhi, 'dry-run', error.soDu);
      throw error;
    }
    throw new Error('The simulation did not roll back.');
  }

  let soDu: ReadonlyMap<number, number> = new Map();
  try {
    await database.transaction(async (connection) => {
      soDu = await run(connection);
    });
  } catch (error) {
    const hint = identifiersOf(error);
    try {
      await ghiNhatKy(database, {
        batDauLuc: startedAt,
        nguoiChayId: userId,
        trangThai: 'that_bai',
        tongKet: {
          nguon: 'nap_hoc_phi',
          error: error instanceof LarkImportError ? error.code : 'GHI_THAT_BAI',
          ...(hint ? { hint } : {}),
        },
      });
    } catch {
      // The write failed first; a missing log row changes nothing for the reader of the error.
    }
    throw error instanceof LarkImportError
      ? error
      : new LarkImportError(
          'LARK_GHI_THAT_BAI',
          `The write failed and was rolled back${hint ? ` (refused by: ${hint})` : ''}.`,
        );
  }
  const report = taoBaoCaoHocPhi(plan as KeHoachHocPhi, 'commit', soDu);
  await ghiNhatKy(database, {
    batDauLuc: startedAt,
    nguoiChayId: userId,
    trangThai: 'thanh_cong',
    tongKet: { nguon: 'nap_hoc_phi', ...report },
  });
  return report;
}
