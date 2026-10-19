# Cài đặt chung — audit và phạm vi triển khai

> Báo cáo của lần triển khai trước. Trạng thái cập nhật theo yêu cầu mới nằm trong [GENERAL-SETTINGS-UPDATE.md](GENERAL-SETTINGS-UPDATE.md); phương án cần xác nhận nằm trong [FINANCIAL-CASHFLOW-PLAN.md](FINANCIAL-CASHFLOW-PLAN.md).

## Kiến trúc đã kiểm tra

- `dashboard.html` là giao diện quản lý tĩnh. `src/settings` là bản preview React độc lập, không phải màn hình cấu hình nghiệp vụ đang dùng. Không tích hợp preview hoặc dữ liệu mẫu vào màn hình thật.
- `data.js` (`RHD`) là nguồn dữ liệu nghiệp vụ trong localStorage, phân biệt `live` / `demo`. Không có database, API hay migration backend.
- `RHD.getSettings/saveSettings` lưu cấu hình theo tài khoản quản lý tại khóa `residenthub_settings_v1_<id>`; merge theo trường, không thay toàn bộ cấu hình. Bản preview cũng dùng định dạng khóa này nhưng schema khác; không tự chuyển đổi hay ghi đè phần dữ liệu preview còn tồn tại.
- `auth.js` (`RH`) quản lý tài khoản và hộp thư (`residenthub_internal_data`). `createNotificationForUser` hỗ trợ chống trùng bằng campaignId; hộp thư hiện có hỗ trợ đã đọc/chưa đọc, refType/refId/actionUrl. Tái sử dụng hàm xác định người nhận của RH bằng export chỉ đọc `resolveNotificationRecipients`.
- `permissions.js` (`RHP`) là nguồn quyền và phạm vi tòa. Không thêm quyền, sửa vai trò hoặc thay cách phân quyền. UI mới dùng `settings.view/update`, `buildings.view`, quyền xem module nguồn và `notifications.create`.
- Tài khoản nhận tiền hiện nằm trong `building.config.bankName/bankAccountNumber/bankAccountHolder`. Thu chi đang lưu phương thức và tài khoản dạng chuỗi, chưa tham chiếu ID tài khoản ngân hàng.
- `resident-live-workspaces.js` đã có VietQR theo ngân hàng/số tài khoản/mã hóa đơn và thao tác chuyển sang `payment_pending`. `RHUI.markInvoicePaid` dùng `invoices.collect` để quản lý xác nhận; hóa đơn có history. Không tạo luồng thanh toán khác.
- **Rủi ro đã xác định:** bản in hóa đơn đọc thông tin ngân hàng hiện tại từ tòa, không có snapshot tài khoản tại lúc phát hành. Trạng thái `payment_pending` chưa thống nhất hoàn toàn giữa luồng cư dân và điều kiện xác nhận của quản lý. Không sửa hai nghiệp vụ này trong nhiệm vụ hiện tại.
- Nhắc hạn trên trang cư dân đang chạy trong trình duyệt, có lịch/khóa chống trùng riêng; chưa có worker hoặc scheduler chung. Cấu hình RHD theo người quản lý chưa có quy tắc sở hữu chung theo tòa cho mọi phiên cư dân.

## Đã triển khai an toàn

UI mới chỉ nằm ở **Cài đặt → Cài đặt cơ bản → Cài đặt chung**, gồm 3 mục. Không đổi Dashboard, Tòa nhà, Hóa đơn, Hợp đồng, Thu chi hay giao diện cư dân.

