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
  // Granted by `202611160001_edu_doi_soat_sao_luu_grant`: the reconciliation page used to borrow the tuition page's
  // grant, and the backup page had none at all.
  doiSoat: 'edu.doiSoat',
  saoLuu: 'edu.saoLuu',
} as const;
