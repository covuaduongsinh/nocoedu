import type { Profile, SessionRow, Term } from '../types.js';

/**
 * The notice of one tuition term a parent receives ("Phiếu báo kỳ học phí"): what Lark's "Kỳ nộp học phí" row used to
 * show in a screenshot. Everything here is worked out from the one answer of the student file (`/hocVien/hoSo360`):
 * the terms and which session belongs to which term are the server's allocation, never a second computation, and
 * "running out" is the band the server put the balance in (`tongHop.dai`, the source of "Cần thu").
 *
 * - `het`: the last term is used up, nothing is owed in sessions;
 * - `vuot`: the last term is used up and the student attended beyond everything paid for;
 * - `sap_het`: the last term still has sessions and the server says the balance is running out;
 * - `dang_hoc`: sessions are left;
 * - `da_sang_ky_moi`: this term is used up and a later one is being used.
 */
export type NoticeStatus =
  'het' | 'vuot' | 'sap_het' | 'dang_hoc' | 'da_sang_ky_moi';

export interface NoticeSession {
  /** The running number of the session inside its list, from 1. */
  readonly stt: number;
  /** `YYYY-MM-DD`. */
  readonly ngay: string;
  /** Absent, and the session was deducted all the same. */
  readonly vang: boolean;
}

export interface Notice {
  readonly hocVien: {
    readonly hoTen: string;
    readonly ma: string;
    readonly lopTen: string | null;
    readonly coSoTen: string | null;
  };
  readonly term: Term;
  /** The first session deducted from the term; `null` while none was. */
  readonly batDau: string | null;
  /** The last session of the term once it is used up; `null` while it still has sessions. */
  readonly ketThuc: string | null;
  readonly cacBuoi: readonly NoticeSession[];
  /** Absences inside the term's period that deducted nothing (`YYYY-MM-DD`). */
  readonly nghiKhongTinh: readonly string[];
  /** Sessions attended beyond everything paid for; listed on the last term only. */
  readonly hocThem: readonly NoticeSession[];
  /** How many sessions are owed (0 unless `status` is `vuot`). */
  readonly soBuoiVuot: number;
  readonly status: NoticeStatus;
  /** The sessions left that the conclusion speaks of: the balance on the last term, the term's own before it. */
  readonly conLai: number;
  /** The term the student moved on to (`da_sang_ky_moi`). */
  readonly kyTiepTheo: Term | null;
  /** The day the notice was made, `YYYY-MM-DD`. */
  readonly ngayLap: string;
}

export { formatDayVn } from '../../format.js';

const isAbsence = (status: string): boolean => status.startsWith('vang');

/** The terms a notice can be made for; none when the person sees no tuition or no sessions. */
export function noticeTerms(profile: Profile): readonly Term[] {
  return profile.hocPhi && profile.buoiHoc ? profile.hocPhi.cacKy : [];
}

/** The term being used now: the first one with sessions left, else the last one. `null` without terms. */
export function currentTermNo(profile: Profile): number | null {
  const terms = noticeTerms(profile);
  const open = terms.find((term) => term.conLai > 0);
  return (open ?? terms[terms.length - 1])?.kySo ?? null;
}

/**
 * Reads the `phieu` parameter of the address: `hien-tai` is the term in use, a number is that term. `null` when the
 * parameter is empty, names no term of the student, or the person may not make a notice.
 */
export function resolveTermNo(
  profile: Profile,
  requested: string,
): number | null {
  if (requested === '') return null;
  const terms = noticeTerms(profile);
  if (requested === 'hien-tai') return currentTermNo(profile);
  const kySo = Number(requested);
  return terms.some((term) => term.kySo === kySo) ? kySo : null;
}

function numbered(rows: readonly SessionRow[]): NoticeSession[] {
  return rows.map((row, index) => ({
    stt: index + 1,
    ngay: row.ngay,
    vang: isAbsence(row.trangThai),
  }));
}

/** The notice of term `kySo`; `null` when the student has no such term or the person sees no tuition. */
export function buildNotice(
  profile: Profile,
  kySo: number,
  today: string,
): Notice | null {
  const terms = noticeTerms(profile);
  const index = terms.findIndex((candidate) => candidate.kySo === kySo);
  const term = terms[index];
  if (!term) return null;
  const sessions = profile.buoiHoc ?? [];
  const last = index === terms.length - 1;

  const ofTerm = sessions.filter(
    (row) => row.kySo === kySo && row.soBuoiDaTru > 0 && !row.vuotSoDu,
  );
  const batDau = ofTerm[0]?.ngay ?? null;
  const ketThuc =
    term.conLai === 0 ? (ofTerm[ofTerm.length - 1]?.ngay ?? null) : null;

  // An absence that deducted nothing belongs to no term; it is shown with the term whose period it falls in.
  const until = ketThuc ?? today;
  const nghiKhongTinh =
    batDau === null
      ? []
      : sessions
          .filter(
            (row) =>
              row.soBuoiDaTru === 0 &&
              isAbsence(row.trangThai) &&
              row.ngay >= batDau &&
              row.ngay <= until,
          )
          .map((row) => row.ngay);

  const balance = profile.tongHop.soBuoiConLai;
  const over = last ? sessions.filter((row) => row.vuotSoDu) : [];
  const soBuoiVuot = last
    ? Math.max(profile.tongHop.vuotSoDu ?? 0, balance < 0 ? -balance : 0)
    : 0;

  let status: NoticeStatus;
  if (!last) status = term.conLai > 0 ? 'dang_hoc' : 'da_sang_ky_moi';
  else if (soBuoiVuot > 0) status = 'vuot';
  else if (term.conLai === 0 && balance <= 0) status = 'het';
  else if (profile.tongHop.dai === 'sap_het') status = 'sap_het';
  else status = 'dang_hoc';

  return {
    hocVien: {
      hoTen: profile.hocVien.hoTen,
      ma: profile.hocVien.ma,
      lopTen: profile.hocVien.lopTen,
      coSoTen: profile.hocVien.coSoTen,
    },
    term,
    batDau,
    ketThuc,
    cacBuoi: numbered(ofTerm),
    nghiKhongTinh,
    hocThem: numbered(over),
    soBuoiVuot: status === 'vuot' ? soBuoiVuot : 0,
    status,
    conLai: last ? Math.max(0, balance) : term.conLai,
    kyTiepTheo: status === 'da_sang_ky_moi' ? (terms[index + 1] ?? null) : null,
    ngayLap: today,
  };
}
