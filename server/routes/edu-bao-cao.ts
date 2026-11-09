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
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';

import { toCsv } from '../edu/csv.js';
import { asText } from '../edu/names.js';
import { LOW_BALANCE_THRESHOLD, addDays, todayVn } from '../edu/so-du.js';
import {
  currentUserId,
  eduError,
  needs,
  policiesOf,
  type EduEnv,
} from './edu-support.js';

/**
 * Reports, their CSV export and the home summary.
 *
 * A report is gated by a composite action (`edu.diemDanh` for attendance, `edu.thanhToan` for revenue, `edu.hocVien`
 * for headcount and balances) and reads only through the policies that action was granted, so it shows the caller's
 * branches or classes and nothing else; a coach holds no payment action, so revenue answers 403. Aggregates over a date
 * range are computed from raw queries restricted to the ids the policy returned. A CSV export is the same report as
 * text plus one row in `eduXuatDuLieuNhatKy` (who, which report, how many rows — never names).
 */
const REPORTS = [
  'siSo',
  'chuyenCan',
  'sapHetBuoi',
  'nghiDai',
  'doanhThu',
] as const;
type ReportKind = (typeof REPORTS)[number];

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);
const ReportInput = z.object({
  loai: z.enum(REPORTS),
  tuNgay: z.iso.date().optional(),
  denNgay: z.iso.date().optional(),
  tuThang: Month.optional(),
  denThang: Month.optional(),
});
type ReportInputType = z.infer<typeof ReportInput>;

type Cell = string | number | null;
interface Report {
  readonly columns: readonly { key: string; label: string }[];
  readonly rows: readonly Record<string, Cell>[];
}
type Row = Record<string, unknown>;

/** The composite action that gates each report. */
const GATE: Record<ReportKind, string> = {
  siSo: 'edu.hocVien',
  chuyenCan: 'edu.diemDanh',
  sapHetBuoi: 'edu.hocVien',
  nghiDai: 'edu.diemDanh',
  doanhThu: 'edu.thanhToan',
};

const PAGE = 100;
/** A report reads at most this many rows; more is refused with a clear error instead of a silently short report. */
export const MAX_ROWS = 5000;
const PRESENT = ['co_mat', 'hoc_bu'];

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

const num = (value: unknown): number => Number(value);
const declare = (summary: string, operationId: string) =>
  describeRoute({
    tags: ['NocoEdu'],
    summary,
    operationId,
    responses: {
      '200': dataResponse(z.object({}).passthrough()),
      ...apiErrorResponses,
    },
  });

