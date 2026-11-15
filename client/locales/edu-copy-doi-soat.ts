type Row = readonly [key: string, vi: string, en: string, zh: string];

export const EDU_DOI_SOAT_ROWS: readonly Row[] = [
  ['nav.doiSoat', 'Đối soát buổi học', 'Session Audit', '课次对账'],
  ['nav.duLieu', 'Sao lưu & Dữ liệu', 'Data & Backup', '数据与备份'],
  ['doiSoat.title', 'Đối soát buổi học & học phí', 'Session & Tuition Audit', '课次与学费对账'],
  [
    'doiSoat.description',
    'Theo dõi, đối soát và chỉnh sửa chi tiết từng buổi học, kỳ học phí, sách giáo trình và nhận xét học viên.',
    'Track, reconcile and edit individual sessions, tuition packages, books and student feedback.',
    '跟踪、对账并编辑各个课次、学费套餐、教材及学员评语。',
  ],
  ['doiSoat.overview', 'Tổng quan đối soát', 'Audit Overview', '对账概览'],
  ['doiSoat.sessions', 'Lịch sử buổi học', 'Session History', '课次记录'],
  ['doiSoat.tuition', 'Kỳ nộp học phí', 'Tuition Terms', '学费周期'],
  ['doiSoat.books', 'Sách & Quỹ giáo trình', 'Books & Materials', '教材与书费'],
  ['doiSoat.print', 'In phiếu đối soát A4', 'Print Audit Report (A4)', '打印A4对账单'],
  ['doiSoat.exportCsv', 'Xuất bảng kê Excel', 'Export Excel/CSV', '导出对账表格'],
  ['doiSoat.back', 'Quay lại danh sách', 'Back to List', '返回列表'],
  ['doiSoat.editSession', 'Sửa buổi học', 'Edit Session', '编辑课次'],
  ['doiSoat.updateSuccess', 'Đã cập nhật buổi học thành công', 'Session updated successfully', '课次更新成功'],

  ['duLieu.title', 'Sao lưu & Quản lý dữ liệu', 'Backup & Data Management', '数据备份与管理'],
  [
    'duLieu.description',
    'Sao lưu CSDL tức thì, quản lý bản sao lưu và xuất nhập dữ liệu theo từng danh mục.',
    'Instant database snapshot backups, backup archives, and modular data import/export.',
    '即时数据库快照备份、历史备份管理以及分模块数据导入导出。',
  ],
  ['duLieu.backupNow', 'Tạo bản sao lưu ngay', 'Create Backup Now', '立即创建备份'],
  ['duLieu.restore', 'Khôi phục dữ liệu', 'Restore Data', '恢复数据'],
  ['duLieu.export', 'Xuất dữ liệu Excel/CSV', 'Export Data', '导出数据'],
  ['duLieu.import', 'Nhập dữ liệu', 'Import Data', '导入数据'],
];
