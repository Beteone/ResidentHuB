# Nhân viên — đối chiếu Excel và kết quả triển khai

Ngày 27/10/2026. Branch `Chi`, mốc HEAD khi bắt đầu `4eb4484`.

Đã đọc trực tiếp workbook `D:\Downloads\BTN Biên Tập Web Nhóm 06.xlsx`, các sheet NHÂN VIÊN (hàng 4–18), QUẢN LÝ (hàng 15–19, 28–29) và Luồng Liên Kết (hàng 6–9). Workbook chỉ là tài liệu đối chiếu; không sửa file hoặc chạy nội dung nhúng. Không có ảnh tham chiếu người dùng mới kèm theo; giữ phong cách UI hiện có và kiểm tra ảnh chụp trình duyệt.

## 1. Đối chiếu chức năng và quyền

| Chức năng nhân viên / nguồn Excel | Trước sửa | Quyền thiếu hoặc vấn đề | Xử lý |
| --- | --- | --- | --- |
| Dashboard, thống kê cá nhân — NV 4 | `dashboard.view`, tổng hợp nhiệm vụ được giao | Không cần checkbox thống kê trùng | Giữ dashboard; dữ liệu nhiệm vụ vẫn lọc theo tài khoản. |
| Thông báo công việc — NV 4,14 | API thông báo cá nhân, tùy chọn riêng | Không cần quyền quản lý thông báo | Giữ API nhận/đọc thông báo của chính mình. |
| Danh sách, chi tiết, tìm kiếm/lọc — NV 5–6 | Dùng chung `support.view` của quản lý | Thiếu quyền nhiệm vụ riêng | Thêm `staffTasks.view`; tìm kiếm/chi tiết dùng cùng quyền và phạm vi nhiệm vụ, không thêm checkbox trùng. |
| Tiếp nhận nhiệm vụ — NV 5,7 | Dùng `support.update` | Chưa tách tiếp nhận | Thêm `staffTasks.accept`; kiểm ở nút, handler và lớp dữ liệu. |
| Cập nhật tiến độ — NV 7 | Có chuyển trạng thái và mốc thời gian | Dùng chung quyền xử lý hỗ trợ quản lý | Thêm `staffTasks.update` cho cập nhật dữ liệu tiến độ; giữ các thao tác chuyển trạng thái hiện có. |
| Báo cáo kết quả — NV 8 | Có ghi chú hoàn thành và pending approval | Chưa tách quyền báo cáo; menu Báo cáo chưa nối form | Thêm `staffTasks.report`; nối menu vào form chi tiết/tiến độ hiện có, không tạo form báo cáo thứ hai. |
| Ghi chú tiến độ giữa chừng, hình ảnh công việc, dòng vật tư/đơn giá/chứng từ — NV 7–8 | Chưa có đầy đủ thao tác lưu và UI tương ứng trong code hiện tại | Thiếu nghiệp vụ thực thi, không chỉ thiếu checkbox | Ghi nhận khoảng trống. Không thêm quyền giả hoặc xây dựng lại module công việc/vật tư trong lượt Cài đặt và phân quyền này. |
| Duyệt kết quả/chi phí — QL 17–19, NV 8 | Quản lý dùng `support.update` và luồng nghiệm thu hiện có | Nhân viên không được tự nghiệm thu hoặc sửa tiền đã duyệt | Giữ quyền quản lý cũ; chặn nhân viên gửi trạng thái approved/resolved của nhiệm vụ và sửa tiền công. |
| Tổng hợp, trạng thái, lịch sử, điều chỉnh tiền công — NV 9–11 | Dùng `invoices.view` | Quyền hóa đơn không đồng nghĩa xem thu nhập cá nhân | Thêm `staffIncome.view`; chỉ đọc tiền/phiếu chi của nhiệm vụ được giao, không sửa phép tính hoặc hạch toán. |
| Hồ sơ, giao diện, thông báo — NV 12–14 | Đã có API tự phục vụ | Không cần quyền quản trị | Giữ nguyên; không tạo lại các trang. |
| Đổi mật khẩu, đăng xuất — NV 15,18 | Chưa có form đổi mật khẩu, đã có đăng xuất | Thiếu xác thực tự phục vụ và OTP DEMO | Bổ sung form và API riêng cho tài khoản nhân viên đang đăng nhập hợp lệ, không cần `users.update`. |
| Trang Quyền truy cập — NV 16 | Có trang đọc quyền | Prompt yêu cầu bỏ trang/menu dư | Bỏ giao diện này; giữ registry, quyền và kiểm quyền. |
| Hỗ trợ nội bộ — NV 17 | Có `support.create`, kho `supportRequests` | Thiếu người quản lý trực tiếp, bộ lọc nguồn và UI hữu ích | Dùng lại kho/nhóm quyền hiện có, thêm nguồn staff và mở rộng đúng module quản lý hỗ trợ. |

