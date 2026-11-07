# Đăng nhập VPS và đồng bộ tài khoản — 04/11/2026

## Kết luận và giới hạn bằng chứng

Repository hiện là ứng dụng tĩnh: README và package.json mô tả build bundle, không có API xác thực đang được frontend gọi. `auth.js` đọc tài khoản từ `residenthub_users`, so sánh mật khẩu dạng chuỗi trong `authenticateDetailed()`. `permissions.js` đọc loại quyền từ `residenthub_account_types`. Phiên dùng sessionStorage/localStorage, không phải phiên do server xác thực. Dữ liệu nghiệp vụ vẫn nằm trong kho trình duyệt.

`seedIfEmpty()` chỉ khởi tạo quản trị demo trên localhost/127.0.0.1/[::1]. Truy cập IP VPS không khởi tạo tài khoản đó. Kho localhost không được gửi sang IP VPS; hai thiết bị cùng IP website vẫn có kho độc lập. Đây là nguyên nhân kiến trúc đã tái hiện được cho tình huống tài khoản tồn tại ở một máy nhưng không tồn tại ở máy khác. Không thể dùng Git pull để đồng bộ tài khoản hay quyền.

Chưa đủ bằng chứng xác định nguyên nhân cụ thể của lần đăng nhập VPS được báo: không có quyền truy cập kho trình duyệt thực và các GET chỉ đọc tới `/`, `/auth.js`, `/permissions.js`, `/data.js` đều không kết nối được từ môi trường thực thi. Không suy ra VPS đang ngừng hoạt động. Chưa xác nhận Nginx/Apache/static service, đường dẫn deploy, hash mã nguồn đang phục vụ, database hiện hữu, mật khẩu sai, trạng thái khóa hoặc lỗi Network/CORS. Không có SSH hay thao tác cấu hình VPS trong lượt này.

`.env.example` ghi rõ frontend chưa tiêu thụ biến Supabase. SQL nền tảng và tài liệu cũ không chứng minh dịch vụ đã được triển khai. Báo cáo audit ngày 21/10 mô tả một phiên bản trước; các lỗi seed/phiên trong đó có phần đã được sửa ở mã hiện tại, không được coi toàn bộ là lỗi còn tồn tại.

## Thay đổi cục bộ

- `auth.js`: thêm `RH.inspectAuthEnvironment()`, chỉ đọc raw storage, không gọi helper normalize/khôi phục phiên có thể ghi dữ liệu. Trả trạng thái kho, xung đột danh tính quản trị demo, trạng thái active và khả năng tìm loại đã liên kết. Không trả mật khẩu, hash, token, session, email nhập vào hay bản ghi tài khoản. Không chứng nhận mật khẩu đúng hoặc quyền Admin từ kết quả này.
- `tests/vps-auth-diagnostic.test.mjs`: kiểm tra kho thiếu/hỏng/sai schema, thiếu tài khoản, trùng danh tính, tài khoản khóa và loại liên kết; chặn mọi ghi/xóa, kiểm tra không lộ credential.
- Tài liệu này và liên kết từ README. Không thay giao diện, bảng quyền, mật khẩu, seed hay dữ liệu nghiệp vụ; chưa kích hoạt hệ thống xác thực mới.

Trên mỗi trình duyệt/origin cần đối chiếu, chạy `RH.inspectAuthEnvironment()` trong Console. `account-missing`/`account-store-missing` xác nhận thiếu tài khoản trong kho đó; `identity-conflict` cần xử lý thủ công; `account-not-active` cần kiểm tra trạng thái; `local-account-present` chỉ xác nhận có bản ghi local và loại liên kết. Nếu hàm chưa tồn tại trên VPS thì mã bổ sung chưa được deploy, không đồng nghĩa lỗi tải script. Dùng `RHP.inspectDemoAdmin()` và `RHP.diagnoseBuildingCreate()` hiện có để đối chiếu quyền; không gửi raw users/session lên chat.

## Phương án tối thiểu cần duyệt

Trước tiên kiểm tra cấu hình phục vụ thực tế, tiến trình, reverse proxy, document root, cách deploy, biến cấu hình theo tên (không xuất giá trị bí mật), log lỗi đã che thông tin nhạy cảm và hash các file. Đối chiếu Network trên trình duyệt gặp lỗi. Nếu xác minh đã có API/DB thì sửa tích hợp vào nguồn đó, không tạo hệ thống thứ hai.

