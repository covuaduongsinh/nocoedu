import settings from './settings-vi-VN.js';
import type { SystemResource } from './en-US.js';

/** The Vietnamese copy of what the template ships; see `./en-US.ts`. Branded for Cờ vua Dương Sinh. */
const systemViVN: SystemResource = {
  pendingFeedback: {
    working: 'Đang xử lý…',
    longWait: 'Việc này lâu hơn bình thường. Có thể tiếp tục chờ.',
  },
  taskProgress: {
    queued: 'Đang chờ bắt đầu',
    running: 'Đang thực hiện',
    completed: 'Đã hoàn tất',
    failed: 'Thất bại',
    canceled: 'Đã hủy',
    count: '{{processed}}/{{total}}',
    processed: 'Đã xử lý {{processed}}',
    background: 'Tác vụ vẫn tiếp tục chạy nếu rời khỏi trang này.',
  },
  listFeedback: {
    loading: 'Đang tải',
    empty: 'Chưa có dữ liệu',
    noResults: 'Không có kết quả',
    forbidden: 'Không có quyền truy cập',
    unauthenticated: 'Phiên đăng nhập đã hết hạn',
    failed: 'Không thể tải danh sách',
    refreshFailed: 'Làm mới thất bại; đang hiển thị dữ liệu trước đó',
    retry: 'Thử lại',
    retrying: 'Đang thử lại…',
    clear: 'Xóa bộ lọc',
    signIn: 'Đăng nhập',
  },
  flowDiagram: {
    controls: 'Điều khiển sơ đồ',
    fitView: 'Vừa khung nhìn',
    fullscreen: 'Toàn màn hình',
    exitFullscreen: 'Thoát toàn màn hình',
    escapeHint: 'Nhấn Escape để thoát',
    leavesTo: 'Chuyển tới',
    arrivesFrom: 'Đến từ',
    otherRoutes: 'Các đường khác',
    minimap: 'Tổng quan sơ đồ',

    configure: 'Cấu hình',
    overview: 'Tổng quan sơ đồ',
    actualSize: 'Kích thước thực',
    states: 'Trạng thái',
    transitions: 'Chuyển tiếp',
    configurable: 'Tham số',
    current: 'Hiện tại',
    visited: 'Đã qua',
    initial: 'Khởi đầu',
    final: 'Kết thúc',
    state: 'Trạng thái',
    zoomOut: 'Thu nhỏ',
    zoomIn: 'Phóng to',
    fit: 'Vừa khung nhìn',

    empty: 'Không có trạng thái nào để hiển thị.',
    loading: 'Đang sắp xếp sơ đồ…',
    failed: 'Không thể sắp xếp sơ đồ này.',
    nodeHelp: 'Nhấn Enter hoặc Space để chọn trạng thái.',
    edgeHelp: 'Nhấn Enter hoặc Space để chọn chuyển tiếp.',
  },
  settings,
  'auth.preparingSession': 'Đang chuẩn bị phiên làm việc…',
  'auth.connectionFailed': 'Không thể kết nối',
  'auth.connectionFailedDescription':
    'Không thể chuẩn bị kết nối thời gian thực. Hãy thử lại để vào ứng dụng, hoặc đăng xuất.',

  'auth.passwordResetSuccess':
    'Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.',
  'auth.requestNewResetLink': 'Yêu cầu liên kết đặt lại mới',

  // The UI Library block of the `/device` page.
  formFeedback: {
    field: 'Giá trị này bị từ chối. Hãy kiểm tra và thử lại.',
    invalid: 'Hãy kiểm tra các trường được đánh dấu rồi thử lại.',
    failed: 'Không thể lưu. Nội dung đã nhập vẫn được giữ lại. Hãy thử lại.',
    network:
      'Không thể kết nối. Hãy kiểm tra kết nối rồi thử lại. Nội dung đã nhập vẫn được giữ lại.',
    denied:
      'Với quyền truy cập hiện tại, không thể gửi biểu mẫu này. Nội dung đã nhập vẫn được giữ lại.',
  },
  'deviceApproval.title': 'Cấp quyền cho thiết bị',
  'deviceApproval.description':
    'Một dòng lệnh hoặc thiết bị khác yêu cầu đăng nhập bằng tài khoản này. Chỉ chấp thuận nếu chính mình đã bắt đầu việc đăng nhập đó.',
  'deviceApproval.enterCode': 'Nhập mã hiển thị trên thiết bị.',
  'deviceApproval.codeLabel': 'Mã',
  'deviceApproval.continue': 'Tiếp tục',
  'deviceApproval.checking': 'Đang kiểm tra mã…',
  'deviceApproval.confirm': 'Hãy kiểm tra mã này có khớp với mã trên thiết bị.',
  'deviceApproval.client': 'Yêu cầu từ {{client}}',
  'deviceApproval.approve': 'Chấp thuận',
  'deviceApproval.approving': 'Đang chấp thuận…',
  'deviceApproval.deny': 'Từ chối',
  'deviceApproval.denying': 'Đang từ chối…',
  'deviceApproval.approved':
    'Đã chấp thuận thiết bị. Hãy quay lại cửa sổ dòng lệnh để tiếp tục; có thể đóng trang này.',
  'deviceApproval.denied':
    'Đã từ chối yêu cầu. Thiết bị chưa được đăng nhập; có thể đóng trang này.',
  'deviceApproval.expired':
    'Mã này đã hết hạn. Hãy bắt đầu lại việc đăng nhập trên thiết bị.',
  'deviceApproval.invalid':
    'Mã này không hợp lệ. Hãy đối chiếu với thiết bị rồi thử lại.',
  'deviceApproval.notYours': 'Mã này đang được một tài khoản khác chấp thuận.',
  'deviceApproval.error': 'Đã xảy ra lỗi. Vui lòng thử lại.',
  'deviceApproval.retry': 'Thử lại',
  'deviceApproval.otherCode': 'Nhập mã khác',

  // The UI Library block of the `/inbox` page.
  'inbox.title': 'Hộp thư',
  'inbox.description': 'Thông báo và yêu cầu gửi đến tài khoản này.',
  'inbox.views.all': 'Tất cả',
  'inbox.views.todo': 'Cần xử lý',
  'inbox.kinds.label': 'Loại',
  'inbox.kinds.all': 'Mọi loại',
  'inbox.kinds.decision': 'Cần quyết định',
  'inbox.kinds.info': 'Thông báo',
  'inbox.tabs.decision': 'Chờ quyết định',
  'inbox.tabs.info': 'Thông báo',
  'inbox.clearFilter': 'Xóa bộ lọc',
  'inbox.noMatchDescription': 'Xóa bộ lọc để xem mọi loại.',
  'inbox.readAll': 'Đánh dấu tất cả đã đọc',
  'inbox.allRead': 'Đã đánh dấu tất cả là đã đọc.',
  'inbox.loading': 'Đang tải',
  'inbox.loadFailed': 'Không thể tải Hộp thư',
  'inbox.loadFailedDescription': 'Hãy kiểm tra kết nối rồi thử lại.',
  'inbox.retry': 'Thử lại',
  'inbox.loadMore': 'Tải thêm',
  'inbox.emptyAll': 'Chưa có gì',
  'inbox.empty.todo': 'Không có gì cần xử lý',
  'inbox.empty.decision': 'Không có việc nào chờ quyết định',
  'inbox.empty.info': 'Không có thông báo',
  'inbox.emptyDescription': 'Thông báo và yêu cầu gửi đến sẽ hiện ở đây.',
  'inbox.unread': 'Chưa đọc',
  'inbox.unreadCount': '{{count}} chưa đọc',
  'inbox.pendingDecisions': '{{count}} đang chờ',
  'inbox.resolved': 'Đã xử lý',
  'inbox.outcomes.approved': 'Đã duyệt',
  'inbox.outcomes.rejected': 'Đã từ chối',
  'inbox.outcomes.withdrawn': 'Đã rút lại',
  'inbox.count': '×{{count}}',
  'inbox.actionsFor': 'Thao tác cho {{title}}',
  'inbox.actions.read': 'Đánh dấu đã đọc',
  'inbox.actions.unread': 'Đánh dấu chưa đọc',
  'inbox.actions.delete': 'Xóa',
  'inbox.deleted': 'Đã xóa.',
  'inbox.requestFailed': 'Yêu cầu thất bại. Vui lòng thử lại.',
  'inbox.forbidden': 'Không được phép thực hiện thao tác này.',
  'inbox.nothingSelected': 'Chọn một mục để xem',
  'inbox.back': 'Quay lại danh sách',
  'inbox.open': 'Mở',
  'inbox.keyMove': 'Di chuyển',
  'inbox.keyOpen': 'Mở',
  'inbox.cancel': 'Hủy',
  'inbox.request.approve': 'Duyệt',
  'inbox.request.reject': 'Từ chối',
  'inbox.request.commentPlaceholder': 'Nhập nội dung…',
  'inbox.request.commentFor': '{{action}}: {{title}}',
  'inbox.request.quickSend': 'để gửi',
  'inbox.request.newLine': 'để xuống dòng',

  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Hộp thư',
  'inboxButton.pending': 'Hộp thư, {{count}} đang chờ',
  'inboxButton.unread': 'Hộp thư, {{count}} chưa đọc',
  'inboxButton.pendingHint':
    '{{count}} đang chờ xử lý; số này giảm khi các mục được xử lý.',
  'inboxButton.unreadHint':
    '{{count}} chưa đọc; số này giảm khi các mục được đọc.',
  'auth.welcome': 'Chào mừng trở lại',
  'auth.loginDescription':
    'Đăng nhập bằng tên đăng nhập hoặc email và mật khẩu.',
  'auth.registerTitle': 'Tạo tài khoản',
  'auth.registerDescription': 'Tạo tài khoản để bắt đầu.',
  'auth.registrationAccepted': 'Đã gửi yêu cầu đăng ký',
  'auth.registrationGuidance':
    'Hãy thử đăng nhập bằng tên đăng nhập và mật khẩu đã gửi. Nếu email này đã có tài khoản, thông tin mới sẽ không có hiệu lực. Hãy đăng nhập bằng tài khoản ban đầu hoặc khôi phục mật khẩu. Làm theo mọi hướng dẫn xác minh của ứng dụng (nếu có) trước khi đăng nhập.',
  'auth.forgotTitle': 'Quên mật khẩu',
  'auth.forgotDescription':
    'Nhập email, nếu tài khoản tồn tại thì liên kết đặt lại mật khẩu sẽ được gửi.',
  'auth.passwordResetUnavailable':
    'Chưa bật tính năng tự đặt lại mật khẩu. Hãy liên hệ quản trị viên để đặt lại mật khẩu.',
  'auth.capabilityLoadFailed':
    'Không thể kiểm tra việc đặt lại mật khẩu có khả dụng hay không.',
  'auth.retry': 'Thử lại',
  'auth.loading': 'Đang tải',
  'auth.resetDescription': 'Chọn mật khẩu mới cho tài khoản.',
  'auth.resetTitle': 'Đặt lại mật khẩu',
  'auth.identifier': 'Tên đăng nhập hoặc email',
  'auth.password': 'Mật khẩu',
  'auth.signIn': 'Đăng nhập',
  'auth.signingIn': 'Đang đăng nhập…',
  'auth.hidePassword': 'Ẩn mật khẩu',
  'auth.showPassword': 'Hiện mật khẩu',
  'auth.forgotLink': 'Quên mật khẩu?',
  'auth.noAccount': 'Chưa có tài khoản?',
  'auth.signUp': 'Đăng ký',
  'auth.createAccount': 'Tạo tài khoản',
  'auth.creatingAccount': 'Đang tạo tài khoản…',
  'auth.name': 'Họ tên',
  'auth.username': 'Tên đăng nhập',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Xác nhận mật khẩu',
  'auth.existingAccount': 'Đã có tài khoản?',
  'auth.passwordMismatch': 'Mật khẩu không khớp.',
  'auth.resetting': 'Đang đặt lại…',
  'auth.newPassword': 'Mật khẩu mới',
  'auth.confirmNewPassword': 'Xác nhận mật khẩu mới',
  'auth.invalidResetLink':
    'Liên kết đặt lại mật khẩu này không hợp lệ hoặc đã hết hạn.',
  'auth.backToSignIn': 'Quay lại đăng nhập',
  'auth.sendResetLink': 'Gửi liên kết đặt lại',
  'auth.sending': 'Đang gửi…',
  'auth.resetSent': 'Nếu tài khoản tồn tại, liên kết đặt lại đã được gửi.',
  'auth.rememberPassword': 'Đã nhớ mật khẩu?',
  'auth.methods': 'Phương thức đăng nhập',
  'auth.or': 'Hoặc tiếp tục với',
  'auth.continueWith': 'Tiếp tục với {provider}',
  'auth.about': 'Giới thiệu ứng dụng',
  'auth.platform': 'Cờ vua Dương Sinh · Vui trí tuệ',
  'auth.marketingTitleFirst': 'Cờ vua Dương Sinh',
  'auth.marketingTitleSecond': 'Vui trí tuệ',
  'auth.marketingDescription':
    'Ứng dụng quản lý đào tạo cờ vua cho trẻ em: học viên, phụ huynh và lớp học.',
  'auth.frontend': 'Quản lý đào tạo',
  'auth.frontendDescription': 'Theo dõi học viên, phụ huynh và lớp học.',
  'auth.foundation': 'Cờ vua Dương Sinh',
  'auth.foundationDescription': 'Dữ liệu, phân quyền và quản trị tập trung.',
  'auth.marketingFooter': 'Cờ vua Dương Sinh · Vui trí tuệ',
  'status.loading': 'Đang tải',
  'status.refreshing': 'Đang làm mới',
  'status.loadingPage': 'Đang tải trang',
  'status.denied': 'Không có quyền truy cập',
  'status.pageFailed': 'Không thể tải trang',
  'status.retry': 'Thử lại',
  'status.reloadPage': 'Tải lại trang',
  'status.retryFailedDescription':
    'Vẫn chưa tải được. Tải lại toàn bộ trang có thể giúp ích; các thay đổi chưa lưu trên trang này có thể bị mất.',
  'navigation.brandHome': 'Trang chủ Cờ vua Dương Sinh',
  'navigation.brandApps': 'Các ứng dụng của Cờ vua Dương Sinh',
  'routeOverlay.close': 'Đóng',
  'status.deniedDescription': 'Không có quyền truy cập {{label}}.',
  'status.routeFailedDescription':
    'Không thể tải tuyến {{label}} từ {{packageName}}.',
  shell: {
    // No <brand> tag on purpose: the footer links the tagged text to nocobase.com.
    brandPartnership: 'Cờ vua Dương Sinh',
    buildReliableSystems: 'Vui trí tuệ',
  },
  home: {
    platform:
      'Cờ vua Dương Sinh · Vui trí tuệ · Quản lý đào tạo cờ vua cho trẻ em',
    title: 'Mô tả nhu cầu, trợ lý lập trình sẽ xây dựng',
    description:
      'Ứng dụng này được phát triển bằng cách trao đổi với trợ lý lập trình. Hãy nêu nhu cầu nghiệp vụ bằng lời thường, trợ lý sẽ viết các trang, mô hình dữ liệu, API và quy trình nghiệp vụ trong dự án này.',
    steps: {
      describe: {
        title: 'Mô tả nhu cầu',
        description:
          'Nêu ai sử dụng, lưu những dữ liệu nào và cần xảy ra điều gì.',
      },
      build: {
        title: 'Để trợ lý xây dựng',
        description: 'Trợ lý đọc dự án và các khả năng có sẵn, sau đó viết mã.',
      },
      review: {
        title: 'Kiểm tra và hoàn thiện',
        description:
          'Làm mới trang để dùng thử, rồi tiếp tục yêu cầu thay đổi theo cách tương tự.',
      },
    },
    example: {
      title: 'Thử một yêu cầu như sau',
      text: 'Xây dựng ứng dụng đơn mua hàng.\n\nMỗi đơn có số đơn, mặt hàng, người đề nghị, số tiền và trạng thái duyệt. Người đề nghị tạo đơn và chỉ thấy đơn của mình; người duyệt thấy mọi đơn đang chờ và duyệt hoặc từ chối.\nSau khi có quyết định, gửi thông báo vào Hộp thư của người đề nghị kèm liên kết tới đơn.',
      hint: 'Dán vào Claude Code, Codex, Cursor hoặc bất kỳ trợ lý lập trình nào đang mở trong dự án này.',
    },
    capabilitiesTitle: 'Khả năng có sẵn',
    capabilitiesDescription:
      'Trợ lý dùng trực tiếp các khả năng này thay vì xây dựng lại từ đầu. Mở một mục để lấy lời nhắc có thể chỉnh sửa và sao chép.',
    viewPrompts: 'Xem lời nhắc ({{count}})',
    prompt: {
      label: 'Lời nhắc',
      hint: 'Hãy chỉnh lời nhắc cho phù hợp nghiệp vụ trước khi sao chép. Thay đổi không được lưu sau khi đóng hộp thoại.',
      copy: 'Sao chép',
      copiedShort: 'Đã chép',
      copied: 'Đã sao chép lời nhắc',
      copyFailed: 'Không thể sao chép. Hãy chọn văn bản và sao chép thủ công.',
      reset: 'Khôi phục mặc định',
    },
    capabilities: {
      auth: {
        title: 'Xác thực',
        description:
          'Đăng nhập, đăng ký, đặt lại mật khẩu và đăng nhập một lần của công ty.',
        prompts: {
          disableSignUp: {
            label: 'Đóng đăng ký',
            text: 'Ứng dụng này chỉ dành cho nhân viên công ty. Quản trị viên tạo mọi tài khoản.\nTắt tính năng tự đăng ký và gỡ liên kết đăng ký khỏi trang đăng nhập.\nNhân viên hiện có vẫn phải đăng nhập được bằng tài khoản và mật khẩu của mình.\nGiữ liên kết quên mật khẩu.',
          },
          companySso: {
            label: 'SSO của công ty',
            text: 'Cho phép nhân viên đăng nhập bằng nền tảng định danh của công ty qua OIDC.\n\nGiữ đăng nhập bằng tài khoản và mật khẩu, thêm nút Tài khoản công ty.\nNút này mở nền tảng định danh của công ty. Sau khi đăng nhập thành công, quay về trang chủ của ứng dụng.\n\nCho phép lần đăng nhập đầu tiên tạo tài khoản ứng dụng, được nhận diện bằng mã định danh người dùng ổn định của nền tảng.\nKhông tự động liên kết tài khoản bằng cách so khớp tên hoặc email. Tài khoản mới dùng quyền mặc định của ứng dụng.\n\nLiệt kê thông tin mà quản trị viên nền tảng định danh phải cung cấp và địa chỉ callback cần đăng ký.',
          },
          apiKeys: {
            label: 'Khóa API',
            text: 'Thêm mục Khóa tích hợp vào menu người dùng, dùng khả năng khóa API có sẵn của ứng dụng.\nNhân viên chỉ quản lý các khóa do chính mình tạo, nhập mục đích và thời hạn hiệu lực tính theo ngày.\nChỉ hiển thị khóa đầy đủ một lần sau khi tạo, kèm lời nhắc sao chép và lưu lại ngay.\nDanh sách hiện tên, một đoạn nhận diện, trạng thái, ngày hết hạn và lần dùng gần nhất của từng khóa, cho phép thu hồi sau khi xác nhận.\nKhông bao giờ hiển thị khóa đầy đủ trong danh sách, nhật ký hay chi tiết.',
          },
        },
      },
      dataSources: {
        title: 'Nguồn dữ liệu',
        description:
          'Chọn cơ sở dữ liệu của ứng dụng và dùng dữ liệu nghiệp vụ từ các cơ sở dữ liệu ngoài hiện có.',
        prompts: {
          postgres: {
            label: 'Đổi cơ sở dữ liệu',
            text: 'Chuyển cơ sở dữ liệu của ứng dụng từ SQLite sang PostgreSQL.\nĐọc thông tin kết nối từ cấu hình chạy của máy chủ, không đọc từ mã nguồn.\nGiải thích cần cài trình điều khiển cơ sở dữ liệu nào và cần điền những thiết lập nào, đồng thời nhắc rằng dữ liệu hiện có không được tự động di chuyển.',
          },
          externalDatabase: {
            label: 'Cơ sở dữ liệu ngoài',
            text: 'Kết nối cơ sở dữ liệu tài chính hiện có của công ty làm nguồn dữ liệu ngoài chỉ đọc; không sửa các bảng của nó.\nĐối chiếu bản ghi theo mã nhà cung cấp và thêm mục Thanh toán vào chi tiết nhà cung cấp, hiển thị chu kỳ thanh toán, hạn mức công nợ và trạng thái thanh toán, có ghi rõ nguồn.\nTiếp tục đọc thông tin liên hệ nhà cung cấp từ cơ sở dữ liệu của ứng dụng, và đọc dữ liệu thanh toán trực tiếp từ cơ sở dữ liệu ngoài mà không nhập vào.\nĐọc thông tin xác thực kết nối từ cấu hình chạy của máy chủ.',
          },
        },
      },
      authorization: {
        title: 'Phân quyền',
        description:
          'Kiểm soát ai được mở trang nào, thực hiện thao tác nào và xem bản ghi nào.',
        prompts: {
          jobs: {
            label: 'Vai trò công việc',
            text: 'Tạo các vai trò Người đề nghị mua hàng và Người duyệt đơn cho ứng dụng.\nNgười đề nghị mua hàng vào được trang đơn hàng và xem các đơn do mình đề nghị.\nNgười duyệt đơn vào được trang đơn hàng, xem đơn, duyệt hoặc từ chối các đơn đang chờ.\nChỉ quản trị viên ứng dụng được đổi quyền và việc gán vai trò.\nDùng khả năng phân quyền sẵn có của ứng dụng để quản trị viên sau này có thể điều chỉnh quyền và gán người.',
          },
          dataScopes: {
            label: 'Phạm vi dữ liệu',
            text: 'Người đề nghị mua hàng chỉ xem đơn của chính mình, dựa vào trường người đề nghị của đơn để xác định chủ sở hữu.\nNgười duyệt đơn xem được mọi đơn và xử lý các đơn đang chờ duyệt.\nQuản trị viên có thể điều chỉnh phạm vi xem đơn của từng vai trò trong bộ quyền của vai trò đó.',
          },
          restrictions: {
            label: 'Hạn chế',
            text: 'Bob tạm thời hỗ trợ duyệt đơn mua hàng và chỉ được xem các đơn từ 2.000 trở xuống.\nThêm giới hạn số tiền vào thao tác Xem đơn của Bob, giữ nguyên vai trò và phạm vi dữ liệu hiện có.\nÁp dụng giới hạn cho đơn của chính Bob và đơn được chia sẻ cho Bob.\nQuản trị viên có thể đổi số tiền hoặc gỡ quy tắc; trước khi gỡ, giải thích rằng phạm vi xem của Bob có thể mở rộng.',
          },
        },
      },
      workflow: {
        title: 'Quy trình',
        description:
          'Chuyển bản ghi nghiệp vụ qua các giai đoạn, có chờ đợi, hết hạn, thử lại và lịch sử ai đã làm gì.',
        prompts: {
          stages: {
            label: 'Giai đoạn',
            text: 'Thêm quy trình cho đơn mua hàng: Chờ duyệt → Chờ mua → Đã nhận → Hoàn tất.\nNgười duyệt chấp thuận hoặc từ chối; từ chối phải có lý do và trả đơn về cho người đề nghị sửa rồi gửi lại.\nSau khi người mua đặt hàng, đơn ở trạng thái chờ mua; xác nhận giao hàng bằng biên nhận có ký sẽ chuyển sang Đã nhận, và người đề nghị xác nhận thì hoàn tất.\nChi tiết đơn chỉ cung cấp các thao tác của giai đoạn hiện tại, và chỉnh sửa thông thường không được đổi giai đoạn.\nKiểm tra giai đoạn và thông tin bắt buộc trên máy chủ, không bao giờ ghi đè kết quả mà người khác đã gửi.',
          },
          backgroundExport: {
            label: 'Xuất dữ liệu nền',
            text: 'Thêm trang báo cáo đơn hàng, xuất các đơn hiện có ra CSV.\nSau khi gửi, yêu cầu xuất chờ được xử lý, được tạo ở chế độ nền và hoàn tất kèm liên kết tải xuống.\nHiển thị giai đoạn hiện tại, tên tệp, số đơn đã xuất, cùng bản ghi gửi yêu cầu và bản ghi xử lý của hệ thống.\nThử lại việc tạo thất bại theo quy tắc, và giữ trạng thái thất bại cuối cùng để chủ sở hữu xử lý; chạy lại không được tạo ra tệp báo cáo trùng lặp.\nGiữ tiến trình và kết quả hiển thị sau khi làm mới trang, và chỉ cho phép người có quyền xuất đơn hàng.',
          },
          history: {
            label: 'Lịch sử',
            text: 'Hiển thị giai đoạn hiện tại và lịch sử xử lý trong chi tiết đơn.\nMỗi mục cho biết ai thực hiện, khi nào, thao tác gì, giai đoạn trước và sau, cùng lý do từ chối hoặc biên nhận có ký nếu có.\nĐánh dấu các thao tác tự động là do hệ thống thực hiện.\nGiữ tiến trình và lịch sử sau khi làm mới trang, để có thể xem lại toàn bộ quy trình khi đã hoàn tất.',
          },
        },
      },
      scheduler: {
        title: 'Tác vụ định kỳ',
        description:
          'Chạy công việc nghiệp vụ vào những thời điểm định sẵn, và xem lần chạy kế tiếp cùng kết quả.',
        prompts: {
          reminder: {
            label: 'Nhắc việc hằng ngày',
            text: 'Thêm Nhắc đơn đang chờ vào ứng dụng đơn hàng hiện có.\n\nLúc 09:00 giờ Bắc Kinh các ngày làm việc trong tuần, tìm các đơn đang chờ duyệt, nhóm theo người duyệt và gửi cho mỗi người duyệt một thông báo trong ứng dụng.\nKèm số đơn đang chờ và liên kết tới danh sách đơn đang chờ. Không gửi gì nếu không có đơn nào đang chờ.\nQuản trị viên có thể xem lịch chạy và bản ghi thực thi, đồng thời tạm dừng hoặc tiếp tục việc nhắc.',
          },
          weeklyReport: {
            label: 'Báo cáo hằng tuần',
            text: 'Lúc 08:00 giờ Bắc Kinh mỗi thứ Hai, tạo bản tổng hợp doanh số tuần trước và thông báo cho trưởng phòng kinh doanh.\nBao gồm doanh thu bán hàng, số đơn và tổng theo khu vực. Quản trị viên có thể xem tác vụ và bản ghi thực thi.',
          },
        },
      },
      notification: {
        title: 'Thông báo',
        description:
          'Gửi tin nhắn trong ứng dụng, email hoặc tin nhắn bot nhóm khi có sự kiện xảy ra.',
        prompts: {
          inApp: {
            label: 'Tin nhắn trong ứng dụng',
            text: 'Thêm tính năng duyệt đơn vào ứng dụng hiện tại và thông báo kết quả cho người đề nghị qua tin nhắn trong ứng dụng.\n\nĐơn gồm số đơn, tên, người đề nghị, số tiền và trạng thái duyệt.\nNgười đề nghị xem được đơn của mình. Người duyệt xem các đơn đang chờ và duyệt hoặc từ chối. Tái sử dụng các tính năng đơn hàng và duyệt đơn nếu đã có.\n\nSau khi duyệt hoặc từ chối, chỉ gửi một tin nhắn trong ứng dụng cho người đề nghị của đơn đó.\nTiêu đề cho biết đơn được duyệt hay bị từ chối. Nội dung gồm số đơn, tên và kết quả duyệt.\nNhấn vào tin nhắn sẽ mở chi tiết đơn tương ứng.\nKhông gửi khi việc duyệt còn đang chờ. Cùng một kết quả duyệt chỉ thông báo một lần.\nThông báo lỗi không ảnh hưởng đến kết quả duyệt đã lưu.',
          },
          email: {
            label: 'Email',
            text: 'Thêm email vào các thông báo duyệt đơn hiện có, dùng kênh email đã cấu hình của ứng dụng.\n\nSau khi đơn được duyệt hoặc bị từ chối, gửi kết quả đến email tài khoản của người đề nghị.\nTiêu đề có số đơn, nội dung có tên đơn và kết quả.\nGiữ các tin nhắn trong ứng dụng hiện có. Nếu người đề nghị không có địa chỉ email, chỉ gửi tin nhắn trong ứng dụng.\nEmail lỗi không được ảnh hưởng đến kết quả duyệt hay tin nhắn trong ứng dụng.',
          },
        },
      },
      mail: {
        title: 'Thư',
        description:
          'Kết nối hộp thư cá nhân, rồi đọc, trả lời và gửi email nghiệp vụ.',
        prompts: {
          providers: {
            label: 'Nhà cung cấp thư',
            text: 'Cấu hình mailbox.org cho ứng dụng trong mail.providers của cấu hình máy chủ:\n- Máy chủ nhận IMAP: imap.mailbox.org, cổng 993, SSL/TLS.\n- Máy chủ gửi SMTP: smtp.mailbox.org, cổng 465, SSL/TLS.\nNgười dùng tự nhập địa chỉ email, tên đăng nhập và mật khẩu trên trang tài khoản hộp thư, và chọn ngày bắt đầu đồng bộ lần đầu; không bao giờ ghi mật khẩu hộp thư vào cấu hình hay mã nguồn.',
          },
          mailCenter: {
            label: 'Trung tâm thư',
            text: 'Tính năng thư đã có sẵn trong ứng dụng này; hãy tái sử dụng thay vì xây lại hoặc cài thêm plugin khác.\nThêm các trang Trung tâm thư và Tài khoản hộp thư vào thanh điều hướng, dùng trang không gian thư và trang tài khoản hộp thư mà khả năng thư cung cấp.\nNgười dùng có thể kết nối hộp thư của mình, đồng bộ thư đến, đọc thư và tệp đính kèm, và trả lời, giữ nguyên tiêu đề cùng ngữ cảnh cuộc trò chuyện, gửi thư trả lời đến người gửi gốc.\nMỗi người dùng chỉ làm việc với các hộp thư do chính mình kết nối.',
          },
          correspondence: {
            label: 'Email khách hàng',
            text: 'Thêm mục thư từ vào chi tiết khách hàng, tái sử dụng các thành phần đọc thư và soạn thư có sẵn của ứng dụng.\nHiển thị các thư có người gửi hoặc người nhận trùng với địa chỉ email liên hệ của khách hàng hiện tại. Nhân viên kinh doanh có thể đọc thư, xem tệp đính kèm và trả lời bằng hộp thư do chính mình kết nối.',
          },
        },
      },
      file: {
        title: 'Tệp',
        description:
          'Tải tệp lên, đính kèm vào bản ghi, và xem trước hoặc tải xuống.',
        prompts: {
          attachments: {
            label: 'Tệp đính kèm',
            text: 'Thêm tệp đính kèm mua hàng vào ứng dụng quản lý đơn hàng hiện có.\n\nThêm khu vực tệp đính kèm vào chi tiết đơn. Mỗi đơn có thể có nhiều tệp, gồm PDF, ảnh và DOCX.\nHiển thị tên tệp và dung lượng, kèm các thao tác xem trước, tải xuống và gỡ tệp đính kèm.\nSau khi tải lên, cho phép lưu các tệp đính kèm vào đơn hiện tại. Giữ chúng khi mở lại đơn.\nBất kỳ ai có quyền truy cập đơn đều xem và tải được tệp đính kèm của đơn. Người đề nghị và người duyệt có thể thêm hoặc gỡ tệp đính kèm.\nGỡ tệp đính kèm chỉ hủy liên kết với đơn hiện tại; vẫn giữ lại tệp.',
          },
          avatar: {
            label: 'Ảnh đại diện',
            text: 'Thêm ảnh đại diện cho mỗi nhân viên, mỗi nhân viên một ảnh.\nHỗ trợ tải lên và thay ảnh đại diện, hiển thị trong danh sách và chi tiết nhân viên.\nDùng ảnh mới sau khi thay và vẫn hiển thị sau khi làm mới trang.',
          },
        },
      },
      i18n: {
        title: 'Ngôn ngữ',
        description:
          'Đổi ngôn ngữ giao diện, thêm ngôn ngữ và đặt ngôn ngữ mặc định.',
        prompts: {
          addLanguage: {
            label: 'Thêm ngôn ngữ',
            text: 'Thêm tiếng Tây Ban Nha vào ứng dụng. Dịch giao diện và các thông báo của máy chủ, đồng thời thêm tiếng Tây Ban Nha vào menu ngôn ngữ.',
          },
          defaultLanguage: {
            label: 'Ngôn ngữ mặc định',
            text: 'Đặt tiếng Trung giản thể làm ngôn ngữ mặc định của ứng dụng cho những người chưa chọn ngôn ngữ. Vẫn giữ tiếng Anh trong menu ngôn ngữ.',
          },
        },
      },
      theme: {
        title: 'Giao diện',
        description:
          'Điều chỉnh màu sắc, phông chữ và mật độ, và chuyển giữa nền sáng và nền tối.',
        prompts: {
          changeTheme: {
            label: 'Đổi giao diện',
            text: 'Cập nhật giao diện Gọn: dùng màu xanh dương làm màu chính và tăng nhẹ độ bo góc. Giữ nguyên phông chữ, cỡ chữ và khoảng cách gọn hiện tại.',
          },
          newTheme: {
            label: 'Giao diện mới',
            text: 'Tạo giao diện Rừng xanh với màu xanh lá làm màu chính, nền dịu, góc bo vừa phải và bóng đổ nhẹ.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Giao diện',
    mode: 'Chế độ màu',
    preset: 'Giao diện',
    light: 'Sáng',
    dark: 'Tối',
    system: 'Theo hệ thống',
    themes: { default: 'Rộng rãi', compact: 'Gọn' },
  },
  app: {
    title: 'NocoEdu',
  },
  actions: {
    close: 'Đóng',
    save: 'Lưu',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    language: 'Ngôn ngữ',
  },
  notices: {
    serverLocaleFallback:
      'Máy chủ không hỗ trợ ngôn ngữ này nên các thông báo của máy chủ sẽ dùng tiếng Anh.',
    languageChangeFailed: 'Không thể đổi ngôn ngữ. Vui lòng thử lại.',
  },
  account: {
    signOutFailed: 'Không thể đăng xuất. Vui lòng thử lại.',
    openMenu: 'Mở menu tài khoản',
    fallback: 'Tài khoản',
    signOut: 'Đăng xuất',
    signingOut: 'Đang đăng xuất…',
  },
  navigation: {
    home: 'Trang chủ',
    open: 'Mở thanh điều hướng',
    close: 'Đóng thanh điều hướng',
    expand: 'Mở rộng thanh điều hướng',
    collapse: 'Thu gọn thanh điều hướng',
    toggle: 'Mở rộng hoặc thu gọn thanh điều hướng',
    label: 'Điều hướng ứng dụng',
    description: 'Đi tới một trang của ứng dụng này.',
    breadcrumb: 'Đường dẫn',
    breadcrumbMore: 'Hiện các cấp ở giữa',
    back: 'Quay lại',
    backTo: 'Quay lại {{label}}',
  },
  dataTable: {
    noResults: 'Không có kết quả',
    sortAscending: 'Tăng dần',
    sortDescending: 'Giảm dần',
    hideColumn: 'Ẩn',
    view: 'Hiển thị',
    toggleColumns: 'Bật/tắt cột',
    selectedCount: 'Đã chọn {{selected}}/{{total}} dòng.',
    rowsPerPage: 'Số dòng mỗi trang',
    pageOf: 'Trang {{page}}/{{pageCount}}',
    firstPage: 'Đến trang đầu',
    previousPage: 'Đến trang trước',
    nextPage: 'Đến trang sau',
    lastPage: 'Đến trang cuối',
  },
  datePicker: {
    placeholder: 'Chọn ngày',
    rangePlaceholder: 'Chọn khoảng ngày',
  },
};

export default systemViVN;
