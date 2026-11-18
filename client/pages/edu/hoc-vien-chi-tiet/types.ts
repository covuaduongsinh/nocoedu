import type { BalanceBand } from '../format.js';

/** The answer of `POST /hocVien/hoSo360` (`server/routes/edu-ho-so.ts`). A section is `null` when the person may not see it. */
export interface Profile {
  readonly hocVien: {
    readonly id: number;
    readonly ma: string;
    readonly hoTen: string;
    readonly levelKey: string;
    readonly trangThai: string;
    readonly lopId: number | null;
    readonly lopTen: string | null;
    readonly nhomId: number | null;
    readonly nhomTen: string | null;
    readonly coSoId: number | null;
    readonly coSoTen: string | null;
  };
  readonly phuHuynhChinh: {
    readonly id: number;
    readonly hoTen: string;
    readonly soDienThoai: string;
    readonly quanHe: string;
  } | null;
  readonly tongHop: {
    readonly soBuoiConLai: number;
    readonly dai: BalanceBand;
    readonly canThu: boolean;
    readonly tongSoBuoiDaMua: number | null;
    readonly tongSoBuoiDaHoc: number | null;
    readonly vuotSoDu: number | null;
    readonly tongTienHocPhi: number | null;
    readonly tongDaThanhToan: number | null;
    readonly tongConNoHocPhi: number | null;
    readonly tienSachDaPhat: number | null;
    readonly tienSachDaNop: number | null;
    readonly quySach: number | null;
    readonly congNoSach: number | null;
  };
  readonly hocPhi: { readonly cacKy: readonly Term[] } | null;
  readonly buoiHoc: readonly SessionRow[] | null;
  readonly sach: {
    readonly cacLanPhat: readonly BookHandout[];
    readonly daPhat: number;
    readonly daNop: number;
    readonly conLai: number;
    readonly congNo: number;
  } | null;
}

/** One term (a package, or a manual adjustment that added sessions) with the sessions allocated to it. */
export interface Term {
  readonly kySo: number;
  readonly goiHocId: number | null;
  readonly loai: 'mua' | 'chuyen_so_du' | 'dieu_chinh';
  readonly trangThaiGoi: string;
  readonly ngayMua: string;
  readonly soBuoi: number;
  readonly donGia: number;
  readonly thanhTien: number;
  readonly daThanhToan: number;
  readonly conNo: number;
  readonly daDung: number;
  readonly conLai: number;
  readonly tienDo: number;
}

export interface SessionRow {
  readonly diemDanhId: number;
  readonly buoiHocId: number;
  readonly stt: number;
  readonly ngay: string;
  readonly gioBatDau: string;
  readonly gioKetThuc: string;
  readonly lopId: number | null;
  readonly lopTen: string | null;
  readonly trangThai: string;
  readonly daLamBtvn: boolean;
  readonly yThucDiem: number | null;
  readonly nhanXet: string;
  readonly soBuoiDaTru: number;
  /** The term the session was deducted from; `null` when it deducted nothing or the person sees no tuition. */
  readonly kySo: number | null;
  readonly vuotSoDu: boolean;
}

export interface BookHandout {
  readonly id: number;
  readonly kyHieu: string;
  readonly tenSach: string;
  readonly ngay: string;
  readonly giaBia: number | null;
  readonly uuDai: number;
  readonly tienSach: number;
  readonly ghiChu: string;
}

export const TABS = [
  'tong-quan',
  'buoi-hoc',
  'hoc-phi',
  'sach-quy',
  'kien-thuc',
  'nhan-xet',
  'phu-huynh',
] as const;
export type TabKey = (typeof TABS)[number];