1. **Thông báo:** dùng các cờ và số ngày nhắc sẵn có của RHD; lưu mẫu tiếng Việt với biến động có allowlist, chèn biến tại con trỏ; kiểm tra quyền tại thao tác lưu/gửi. Thêm duy nhất trường tùy chọn `notificationTemplates` vào settings, mặc định `{}`. Đồng bộ chủ động bằng nút, dùng dữ liệu thật, người nhận và hộp thư RH. Chỉ lấy hóa đơn có `issuedAt`, trạng thái đã phát hành/chờ xác nhận, số tiền hợp lệ; hợp đồng phải `active`. Loại Demo và tài khoản nhận bị khóa; giới hạn theo RHP. Campaign ID ổn định theo đối tượng/lần phát hành/hạn/ngày nhắc; kiểm tra thông báo cũ để hạn chế gửi lại từ luồng legacy. Không tự tạo hóa đơn/hợp đồng hoặc đánh dấu đã thanh toán.
2. **Tài chính:** danh sách chỉ đọc từ cấu hình tòa thật, giữ số 0 đầu tài khoản; kiểm tra quyền/phạm vi tòa. Hiển thị rõ giới hạn thay đổi tài khoản do chưa có snapshot hóa đơn. Không tạo kho tài khoản riêng, không sửa thông tin ngân hàng hoặc ảnh QR.
3. **Nhật ký:** thêm hook tùy chọn sau các thao tác RHD create/update/remove/saveSettings thành công. Ghi người thực hiện, vai trò hiện tại, thời gian, đối tượng, module, kết quả, trước/sau từ allowlist. Không ghi password/token/biên lai/nội dung hồ sơ cư dân. Nhật ký mới lưu localStorage `residenthub_<mode>_activity_v1`, không tạo lịch sử giả. Tìm theo người dùng, khoảng ngày Bangkok, module và hành động; mở sidebar chi tiết; không có chức năng sửa/xóa. Admin xem toàn bộ; người có `settings.view` xem log tòa trong phạm vi và log không gắn tòa do chính họ thực hiện. Lỗi ghi log không đổi kết quả nghiệp vụ, được báo khi mở Cài đặt; log hỏng không bị reset/ghi đè.

Lưu cấu hình mới cập nhật lại các ô cấu hình cũ cùng trường trong form để lần lưu form cũ không phục hồi giá trị lỗi thời. Enter trong ô nhập của UI mới không submit form cấu hình cũ.

## File thay đổi và dependency

- `dashboard.html`: nạp script/CSS, đặt host ở Cài đặt cơ bản, gọi mount khi mở Cài đặt.
- `general-settings.js`, `general-settings.css`: UI/service nhỏ, CSS giới hạn hoàn toàn dưới `#rh-general-settings`.
- `data.js`: thêm default cấu hình tùy chọn, hook audit sau ghi; không thay công thức, trạng thái nghiệp vụ hoặc schema bản ghi hiện có.
- `auth.js`: export hàm xác định người nhận có sẵn; không sửa logic xác thực hoặc đồng bộ.
- `tests/general-settings.test.mjs`, `tests/general-settings.browser.mjs`: fixture trong bộ nhớ/profile Edge tạm, không đụng dữ liệu người dùng.

Không đổi dependency, cấu trúc thư mục, permission schema, route module khác; không commit/push/merge/chuyển branch.

## Phần dừng và phương án cần thống nhất trước

Đây là **triển khai phần an toàn, chưa đạt toàn bộ tiêu chí nghiệm thu**:

