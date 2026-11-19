/**
 * NocoEdu wording for the notice of a tuition term a parent receives ("Phiếu báo kỳ học phí",
 * docs/plans/2026-11-19-ke-hoach-phieu-bao-ky-hoc-phi.md): the dialog, the text drawn on the picture (`card.*`,
 * `status.*`) and the message that goes with it (`msg.*`). Same shape as `./edu-copy.ts`.
 *
 * The picture cuts a line by a number of characters, so keep a `status.*.title` under about 50 characters.
 */
type Row = readonly [key: string, vi: string, en: string, zh: string];

export const EDU_PHIEU_BAO_ROWS: readonly Row[] = [
  // --- Buttons and the dialog --------------------------------------------------------------------------------------
  [
    'phieuBao.button',
    'Phiếu báo phụ huynh',
    'Notice for parents',
    '家长通知单',
  ],
  ['phieuBao.link', 'Phiếu báo', 'Notice', '通知单'],
  [
    'phieuBao.dialogTitle',
    'Phiếu báo kỳ học phí',
    'Tuition term notice',
    '学费周期通知单',
  ],
  [
    'phieuBao.dialogDescription',
    'Ảnh và lời nhắn gửi phụ huynh để báo tình hình kỳ học phí của con.',
    'A picture and a message that tell a parent how their child’s tuition term stands.',
    '向家长说明孩子学费周期情况的图片与留言。',
  ],
  ['phieuBao.term', 'Kỳ học phí', 'Term', '学费周期'],
  [
    'phieuBao.previewAlt',
    'Phiếu báo {{term}} của {{name}}',
    'Notice of {{term}} for {{name}}',
    '{{name}} 的{{term}}通知单',
  ],
  ['phieuBao.message', 'Lời nhắn gửi kèm', 'Message', '附带留言'],
  [
    'phieuBao.messageHint',
    'Có thể sửa lời nhắn trước khi sao chép.',
    'You can edit the message before copying it.',
    '复制前可以修改留言。',
  ],
  ['phieuBao.copyMessage', 'Sao chép lời nhắn', 'Copy message', '复制留言'],
  ['phieuBao.copyImage', 'Sao chép ảnh', 'Copy picture', '复制图片'],
  ['phieuBao.download', 'Tải ảnh', 'Download picture', '下载图片'],
  ['phieuBao.share', 'Chia sẻ', 'Share', '分享'],
  [
    'phieuBao.rendering',
    'Đang tạo ảnh…',
    'Making the picture…',
    '正在生成图片…',
  ],
  [
    'phieuBao.renderError',
    'Không tạo được tệp ảnh trên trình duyệt này. Thầy cô có thể chụp màn hình phiếu ở trên.',
    'The picture file could not be made in this browser. You can take a screenshot of the notice above.',
    '此浏览器无法生成图片文件，您可以截取上方通知单的屏幕。',
  ],
  [
    'phieuBao.copiedImage',
    'Đã sao chép ảnh. Dán vào Zalo để gửi phụ huynh.',
    'Picture copied. Paste it into the chat with the parent.',
    '图片已复制，请粘贴到与家长的聊天中。',
  ],
  [
    'phieuBao.copiedMessage',
    'Đã sao chép lời nhắn.',
    'Message copied.',
    '留言已复制。',
  ],
  [
    'phieuBao.copyImageFailed',
    'Trình duyệt không cho sao chép ảnh. Hãy bấm “Tải ảnh” rồi gửi tệp.',
    'The browser refused to copy the picture. Use “Download picture” and send the file.',
    '浏览器拒绝复制图片，请点击“下载图片”后发送文件。',
  ],
  [
    'phieuBao.copyImageUnavailable',
    'Sao chép ảnh cần trang chạy trên HTTPS và trình duyệt mới. Hãy dùng “Tải ảnh” rồi gửi tệp.',
    'Copying a picture needs HTTPS and a recent browser. Use “Download picture” and send the file.',
    '复制图片需要 HTTPS 和较新的浏览器，请使用“下载图片”后发送文件。',
  ],
  [
    'phieuBao.copyMessageFailed',
    'Không sao chép được. Hãy chọn lời nhắn ở trên rồi sao chép thủ công.',
    'Copying failed. Select the message above and copy it by hand.',
    '复制失败，请选中上方留言后手动复制。',
  ],
  [
    'phieuBao.shareFailed',
    'Không chia sẻ được. Hãy dùng “Tải ảnh” rồi gửi tệp.',
    'Sharing failed. Use “Download picture” and send the file.',
    '分享失败，请使用“下载图片”后发送文件。',
  ],

  // --- The picture -------------------------------------------------------------------------------------------------
  [
    'phieuBao.card.title',
    'Thông báo kỳ học phí',
    'Tuition term notice',
    '学费周期通知',
  ],
  ['phieuBao.card.bought', 'Số buổi nộp', 'Sessions paid', '已缴课时'],
  ['phieuBao.card.attended', 'Đã học', 'Attended', '已上课'],
  ['phieuBao.card.left', 'Còn lại', 'Left', '剩余'],
  [
    'phieuBao.card.period',
    'Thời gian học: từ {{start}} đến {{end}}',
    'From {{start}} to {{end}}',
    '上课时间：{{start}} 至 {{end}}',
  ],
  [
    'phieuBao.card.periodOpen',
    'Thời gian học: bắt đầu {{start}}, đang học',
    'Started on {{start}}, in progress',
    '上课时间：自 {{start}} 起，进行中',
  ],
  [
    'phieuBao.card.periodNone',
    'Thời gian học: chưa bắt đầu',
    'Not started yet',
    '上课时间：尚未开始',
  ],
  [
    'phieuBao.card.sessions',
    'Các ngày đã học ({{count}} buổi)',
    'Days attended ({{count}} sessions)',
    '已上课日期（{{count}} 节）',
  ],
  [
    'phieuBao.card.noSessions',
    'Chưa có buổi học nào tính vào kỳ này.',
    'No session has been counted in this term yet.',
    '本期尚未计入任何课程。',
  ],
  [
    'phieuBao.card.absent',
    'Vắng mặt, vẫn tính buổi',
    'Absent, still counted',
    '缺席，仍计课时',
  ],
  [
    'phieuBao.card.excused',
    'Nghỉ, không tính buổi ({{count}})',
    'Absent, not counted ({{count}})',
    '请假，不计课时（{{count}}）',
  ],
  [
    'phieuBao.card.over',
    'Buổi học thêm, chưa có học phí ({{count}} buổi)',
    'Extra sessions, not paid for yet ({{count}})',
    '额外课程，尚未缴费（{{count}} 节）',
  ],
  [
    'phieuBao.card.footer',
    'Lập ngày {{date}} · {{club}}',
    'Made on {{date}} · {{club}}',
    '制表日期 {{date}} · {{club}}',
  ],

  // --- The conclusion, by status -----------------------------------------------------------------------------------
  [
    'phieuBao.status.het.title',
    'Kỳ học phí này đã hết',
    'This term is used up',
    '本期学费已用完',
  ],
  [
    'phieuBao.status.het.body',
    'Kính mời phụ huynh nộp học phí kỳ tiếp theo để con tiếp tục học.',
    'Please pay for the next term so your child can keep studying.',
    '敬请家长缴纳下一期学费，以便孩子继续上课。',
  ],
  [
    'phieuBao.status.vuot.title',
    'Đã hết kỳ, con đã học thêm {{count}} buổi',
    'Term used up, {{count}} extra sessions attended',
    '本期已用完，孩子已多上 {{count}} 节',
  ],
  [
    'phieuBao.status.vuot.body',
    'Các buổi học thêm sẽ được tính vào kỳ tiếp theo. Kính mời phụ huynh nộp học phí kỳ mới.',
    'The extra sessions will be counted in the next term. Please pay for the new term.',
    '额外课程将计入下一期。敬请家长缴纳新一期学费。',
  ],
  [
    'phieuBao.status.sap_het.title',
    'Sắp hết kỳ: còn {{count}} buổi',
    'Almost used up: {{count}} left',
    '即将用完：剩余 {{count}} 节',
  ],
  [
    'phieuBao.status.sap_het.body',
    'Kính mời phụ huynh chuẩn bị học phí kỳ tiếp theo.',
    'Please get ready to pay for the next term.',
    '敬请家长准备下一期学费。',
  ],
  [
    'phieuBao.status.dang_hoc.title',
    'Đang học: còn {{count}} buổi',
    'In progress: {{count}} left',
    '进行中：剩余 {{count}} 节',
  ],
  [
    'phieuBao.status.dang_hoc.body',
    'Trung tâm sẽ báo phụ huynh khi kỳ học phí sắp hết.',
    'We will tell you when the term is almost used up.',
    '学费即将用完时，中心会通知家长。',
  ],
  [
    'phieuBao.status.da_sang_ky_moi.title',
    'Đã học hết kỳ này',
    'This term is used up',
    '本期已上完',
  ],
  [
    'phieuBao.status.da_sang_ky_moi.body',
    'Con đang học sang {{term}}.',
    'Your child is now on {{term}}.',
    '孩子已进入{{term}}。',
  ],

  // --- The message -------------------------------------------------------------------------------------------------
  [
    'phieuBao.msg.greeting',
    'Kính gửi phụ huynh em {{name}},',
    'Dear parent of {{name}},',
    '尊敬的 {{name}} 家长：',
  ],
  [
    'phieuBao.msg.intro',
    '{{club}} xin gửi thống kê {{term}} của con:',
    '{{club}} sends you the summary of {{term}}:',
    '{{club}} 向您发送孩子{{term}}的统计：',
  ],
  [
    'phieuBao.msg.paid',
    '- Ngày nộp học phí: {{date}}',
    '- Paid on: {{date}}',
    '- 缴费日期：{{date}}',
  ],
  [
    'phieuBao.msg.count',
    '- Đã học {{used}}/{{total}} buổi, còn lại {{left}} buổi',
    '- Attended {{used}} of {{total}} sessions, {{left}} left',
    '- 已上 {{used}}/{{total}} 节，剩余 {{left}} 节',
  ],
  [
    'phieuBao.msg.days',
    '- Các ngày đã học: {{days}}',
    '- Days attended: {{days}}',
    '- 已上课日期：{{days}}',
  ],
  [
    'phieuBao.msg.excused',
    '- Nghỉ, không tính buổi: {{days}}',
    '- Absent, not counted: {{days}}',
    '- 请假，不计课时：{{days}}',
  ],
  [
    'phieuBao.msg.over',
    '- Buổi học thêm, chưa có học phí: {{days}}',
    '- Extra sessions, not paid for yet: {{days}}',
    '- 额外课程，尚未缴费：{{days}}',
  ],
  [
    'phieuBao.msg.transfer',
    'Học phí kỳ tiếp theo: {{amount}} đ. Nội dung chuyển khoản: {{content}} (mã QR có trong ảnh).',
    'Next term: {{amount}} VND. Transfer note: {{content}} (the QR code is in the picture).',
    '下一期学费：{{amount}} 越南盾。转账备注：{{content}}（二维码见图片）。',
  ],

  // --- The transfer code of the next term (phase 2) ------------------------------------------------------------------
  [
    'phieuBao.qr.toggle',
    'Kèm mã QR chuyển khoản kỳ tiếp theo',
    'Add the transfer QR code of the next term',
    '附上下一期的转账二维码',
  ],
  [
    'phieuBao.qr.amount',
    'Học phí kỳ tiếp theo (đồng)',
    'Next term’s tuition (VND)',
    '下一期学费（越南盾）',
  ],
  [
    'phieuBao.qr.invalid',
    'Nhập số tiền để tạo mã QR.',
    'Type an amount to make the QR code.',
    '请输入金额以生成二维码。',
  ],
  [
    'phieuBao.qr.loading',
    'Đang tải mã QR…',
    'Loading the QR code…',
    '正在加载二维码…',
  ],
  [
    'phieuBao.qr.error',
    'Không tải được mã QR nên ảnh chưa có mã. Kiểm tra mạng rồi đổi số tiền hoặc mở lại phiếu.',
    'The QR code could not be loaded, so the picture has none. Check the network, then change the amount or open the notice again.',
    '无法加载二维码，图片中暂无二维码。请检查网络后修改金额或重新打开通知单。',
  ],
  [
    'phieuBao.card.qrTitle',
    'Chuyển khoản học phí kỳ tiếp theo',
    'Transfer for the next term',
    '下一期学费转账',
  ],
  [
    'phieuBao.card.qrContent',
    'Nội dung: {{content}}',
    'Note: {{content}}',
    '备注：{{content}}',
  ],
  [
    'phieuBao.card.qrHint',
    'Quét mã bằng ứng dụng ngân hàng: số tiền và nội dung đã được điền sẵn.',
    'Scan with your banking app: the amount and the note are filled in.',
    '使用银行应用扫码：金额与备注已自动填写。',
  ],

  // --- "The parent was told" (phase 2) -------------------------------------------------------------------------------
  [
    'phieuBao.mark.title',
    'Theo dõi báo phụ huynh',
    'Was the parent told?',
    '是否已通知家长',
  ],
  [
    'phieuBao.mark.none',
    'Chưa đánh dấu đã báo cho kỳ này.',
    'Not marked as told for this term.',
    '本期尚未标记为已通知。',
  ],
  [
    'phieuBao.mark.done',
    'Đã báo phụ huynh ngày {{date}}.',
    'The parent was told on {{date}}.',
    '已于 {{date}} 通知家长。',
  ],
  [
    'phieuBao.mark.doneBy',
    'Đã báo phụ huynh ngày {{date}} ({{name}}).',
    'The parent was told on {{date}} ({{name}}).',
    '已于 {{date}} 通知家长（{{name}}）。',
  ],
  ['phieuBao.mark.button', 'Đánh dấu đã báo', 'Mark as told', '标记为已通知'],
  ['phieuBao.mark.today', 'Đã đánh dấu hôm nay', 'Marked today', '今天已标记'],
  ['phieuBao.mark.undo', 'Bỏ đánh dấu', 'Take the mark back', '取消标记'],
  ['phieuBao.told.column', 'Báo phụ huynh', 'Parent told', '通知家长'],
  ['phieuBao.told.all', 'Tất cả', 'Everybody', '全部'],
  ['phieuBao.told.chua_bao', 'Chưa báo', 'Not told', '未通知'],
  ['phieuBao.told.da_bao', 'Đã báo', 'Told', '已通知'],
  ['phieuBao.told.on', 'Đã báo {{date}}', 'Told {{date}}', '已通知 {{date}}'],
  [
    'phieuBao.told.empty',
    'Không có học viên nào khớp bộ lọc.',
    'No student matches the filter.',
    '没有符合筛选条件的学员。',
  ],
  [
    'errors.EDU_NOTICE_NOT_FOUND',
    'Không tìm thấy lần đánh dấu này.',
    'This mark was not found.',
    '未找到该标记。',
  ],
  [
    'errors.EDU_PACKAGE_NOT_FOUND',
    'Không tìm thấy gói học.',
    'The package was not found.',
    '未找到课时包。',
  ],
  [
    'phieuBao.msg.thanks',
    'Trân trọng cảm ơn phụ huynh!',
    'Thank you!',
    '衷心感谢家长！',
  ],
];