**Quyền mới không được tự cấp.** Các loại tài khoản vẫn giữ nguyên mảng quyền đã lưu. Quản lý cần bật những quyền `staffTasks.*`, `staffIncome.view` phù hợp cho loại Nhân viên. Không dùng `support.update` để ngầm cấp quyền quản trị cho nhân viên. Quyền mới chưa được cấp mặc định bị từ chối.

## 2. Cách hoạt động

- Tiếp tục dùng `RHP.SCHEMA`, `RHP.can`, `residenthub_account_types` và `RHP.registerModule` đã có; không tạo registry/kho vai trò thứ hai.
- Module mới khai báo trong schema chung hoặc gọi `RHP.registerModule(...)` từ script khai báo được tải lúc khởi động ở các trang liên quan. Ma trận quản lý được dựng từ cùng schema; không cần sửa HTML ma trận. Không tự theo dõi GitHub.
- Mã quyền cũ chưa được module khai báo vẫn được bảo toàn trong dữ liệu khi lưu, nhưng không được phép thực thi cho đến khi có khai báo hợp lệ.
- Tài khoản nhân viên có trường tùy chọn `supervisorId`. Không có trường cấp trên tương đương trước đó; `building.managerId` chỉ quản lý từng tòa nên được dùng làm nguồn dự phòng khi định tuyến, không thay thế quan hệ cấp trên trực tiếp.
- Form tạo/sửa hiện có lấy quản lý từ tài khoản đang hoạt động có quyền xử lý hỗ trợ. Việc đổi cấp trên yêu cầu `users.update`; nhân viên không sửa được từ API tự phục vụ.
- Khi gửi hỗ trợ, lớp dữ liệu xác định người gửi, mã bằng hàm `nextSupportCode()` sẵn có, nguồn staff, thời gian, trạng thái mới. Ưu tiên cấp trên hợp lệ trong phạm vi tòa nhà, sau đó quản lý tòa và tài khoản quản lý có quyền/phạm vi phù hợp. Không có người phù hợp thì giữ rõ chưa định tuyến để quản lý có quyền tiếp nhận; không gán bừa tài khoản kỹ thuật.
- Hỗ trợ nội bộ không có phần nhập tiền công, không tự tạo trạng thái nhiệm vụ sửa chữa hoặc thông báo nghiệm thu cho cư dân. Quản lý có thể phân công tài khoản có quyền xử lý trong phạm vi hợp lệ.
- Nhân viên gửi hỗ trợ không được xem yêu cầu người khác. Người được phân công xử lý nội bộ cần `support.update`; người gửi xem trạng thái và trao đổi của yêu cầu mình.

## 3. Đổi mật khẩu DEMO và giới hạn

