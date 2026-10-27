# Khôi phục Người dùng sau audit — 27/10/2026

## Phạm vi và bảo toàn

Triển khai trên branch `Chi`, HEAD `61c4d62`, không checkout/pull/merge/reset/revert/commit/push. Bốn file sửa và hai file mới đã có trước lượt triển khai được sao lưu tại:

`C:\Users\Admin\AppData\Local\Temp\ResidentHuB-before-user-restore-b4ebf863fbba41d799af9059b3ee570c`

`theme.css`, `theme.js`, `UI-ACCOUNT-RESTORATION.md`, `tests/theme-accounts.browser.mjs` giữ nguyên hash so với đầu lượt này. Hai file `auth.js`, `account-modules.js` được sửa bổ sung trên nội dung đang có. Không ghi đè bằng phiên bản lịch sử, không sửa dữ liệu trình duyệt thật.

## Nguyên nhân đã xử lý

Module gộp nút của `b521367` vẫn tồn tại nhưng dashboard gọi form cũ. Audit bổ sung xác định merge `6fe440f` đã mất cách nối mới so với parent `b04eae6`; PR #40 (`fc00fe6`) tiếp tục giữ giao diện cũ dù nhận `97aa3ef`. Báo cáo `UI-ACCOUNT-RESTORATION.md` từ lượt đầu chưa phản ánh đầy đủ nguyên nhân này; tài liệu đó được giữ nguyên theo yêu cầu bảo toàn.

## File thay đổi trong lượt triển khai

| File | Thay đổi |
| --- | --- |
| `dashboard.html` | Nối `accounts` vào `RHAccounts.renderUsersTab(f)`; mở đường vào menu/trang cho đúng quyền tạo; thay vùng markup tài khoản cũ bằng container do module render; cập nhật refresh sau duyệt/từ chối; giữ renderer theo dõi hồ sơ nhân viên và cập nhật lại đúng section sau lưu; phục hồi CSS liên quan form, tab, bộ lọc và ma trận quyền, dùng biến màu hiện tại. |
| `account-modules.js` | Một nút Thêm người dùng, kể cả người chỉ có quyền tạo; tiếp tục lấy loại từ `RHP.listTypes()`; giữ tách quyền tạo cư dân/nội bộ; đưa section theo dõi hồ sơ nhân viên vào trang mới. |
| `auth.js` | Suy ra role và quyền tạo từ loại cấu hình, chặn loại không hợp lệ và gán Admin trái phép; kiểm phạm vi hồ sơ/căn hộ và hợp đồng khi tạo cư dân; đồng bộ portal khi đổi loại; giữ hỗ trợ điện thoại đã sửa trước đó; kiểm quyền phê duyệt/từ chối độc lập. |
| `tests/data-consistency.test.mjs` | Seed Admin trực tiếp trong storage thử, thay vì gán quyền Admin qua API khi chưa có actor Admin. Giữ các assertion nghiệp vụ. |
| `tests/user-management.browser.mjs` | Mới: kiểm tra từ menu, nút, dropdown và form thật bằng Edge; tài khoản hạn chế dùng quyền lưu thật, không monkey-patch `RHP.can`; kiểm cả form đăng ký trang chủ và thao tác duyệt/từ chối. |

Không thay đổi `permissions.js`, kho loại tài khoản, quyền được cấp sẵn, `staff.html`, `index.html` hoặc các module nghiệp vụ khác. Các hàm legacy trong dashboard được giữ để tránh xóa thêm logic ngoài phạm vi; mục Người dùng không còn dùng markup/form legacy.

## Chức năng được giữ

- Đăng ký cư dân -> pending -> phê duyệt/từ chối -> tài khoản và liên kết hồ sơ.
- Loại tài khoản tùy chỉnh và ma trận quyền từ kho hiện hữu.
- Bộ phận, chức danh, nhóm chuyên môn nhân viên, phạm vi tòa nhà.
- Hồ sơ nhân viên và lịch sử cập nhật; quản lý lưu tình hình theo dõi được ngay trên trang Người dùng mới.
- Hồ sơ cá nhân, thông báo, cài đặt giao diện; không thay đổi code triển khai các tính năng này ngoài lớp tài khoản liên quan.
- Các module hợp đồng, thu chi, báo cáo và thống kê không bị ghi đè.

