# Tòa nhà và Tài khoản — truy nguyên và phục hồi theo ảnh

Ngày: 16/10/2026. Branch: `Chi`. Fetch `origin` thành công; HEAD và `origin/main` đều ở `fc00fe6`. Các thay đổi chưa commit từ các đợt phục hồi trước được giữ nguyên.

## 1. Đọc đúng phạm vi ảnh tham chiếu

- Ảnh `155434`: ba ô thống kê, hàng tìm kiếm/trạng thái/tỉnh/phường, bảng 7 cột và thao tác Tòa nhà. Dữ liệu và số lượng trong ảnh là dữ liệu tại thời điểm quay, không phải giá trị phải chép vào ứng dụng.
- Ảnh `155532`: trang Hỗ trợ đang mở; phần liên quan Tài khoản là nhóm menu mở rộng gồm **Loại tài khoản** và **Người dùng**, badge chờ duyệt ở mục Người dùng. Ảnh không cho thấy nội dung hai trang con.
- Giữ việc xóa dòng mô tả Tòa nhà theo yêu cầu trước đó, dù dòng đó còn trong ảnh cũ. Không đổi trang Hỗ trợ về hình cũ vì sẽ làm mất các phần hội thoại đã phục hồi.
- Không tự dựng nội dung trang Người dùng theo suy đoán.

## 2. Commit/PR làm thay đổi → nguồn UI gần nhất

| Giao diện | Mốc trực tiếp gần HEAD nhất | Nguồn gần nhất khớp phần thấy trong ảnh | Đoạn bị mất/thay |
|---|---|---|---|
| Tòa nhà | **`fc00fe6`, PR #40**, ChiNg-02, **16/10/2026 14:10:58 +07**, merge `419541d` + `97aa3ef`. So với parent nhánh Chi `97aa3ef`, kết quả merge bỏ CSS cần cho UI Tòa nhà. Parent main `419541d` đã thiếu các rule đó. | **`97aa3ef`**, Quynh Chi, **16/10/2026 14:10:13 +07**, “chi sửa tòa nhà”. Phiên bản này đã xóa mô tả theo yêu cầu. | `.bld-kpis`, `.bld-kpi`, `.bld-filters`, `.bld-clear`, các rule tìm kiếm/select dùng chung. JS render còn nên UI vẫn có dữ liệu nhưng KPI/bộ lọc không còn bố cục đúng. |
| Nhóm Tài khoản | Cùng **`fc00fe6`, PR #40**: kết quả giữ menu phẳng của parent main thay cho nhóm ở parent Chi. | **`97aa3ef`**, cùng tác giả/thời gian ở trên. | `rhAccountsGroup`, menu con, caret, `toggleNavGroup`, phần cập nhật hiển thị nhóm theo quyền và mở nhóm khi vào trang con. |
| Loại tài khoản | Trang dùng `RHAccounts.renderRolesTab` vẫn được nối và module còn. Không có ảnh nội dung để kết luận phải thay bảng hiện tại. | Module hiện tại; menu nhóm lấy từ `97aa3ef`. | Không khôi phục nguyên module; chỉ đưa mục này vào nhóm đúng nguồn cũ. |
| Người dùng | Trong diff `97aa3ef..fc00fe6`, renderer từ `RHAccounts.renderUsersTab` đổi thành `renderAccountRequestsTable` + `renderAccountsTable`. | `97aa3ef` có renderer cũ, nhưng không tương thích trọn vẹn với auth hiện tại. Ảnh chỉ xác nhận tên/menu, không xác nhận nội dung trang. | Đổi từ UI Người dùng có metadata loại/scope sang bảng legacy. **Chưa đổi renderer ngược lại** vì thao tác lưu loại/scope đang lỗi; giữ các handler hiện tại và màn hình duyệt cư dân. |

Không quy hết nguyên nhân cho commit “Lý khôi phục”. Git merge có nhiều parent; việc một đoạn có trong một parent không có nghĩa nó đã tồn tại trên toàn bộ main trước đó.

### Các mốc trung gian đã đối chiếu

