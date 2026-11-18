type Row = readonly [key: string, vi: string, en: string, zh: string];

export const EDU_DOI_SOAT_ROWS: readonly Row[] = [
  ['nav.doiSoat', 'Đối soát buổi học', 'Session Audit', '课次对账'],
  ['nav.duLieu', 'Sao lưu & Dữ liệu', 'Data & Backup', '数据与备份'],
  [
    'doiSoat.title',
    'Đối soát buổi học & học phí',
    'Session & Tuition Audit',
    '课次与学费对账',
  ],

  [
    'duLieu.title',
    'Sao lưu & Quản lý dữ liệu',
    'Backup & Data Management',
    '数据备份与管理',
  ],
  [
    'duLieu.description',
    'Sao lưu CSDL tức thì, quản lý bản sao lưu và xuất nhập dữ liệu theo từng danh mục.',
    'Instant database snapshot backups, backup archives, and modular data import/export.',
    '即时数据库快照备份、历史备份管理以及分模块数据导入导出。',
  ],
  [
    'duLieu.backupNow',
    'Tạo bản sao lưu ngay',
    'Create Backup Now',
    '立即创建备份',
  ],
  ['duLieu.restore', 'Khôi phục dữ liệu', 'Restore Data', '恢复数据'],
  ['duLieu.export', 'Xuất dữ liệu Excel/CSV', 'Export Data', '导出数据'],
  ['duLieu.import', 'Nhập dữ liệu', 'Import Data', '导入数据'],
];