- Thêm/sửa/ngừng sử dụng nhiều tài khoản, gán nhiều tòa, chọn mặc định: cần mô hình tham chiếu tài khoản và snapshot thông tin nhận tiền tại phát hành hóa đơn/hợp đồng. Đề xuất bổ sung trường tùy chọn, chỉ áp dụng cho nghiệp vụ phát hành mới; không tự gán hay thay thông tin trên hóa đơn đã phát hành. Dữ liệu cũ cần phương án xác minh lịch sử riêng, không lấy tài khoản hiện tại làm lịch sử giả.
- Xác minh/từ chối chuyển khoản, mã giao dịch/biên lai, người xác nhận và đối soát: cần mở rộng luồng thanh toán hiện có và xử lý sự không thống nhất của `payment_pending`, không xây module song song. Chưa thực hiện do liên quan luồng hóa đơn/thu chi/cư dân ngoài phạm vi. Không tự động xác nhận thanh toán.
- Scheduler, Email, cấu hình chung theo tòa và thông báo tự động ở mọi phiên người dùng: cần thống nhất phạm vi sở hữu cấu hình và một dispatcher chung trước khi thay các luồng nhắc hạn legacy. Bản này chỉ đồng bộ chủ động trong Cài đặt; không đảm bảo chống trùng toàn hệ thống giữa các phiên chạy đồng thời vì localStorage không có transaction. Không gọi đây là dịch vụ gửi tự động chạy nền.
- Mẫu hỗ trợ và mẫu hoạt động tòa nhà chưa nối vào dispatcher chung. Cờ hỗ trợ tiếp tục dùng luồng hiện tại; hoạt động tòa nhà tiếp tục dùng module Quản lý thông báo. Không hiển thị nút lưu mẫu chưa được dùng.
- Nhật ký login/logout, thay đổi quyền/tài khoản và mọi nguồn ghi ngoài RHD trên dashboard: cần hook tối thiểu dùng chung tại nguồn thao tác, kể cả trang đăng nhập/cư dân. Bản này chưa bao phủ các nguồn đó, không suy diễn login từ lần mở trang. Sidebar ghi rõ giới hạn. Phần tạo/sửa/xóa được ghi dưới action chuẩn, phê duyệt/chuyển trạng thái thể hiện qua before/after khi đi qua RHD.
- Nhật ký và quyền bền vững đa thiết bị, chống can thiệp, lưu trữ dài hạn: cần backend kiểm tra quyền/phạm vi và kho append-only. localStorage chỉ bền vững trên trình duyệt hiện tại, có thể bị người dùng chỉnh bằng công cụ trình duyệt. Không tuyên bố có kiểm soát quyền phía server.

## Kiểm thử

- `npm run build`: **PASS** (TypeScript và hai bundle hiện có).
- `node tests/general-settings.test.mjs`: **PASS** — RH/RHD/RHP thật với dữ liệu thử trong bộ nhớ; quyền, scope, cư dân liên quan, khóa/Demo/nháp/đã trả bị loại, chống lặp, đã đọc, mẫu và ngày nhắc, before/after, dữ liệu nhạy cảm, log hỏng được giữ nguyên, không thay hóa đơn/ngân hàng.
- `node tests/general-settings.browser.mjs`: **PASS** — Edge headless/profile tạm: ba tab, chèn biến, lưu, đồng bộ control cũ, số 0 đầu tài khoản, escape HTML, sidebar, bộ lọc, 1280/375/320px. CDP trong sandbox timeout ngay ở Page.enable; chạy ngoài sandbox được auto-review cho phép và pass.
- `node src/settings/settingsStore.test.mjs`: **PASS** — kiểm thử preview cũ.
- `node src/invoices/domain.test.mjs`: **PASS** — tổng tiền, ngày hạn, trạng thái và thanh toán một phần/toàn bộ ở domain hiện có.
- `node src/invoices/billing.integration.test.mjs`: **FAIL có sẵn**, dòng 66: `needsRecalculation` là undefined thay vì true. Chạy lại cùng test với `git show HEAD:data.js` có cùng lỗi.
- `node tests/workflows.test.mjs`: **FAIL có sẵn**, dòng 42: tạo hợp đồng vượt tài sản trả true thay vì false. Chạy lại cùng test với `git show HEAD:data.js` có cùng lỗi. Không sửa ngoài phạm vi.
- `node --check` các JS thay đổi và `git diff --check`: **PASS**. Build không để lại thay đổi bundle trong git diff.

Chưa thể xác nhận mọi module cũ hoạt động bình thường khi các test hồi quy có sẵn còn lỗi. Các thay đổi nghiệp vụ thanh toán, tài khoản và phân quyền được giữ ngoài bản triển khai này.