- `27efbfe`, Quynh Chi, **08/10/2026 13:09:15 +07**, “chi sửa tòa nhà”: có bố cục KPI/bộ lọc Tòa nhà; vào main qua PR #26 (`1e1d7e4`).
- `5c6a3d2`, Quynh Chi, **07/10/2026 00:45:28 +07**: lịch sử nhóm Tài khoản/Loại tài khoản/Người dùng.
- `b04eae6`, ChiNg-02, **15/10/2026 13:15:31 +07**: có CSS Tòa nhà, nhóm menu và renderer Người dùng.
- `6fe440f`, daothanhthao1410, **15/10/2026 15:08:12 +07**, merge `0920863` + `b04eae6`: parent thứ hai có ba phần trên, parent thứ nhất và kết quả merge không có.
- `689b546`, ChiNG02, **16/10/2026 09:06:12 +07**: lại có đầy đủ phần UI tham chiếu trên nhánh Lý.
- `4475c45`, ChiNG02, **16/10/2026 09:43:51 +07**, merge `689b546` + `eba223b`: kết quả lấy dashboard thiếu các phần đó từ phía main.
- `991f4eb`, ChiNG02, **16/10/2026 12:15:09 +07**, “Lý khôi phục”: thêm lại script/phân quyền và hai mục Tài khoản dạng phẳng, chưa phục hồi CSS Tòa nhà hoặc nhóm menu. Vào main qua PR #39 (`419541d`, hahuonglyn-lang, **12:16:49 +07**).
- `fc00fe6`, PR #40: mốc gần nhất chọn kết quả thiếu UI thay vì phần UI còn trên nhánh Chi `97aa3ef`.

`git blame` của các rule ở `689b546` có dòng gắn với merge `f4e1dd8` do cách giải quyết merge trước đó; đã dùng thêm `git log -m -S` và so sánh cả parent để không nhầm tác giả blame thành người tạo/xóa UI đầu tiên. Các rule CSS liên quan ở `689b546` và `97aa3ef` được kiểm tra là giống nhau.

## 3. Thay đổi thực hiện có chọn lọc

Chỉ thêm/sửa code ứng dụng trong **`dashboard.html`** ở đợt này:

1. Khôi phục các rule KPI/bộ lọc từ `97aa3ef`; đặt dưới `#buildings-tab` để không đổi style của Căn hộ, Tài sản hoặc các bộ lọc khác.
2. Khôi phục HTML nhóm Tài khoản, hai menu con và hai ID badge hiện có (`rhNavAccountsGroupCount`, `rhNavAccountsCount`). Dùng lại hàm đếm badge đang có trong manager-modules; không thay nguồn dữ liệu.
3. Khôi phục CSS menu/caret/thụt lề theo nguồn cũ và `toggleNavGroup`. Thêm khả năng thao tác Enter/Space cho phần tử nhóm có `role=button`.
4. `applyNavPermissions` vẫn dùng quyền từng menu con như trước. Nhóm chỉ hiển thị nếu còn ít nhất một mục được phép xem; không cấp thêm quyền. Khi vào trang con được phép, nhóm mở như nguồn cũ.
5. Tiêu đề điều hướng của `accounts` dùng “Người dùng” theo nguồn cũ; nội dung, forms, API và handler hiện tại vẫn giữ.

Không sửa renderer/dữ liệu Tòa nhà, `auth.js`, `permissions.js`, `data.js`, `account-modules.js`, `rental-domain.js`, nghiệp vụ duyệt cư dân hoặc các module mới. Không đưa lại menu Tài sản khi dependencies chưa được giải quyết. Không reset, revert, checkout file cũ, commit, push hoặc merge.

## 4. Kiểm thử localhost

Chạy bằng Edge trên HTTP localhost với profile/storage thử riêng, tài khoản Admin fixture được gán metadata rõ ràng. Không dùng dữ liệu thật. Không coi điều đó là bằng chứng auth hiện tại đã tự lưu metadata đúng.

