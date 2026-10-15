# Cập nhật Tài khoản, Hợp đồng và Biểu mẫu

## Audit kiến trúc

- Ứng dụng tĩnh: `auth.js` lưu tài khoản toàn cục; `permissions.js` khai báo quyền và phạm vi tòa nhà; `data.js` lưu thực thể theo dataset live/demo trong localStorage. Không có backend/API hay cơ sở dữ liệu server trong repo.
- `customerId` trước đây là khách thuê duy nhất. Giữ trường này làm người đại diện, bổ sung `customerIds`; các bộ phân giải cư dân và phạm vi đọc được cả schema cũ lẫn mới.
- Thư viện `RHT` đã có seed, clone, mặc định và biến HTML. Tiếp tục dùng kho này; không tạo kho biểu mẫu thứ hai.
- Tài chính React lưu theo actor trong `residenthub_settings_v1_<actor>`, khác cấu hình tòa nhà `building.config`. Resolver thanh toán đọc các nguồn hiện hữu, cho phép chỉnh sửa và chụp lại trong hợp đồng.
- File trong `dist/settings` đã bị xóa và `dist/meter-reading.js` đã thay đổi trước lượt cập nhật này. Không sửa những thay đổi đó. Bundle invoice được build lại vì trực tiếp phục vụ các trường tiền mới.

## Thay đổi

- Quyền độc lập `users.createResident`, không tự cấp cho vai trò hiện có. Form tìm hồ sơ/tòa nhà/căn hộ bằng RHSelect. Hàm tạo tài khoản kiểm quyền, phạm vi, liên kết hợp đồng, trùng hồ sơ và số điện thoại. Chọn kích hoạt ngay hoặc chưa kích hoạt khi tạo; đăng ký tự phục vụ tiếp tục chỉ tạo yêu cầu pending.
- Trường tiền được đánh dấu tường minh, định dạng Việt Nam và parse lại số trước khi lưu. Không định dạng CCCD, số tài khoản ngân hàng, điện thoại, sức chứa hay chỉ số. React invoice dùng MoneyInput riêng.
- Hợp đồng nhiều khách, người đại diện, kiểm sức chứa và trùng thời gian. Tài sản lấy từ căn hộ; lưu số lượng, tình trạng, ghi chú và giá trị bàn giao. Lưu snapshot dịch vụ và thông tin ngân hàng cùng dữ liệu hợp đồng.
- Editor trực quan thay textarea HTML: font, cỡ chữ, tiêu đề, căn lề, danh sách, bảng/thêm/xóa hàng, điều khoản, ngắt trang, header/footer nội dung. Tìm/chèn biến đơn hoặc bảng bằng RHSelect. Xem trước bằng hợp đồng thực và cảnh báo biến thiếu.
- Mẫu hệ thống bị chặn ghi đè tại RHT.update. Lưu tùy chỉnh tạo bản sao; mỗi lần sửa giữ lịch sử; có thể lưu thành phiên bản mới, đặt mặc định theo loại/tòa nhà, tìm kiếm theo nội dung thẻ.
- Hợp đồng có ngày ký lưu HTML đã render, dữ liệu, template ID/version và HTML mẫu. Sửa mẫu không sửa snapshot. Trước khi sửa mẫu, hợp đồng cũ có ngày ký nhưng chưa có snapshot được chụp theo dữ liệu hiện có; đánh dấu `legacyCapture`, không tuyên bố phục hồi dữ liệu lịch sử đã mất.
- Xem/xuất hợp đồng từ danh sách hoặc xem trước trước khi lưu. In/Lưu PDF dùng iframe A4 chứa tài liệu; chặn xuất khi còn biến thiếu.

## Giới hạn còn lại

- Kiểm quyền hiện nằm ở UI và lớp ghi localStorage, **không phải kiểm quyền backend**. Không thể coi localStorage là ranh giới bảo mật giữa người dùng. Cần backend thật để đáp ứng phần yêu cầu server; không tự tạo kiến trúc ngoài phạm vi.
- DOCX hiển thị thông báo chưa hỗ trợ chính xác; không tạo file HTML giả DOCX.
- Header/footer là vùng nội dung có thể chỉnh sửa; chưa phải header/footer lặp tự động trên mọi trang như Word. PDF phụ thuộc engine in của trình duyệt; chưa có kiểm định so khớp từng trang giữa các trình duyệt. Font phải được cài/tải thành công trên máy xuất.
- Biến đơn dịch vụ/tài sản chỉ tự điền khi có đúng một bản ghi. Nhiều bản ghi dùng bảng lặp; không tự chọn tùy ý. Phí dịch vụ kỳ đầu/phát sinh chưa có số đã xác nhận cho phép nhập tay, không suy đoán tiêu thụ điện/nước.

## Kiểm tra

- `node tests/workflows.test.mjs`: quyền có/không, chống trùng, đăng ký pending, money round trip, sức chứa, khách trùng, hợp đồng giao thời gian, số lượng tài sản, bảo vệ mẫu gốc, nhiều bản sao, version, mặc định theo tòa nhà, biến thiếu, snapshot bất biến.
- `node tests/browser-workflows.test.mjs`: Edge với profile tạm riêng; mở form hợp đồng đầy đủ, định dạng/caret/xóa tiền, lưu numeric 1000000, form cư dân có tìm kiếm, lọc HTML thực thi, editor WYSIWYG và clone-on-save. Không truy cập dữ liệu trình duyệt người dùng.
- `node src/settings/settingsStore.test.mjs`: regression settings đạt.
- `npm run build -- --outDir .tmp-build --emptyOutDir false`: typecheck và build đạt; dùng output tạm để tránh xóa các bundle module khác.
- `npx vite build --config src/invoices/vite.config.ts`: bundle invoice đạt.
- `git diff --check`: đạt. Không push, merge hoặc commit trong lượt cập nhật này.

## File sửa/tạo

- Tài khoản: `permissions.js`, `auth.js`, `account-modules.js`.
- Hợp đồng và dữ liệu: `data.js`, `manager-modules.js`, mới `contract-documents.js`.
- Tiền: mới `money-input.js`, `asset-module.js`, mới `src/invoices/MoneyInput.tsx`, `src/invoices/InvoiceModal.tsx`, `src/invoices/InvoicePage.tsx`, build lại `dist/invoices/invoice.js`.
- Biểu mẫu: `templates.js`, `templates.html`, mới `template-editor.js`.
- `dashboard.html`: chỉ thêm script dependency và cho phép vào mục Tài khoản với quyền createResident; không đổi giao diện tổng thể hoặc định tuyến.
- Mới `tests/workflows.test.mjs`, `tests/browser-workflows.test.mjs`, báo cáo này.