- Form có mật khẩu hiện tại, mới, xác nhận và nút hiện/ẩn. Mật khẩu mới 8–128 ký tự, có chữ và số, khác mật khẩu hiện tại.
- API kiểm mật khẩu cũ và phiên hợp lệ trước khi tạo OTP. Mã ngẫu nhiên 6 chữ số từ `crypto.getRandomValues`, hiện trong popup ghi rõ DEMO.
- Mã hết hạn sau 120 giây; tối đa 5 lần sai; tối đa 3 lần cấp lại. Cấp lại làm mã cũ mất hiệu lực, không đặt lại bộ đếm sai. Mã chỉ dùng một lần; challenge chỉ nằm trong bộ nhớ trang.
- Presenter hiển thị OTP tách khỏi API kiểm/chốt đổi mật khẩu để có thể thay cơ chế chuyển mã về sau. Không gửi email/SMS.
- Sau xác nhận, cập nhật mật khẩu trong kho hiện có, tăng `credentialVersion`, đăng xuất. Phiên cũ cùng kho localStorage bị từ chối khi kiểm tra lại.
- `getSession()` từ chối tài khoản khóa/vô hiệu/xóa và phiên có phiên bản thông tin đăng nhập cũ. Tài khoản demo không bị đặt lại mật khẩu/mở khóa mỗi lần tải; tài khoản demo đã xóa không được tự tạo lại sau khi đã đánh dấu khởi tạo.
- Đây vẫn là demo client-side, **mật khẩu vẫn nằm trong mô hình lưu hiện có**, chưa chuyển sang lưu băm/backend. OTP hiển thị trên chính thiết bị không phải 2FA. Không đảm bảo thu hồi phiên giữa các máy có kho dữ liệu độc lập, hoặc bảo mật trước người sửa localStorage/mã JavaScript. Không mô tả là production-ready.

## 4. File và bảo toàn phạm vi

Đầu lượt đã có sáu file sửa chưa commit: `auth.js`, `data.js`, `permissions.js`, `staff.html` và hai test `staff-settings`, `user-management`. Đã sao lưu nội dung trước khi bổ sung tại:

`C:\Users\Admin\AppData\Local\Temp\ResidentHuB-before-excel-staff-260872778d2640a3839c54a4625dfaca`

| File | Phần bổ sung trong lượt này |
| --- | --- |
| `permissions.js` | Nhóm nhiệm vụ và thu nhập nhân viên; không thay mảng quyền mặc định của các loại. Không dùng RH_SESSION cũ khi phiên thật đã hết hiệu lực. |
| `auth.js` | OTP DEMO tự phục vụ; phiên bản thông tin đăng nhập; kiểm trạng thái phiên; bảo toàn tài khoản demo sau cập nhật/khóa/xóa; lưu/kiểm cấp quản lý. |
| `staff.html` | Bỏ trang/menu Quyền truy cập cũ, đổi Hỗ trợ và thông tin hệ thống thành Hỗ trợ; form mật khẩu/OTP, hướng dẫn và hỗ trợ có ảnh, liên hệ cấp trên; nối các quyền mới vào thao tác hiện có. CSS mới chỉ trong trang nhân viên và các form liên quan. |
| `account-modules.js` | Thêm chọn cấp quản lý trong form nhân viên hiện hữu và payload tương ứng; không thêm nút/form tạo tài khoản riêng. |
| `data.js` | Chốt quyền nhiệm vụ/thu nhập nhân viên; giới hạn đọc yêu cầu và tiền công/phiếu chi của mình; nguồn hỗ trợ nội bộ, định tuyến, không tự nghiệm thu; không sửa phép tính tiền hay ghi sổ. |
| `manager-modules.js` | Chỉ vùng hỗ trợ: lọc nguồn, phân biệt người gửi, định tuyến/phân công, tệp đính kèm nội bộ; không chạy tiền công/thông báo cư dân cho hỗ trợ nhân viên. |
| `tests/staff-settings.test.mjs` | OTP, trạng thái khóa/xóa, phiên cũ, quyền không trùng, bảo toàn quyền cũ. |
| `tests/auth-environment-audit.test.mjs` | Đổi assertion hai lỗi đã sửa: phiên tài khoản khóa và seed demo ghi đè mật khẩu/trạng thái. |
| `tests/staff-tasks.browser.mjs` | Fixture cấp rõ quyền mới; kiểm không có khoản tiền được duyệt/ghi sổ thay vì đòi không có metadata draft; điều hướng sang trang nhân viên trước khi kiểm tiền công. Không sửa nghiệp vụ tiền công. |
| `tests/user-management.browser.mjs` | Mở rộng kiểm từ form/menu thật cho OTP, cấp trên, ảnh, bộ lọc nguồn, phân công/phản hồi và thu hồi quyền. |

