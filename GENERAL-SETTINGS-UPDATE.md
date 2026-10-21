# Cập nhật 3 mục Cài đặt chung

## Audit bổ sung

- Tiếp tục dùng UI/service đã triển khai, không tích hợp bản preview React hoặc tạo giao dịch mẫu.
- Chưa có danh mục tài khoản/sổ quỹ có ID trong dữ liệu thực. `building.config.bank*` là thông tin nhận tiền, không phải sổ quỹ; giữ nguyên hoàn toàn.
- Thu chi dùng `RHD.list/create/update/remove('cashflows')`. Phiếu lưu `accountName`/`paymentMethod` dạng chuỗi, không có quan hệ ID bắt buộc. Form nhập tay, CSV và thao tác xóa cùng sử dụng RHD. Hiện chưa kiểm tra ngày khóa kỳ.
- Không thể tự suy luận rằng mọi phiếu có cùng tên là cùng một tài khoản, đặc biệt giữa nhiều quản lý. Không tự gán lại dữ liệu cũ hoặc sửa tên trên phiếu.
- Danh mục mới lưu bằng RHD tại `residenthub_<mode>_financialAccounts`, không có kho giao dịch mới. Tài khoản thuộc người tạo; admin xem toàn bộ, người có quyền Cài đặt chỉ xem/quản lý tài khoản của mình. Quyền hiện có `settings.view` và `settings.update` được kiểm tra ở service và UI; không thay schema phân quyền.
- Nhật ký cũ `residenthub_<mode>_activity_v1` được giữ và tái sử dụng. Chuyển hàm append/allowlist sang service không có UI để nguồn đăng nhập, tài khoản và quyền có thể dùng chung. Không đổi schema bản ghi cũ.

## Chức năng đã hoàn thành

### Tài khoản tài chính

- Bảng đúng cột: mã duy nhất, thao tác, tên, loại, số dư đầu kỳ, tồn quỹ, ghi chú. Tìm mã/tên, nút thêm và empty state.
- Modal thêm/sửa hỗ trợ tiền mặt, ngân hàng, ví điện tử; trường hiển thị theo loại. Tên/ngày/số tiền dùng chung, dữ liệu riêng ngân hàng/ví giữ lại khi chuyển qua lại trong modal.
- Ngân hàng dùng dropdown gợi ý có tìm kiếm của trình duyệt; kiểm tra phải chọn giá trị hợp lệ trong danh sách. Tài khoản ngân hàng lưu chuỗi, giữ số 0 đầu.
- Kiểm tra tên, loại, ngày thật/không ở tương lai, độ dài và số nguyên VND trong giới hạn chính xác. UI `1.000.000`, dữ liệu `1000000`.
- Lưu/cập nhật danh sách ngay; modal có Hủy/Lưu, cuộn phần nội dung, giữ header/footer, Escape và giới hạn Tab trong modal.
- Sửa số dư/ngày chốt đầu kỳ cần xác nhận ảnh hưởng tồn quỹ. Không đổi loại tài khoản đã có liên kết; chặn đổi tên khi còn phiếu cũ tham chiếu bằng tên.
- Tồn quỹ đọc từ Thu chi, chỉ dùng quan hệ ID rõ ràng. Cộng số dư đầu kỳ và thu trừ chi sau ngày chốt (số dư đầu kỳ được hiểu là số dư cuối ngày chốt). Loại phiếu hủy/xóa/nháp; kiểm tra số tiền/ngày/ID trùng và giới hạn chính xác. Không tự cộng phiếu chỉ có tên: hiển thị “Chưa xác định” với lý do, thay vì hiển thị số dư sai.
- Xóa tài khoản chưa có giao dịch/liên kết có popup xác nhận. Tài khoản có liên kết mở chọn tài khoản tiếp nhận (không gồm chính nó), nhưng chặn xác nhận chuyển/xóa vì chưa có phương án ghi liên kết an toàn được duyệt. Nhật ký được giữ nguyên.
- Modal khóa có ngày khóa và cảnh báo đúng yêu cầu. **Chưa lưu/ap dụng ngày khóa**, vì Thu chi chưa có kiểm tra tương ứng. Save trả lý do rõ ràng, không báo khóa thành công giả.

