/** Page ids used in route `authz` declarations (client/routes.ts) and in the page grants of the seeded roles. */
export const PAGES = {
  coSo: 'edu.coSo',
  lop: 'edu.lop',
  hocVien: 'edu.hocVien',
  phuHuynh: 'edu.phuHuynh',
  diemDanh: 'edu.diemDanh',
  hocPhi: 'edu.hocPhi',
  nhanXet: 'edu.nhanXet',
  baoCao: 'edu.baoCao',
  // Added after the first seed ran: granted by `202611130003_edu_sach_grant` (see the generator of the seed).
  sach: 'edu.sach',
  // Granted by `202611140002_edu_phat_sach_grant`.
  phatSach: 'edu.phatSach',
  // Granted by `202611140004_edu_tuyen_sinh_grant`.
  tuyenSinh: 'edu.tuyenSinh',
  // Granted by `202611140005_edu_ho_so_gv_grant`.
  hoSoGv: 'edu.hoSoGv',
  // Granted by `202611170001_edu_he_thong_grant` (administrator only: backup and restore of the whole database).
  heThong: 'edu.heThong',
  // Granted by `202611180005_edu_kien_thuc_grant` (GĐ 4): the curriculum and the knowledge matrix.
  chuongTrinh: 'edu.chuongTrinh',
  kienThuc: 'edu.kienThuc',
} as const;
