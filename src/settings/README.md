# Module Cài đặt

Module React + TypeScript độc lập. Không import, ghi dữ liệu hoặc thay đổi module Ghi chỉ số / Hóa đơn, routing, phân quyền hiện có hay các cấu hình build chung.

## Xem thử và build

```powershell
npx vite --config src/settings/vite.config.ts
npx tsc --noEmit
npx vite build --config src/settings/vite.config.ts
node src/settings/settingsStore.test.mjs
node src/settings/browser.test.mjs
```

Trang preview tại URL Vite cung cấp. Build chỉ xuất vào `dist/settings`, không xóa bundle của module khác. Trang dùng Tailwind CDN giống các trang độc lập hiện tại; cần internet để tải CSS. SVG sử dụng đường nét Heroicons outline, không cần thêm dependency.

Browser test chạy sau build, dùng Edge headless trên Windows với profile tạm riêng và kiểm tra ở 1280/375/320px. Test không mở dashboard hay dùng localStorage của người dùng.

## Tích hợp khi cần

Import `SettingsLayout` và truyền `actor={{ id, name, role }}`. Role hỗ trợ: `manager`, `chief_accountant`, `staff`. Mặc định `demo=false`; chỉ preview bật bộ chọn vai trò mô phỏng và dữ liệu nhật ký mẫu. Có thể truyền `activityEntries` để hiển thị nhật ký từ nguồn dữ liệu thực. Remount bằng `key={actor.id}` khi đổi người dùng.

Dashboard hiện có mục **Cài đặt → Nhật ký hoạt động**, mở view chỉ đọc qua `dist/settings/index.html?view=activity`. View tách biệt bằng iframe để không ảnh hưởng CSS và form Cài đặt cũ. Mục này dùng quyền `settings.view` hiện có, không thêm hoặc đổi phân quyền. Các mục Cài đặt cũ được giữ nguyên. Toàn bộ layout mới vẫn có thể xem riêng qua Vite.

Cài đặt mới được lưu theo actor bằng khóa `residenthub_settings_v1_<actorId>`. Lưu một nhóm luôn đọc dữ liệu mới nhất và chỉ cập nhật nhóm đó. Lỗi đọc/lưu được hiển thị; không xóa dữ liệu cũ. View nhật ký dùng actor đang đăng nhập; chỉ chế độ Demo mới hiện lịch sử mẫu, chế độ thật không tự tạo lịch sử liên module.

Mẫu thông báo và tài chính là cấu hình cục bộ, chưa gửi Email/App hay xử lý thanh toán. Nhật ký thực trong preview chỉ ghi các lần lưu Cài đặt. Không ghi số tài khoản vào nội dung nhật ký. Phân quyền chỉ là mô phỏng phía client; khi tích hợp API, cần kiểm tra quyền ở server.

Số tài khoản dùng `type=text` + `inputMode=numeric`, chỉ nhận chữ số, giữ số 0 ở đầu và tránh làm tròn số dài. Tên chủ tài khoản tự viết hoa. Khoảng ngày nhật ký tính cả hai đầu theo múi giờ Asia/Bangkok. Đổi mục menu giữ nội dung đang sửa.