### Thông báo

- Tái sử dụng các cờ/ngày nhắc RHD hiện tại. Thêm cấu hình tùy chọn `notificationDelivery`, `notifyBuildingActivity`, `financialAlerts`; dữ liệu cũ không cần migration.
- Mẫu/biến tiếng Việt cho hóa đơn, nhắc hóa đơn, hợp đồng sắp hết hạn, cập nhật hỗ trợ, hoạt động tòa nhà. Allowlist biến theo loại; không cho lưu biến không có nguồn dữ liệu tương ứng.
- Bật/tắt theo loại, chọn giờ HH:mm (UTC+7). Có đồng bộ chủ động; loại có giờ gửi được kiểm tra mỗi phút khi trang quản lý mở và tài khoản có quyền. Không có scheduler backend khi đóng trình duyệt.
- Hỗ trợ nối vào `RH.syncManagerNotification`, đọc yêu cầu thật và dùng trạng thái hiện tại. Event và đồng bộ lịch dùng cùng campaign ID. Giờ gửi hỗ trợ áp dụng cho cập nhật trạng thái; tin nhắn trao đổi đang có giữ luồng hiện tại.
- Hóa đơn nối ở phần thông báo của `RH.syncManagerRecord`; phần đồng bộ dữ liệu nghiệp vụ giữ nguyên. Chặn nháp/chưa phát hành/không hợp lệ, kiểm tra cư dân hoạt động và phạm vi. Tắt thông báo vẫn giữ đồng bộ dữ liệu hóa đơn.
- Hoạt động tòa nhà tiếp tục dùng campaign/lịch gửi của `notification-manager.js`. Cấu hình mẫu/giờ được chụp vào campaign mới, không tạo queue hay module thông báo khác, không tự phát hành bản nháp. Các campaign cũ không bị sửa lại; cấu hình này áp dụng khi tạo/lưu campaign mới.
- Giữ hộp thư RH, đã đọc/chưa đọc, refId/refType/actionUrl. ID chống lặp ổn định và kiểm tra thông báo legacy. Quyền xem module/phạm vi tòa được kiểm tra trước đồng bộ.
- Cảnh báo tài chính chỉ bật khi được cấu hình rõ; chỉ quản lý đang hoạt động có `settings.view/update` trong phạm vi được chọn. Mặc định tắt, không chọn cư dân. Gửi cảnh báo sau cập nhật/xóa thành công. Cấu hình khóa sổ chỉ phát sinh cảnh báo sau khi nghiệp vụ khóa được triển khai thành công, hiện chưa gửi cảnh báo khóa giả.

### Nhật ký

- Dùng `activity-store.js` append vào store cũ với allowlist theo module; không ghi password/token/toàn bộ hồ sơ hoặc số tài khoản đầy đủ.
- Hook tại thao tác thành công: RHD tạo/sửa/xóa; RH login/logout/tạo/sửa/xóa người dùng; RHP tạo/sửa/xóa loại quyền. Đổi thông tin phiên đăng nhập sau sửa hồ sơ không bị ghi nhầm thành lần login mới.
- Ghi người, vai trò, thời gian, module, hành động, đối tượng, kết quả và trước/sau phù hợp. Thao tác mở popup, tìm kiếm, xem trang, validation thất bại không sinh log thành công.
- Bổ sung module tài chính, Thu chi, tài khoản, phân quyền, login/logout vào bộ lọc. Giữ panel chi tiết và không có UI sửa/xóa log.
- CSS/UI mới chỉ trong 3 mục. `index.html` và `resident-web.html` chỉ thêm một script không có giao diện để ghi log tại nguồn, không thay màn hình.

