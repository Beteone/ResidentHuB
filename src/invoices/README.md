# Quản lý Hóa đơn

Trang độc lập: mở `/invoice.html` qua web server hiện có. Khi không có `window.RHD`, trang dùng 5 hóa đơn mẫu liên kết với 5 phòng mẫu, gồm các trạng thái nháp, phát hành, thu đủ và hủy.

```powershell
npm run typecheck
npx vite build --config src/invoices/vite.config.ts
node src/invoices/domain.test.mjs
node src/invoices/billing.integration.test.mjs
```

Build riêng ghi vào `dist/invoices/`, không xóa hoặc ghi đè bundle Ghi chỉ số. Lưu ý `npm run build` hiện tại của dự án xóa toàn bộ `dist`; sau khi chạy lệnh đó cần build lại module Hóa đơn bằng lệnh riêng bên trên.

Các file hiện có giữ nguyên. Vì vậy menu Hóa đơn trong dashboard vẫn chạy luồng cũ. Module mới có entry `InvoiceApp.mount(element)` và `InvoiceApp.unmount()` để tích hợp sau: tải `dist/invoices/invoice.js` trên trang đã có auth/data/permissions, rồi mount vào container riêng. Chưa tự thay menu hoặc renderer cũ.

Adapter chỉ đọc `RHD` (phòng, tòa nhà, hợp đồng, khách thuê, chỉ số); không gọi create/update/remove vào kho dữ liệu hiện tại. Chọn phòng/kỳ mô phỏng fetch, lấy bản ghi điện/nước mới nhất đúng `readingPeriod` (tương thích `periodMonth` cũ), có đủ chỉ số và được duyệt riêng từng loại. Tiêu thụ là chỉ số mới trừ chỉ số trước, bao gồm 0 hợp lệ. Không có/không duyệt thì cảnh báo và chặn phát hành. Trong dữ liệu kết nối, tiền thuê lấy từ hợp đồng trong kỳ, phí/đơn giá lấy từ dịch vụ được chọn và giá ghi đè hợp đồng; điện/nước không áp dụng không bắt buộc chỉ số. Các mức 150.000đ, 3.500đ/kWh và 25.000đ/m³ chỉ dùng cho mock độc lập.

Luồng dashboard hiện có dùng `billing.js`: kỳ hóa đơn là kỳ tiêu thụ, không lấy tháng của ngày chốt hoặc thay bằng kỳ trước (`meterPeriod` cũ không còn dịch chuyển truy vấn chỉ số). Ngày thu, chu kỳ thuê, lịch tự lập và phí cố định vẫn theo cấu hình hiện tại. Thay đổi chỉ số chỉ đánh dấu nháp cùng căn/kỳ cần tính lại; thao tác tính lại yêu cầu xác nhận nếu có khoản nhập/chỉnh tay hoặc dữ liệu cũ chưa có dấu nguồn. Không sửa hóa đơn đã phát hành/thanh toán.

Audit dữ liệu trình duyệt đang mở: `RHB.auditInvoices()` trả về mã, kỳ, trạng thái, lỗi và cờ `issued`, không ghi dữ liệu. Khi bấm lập tự động, cảnh báo liệt kê hóa đơn đã phát hành/thanh toán bị ảnh hưởng trong phạm vi tài khoản; xem trước dùng khung cảnh báo hiện có. Nháp được sửa bằng nút “Tính lại từ dữ liệu”; hóa đơn đã phát hành xử lý bằng quy trình điều chỉnh hiện tại. Không có migration tự chạy hoặc xóa dữ liệu cũ.

Hóa đơn lưu localStorage với namespace riêng theo chế độ và tài khoản, không dùng store `invoices` cũ. Quyền dùng `invoices.view/create/update/issue/collect/delete` và phạm vi tòa nhà hiện có nếu RHP được cung cấp. Phát hành chỉ chuyển trạng thái cục bộ; chưa gửi thông báo cho cư dân hoặc ghi vào sổ hóa đơn cũ. Cần API khi triển khai nhiều người dùng; localStorage không bảo đảm giao dịch đồng thời.

Kỳ thu lưu `YYYY-MM`, hạn thanh toán lưu `YYYY-MM-DD`; UI hiển thị tháng/ngày theo Việt Nam. Quá hạn là trạng thái hiển thị suy ra từ hóa đơn phát hành còn nợ, tính theo ngày tại Asia/Bangkok; không sửa status đã lưu. Thống kê theo bộ lọc, bao gồm nháp và loại hóa đơn hủy. Thu tiền hỗ trợ trả một phần; hủy hóa đơn đã thu một phần bị chặn để không làm mất khoản thu. Preview và hóa đơn đã phát hành chỉ đọc.

Trang độc lập dùng Tailwind CDN và Font Awesome giống cách dashboard hiện tại tải giao diện; cần mạng để tải style/icon. Các kiểm thử tự động kiểm tra quy tắc tiền và vòng đời; chưa có kiểm thử trình duyệt tự động.
