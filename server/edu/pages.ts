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
} as const;
