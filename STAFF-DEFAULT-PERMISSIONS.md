# Hoàn thiện quyền mặc định Nhân viên

## Nguyên nhân và đối chiếu

Đã đối chiếu các sheet NHÂN VIÊN, QUẢN LÝ và Luồng Liên Kết của Excel. Bảng quyền hiện có lấy từ `RHP.SCHEMA`; màn hình nhân viên đã kiểm tra `staffTasks.*`, `staffIncome.view` và `support.create`. Các mã này có trong thay đổi chưa commit từ lượt trước, nhưng mẫu `at-staff` vẫn giữ bộ quyền vận hành cũ, thiếu tất cả các quyền đó. Hai browser test trước đây tự cấp chúng trong fixture nên chưa kiểm chứng được môi trường sạch.

Không có bằng chứng rằng commit gần nhất gây lỗi này. Đây là thiếu kết nối giữa mẫu quyền cũ và các chức năng mới trong working tree. Không thay đổi lịch sử Git để khắc phục.

## Bộ quyền và kế thừa

Mẫu chung `at-staff` cấp đúng: `dashboard.view`, `staffTasks.view`, `staffTasks.accept`, `staffTasks.update`, `staffTasks.report`, `staffIncome.view`, `support.create`.

Ba trang tiền công dùng chung `staffIncome.view`; dữ liệu vẫn lọc theo người được giao. Không cấp quyền người dùng, phân quyền, duyệt/khóa tài khoản, quản lý cư dân/tòa nhà, phê duyệt tiền công hay hỗ trợ toàn hệ thống. Hồ sơ, giao diện, thông báo, đổi mật khẩu, đăng xuất và xem yêu cầu bản thân tiếp tục dùng cơ chế tự phục vụ hiện có; không cần `users.update`.

Tài khoản Kỹ thuật / Vệ sinh / An ninh dùng cùng `accountTypeId: at-staff`; `staffGroup` không thay đổi quyền/menu. Resolver đọc quyền từ loại tài khoản, không sao chép vào từng người dùng; không có hệ thống quyền cá nhân song song trong code hiện tại.

Hỗ trợ nhân viên dùng `support.create` để gửi, đọc yêu cầu bản thân theo requesterId. Quản lý tiếp tục dùng `support.view/update`, bộ lọc nguồn và luồng phân công/phản hồi chung đã tồn tại. Không tự cấp thêm quyền cho quản lý hoặc nhân viên xử lý nội bộ; người xử lý phải có quyền phù hợp.

## Khởi tạo và bảo toàn dữ liệu

- Môi trường sạch: tạo một mẫu Nhân viên với quyền mặc định trong code.
- Store thiếu `at-staff`: bổ sung một lần nếu không có loại tự tạo trùng tên.
- Mẫu cũ chỉ chuyển đổi khi đúng ID/tên/cổng/mô tả và toàn bộ danh sách quyền lịch sử, không có `updatedAt`, không fullAccess/system và chưa có phiên bản chuyển đổi. Chuyển nguyên mẫu vận hành cũ sang bộ quyền cá nhân nêu trên; giữ ID, createdAt và các trường khác.
- Mọi mẫu đã lưu qua giao diện quản lý (`updatedAt`), đổi tên/mô tả/quyền, hoặc đã chuyển đổi đều được giữ nguyên. Không tự khôi phục quyền quản lý đã thu hồi; không cấp tự động quyền đăng ký mới trong tương lai.
- Nếu loại tùy chỉnh có cùng tên nhưng ID khác, không tạo bản sao hoặc tự đổi ID/gán lại người dùng. Cấu hình đó giữ nguyên và cần quản lý xem xét riêng nếu muốn chuyển sang mẫu chuẩn. Không suy luận quyền riêng đã cấu hình là lỗi.

Nguồn lưu vẫn là localStorage `residenthub_account_types`, chung cho live/demo trên cùng origin/profile. Người dùng lưu trong `residenthub_users`. Các máy có code giống nhau được khởi tạo giống nhau, nhưng thay đổi trong trình duyệt không tự đồng bộ sang máy khác. Không thêm backend/database/VPS.

## Phạm vi lượt này

Trước sửa đã chụp `git diff --binary` và sao lưu các file định sửa tại thư mục tạm `ResidentHuB-before-staff-defaults-4e00ebcb0a2c4b6fa80ee65e93988fe8`.

- `permissions.js`: chỉ đổi mẫu Nhân viên và seed/chuyển đổi có điều kiện.
- `tests/staff-defaults.test.mjs`: mới; kiểm môi trường sạch, quyền chung ba nhóm, quyền tối thiểu, chuyển mẫu cũ, cấu hình tùy chỉnh, thu hồi và idempotence.
- `tests/staff-tasks.browser.mjs`: thay cấp quyền thủ công bằng kiểm tra quyền đã seed.
- `tests/user-management.browser.mjs`: tương tự; thêm tạo ba nhóm, kiểm menu và ba trang tiền công trống, cô lập dữ liệu; sửa chờ trang đăng xuất để tránh đọc RH khi script chưa tải.
- Báo cáo này.

Các thay đổi trong account-modules.js, auth.js, data.js, manager-modules.js, staff.html, tests/auth-environment-audit.test.mjs, tests/staff-settings.test.mjs và STAFF-EXCEL-AUDIT.md đã có trước lượt này, được giữ nguyên. Phần registry/resolver trong permissions.js và phần test cũ cũng được giữ. Không sửa theme/CSS/nghiệp vụ tiền công/module khác, không tạo bảng quyền mới, không commit/push/merge/đổi branch.

## Kiểm thử

- 9 bộ Node test đạt, gồm staff-defaults, staff-settings, auth-environment-audit, data-consistency, workflows, general-settings, financial-report, statistics-report, migration-backup.
- Build TypeScript và cả ba bundle đạt.
- Browser nhiệm vụ đạt: phân công, cô lập truy cập, tiếp nhận, cập nhật/báo cáo, nghiệm thu và đối chiếu tiền công.
- Browser quản lý người dùng đạt: role/matrix, tạo người dùng ba nhóm, menu chung, ba trang tiền công có quyền nhưng không dữ liệu, hỗ trợ gửi/nhận/phân công/phản hồi, đăng ký/duyệt/từ chối cư dân, thu hồi quyền và đăng xuất; không JavaScript exception hoặc console error. Artifact: `C:\Users\Admin\AppData\Local\Temp\residenthub-ui-check-7yIvDu`.

Browser chạy với profile, localStorage và server thử riêng, không dùng dữ liệu thật trên localhost:3000. Trong sandbox Edge không phản hồi CDP; chạy ngoài sandbox đã điều khiển được trang. Auth audit vẫn ghi nhận lỗi dữ liệu/API cũ ngoài phạm vi; các test đạt không có nghĩa dự án có ranh giới bảo mật backend. Không mở rộng chức năng vật tư/chi phí hay sửa thuật toán tiền công; những phần Excel chưa được hệ thống hỗ trợ vẫn giữ nguyên giới hạn đã ghi trong STAFF-EXCEL-AUDIT.md.
