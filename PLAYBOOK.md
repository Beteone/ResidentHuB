# Playbook dự án ResidentHuB

Hướng dẫn dành cho người mới tham gia phát triển, sửa lỗi và phát hành ResidentHuB. Đây là ứng dụng quản lý vận hành chung cư, gồm dashboard quản lý, giao diện cư dân và một số module React độc lập.

## 1. Bắt đầu nhanh

Yêu cầu Node.js/npm. Mở terminal tại thư mục gốc dự án:

```powershell
npm install
npm run typecheck
npm run build
```

Ứng dụng chủ yếu là web tĩnh. Có thể mở `index.html` hoặc chạy qua static server; `dashboard.html` là dashboard quản lý. Module Hóa đơn và Cài đặt có trang preview/build riêng, hướng dẫn ở mục 5. Các phần dùng Tailwind CDN/Font Awesome cần kết nối mạng để tải giao diện.

Sau khi build, kiểm tra `dist/` và mở trang bằng trình duyệt để xác nhận module cần sửa hiển thị đúng. Không cần chạy `npm install` lại nếu manifest không thay đổi và dependencies đã có.

## 2. Bản đồ kiến trúc

| Khu vực | Vai trò |
| --- | --- |
| `index.html`, `dashboard.html`, `resident-web.html` | Các trang web tĩnh của ứng dụng |
| Các file JS ở thư mục gốc như `auth.js`, `data.js`, `permissions.js`, `billing.js`, `manager-modules.js` | Logic dashboard và dữ liệu dùng chung; đây là đường đi hiện tại của nhiều chức năng quản lý |
| `src/meter-reading/` | Module React/TypeScript Ghi chỉ số, mount vào dashboard qua `MeterReadingApp` |
| `src/invoices/` | Module Hóa đơn độc lập, mount qua `InvoiceApp`; chưa thay thế luồng Hóa đơn cũ trong dashboard |
| `src/settings/` | Module Cài đặt độc lập; Nhật ký hoạt động có trang riêng được dashboard mở trong iframe |
| `src/document-export/` | Bundle hỗ trợ xuất tài liệu |
| `dist/` | Các bundle được trang tĩnh tải; một số bundle được commit để chạy mà không cần build tại máy triển khai |
| `tests/` và các test cạnh module | Kiểm thử workflow, audit logic và giao diện trình duyệt |

Ứng dụng hiện chưa có backend/API hay cơ sở dữ liệu máy chủ. Nhiều dữ liệu được lưu trong `localStorage`; localStorage không đồng bộ an toàn giữa người dùng/trình duyệt và không phải ranh giới bảo mật. Không mô tả hoặc triển khai quyền client-side như kiểm soát truy cập phía server.

## 3. Quy tắc thay đổi tính năng

### Trước khi sửa

1. Tìm luồng hiện tại trước khi thêm luồng mới: kiểm tra module gốc, trang gọi module, kho dữ liệu, phân quyền và các test liên quan.
2. Xác định trang nào đang dùng tính năng. Module có preview độc lập chưa chắc đã được gắn vào dashboard.
3. Xem các tài liệu trong repo, đặc biệt `README.md`, `WORKFLOW-UPDATE.md` và README riêng của module.
4. Kiểm tra trạng thái Git trước khi chỉnh sửa; giữ nguyên các thay đổi sẵn có không liên quan.

### Khi triển khai

- Giữ nguyên tương thích với dữ liệu/schema cũ nếu luồng hiện hữu còn đọc chúng; không tự ý xóa hoặc migrate dữ liệu trình duyệt.
- Dùng `permissions.js` làm nguồn khai báo quyền chung cho dashboard. Với thao tác ghi, kiểm quyền tại hàm xử lý dữ liệu, không chỉ ẩn nút trên giao diện. Lưu ý đây vẫn là kiểm tra phía client.
- Tái sử dụng dịch vụ/helper hiện có thay vì tạo kho dữ liệu hoặc quy tắc nghiệp vụ song song.
- Các trường tiền phải được parse/lưu dưới dạng số theo pattern hiện có; không áp định dạng tiền cho CCCD, số tài khoản, điện thoại, sức chứa hoặc chỉ số.
- Phân biệt trạng thái nháp, phát hành và thanh toán. Không sửa âm thầm hóa đơn đã phát hành; tuân theo luồng điều chỉnh/hủy hiện có.
- Với module React, giữ `mount`/`unmount` đúng hợp đồng tích hợp để tránh nhiều React root hoặc state cũ khi mở lại tab.
- Chỉ sửa mã nguồn; không chỉnh tay bundle trong `dist/`. Build lại đúng module và đưa bundle đầu ra cần thiết vào thay đổi.

### Dữ liệu và nghiệp vụ cần giữ đúng

- `permissions.js` (`RHP`) là nguồn quyền dashboard; dùng `RHP.can(...)`, `RHP.guard(...)` và `RHP.scopeList(...)` theo mục đích.
- `billing.js` (`RHB`) là engine hóa đơn đang dùng cho luồng cũ. Chỉ số điện/nước dùng để tính cần đúng kỳ và đã duyệt; hóa đơn tự động có khóa chống trùng.
- Ghi chỉ số và duyệt chỉ số là hai trạng thái khác nhau.
- Gửi thông báo theo lịch và chạy hóa đơn tự động dựa vào dashboard/localStorage; không có backend chạy nền. Tác vụ có thể chỉ được xử lý khi dashboard đang mở hoặc được mở lại.
- Khi thay đổi cách đọc/ghi dữ liệu, kiểm tra cả tài khoản, phạm vi tòa nhà và chế độ dữ liệu demo/live nếu chức năng liên quan.