Không sửa `dashboard.html`, `resident-web.html`, `index.html`, `general-settings.js/css`, `theme.js/css`, các module hợp đồng/hóa đơn/thanh toán. Không nâng dependency, tạo module quản lý hỗ trợ/phân quyền mới hoặc thay đổi Git history. Các phần quản lý/cư dân không liên quan trong file dùng chung được giữ nguyên.

## 5. Kiểm thử và kết quả

| Ca yêu cầu | Kết quả / bằng chứng |
| --- | --- |
| 1. Ma trận quyền nhân viên | Đạt cho các thao tác đang thực thi: view/accept/update/report/income; khoảng trống vật tư/hình ảnh tiến độ nêu ở mục 1, không tuyên bố đã triển khai. |
| 2. Không trùng quyền | Đạt, so số mã với Set và kiểm ma trận. |
| 3. Giữ quyền cũ | Đạt, registry không tự sửa kho; giữ mã retired/unloaded khi lưu. |
| 4. Đổi mật khẩu OTP | Đạt qua form trình duyệt. |
| 5. Mật khẩu/confirm/OTP sai | Đạt; VM kiểm thêm hết hạn, cấp lại, 5 lần sai và one-use. |
| 6. Mật khẩu mới có hiệu lực | Đạt sau điều hướng; mật khẩu cũ bị từ chối, phiên credentialVersion cũ không phục hồi được. |
| 7. Tài khoản khóa/xóa | Đạt ở API/VM: session bị hủy, không đổi mật khẩu, không seed hồi sinh; browser kiểm chặn trang khi đã đăng xuất. |
| 8. Không tự nâng quyền | Đạt ở API dùng chung; không thể tự gán Admin/cấp trên/xóa tài khoản khác. |
| 9–10. Gán/sửa và xem cấp trên | Đạt qua form sửa người dùng; nhân viên thấy đúng người mới từ dữ liệu. |
| 11–12. Gửi/nhận hỗ trợ | Đạt, có ảnh PNG thật trong fixture và hiển thị bên quản lý; dùng cùng kho/module. |
| 13. Bộ lọc nguồn | Đạt, mặc định tất cả; chọn cư dân loại hỗ trợ staff, chọn staff hiển thị đúng. |
| 14. Phân công | Đạt qua form quản lý; không xuất hiện phần tiền công cho nội bộ. |
| 15. Trạng thái/phản hồi | Đạt, nhân viên đọc được phản hồi quản lý cho yêu cầu mình. |
| 16. Luồng cư dân | Đạt: phân công -> nhân viên tiếp nhận/báo cáo -> quản lý nghiệm thu -> tiền công/phiếu chi -> cư dân xem kết quả. |
| 17. Hồi quy khác | Các test liên quan đã chạy đạt; không khẳng định đã kiểm mọi màn hình của hệ thống. |

Lệnh đã đạt:

- `npm run build` — TypeScript và cả ba bundle; không phát sinh nội dung tracked mới trong dist.
- `node --test tests/staff-settings.test.mjs tests/auth-environment-audit.test.mjs tests/data-consistency.test.mjs tests/workflows.test.mjs tests/general-settings.test.mjs tests/financial-report.test.mjs tests/statistics-report.test.mjs tests/migration-backup.test.mjs` — 8/8 bộ đạt.
- `node tests/user-management.browser.mjs` — đạt, không JS exception/console error trong các luồng kiểm; có ảnh OTP.
- `node tests/staff-tasks.browser.mjs` — đạt, gồm nghiệm thu và đối chiếu tiền công.
- `node --check` cho các JS sửa và `git diff --check` — đạt.

Browser dùng Edge headless, profile/storage và server thử riêng; không truy cập dữ liệu localhost:3000 của người dùng. Tài nguyên CDN trang trí bị bỏ trong test; không xác minh đầy đủ mọi font/icon hoặc trình duyệt. Auth audit vẫn ghi nhận một số lỗi cũ khác ngoài phạm vi (ví dụ API dữ liệu chung không có ranh giới backend); đạt không có nghĩa các lỗi đó đã được sửa.

Chưa commit/push/pull/merge/reset hoặc đổi branch. Mọi thay đổi nằm trong working tree để xem xét.
