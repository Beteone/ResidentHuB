# ResidentHuB
Hệ thống quản lý cư dân chung cư hiệu quả, tiện ích

## Phát triển

Web chạy tĩnh (mở `index.html` hoặc dùng bất kỳ static server nào). Riêng module **Ghi chỉ số** viết bằng React + TypeScript và cần build:

```bash
npm install        # lần đầu
npm run build      # kiểm tra kiểu TypeScript rồi build src/meter-reading → dist/meter-reading.js
npm run dev        # build lại tự động khi sửa file trong src/
```

- Mã nguồn: `src/meter-reading/` (`MeterReadingPage` giữ state; `DashboardCards`, `RecordTable`, `AddRecordModal`, `MeterBlock`, `PhotoViewer`).
- `dist/meter-reading.js` được commit vào repo để web vẫn chạy tĩnh không cần build. Sửa code trong `src/` thì nhớ chạy `npm run build` và commit cả file trong `dist/`.
- Class Tailwind do Tailwind CDN trong `dashboard.html` sinh ra lúc chạy.
- Hướng dẫn phát triển, kiểm thử và build các module: [PLAYBOOK.md](./PLAYBOOK.md).
- Tài liệu giới thiệu sản phẩm dành cho Marketing/Content: [docs/PRODUCT-INTRODUCTION-FOR-MARKETING.md](./docs/PRODUCT-INTRODUCTION-FOR-MARKETING.md).

## Phân quyền (Loại tài khoản)

### Admin demo cục bộ

- Chạy static server tại `localhost`, `127.0.0.1` hoặc `[::1]` rồi mở `index.html`. Live Server của repo dùng port 5501; `npm run dev` chỉ build/watch bundle.
- Trên kho demo mới, nhập mật khẩu chung do nhóm tự thống nhất (ít nhất 12 ký tự) một lần. Mật khẩu không được đưa vào source hoặc Git. Đăng nhập bằng `manager@residenthub.vn` (ID cố định `u-manager-1`). Hủy hoặc mật khẩu quá ngắn sẽ bỏ qua; có thể tải lại để thử lại.
- Bootstrap chỉ tạo `u-manager-1` / `manager@residenthub.vn` khi chưa có tài khoản và dữ liệu nghiệp vụ; không tự tạo tài khoản mẫu vào kho người dùng cũ. `index.html` nạp `permissions.js` để tạo bộ quyền chuẩn trước khi chuyển trang. Cùng code, hai kho sạch có cùng quyền Admin qua `fullAccess` và registry hiện có.
- Tài khoản và loại quyền cũ được giữ nguyên; không tự đổi `accountTypeId`, khôi phục `fullAccess` hoặc cập nhật quyền nhân viên cũ. Cư dân/nhân viên demo đã tồn tại được giữ nguyên, kể cả mật khẩu và trạng thái khóa. Cấu hình khác chuẩn có thể là thu hồi có chủ đích; không tự suy đoán.
- Sau cập nhật, giữ nguyên hostname/port và profile, tải lại trang rồi dùng mật khẩu cũ. Không xóa storage. Chạy `RHP.inspectDemoAdmin()` trong Console: `ready` nghĩa là loại đang liên kết có toàn quyền; `permission-conflict` nghĩa là cần đối chiếu; `identity-conflict` / `invalid-store` nghĩa là phải dừng để kiểm tra. Hàm chỉ đọc và không trả mật khẩu.
- Client-side credentials cannot authorize restoring revoked Admin grants. `RHP.migrateDemoAdmin()` now refuses all writes. Back up the old environment and provision a separate clean demo with the responsible administrator.
- Run `RHP.diagnoseBuildingCreate()` on each machine for a read-only permission report. See [audit and recovery procedure](docs/DEMO-ADMIN-PERMISSIONS.md).
- Live không tự seed dữ liệu mẫu. Demo chỉ seed khi chưa tồn tại bất kỳ tập dữ liệu nghiệp vụ nào; không xóa storage để cập nhật phiên bản. Dữ liệu và mật khẩu hiện có vẫn riêng theo origin/profile/thiết bị, chưa đồng bộ giữa máy.

- `permissions.js` (`RHP`) là nơi **duy nhất** khai báo quyền: `PERMISSION_SCHEMA` = danh sách module + `actions` (view/create/update/delete) + `extra` (quyền nghiệp vụ). Ma trận trong *Tài khoản › Loại tài khoản* tự render từ đây.
- Thêm module mới: thêm 1 mục vào `PERMISSION_SCHEMA`, rồi dùng `RHP.can('module.action')` để ẩn nút và `RHP.guard('module.action')` ở đầu mỗi hàm ghi dữ liệu. Admin (`fullAccess`) tự có quyền mới.
- Phạm vi dữ liệu: người dùng có `allBuildings` hoặc chỉ các `buildingIds` + tòa mà họ là `managerId`. Lọc danh sách bằng `RHP.scopeList(entity, items)`.
- Trang (menu / tab) dùng `data-perm` và `TAB_PERMS` trong `dashboard.html`.
- Dashboard có mục **Quản lý thông báo** để xem thống kê, lọc lịch sử, xem chi tiết, lưu bản nháp, hẹn giờ và gửi thông báo tới toàn bộ cư dân, theo tòa nhà hoặc theo căn hộ. Có thể đính kèm tối đa 4 ảnh JPG, PNG hoặc WebP; ảnh được nén tự động (tối đa 900 KB tổng dung lượng) và cư dân có thể bấm để xem ảnh lớn. Ảnh được lưu một lần theo chiến dịch để tránh nhân bản trong từng tài khoản cư dân. Lịch sử hiển thị một dòng cho mỗi chiến dịch; trạng thái đã đọc được đồng bộ. Do ứng dụng hiện dùng localStorage, lịch gửi được xử lý khi dashboard quản lý đang mở hoặc vào lần tiếp theo mở dashboard sau giờ hẹn.

## Hóa đơn tự động (billing.js)

- `billing.js` (`RHB`) là engine duy nhất cho cả hóa đơn tự động và thủ công: tính tiền từ Tòa nhà (dịch vụ, đơn giá), Hợp đồng (giá thuê, chu kỳ, ngày bắt đầu/kết thúc) và **chỉ số điện/nước đã chốt và đã duyệt**.
- Quy trình: `draft` (Bản nháp) → `approved` (Đã duyệt) → `unpaid`/`sent` (Đã phát hành) → `paid`/`overdue`. Hóa đơn đã phát hành chỉ được **điều chỉnh** (hóa đơn điều chỉnh liên kết) hoặc **hủy** (có lý do). Cư dân và Bảng tin chỉ thấy hóa đơn đã phát hành (`RHD.isIssuedInvoice`).
- Chống trùng: mỗi kỳ tự động có khóa `contractId|YYYY-MM|monthly` lưu trong `billingRuns`. Chạy lại bao nhiêu lần cũng không tạo trùng.
- Lịch chạy: dự án chưa có backend (dữ liệu nằm ở localStorage), nên `RHB.run()` chạy khi trang Quản lý mở, mỗi giờ, và khi bấm nút ✨ trên trang Hóa đơn. Engine tự **chạy bù** mọi kỳ đã qua ngày tính tiền. Khi có backend, chỉ cần gọi `RHB.run({ today })` từ cron.