## File đã sửa/thêm

- UI/service Cài đặt: `general-settings.js`, `general-settings.css`, **mới** `financial-accounts.js`.
- Nhật ký dùng chung: **mới** `activity-store.js`.
- Hook liên kết tối thiểu: `data.js`, `auth.js`, `permissions.js`, `notification-manager.js`.
- Nạp script: `dashboard.html`, `index.html`, `resident-web.html`.
- Kiểm thử: `tests/general-settings.test.mjs`, `tests/general-settings.browser.mjs`.
- Báo cáo: tài liệu này, liên kết cập nhật trong `GENERAL-SETTINGS-AUDIT.md`, `FINANCIAL-CASHFLOW-PLAN.md`.

Không đổi `manager-modules.js`, công thức tiền, nghiệp vụ hóa đơn/hợp đồng, giao diện Thu chi, Resident, Dashboard hay các bundle sinh ra. Không commit/push/merge/chuyển branch.

## Kiểm thử

- **PASS** `npm run build` (TypeScript, meter-reading và document-export).
- **PASS** `node tests/general-settings.test.mjs`: RH/RHD/RHP thật với storage trong bộ nhớ. Quyền/scope, cư dân liên quan, trạng thái/nháp/khóa/Demo, lịch gửi, mẫu/biến, idempotency giữa event/lịch, data-sync vẫn giữ khi tắt thông báo, cảnh báo chỉ quản lý, tài khoản thêm/sửa/xóa không liên kết, chặn khóa/xóa có liên kết, tính tồn quỹ/cutoff/hủy, log login/logout/user/quyền/tài chính, mask dữ liệu, corrupt log.
- **PASS** `node tests/general-settings.browser.mjs`: Edge profile tạm. Thêm/sửa/validation, VND, số 0 đầu, giữ dữ liệu khi đổi loại, xác nhận đổi số dư, chặn khóa/xóa có liên kết, filter/panel log. Modal tại 1024/768/375/320px, trang tại 1280/375/320px. Kiểm thử thêm `dashboard.html` thật: mở Cài đặt, ba tab được mount và modal sửa hoạt động trong layout cũ. Không sử dụng profile/dữ liệu thật của người dùng.
- **PASS** `node src/invoices/domain.test.mjs`, `node src/settings/settingsStore.test.mjs`.
- **PASS** kiểm tra cú pháp JS và `git diff --check`.
- **FAIL có sẵn, không sửa ngoài phạm vi:** `src/invoices/billing.integration.test.mjs:66` (`needsRecalculation` undefined thay vì true); `tests/workflows.test.mjs:42` (kiểm tra tài sản hợp đồng). Cùng lỗi đã được đối chiếu với `HEAD:data.js` trong lần audit trước và vẫn tái hiện.

## Phần còn thiếu/rủi ro cần quyết định

1. Khóa sổ thực thi và gắn ID cho các ghi Thu chi mới cần xác nhận [phương án](FINANCIAL-CASHFLOW-PLAN.md). Hiện khóa bị chặn, không có trạng thái khóa giả.
2. Chuyển liên kết khi xóa có nhiều nguồn dữ liệu cần transaction/rollback; hiện chặn xóa. Không tự chuyển tiền, số dư hoặc phiếu.
3. Phiếu cũ chỉ có tên chưa được gán ID. Không đủ căn cứ tính tồn quỹ thì hiển thị chưa xác định; không tự sửa dữ liệu cũ.
4. localStorage không có transaction đa khóa hoặc chống sửa bằng DevTools. Nhật ký chỉ bền trên trình duyệt hiện tại; bảo đảm đa thiết bị, quyền phía server, chống sửa log và scheduler khi đóng trang cần backend. Không khẳng định tính nguyên tử/chống trùng giữa các tab chạy đồng thời.
5. Không triển khai QR mới, API ngân hàng, biên lai, đối soát hoặc tự cập nhật thanh toán. Chức năng cũ giữ nguyên.