| Kiểm tra | Kết quả |
|---|---|
| KPI Tòa nhà, bố cục grid/flex và 7 cột bảng | Đạt; số lượng lấy từ store fixture, không hardcode số trong ảnh |
| Tìm tên/mã, trạng thái, tỉnh và phường | Đạt |
| Thêm/sửa/xóa Tòa nhà qua các form/handler hiện tại | Đạt |
| Chặn xóa Tòa nhà còn căn hộ | Đạt |
| Menu Tài khoản, đóng/mở thực tế bằng CSS, tự mở khi vào trang con | Đạt |
| Ẩn menu Người dùng khi chỉ có quyền roles.view; ẩn cả nhóm khi không có quyền | Đạt với mô phỏng can/canAny; không thay role thật hoặc backend |
| Loại tài khoản: thêm/sửa/xóa qua UI hiện tại | Đạt |
| Người dùng: thêm/sửa/xóa qua form/handler hiện tại | Đạt; chưa kiểm chứng sửa loại/scope qua renderer cũ vì chưa bật renderer đó |
| Duyệt đăng ký cư dân, badge chờ duyệt, tài khoản sau duyệt liên kết residentId | Đạt |
| Khóa tài khoản Người dùng | **Lỗi có sẵn:** lưu xong vẫn active; báo riêng, không sửa logic |
| Các kiểm tra trước: 11 tab Management, 6 forms, 7 mục Resident, hội thoại hai phía và giữ bản nháp | Đạt lại |
| Typecheck và hai bước build của npm run build | Đạt; bundle xuất vào thư mục tạm để giữ file build trong repo |
| Unit test domain hóa đơn và settings store | Đạt |
| Test tích hợp billing và workflows | Vẫn lỗi tại billing.integration.test.mjs:66 và workflows.test.mjs:42 như trước; chưa sửa logic |

Ảnh localhost đã chụp và xem:

- [Tòa nhà](audit-artifacts/building-accounts/buildings-localhost.png)
- [Menu Tài khoản](audit-artifacts/building-accounts/accounts-menu-localhost.png)

Đã đối chiếu bố cục với ảnh tham chiếu. Server kiểm thử bỏ các CDN trang trí để chạy offline nên ảnh thử thiếu font/icon CDN; không tuyên bố khớp từng pixel của font/icon. Khác số liệu/tên fixture là chủ ý để không sao chép dữ liệu trong ảnh vào code. Ảnh Hỗ trợ vẫn có hội thoại/bộ lọc đã phục hồi trước đó theo yêu cầu giữ chúng.

## 5. Nguy cơ và phần không tự sửa

- **UI Tòa nhà:** rủi ro thấp, CSS giới hạn dưới tab; dữ liệu, liên kết, form và validation giữ nguyên.
- **Menu Tài khoản:** rủi ro thấp, chỉ nhóm điều hướng và giữ quyền/badge hiện tại.
- **Toàn bộ bảng Người dùng cũ:** chưa phục hồi. Cần xử lý tương thích `accountTypeId`, `allBuildings`, `buildingIds`, metadata nhân viên và cơ chế lưu/quyền trước. Đổi mỗi renderer có thể hiện các control không lưu được hoặc làm sai kỳ vọng quyền.
- **Khóa tài khoản:** `toggleAccountLock` gửi patch status nhưng `RH.updateUser` không xử lý trường này. Cách sửa an toàn cần thêm kiểm tra người có quyền khóa, bảo vệ tài khoản hiện tại/Admin và đảm bảo authenticate tôn trọng trạng thái. Không thay logic trong đợt này.
- **Tìm kiếm/lọc người dùng theo UI cũ:** bảng legacy hiện tại chưa có bộ lọc của `RHAccounts.renderUsersTab`. Không tuyên bố đã phục hồi chúng hoặc giả lập loại tài khoản từ role rồi lưu đè dữ liệu. Ảnh thứ hai không cung cấp phần nội dung này.
- Giữ hai lỗi nghiệp vụ đã báo riêng và các hạn chế trong `MISSING-LOGIC-REPORT.md`.

Kết quả này phục hồi Tòa nhà và menu Tài khoản theo nguồn Git khớp phần thấy trong ảnh; **chưa phải phục hồi đầy đủ bảng Người dùng cũ hoặc sửa xong các nghiệp vụ tài khoản**.