## Kiểm thử

`node tests/user-management.browser.mjs`: đạt, dùng Edge headless và profile/storage riêng. Ca cuối cùng lưu ảnh tại `C:\Users\Admin\AppData\Local\Temp\residenthub-ui-check-TJ5it8`.

| Ca yêu cầu | Kết quả |
| --- | --- |
| 1. Vào Tài khoản -> Người dùng | Đạt qua click menu thật. |
| 2. Một nút Thêm người dùng | Đạt; form legacy không còn trong DOM. |
| 3. Click mở đúng form | Đạt; có `ufTypeField` từ module RHAccounts. |
| 4. Danh sách loại động | Đạt; đối chiếu option với `RHP.listTypes()` cho Admin. |
| 5. Tạo cư dân, liên kết hồ sơ/căn hộ | Đạt qua dropdown hồ sơ, tòa nhà, căn hộ và nút lưu. |
| 6. Tạo quản lý/nhân viên | Đạt; kiểm loại, role, bộ phận, nhóm chuyên môn và tòa nhà; đăng nhập bằng điện thoại đạt. |
| 7. Loại tùy chỉnh | Đạt; tạo loại từ UI Loại tài khoản, chọn trong form rồi tạo người dùng. |
| 8. Người chỉ được tạo cư dân | Đạt với actor thật; chỉ thấy loại cư dân, tạo cư dân được; gửi role giả kèm loại quản lý bị từ chối; không có quyền duyệt/từ chối. |
| 9. Đăng ký/phê duyệt | Đạt từ form trang chủ trong phiên khách; pending chưa có login; UI duyệt tạo login có hồ sơ; UI từ chối giữ trạng thái rejected và chặn login. |
| 10. UI và tính năng mới | Đạt: theme sáng khi hệ điều hành tối, tab/bộ lọc được style, form không tràn ngang ở 390px; xem ảnh desktop/mobile; hồ sơ nhân viên và lưu Đã xử lý đạt; không JS exception/console error trong các luồng kiểm tra. |

`npm run build`: đạt TypeScript và cả ba bundle; không tạo thay đổi nội dung tracked trong dist.

`node --test tests/data-consistency.test.mjs tests/staff-settings.test.mjs tests/workflows.test.mjs tests/general-settings.test.mjs tests/auth-environment-audit.test.mjs`: 5/5 bộ đạt. Auth audit chứa một số assertion mô tả lỗi cũ ngoài phạm vi; đạt không có nghĩa đã sửa các lỗi đó.

`node --check auth.js`, `node --check account-modules.js`, `git diff --check`: đạt.

## Giới hạn

- Browser test bỏ CDN trang trí để chạy độc lập mạng: icon/font từ CDN và mọi màn hình hệ thống chưa được xác minh đầy đủ.
- Không tự gán loại mới cho tài khoản cũ thiếu `accountTypeId`, không tự cấp thêm quyền hoặc sửa dữ liệu tồn tại. Những tài khoản đó có thể vẫn hiện Không xác định ở cột loại cho đến khi người quản lý cập nhật hợp lệ.
- Hai bộ browser cũ đã được audit trước đó còn kỳ vọng không khớp phiên bản hiện tại (chiều cao biểu đồ và API preview hợp đồng). Lượt này không sửa các bài đó và không tuyên bố toàn bộ test repository đạt.
- Đăng nhập được kiểm bằng API xác thực sau khi tạo/duyệt; các thao tác tạo, đăng ký, duyệt và từ chối đi qua DOM/form thật. Kiểm tra quyền giả mạo dùng gọi API trực tiếp để xác minh lớp xử lý.
