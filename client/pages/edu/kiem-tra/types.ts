/**
 * The answers of the test routes (`server/routes/edu-kiem-tra.ts`). A test belongs to one class and one level; its
 * marks are whole numbers per student and skill; passing a `len_cap` test only makes a student eligible for the next
 * level (`denLevelKey`), the coach confirms it.
 */
export const TEST_KINDS = ['dinh_ky', 'len_cap'] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const TEST_STATUSES = ['nhap', 'da_chot'] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

export interface TestBase {
  readonly id: number;
  readonly ten: string;
  readonly loai: TestKind;
  readonly levelKey: string;
  readonly lopId: number;
  readonly coSoId: number;
  readonly ngay: string;
  readonly diemDat: number;
  readonly trangThai: TestStatus;
  readonly chotLuc: string | null;
}

/** One line of `POST /kiemTra/danhSach`. */
export interface TestRow extends TestBase {
  readonly soKyNang: number;
  readonly soHocVien: number;
}

export interface TestList {
  readonly tong: number;
  readonly trang: number;
  readonly limit: number;
  readonly danhSach: readonly TestRow[];
}

export interface TestSkill {
  readonly kyNangId: number;
  readonly ma: string;
  readonly ten: string;
  readonly chuDe: string;
  readonly diemToiDa: number;
}

export interface TestStudent {
  readonly id: number;
  readonly ma: string;
  readonly hoTen: string;
  readonly levelKey: string;
  readonly trangThai: string;
}

export interface TestMark {
  readonly hocVienId: number;
  readonly kyNangId: number;
  readonly diem: number;
}

export interface TestSummary {
  readonly hocVienId: number;
  readonly diem: number;
  readonly toiDa: number;
  readonly phanTram: number;
  readonly dat: boolean;
  readonly thieu: number;
  readonly daKiemTra: boolean;
  /** The level the student may be confirmed into; `null` when the student is not eligible. */
  readonly denLevelKey: string | null;
  /** Passed, and already confirmed into a higher level since. */
  readonly daLenCap: boolean;
}

/** `POST /kiemTra/chiTiet`. */
export interface TestDetail {
  readonly bai: TestBase;
  readonly coTheSua: boolean;
  readonly kyNang: readonly TestSkill[];
  readonly hocVien: readonly TestStudent[];
  readonly diem: readonly TestMark[];
  readonly tongHop: readonly TestSummary[];
}

/** `POST /kiemTra/hocVien`: a closed test of one student. */
export interface StudentTest extends TestBase {
  readonly diem: number;
  readonly toiDa: number;
  readonly phanTram: number;
  readonly dat: boolean;
  readonly denLevelKey: string | null;
  readonly kyNang: readonly {
    readonly kyNangId: number;
    readonly ma: string;
    readonly ten: string;
    readonly diem: number;
    readonly diemToiDa: number;
    readonly mucDo: 'chua_vung' | 'dat' | 'vung';
  }[];
}

export interface StudentTests {
  readonly hocVienId: number;
  readonly baiKiemTra: readonly StudentTest[];
}
