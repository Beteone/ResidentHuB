# Kiểm tra quyền Admin demo — 30/10/2026

## Kết luận và phạm vi xác minh

Chưa truy cập localStorage của máy B, nên chưa xác nhận nguyên nhân dữ liệu cụ thể hoặc lỗi đã hết trên máy B. Không được suy ra quyền từ email hay tên Admin.

Hai lỗi code đã xác minh:

- `dashboard.html:2905`: nút tạo tòa nhà trên Bảng tin thiếu điều kiện quyền. Nút vẫn xuất hiện khi `RHP.guard()` từ chối. Đã thêm `data-perm="buildings.create"` để `applyNavPermissions()` dùng cùng nguồn quyền với handler.
- `dashboard.html:5619`: listener `storage` bỏ sót `residenthub_account_types`. `RHP.can()` đã đọc quyền mới nhưng giao diện vẫn có thể giữ nút cũ. Đã bổ sung khóa này vào cơ chế refresh hiện có.

Đường phân quyền đầy đủ:

| Vị trí | Hàm / dòng | Nguồn quyết định |
| --- | --- | --- |
| Nút Bảng tin | dashboard.html:2905, applyNavPermissions:4393 | RHP.canAny → can |
| Nút danh sách | manager-modules.js:483, :502; addButton:353 | can('buildings.create') → RHP.can |
| Mở form | manager-modules.js:755 | guard('buildings.create') → RHP.guard |
| Lưu | manager-modules.js:833 | guard trước khi ghi; create/update tùy drawerId |
| Quyền | permissions.js:284, guard:352 | loại tài khoản và registry |
| Resolve | permissions.js:253 | phiên hiện tại từ RH.getSession; user từ kho users |
| Fallback | permissions.js:165 | thiếu/sai liên kết thì về at-building-manager |
| Khởi tạo | auth.js:777, :815; permissions.js:108, :150 | kho demo sạch: u-manager-1 → at-admin → fullAccess |
| Phiên hợp lệ | auth.js:1506 | đối chiếu user hiện tại, active và credentialVersion |

`at-building-manager` mặc định không có `buildings.create`. Các trường hợp tái hiện bị từ chối gồm thiếu liên kết, liên kết về quản lý thường, hoặc loại Admin đã bị giới hạn. Dữ liệu cũ được ưu tiên và không tự sửa khi tải trang. Code hiện tại không tự bật fullAccess cho mọi `at-admin`.

Cache của `resolve()` gồm ID phiên và chuỗi users/types trong localStorage; thay đổi hai kho này làm cache hết hiệu lực ở lần kiểm tra kế tiếp. Handler mở/lưu luôn kiểm tra lại. Một form đang mở có thể được giữ để tránh mất nội dung, nhưng việc thu hồi quyền vẫn chặn lưu.

## Chẩn đoán chỉ đọc trên cả hai máy

Sau khi cập nhật các file, giữ nguyên origin/profile cũ, tải lại hoàn toàn trang rồi mở Console:

```js
console.log(JSON.stringify(RHP.diagnoseBuildingCreate(), null, 2));
```

Báo cáo chỉ chọn ID, role, trạng thái, accountTypeId, loại đã resolve, fallback, fullAccess, buildings.create và phiên bản `building-permissions-2026-10-30-v2`. Không trả mật khẩu, token, raw session hoặc bản ghi người dùng đầy đủ. Các trường renderCheck/openFormCheck/saveCheck là quyết định chính sách hiện tại, không khẳng định hành động đã chạy. dashboardButtonVisible là trạng thái display của nút Bảng tin, không phải kiểm thử click.

So sánh origin (scheme/host/port), ID thực tế, accountTypeId và resolvedType trên hai máy. `127.0.0.1:5501` khác `localhost:5501` và `127.0.0.1:5500`. `permission-conflict` không chứng minh lỗi: quyền có thể đã bị thu hồi có chủ đích. `migrationRecorded` chỉ cho biết marker cũ tồn tại, không chứng minh khôi phục thành công.

## Cập nhật và phục hồi không mất dữ liệu

