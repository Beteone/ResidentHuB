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

## Phân quyền (Loại tài khoản)

- `permissions.js` (`RHP`) là nơi **duy nhất** khai báo quyền: `PERMISSION_SCHEMA` = danh sách module + `actions` (view/create/update/delete) + `extra` (quyền nghiệp vụ). Ma trận trong *Tài khoản › Loại tài khoản* tự render từ đây.
- Thêm module mới: thêm 1 mục vào `PERMISSION_SCHEMA`, rồi dùng `RHP.can('module.action')` để ẩn nút và `RHP.guard('module.action')` ở đầu mỗi hàm ghi dữ liệu. Admin (`fullAccess`) tự có quyền mới.
- Phạm vi dữ liệu: người dùng có `allBuildings` hoặc chỉ các `buildingIds` + tòa mà họ là `managerId`. Lọc danh sách bằng `RHP.scopeList(entity, items)`.
- Trang (menu / tab) dùng `data-perm` và `TAB_PERMS` trong `dashboard.html`.

## Hóa đơn tự động (billing.js)

- `billing.js` (`RHB`) là engine duy nhất cho cả hóa đơn tự động và thủ công: tính tiền từ Tòa nhà (dịch vụ, đơn giá), Hợp đồng (giá thuê, chu kỳ, ngày bắt đầu/kết thúc) và **chỉ số điện/nước đã chốt và đã duyệt**.
- Quy trình: `draft` (Bản nháp) → `approved` (Đã duyệt) → `unpaid`/`sent` (Đã phát hành) → `paid`/`overdue`. Hóa đơn đã phát hành chỉ được **điều chỉnh** (hóa đơn điều chỉnh liên kết) hoặc **hủy** (có lý do). Cư dân và Bảng tin chỉ thấy hóa đơn đã phát hành (`RHD.isIssuedInvoice`).
- Chống trùng: mỗi kỳ tự động có khóa `contractId|YYYY-MM|monthly` lưu trong `billingRuns`. Chạy lại bao nhiêu lần cũng không tạo trùng.
- Lịch chạy: dự án chưa có backend (dữ liệu nằm ở localStorage), nên `RHB.run()` chạy khi trang Quản lý mở, mỗi giờ, và khi bấm nút ✨ trên trang Hóa đơn. Engine tự **chạy bù** mọi kỳ đã qua ngày tính tiền. Khi có backend, chỉ cần gọi `RHB.run({ today })` từ cron.