Nếu VPS đúng là bản tĩnh hiện tại, tái sử dụng thiết kế Supabase đã có tại `supabase/SETUP.md`, `supabase/migrations/202610210001_foundation.sql` và `CENTRAL-DATA-IMPLEMENTATION.md`. Chỉ triển khai sau khi duyệt dịch vụ/gói/chi phí thực tế, nơi đặt dữ liệu và thao tác cần thực hiện; chưa xác minh giá hay quota của tài khoản dịch vụ. Đưa Auth, membership, loại quyền và phạm vi tòa về nguồn chung. Password do dịch vụ Auth quản lý, không đưa credential vào bảng ứng dụng hoặc frontend. Chuyển các caller sang async, xử lý lỗi mạng mà không fallback sang tài khoản/quyền local.

Chỉ đổi màn hình login chưa đủ: server/RLS phải kiểm tra membership active, loại quyền và scope trên mọi đọc/ghi nghiệp vụ. Các API dữ liệu local hiện có có thể bỏ qua guard UI. SQL nền tảng chưa là bản cutover hoàn chỉnh; cần rà soát RLS, giao dịch, RPC và toàn bộ đường ghi trước khi mở cổng dữ liệu. Giữ registry quyền nghiệp vụ và nhóm chuyên môn nhân viên hiện tại. Refresh phiên/quyền khi mở trang, focus và theo chính sách được duyệt; server từ chối ngay quyền đã thu hồi và membership bị khóa, kể cả JWT cũ còn hạn. Quy trình đổi/reset mật khẩu phải thu hồi phiên theo chính sách được chốt và kiểm thử.

## Chuyển dữ liệu an toàn

1. Dùng công cụ backup mã hóa hiện có trong `tools/migration/`, lưu riêng bản sao từng origin/profile; không reset hay upload storage tự động. Bản sao có credential cũ nên không đưa vào Git/chat.
2. Kiểm kê và chọn nguồn chuẩn có người phụ trách xác nhận. Đối chiếu trùng ID/email, loại quyền, scope và quan hệ tòa/căn hộ/cư dân/hợp đồng. Không merge bằng email hoặc ghi đè khi xung đột.
3. Xác minh người sở hữu tài khoản quản trị; tạo hoặc liên kết đúng một membership legacy ID `u-manager-1` với Auth UID đã xác minh. Chỉ gán loại Admin sau xác nhận danh tính và quyền; không suy ra từ email, hostname hay role manager. Dùng lời mời/đặt lại mật khẩu an toàn; không nhập password/pass/plaintext cũ.
4. Chuyển loại quyền và các liên kết theo mapping được duyệt, giữ custom permissions. Chạy importer dry-run trên bản sao, kiểm tra số lượng, khóa ngoại, dữ liệu nghiệp vụ và xung đột; chưa có importer production được triển khai trong lượt này.
5. Nghiệm thu staging rồi mới chốt thời gian dừng ghi, backup cuối, migration có transaction/đối soát và phương án rollback. Giữ nguồn cũ chỉ đọc để đối chiếu; không gộp lại các thay đổi sau cutover một cách tự động.

## Kiểm thử và điều kiện deploy

Đã chạy đạt: diagnostic mới, auth-environment-audit, demo-admin, data-consistency, workflows, migration-backup và TypeScript typecheck. Các bài test dùng VM/storage giả hoặc công cụ backup, không phải hai browser kết nối database. Bài auth audit còn có assertion xác nhận lỗi bypass guard local vẫn tồn tại; test đạt không chứng minh bảo mật production.

Chưa chạy: login trên VPS/staging tương đương, Auth/RLS trên DB thực, hai browser dùng chung tài khoản/quyền, lưu tòa qua server, đổi mật khẩu đa thiết bị, khóa phiên đa thiết bị, thu hồi quyền phía server, staff/resident qua backend, nghiệm thu đủ module và kiểm tra không mất dữ liệu sau migration. Các tiêu chí này chỉ có thể đạt sau khi có nguồn tập trung và tích hợp hoàn chỉnh.

Các bước cần phê duyệt riêng: quyền truy cập kiểm tra VPS; xác nhận nguồn API/DB hiện hữu hoặc chọn dịch vụ mới và chi phí; tạo môi trường staging; chạy SQL đã review; xác minh/mời tài khoản; migration thử và nghiệm thu; sau cùng mới migration production, cấu hình HTTPS/callback, deploy và kiểm tra sau deploy. Không commit, push, merge, deploy, chạy SQL hay thay dữ liệu thật trong lượt này. Chưa thể báo lỗi VPS đã được sửa hoặc đồng bộ đa thiết bị đã hoàn tất.