/** Months from `from` to `to` inclusive (`YYYY-MM`), at most 36. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export default [
  defineApiRoutes<AppPluginApplication>((app) => {
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const router = new Hono<EduEnv>();
    const q = () => database.connection().query;

    /** Every row the policy lets through, page by page. */
    async function readAll(
      collection: string,
      policy: unknown,
      filter?: unknown,
    ): Promise<Row[]> {
      const repository = database
        .repository(collection)
        .withPolicy(policy as never) as unknown as {
        findMany(input: unknown): Promise<Row[]>;
      };
      const rows: Row[] = [];
      for (let offset = 0; offset <= MAX_ROWS; offset += PAGE) {
        const page = await repository.findMany({
          ...(filter ? { filter } : {}),
          sort: (s: { field: (n: string) => { asc: () => unknown } }) =>
            s.field('id').asc(),
          limit: PAGE,
          offset,
        });
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      if (rows.length > MAX_ROWS) {
        throw eduError(
          'FAILED_PRECONDITION',
          'EDU_REPORT_TOO_LARGE',
          'The report covers too many records. Narrow it to one branch or class.',
        );
      }
      return rows;
    }

    async function nameMap(
      table: 'eduLop' | 'eduCoSo',
      ids: readonly number[],
    ): Promise<Map<number, string>> {
      const map = new Map<number, string>();
      for (const part of chunks([...new Set(ids)], 200)) {
        const rows = await q()
          .selectFrom(table)
          .select(['id', 'ten'])
          .where('id', 'in', part)
          .execute();
        for (const row of rows) map.set(num(row.id), asText(row.ten));
      }
      return map;
    }

    async function build(
      c: Parameters<typeof policiesOf>[0],
      input: ReportInputType,
    ): Promise<Report> {
      const gate = await policiesOf(c, GATE[input.loai], 'view');
      const today = todayVn();

      if (input.loai === 'doanhThu') {
        const policy = gate.eduThanhToan;
        if (!policy) throw denied();
        const from = input.tuThang ?? addDays(today, -150).slice(0, 7);
        const to = input.denThang ?? today.slice(0, 7);
        const totals = new Map<string, number>();
        for (const month of monthsBetween(from, to)) {
          const payments = await readAll(
            'eduThanhToan',
            policy,
            (f: { string: (n: string) => { eq: (v: string) => unknown } }) =>
              f.string('thang').eq(month),
          );
          for (const p of payments) {
            const key = `${month}|${num(p.coSoId)}`;
            totals.set(key, (totals.get(key) ?? 0) + num(p.soTien));
          }
        }
        const branches = await nameMap(
          'eduCoSo',
          [...totals.keys()].map((k) => num(k.split('|')[1])),
        );
        const rows = [...totals.entries()]
          .map(([key, total]) => {
            const [thang, coSoId] = key.split('|') as [string, string];
            return {
              thang,
              coSo: branches.get(num(coSoId)) ?? '',
              doanhThu: total,
            };
          })
          .sort((a, b) =>
            `${a.thang}|${a.coSo}`.localeCompare(`${b.thang}|${b.coSo}`, 'vi'),
          );
        return {
          columns: [
            { key: 'thang', label: 'Tháng' },
            { key: 'coSo', label: 'Cơ sở' },
            { key: 'doanhThu', label: 'Doanh thu (đồng)' },
          ],
          rows,
        };
      }

      // Student-based reports: the students come through the policy of `edu.hocVien`.
      const studentPolicy = (await policiesOf(c, 'edu.hocVien', 'view'))
        .eduHocVien;
      if (!studentPolicy) throw denied();
      const students = await readAll('eduHocVien', studentPolicy);
      const studentIds = students.map((s) => num(s.id));
      const lops = await nameMap(
        'eduLop',
        students.filter((s) => s.lopId != null).map((s) => num(s.lopId)),
      );
      const branches = await nameMap(
        'eduCoSo',
        students.map((s) => num(s.coSoId)),
      );

      switch (input.loai) {
        case 'siSo': {
          const count = new Map<string, number>();
          for (const s of students) {
            if (s.trangThai !== 'dang_hoc') continue;
            const key = `${num(s.coSoId)}|${s.lopId == null ? 0 : num(s.lopId)}`;
            count.set(key, (count.get(key) ?? 0) + 1);
          }
          const rows = [...count.entries()]
            .map(([key, total]) => {
              const [coSoId, lopId] = key.split('|').map(Number) as [
                number,
                number,
              ];
              return {
                coSo: branches.get(coSoId) ?? '',
                lop: lopId ? (lops.get(lopId) ?? '') : '',
                soHocVien: total,
              };
            })
            .sort((a, b) =>
              `${a.coSo}|${a.lop}`.localeCompare(`${b.coSo}|${b.lop}`, 'vi'),
            );
          return {
            columns: [
              { key: 'coSo', label: 'Cơ sở' },
              { key: 'lop', label: 'Lớp' },
              { key: 'soHocVien', label: 'Sĩ số' },
            ],
            rows,
          };
        }
        case 'sapHetBuoi': {
          const rows = students
            .filter(
              (s) =>
                s.trangThai === 'dang_hoc' &&
                num(s.soBuoiConLai) <= LOW_BALANCE_THRESHOLD,
            )
            .sort((a, b) => num(a.soBuoiConLai) - num(b.soBuoiConLai))
            .map((s) => ({
              ma: asText(s.ma),
              hoTen: asText(s.hoTen),
              lop: s.lopId == null ? '' : (lops.get(num(s.lopId)) ?? ''),
              soBuoiConLai: num(s.soBuoiConLai),
            }));
          return {
            columns: [
              { key: 'ma', label: 'Mã' },
              { key: 'hoTen', label: 'Họ tên' },
              { key: 'lop', label: 'Lớp' },
              { key: 'soBuoiConLai', label: 'Số buổi còn lại' },
            ],
            rows,
          };
        }
        case 'chuyenCan': {
          const from = input.tuNgay ?? addDays(today, -30);
          const to = input.denNgay ?? today;
          // Only sessions of classes the caller may see: a student who attended another class once (a make-up) must
          // not bring that class into this report.
          const classPolicy = (await policiesOf(c, 'edu.lop', 'view')).eduLop;
          const visibleClasses = new Set(
            classPolicy
              ? (await readAll('eduLop', classPolicy)).map((r) => num(r.id))
              : [],
          );
          const tally = new Map<
            number,
            {
              tong: number;
              coMat: number;
              vangCoPhep: number;
              vangKhongPhep: number;
            }
          >();
          for (const part of chunks(studentIds, 400)) {
            const marks = await q()
              .selectFrom('eduDiemDanh')
              .select(['buoiHocId', 'trangThai'])
              .where('hocVienId', 'in', part)
              .execute();
            const sessionIds = [...new Set(marks.map((m) => num(m.buoiHocId)))];
            const sessions = new Map<number, number>();
            for (const ids of chunks(sessionIds, 400)) {
              const rows = await q()
                .selectFrom('eduBuoiHoc')
                .select(['id', 'lopId'])
                .where('id', 'in', ids)
                .where('ngay', '>=', from)
                .where('ngay', '<=', to)
                .execute();
              for (const r of rows) {
                if (visibleClasses.has(num(r.lopId)))
                  sessions.set(num(r.id), num(r.lopId));
              }
            }
            for (const m of marks) {
              const lopId = sessions.get(num(m.buoiHocId));
              if (lopId === undefined) continue;
              const t = tally.get(lopId) ?? {
                tong: 0,
                coMat: 0,
                vangCoPhep: 0,
                vangKhongPhep: 0,
              };
              t.tong += 1;
              const status = asText(m.trangThai);
              if (PRESENT.includes(status)) t.coMat += 1;
              else if (status === 'vang_co_phep') t.vangCoPhep += 1;
              else t.vangKhongPhep += 1;
              tally.set(lopId, t);
            }
          }
          const classNames = await nameMap('eduLop', [...tally.keys()]);
          const rows = [...tally.entries()]
            .map(([lopId, t]) => ({
              lop: classNames.get(lopId) ?? '',
              tong: t.tong,
              coMat: t.coMat,
              vangCoPhep: t.vangCoPhep,
              vangKhongPhep: t.vangKhongPhep,
              tyLe: t.tong ? Math.round((t.coMat / t.tong) * 100) : 0,
            }))
            .sort((a, b) => a.lop.localeCompare(b.lop, 'vi'));
          return {
            columns: [
              { key: 'lop', label: 'Lớp' },
              { key: 'tong', label: 'Lượt điểm danh' },
              { key: 'coMat', label: 'Có mặt hoặc học bù' },
              { key: 'vangCoPhep', label: 'Vắng có phép' },
              { key: 'vangKhongPhep', label: 'Vắng không phép' },
              { key: 'tyLe', label: 'Chuyên cần (%)' },
            ],
            rows,
          };
        }
        case 'nghiDai': {
          const cutoff = addDays(today, -14);
          const active = students.filter(
            (s) => s.trangThai === 'dang_hoc' || s.trangThai === 'tam_nghi',
          );
          const last = new Map<number, string>();
          for (const part of chunks(
            active.map((s) => num(s.id)),
            400,
          )) {
            const marks = await q()
              .selectFrom('eduDiemDanh')
              .select(['buoiHocId', 'hocVienId'])
              .where('hocVienId', 'in', part)
              .where('trangThai', 'in', PRESENT)
              .execute();
            const dates = new Map<number, string>();
            for (const ids of chunks(
              [...new Set(marks.map((m) => num(m.buoiHocId)))],
              400,
            )) {
              const rows = await q()
                .selectFrom('eduBuoiHoc')
                .select(['id', 'ngay'])
                .where('id', 'in', ids)
                .execute();
              for (const r of rows) dates.set(num(r.id), asText(r.ngay));
            }
            for (const m of marks) {
              const date = dates.get(num(m.buoiHocId));
              if (date && date > (last.get(num(m.hocVienId)) ?? ''))
                last.set(num(m.hocVienId), date);
            }
          }
          const rows = active
            .filter((s) => (last.get(num(s.id)) ?? '') < cutoff)
            .map((s) => ({
              ma: asText(s.ma),
              hoTen: asText(s.hoTen),
              lop: s.lopId == null ? '' : (lops.get(num(s.lopId)) ?? ''),
              lanCuoiDiHoc: last.get(num(s.id)) ?? '',
            }))
            .sort((a, b) => a.lanCuoiDiHoc.localeCompare(b.lanCuoiDiHoc));
          return {
            columns: [
              { key: 'ma', label: 'Mã' },
              { key: 'hoTen', label: 'Họ tên' },
              { key: 'lop', label: 'Lớp' },
              { key: 'lanCuoiDiHoc', label: 'Lần cuối đi học' },
            ],
            rows,
          };
        }
      }
    }

    const denied = () =>
      eduError(
        'PERMISSION_DENIED',
        'EDU_PERMISSION_DENIED',
        'This report is not allowed.',
      );

    for (const path of ['/baoCao/xem', '/baoCao/xuatCsv', '/trangChu/tomTat']) {
      router.use(
        path,
        auth.required(),
        authz.middleware(),
        bodyLimit({ maxSize: 8 * 1024 }),
      );
    }

    router.post(
      '/baoCao/xem',
      declare('Show a report', 'showReport'),
      apiValidator('json', ReportInput),
      async (c) => {
        const input = c.req.valid('json');
        const report = await build(c, input);
        return c.json({ data: report });
      },
    );

    router.post(
      '/baoCao/xuatCsv',
      declare('Export a report as CSV', 'exportReport'),
      apiValidator('json', ReportInput),
      async (c) => {
        const input = c.req.valid('json');
        const userId = currentUserId(c);
        // Downloading is a separate action from viewing: a coach sees a report on screen but cannot take the file.
        await policiesOf(c, 'edu.baoCao', 'export');
        const report = await build(c, input);
        await q()
          .insertInto('eduXuatDuLieuNhatKy')
          .values({
            userId,
            loai: `bao_cao_${input.loai}`,
            boLoc: {
              tuNgay: input.tuNgay ?? null,
              denNgay: input.denNgay ?? null,
              tuThang: input.tuThang ?? null,
              denThang: input.denThang ?? null,
            },
            soDong: report.rows.length,
            createdAt: new Date(),
          })
          .execute();
        const csv = toCsv(
          report.columns.map((column) => column.label),
          report.rows.map((row) =>
            report.columns.map((column) => row[column.key]),
          ),
        );
        return new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="bao-cao-${input.loai}.csv"`,
            'cache-control': 'no-store',
          },
        });
      },
    );

    // --- Home summary -------------------------------------------------------------------------------------------
    router.post(
      '/trangChu/tomTat',
      declare('Today at a glance for the signed-in role', 'homeSummary'),
      needs('edu.buoiHoc', 'view'),
      async (c) => {
        const today = todayVn();
        const policies = await policiesOf(c, 'edu.buoiHoc', 'view');
        const sessionPolicy = policies.eduBuoiHoc;
        if (!sessionPolicy) throw denied();
        const sessions = await readAll(
          'eduBuoiHoc',
          sessionPolicy,
          (f: { string: (n: string) => { eq: (v: string) => unknown } }) =>
            f.string('ngay').eq(today),
        );
        const pending = await readAll(
          'eduBuoiHoc',
          sessionPolicy,
          (f: { string: (n: string) => { eq: (v: string) => unknown } }) =>
            f.string('trangThai').eq('du_kien'),
        );
        const lops = await nameMap(
          'eduLop',
          [...sessions, ...pending].map((s) => num(s.lopId)),
        );
        const view = (s: Row) => ({
          id: num(s.id),
          lopId: num(s.lopId),
          lop: lops.get(num(s.lopId)) ?? '',
          ngay: asText(s.ngay),
          gioBatDau: asText(s.gioBatDau),
          gioKetThuc: asText(s.gioKetThuc),
          daDiemDanh: s.trangThai === 'da_diem_danh',
        });
        return c.json({
          data: {
            homNay: sessions.map(view),
            chuaDiemDanh: pending
              .filter((s) => asText(s.ngay) <= today)
              .sort((a, b) => asText(b.ngay).localeCompare(asText(a.ngay)))
              .slice(0, 50)
              .map(view),
          },
        });
      },
    );

    return new Hono().route('/', router);
  }),
];
