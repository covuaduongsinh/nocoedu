/**
 * NocoEdu wording for the books catalogue (DS-61 phase E). Same shape as the rows in `./edu-copy.ts`:
 * `[key, Tiếng Việt, English, 中文]`.
 */
export const EDU_SACH_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['nav.sach', 'Sách', 'Books', '书籍'],
  ['sach.title', 'Sách', 'Books', '书籍'],
  [
    'sach.description',
    'Danh mục sách CLB bán cho học viên: ký hiệu, tên và giá.',
    'The books the club sells to students: symbol, title and price.',
    '俱乐部向学员销售的书籍：代号、书名和价格。',
  ],
  ['sach.new', 'Thêm sách', 'Add a book', '新增书籍'],
  ['sach.edit', 'Sửa sách', 'Edit the book', '编辑书籍'],
  ['sach.kyHieu', 'Ký hiệu', 'Symbol', '代号'],
  ['sach.ten', 'Tên sách', 'Title', '书名'],
  ['sach.giaBia', 'Giá bìa (đồng)', 'Cover price (VND)', '定价（越南盾）'],
  ['sach.giaBan', 'Giá bán (đồng)', 'Selling price (VND)', '售价（越南盾）'],
  ['sach.trangThai', 'Trạng thái', 'Status', '状态'],
  ['sach.empty', 'Chưa có sách nào', 'No books yet', '暂无书籍'],
  [
    'sach.emptyHint',
    'Thêm cuốn sách đầu tiên để dùng khi phát sách cho học viên.',
    'Add the first book to use when handing books out to students.',
    '添加第一本书，以便向学员发书时使用。',
  ],
  ['status.dang_ban', 'Đang bán', 'On sale', '在售'],
  ['status.ngung', 'Ngừng bán', 'Withdrawn', '停售'],
];