## 4. Kiểm tra thay đổi

Chạy bộ kiểm tra nhỏ nhất liên quan trước; sau đó chạy thêm kiểm tra tổng quát nếu thay đổi chạm nhiều luồng.

### Kiểu và build

```powershell
npm run typecheck
npm run build
```

TypeScript bật strict và `noUnusedLocals`/`noUnusedParameters`, nên sửa lỗi kiểu và import thừa thay vì bỏ qua kiểm tra.

### Kiểm tra workflow dashboard

```powershell
node tests/workflows.test.mjs
node tests/browser-workflows.test.mjs
```

### Các module độc lập

```powershell
# Hóa đơn
node src/invoices/domain.test.mjs
node src/invoices/billing.integration.test.mjs
npx vite build --config src/invoices/vite.config.ts

# Cài đặt
node src/settings/settingsStore.test.mjs
node src/settings/browser.test.mjs
npx vite build --config src/settings/vite.config.ts

# Xuất tài liệu
npm run build:documents
```

Test browser có thể cần Microsoft Edge trên Windows. Browser test của Cài đặt và module khác dùng môi trường/profile thử nghiệm riêng; khi test báo lỗi môi trường, phân biệt lỗi thiếu browser/dependency với lỗi sản phẩm.

Các script audit bổ sung có trong `tests/`, gồm `missing-logic-audit.mjs`, `ui-merge-audit.mjs`, `building-account-checks.mjs` và `ui-restoration.browser.mjs`. Chọn script theo phạm vi thay đổi, không mặc định chạy tất cả cho một sửa đổi nhỏ.

## 5. Build, preview và lưu ý về `dist/`

- `npm run dev` theo dõi và build lại entry Ghi chỉ số; đây không phải dev server phục vụ toàn bộ dashboard.
- `npm run build` chạy typecheck, build module theo Vite mặc định và build xuất tài liệu.
- Hóa đơn: `npx vite build --config src/invoices/vite.config.ts`; test nghiệp vụ: hai lệnh Node ở mục 4.
- Cài đặt: `npx vite --config src/settings/vite.config.ts` để preview; build bằng lệnh Vite tương ứng ở mục 4.
- Trước khi build, xem cấu hình của module về `outDir` và `emptyOutDir`. Một số build có thể làm sạch `dist`; kiểm tra lại các bundle sibling sau khi chạy. Hướng dẫn hiện tại trong `src/invoices/README.md` lưu ý cần build lại Hóa đơn sau `npm run build` nếu bundle của nó bị xóa.
- Không xóa toàn bộ `dist/` để dọn build nếu chưa xác nhận tất cả bundle được tái tạo. So sánh `git status` trước/sau build; chỉ giữ các bundle bị ảnh hưởng trực tiếp.
- Khi sửa `src/meter-reading/`, đảm bảo `dist/meter-reading.js` được cập nhật. Với các module độc lập, không cho rằng build preview đồng nghĩa module đã được tích hợp vào dashboard.

## 6. Checklist trước khi hoàn tất thay đổi

- [ ] Đã kiểm tra các điểm gọi và các luồng dùng chung bị ảnh hưởng.
- [ ] Đã giữ nguyên tương thích dữ liệu cũ và phân biệt demo/live nếu phù hợp.
- [ ] Đã kiểm tra quyền, phạm vi dữ liệu và trạng thái nghiệp vụ liên quan.
- [ ] Đã chạy test phù hợp và typecheck/build cần thiết.
- [ ] Đã kiểm tra bằng trình duyệt với kích thước/luồng liên quan nếu có thay đổi UI.
- [ ] Đã xác nhận bundle `dist/` cần thiết tồn tại và không vô tình xóa bundle khác.
- [ ] Đã xem `git diff`/`git status`; không đưa vào thay đổi dữ liệu, ảnh chụp hoặc file sinh không liên quan.
- [ ] Đã cập nhật tài liệu module khi quy trình hoặc giới hạn của module thay đổi.

## 7. Giới hạn hiện tại cần nêu rõ

- Không có backend; localStorage là dữ liệu cục bộ, có thể bị mất khi xóa dữ liệu trình duyệt và không phù hợp cho đồng bộ nhiều người dùng.
- Phân quyền trong ứng dụng hiện hành là client-side, không thay thế xác thực/ủy quyền phía máy chủ.
- Lịch gửi thông báo và lập hóa đơn tự động không phải tác vụ nền đáng tin cậy khi không có backend.
- Module Hóa đơn mới chưa tự thay luồng cũ của menu dashboard; kiểm tra `src/invoices/README.md` trước khi thay đổi tích hợp.
- Mẫu thông báo/tài chính trong module Cài đặt là cấu hình cục bộ; không mặc định chúng đã gửi thông báo hoặc thực hiện thanh toán thật.

## 8. Tài liệu liên quan

- [README.md](./README.md): khởi chạy, phân quyền và hóa đơn tự động.
- [src/invoices/README.md](./src/invoices/README.md): phạm vi, tích hợp và giới hạn module Hóa đơn.
- [src/settings/README.md](./src/settings/README.md): preview, build và giới hạn module Cài đặt.
- [WORKFLOW-UPDATE.md](./WORKFLOW-UPDATE.md): các workflow tài khoản, hợp đồng và biểu mẫu đã cập nhật.
