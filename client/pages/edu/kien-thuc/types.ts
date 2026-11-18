/**
 * The answers of the knowledge routes (`server/routes/edu-kien-thuc.ts`) and the states a student can have on a skill.
 * No row for a skill means it has not been learned.
 */
export const MUC_DO = ['da_hoc', 'chua_vung', 'dat', 'vung'] as const;
export type MucDo = (typeof MUC_DO)[number];

export const isMucDo = (value: unknown): value is MucDo =>
  (MUC_DO as readonly unknown[]).includes(value);

export interface Topic {
  readonly id: number;
  readonly levelKey: string;
  readonly ma: string;
  readonly ten: string;
  readonly thuTu: number;
  readonly trangThai: string;
}

export interface Skill {
  readonly id: number;
  readonly chuDeId: number;
  readonly ma: string;
  readonly ten: string;
  readonly moTa: string | null;
  readonly thuTu: number;
  readonly trangThai: string;
  readonly sachId: number | null;
}

/** `POST /chuongTrinh/cay`. */
export interface CurriculumTree {
  readonly capDo: readonly {
    readonly key: string;
    readonly order: number;
    readonly title: string;
  }[];
  readonly chuDe: readonly Topic[];
  readonly kyNang: readonly Skill[];
}

export interface MatrixStudent {
  readonly id: number;
  readonly ma: string;
  readonly hoTen: string;
  readonly nhomId: number | null;
  readonly tong: number;
  readonly daHoc: number;
  readonly dat: number;
  readonly chuaVung: number;
  readonly phanTram: number;
  readonly canBu: number;
}

export interface MatrixCell {
  readonly hocVienId: number;
  readonly kyNangId: number;
  readonly mucDo: MucDo;
  readonly nguon: string;
}

/** `POST /kienThuc/maTran`. */
export interface Matrix {
  readonly lop: {
    readonly id: number;
    readonly ma: string;
    readonly ten: string;
    readonly levelKey: string;
  };
  readonly levelKey: string;
  readonly nhomId: number | null;
  /** The topic whose skills are the columns (the first of the level unless one was asked for). */
  readonly chuDeId: number | null;
  readonly chuDe: readonly Topic[];
  readonly kyNang: readonly Skill[];
  readonly hocVien: readonly MatrixStudent[];
  readonly o: readonly MatrixCell[];
  /** Skills this class (or group) has been taught at all. */
  readonly daDay: readonly number[];
  readonly tong: number;
  readonly trang: number;
  readonly limit: number;
}

export type GapReason = 'vang_buoi_day' | 'chua_vung';

export interface GapStudent {
  readonly hocVienId: number;
  readonly ma: string;
  readonly hoTen: string;
  readonly lyDo: GapReason;
  readonly ngay: string | null;
  readonly buoiHocId: number | null;
}

export interface GapSkill {
  readonly kyNangId: number;
  readonly ma: string;
  readonly ten: string;
  readonly chuDeId: number;
  readonly chuDe: string;
  readonly levelKey: string;
  readonly hocVien: readonly GapStudent[];
}

/** `POST /kienThuc/loHong`. */
export interface Gaps {
  readonly che: 'lop' | 'hocVien';
  /** Skills with a gap. */
  readonly tong: number;
  /** (student, skill) pairs. */
  readonly tongCap: number;
  readonly trang: number;
  readonly limit: number;
  readonly kyNang: readonly GapSkill[];
}

export interface StudentSkill extends Skill {
  readonly mucDo: MucDo | null;
  readonly nguon: string | null;
  readonly canBu: GapReason | null;
  readonly ngayVang: string | null;
}

export interface StudentLevel {
  readonly levelKey: string;
  readonly tong: number;
  readonly daHoc: number;
  readonly dat: number;
  readonly chuaVung: number;
  readonly phanTram: number;
  readonly chuDe: readonly (Topic & {
    readonly kyNang: readonly StudentSkill[];
  })[];
}

/** `POST /kienThuc/hoSo`. */
export interface StudentKnowledge {
  readonly hocVienId: number;
  readonly levelKey: string;
  readonly capDo: readonly StudentLevel[];
  readonly canBu: readonly {
    readonly kyNangId: number;
    readonly ma: string;
    readonly ten: string;
    readonly chuDe: string;
    readonly levelKey: string;
    readonly lyDo: GapReason;
    readonly ngay: string | null;
  }[];
}