1. Người phụ trách sao lưu nguyên kho của từng profile/origin trước khi thao tác: localStorage và các kho nghiệp vụ đang dùng. Bản sao có thông tin xác thực nhạy cảm, cần giữ riêng, không gửi lên chat/Git. Giữ môi trường gốc nguyên trạng và kiểm tra bản sao có thể đọc được.
2. Cập nhật file source bằng quy trình của nhóm, không xóa storage. Tải lại hoàn toàn các tab. Chạy chẩn đoán trên cả hai máy, ghi nhận version và đối chiếu người dùng/loại thực tế.
3. Nếu có quản trị viên hợp lệ đã được cấp quyền, dùng màn hình quản lý tài khoản/loại tài khoản để kiểm tra cấu hình và thực hiện thay đổi đã được người phụ trách cho phép. Không sửa loại dùng chung chỉ để sửa một tài khoản demo. Không tự bật fullAccess hoặc dùng đoạn Console cấp quyền.
4. Nếu không có quản trị viên có quyền xác minh: dừng khôi phục quyền trên kho cũ. Người phụ trách chuẩn bị profile hoặc origin demo riêng, sạch; mở index.html và nhập mật khẩu demo thống nhất ít nhất 12 ký tự. Xác nhận ID u-manager-1, role manager, loại at-admin, fullAccess và thử mở/lưu một tòa nhà trước khi sử dụng.
5. Giữ bản sao và kho cũ. Việc phục hồi dữ liệu nghiệp vụ sang môi trường mới phải được người phụ trách chọn và kiểm tra từ bản sao, không nhập đè users/types/session cũ làm mất cấu hình mới, không chép mù toàn bộ storage. Hiện chưa có công cụ tự động hợp nhất dữ liệu được xác minh; không chạy reset/xóa kho để cập nhật.

`RHP.migrateDemoAdmin()` hiện trả `requires-trusted-reprovisioning`, không prompt, không ghi. Phiên bản trước cho phép tự tạo loại fullAccess riêng chỉ bằng mật khẩu trong localStorage; client không thể phân biệt quyền bị hỏng với thu hồi có chủ đích. Giữ tên hàm để caller cũ nhận từ chối rõ ràng. Không xóa marker/backup migration đã tồn tại.

Git pull chỉ cập nhật file, không cập nhật localStorage của trình duyệt. Code thống nhất schema, seed và đường kiểm tra; users, types, session và dữ liệu nghiệp vụ vẫn độc lập giữa máy/profile/origin. Không có đồng bộ đa máy. Để đồng bộ thật cần nguồn danh tính/quyền chung và kiểm tra quyền phía server.

## Kiểm thử và giới hạn

- `node tests/demo-admin.test.mjs`: kho sạch độc lập; liên kết thiếu/sai, at-admin giới hạn và tài khoản khác cùng loại không đổi; dữ liệu cũ/nhân viên/cư dân giữ nguyên; khóa phiên; chẩn đoán không ghi và không lộ mật khẩu; không khôi phục quyền qua client.
- `node tests/demo-admin.browser.mjs`: mỗi lần chạy tạo Chrome profile tạm riêng; đăng nhập bootstrap, thấy nút, click mở form và lưu tòa nhà qua handler thật; quản lý thường không có nút/không mở/không lưu; thu hồi quyền và sự kiện storage làm mới nút; tài khoản bị khóa không thao tác; kho cũ giữ nguyên và từ chối tự khôi phục.
- `node tests/auth-environment-audit.test.mjs`, `node tests/staff-defaults.test.mjs`, `node tests/data-consistency.test.mjs`: đạt. Bài audit có assertion ghi nhận khiếm khuyết API dữ liệu, không có nghĩa là khiếm khuyết đó đã được sửa.

Kiểm thử browser dùng Chrome headless với sandbox tắt trong môi trường kiểm thử bị hạn chế; loại bỏ tài nguyên trang trí CDN. Không thay đổi cấu hình trình duyệt của người dùng. Hai profile thử nghiệm có thể chứng minh luồng UI cục bộ; không đại diện cho localStorage thực tế của máy B.

Giới hạn bảo mật: RHD.create là API client tổng quát, chưa có kiểm tra quyền tạo tòa nhà ở lớp lưu trữ. Luồng UI giữ đầy đủ can/guard; sửa dữ liệu/JavaScript trực tiếp vẫn vượt được kiểm tra client. Chưa thay hệ thống phân quyền hoặc mở rộng sang backend trong thay đổi này. Chưa kết luận PASS trên máy B.
