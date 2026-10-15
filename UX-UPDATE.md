# Cập nhật UX: Người dùng, Biểu mẫu, In/Xuất hợp đồng

## Kiến trúc và phạm vi

Tiếp tục dùng RH/RHP cho tài khoản và quyền, RHSelect cho dropdown tìm kiếm, RHT cho thư viện/version, RHD cho dữ liệu hợp đồng và RHDocuments cho render/snapshot. Không đổi branch, API hoặc kho dữ liệu. Các thay đổi có sẵn từ lượt trước (money input, invoice, asset, settings/dist) được giữ; lượt này chỉ chỉnh ba khu vực được yêu cầu và dependency xuất tài liệu.

## File liên quan trong lượt này

- `account-modules.js`: bỏ luồng/nút tạo cư dân riêng; đưa Cư dân vào form Thêm người dùng. Đổi loại không làm mất các trường cơ bản đang nhập; chọn hồ sơ tự điền liên hệ và căn hộ từ hợp đồng. Cả quyền users.create và users.createResident được xét độc lập; hàm RH.createUser hiện có tiếp tục kiểm quyền và chống trùng ở lớp xử lý dữ liệu.
- `template-editor.js`: editor toàn màn hình, header lưu/nhân bản/preview, toolbar có icon và tooltip, trang A4, sidebar nhóm trường tiếng Việt, chip tại con trỏ, serialize về key cũ khi lưu. Mẫu hệ thống chỉ được tạo bản sao. Bản nháp riêng theo actor/dataset/template được lưu trên máy, khôi phục khi mở lại; đóng hoặc rời trang có bảo vệ thay đổi chưa lưu.
- `document-editor.css`: bố cục editor và preview chung, canvas/sidebar cuộn riêng, responsive 375px.
- `templates.html`: nạp stylesheet, nhãn trạng thái tiếng Việt. Preview thư viện cho chọn hợp đồng thật; chưa chọn thì chỉ xem dữ liệu minh họa có đánh dấu, không ghi vào dữ liệu nghiệp vụ.
- `templates.js`: clone kèm nội dung trong một lần ghi, để quyền tạo mẫu không cần quyền sửa mẫu khác. Tiếp tục giữ lịch sử khi cập nhật và lineage khi nhân bản.
- `contract-documents.js`: nhãn và hướng dẫn bổ sung dữ liệu tiếng Việt; preview có nút In, Tải PDF, Tải Word; lazy-load exporter khi cần. Người quản lý tòa nhà và người đại diện bên cho thuê là hai trường riêng. Dữ liệu mới không tự dùng người quản lý thay người đại diện ký. Snapshot hợp đồng đã ký không bị thay đổi.
- `manager-modules.js`: dùng preview chung; thêm thông tin bên cho thuê/người đại diện vào form hợp đồng để người dùng có nơi bổ sung dữ liệu xuất.
- `dashboard.html`: chỉ thêm CSS dùng bởi preview, không thay đổi bố cục/routing.
- `src/document-export/main.js`, `src/document-export/vite.config.js`, `dist/document-export/document-export.js`: xuất file thực với docx và html2pdf.js. DOCX là OOXML ZIP có bảng, A4, định dạng đoạn/chữ, header/footer và ngắt trang; PDF tải trực tiếp. Kiểm dữ liệu trước khi xuất, báo lỗi thay vì tạo DOCX không hỗ trợ ảnh. Exporter chỉ tải khi người dùng nhấn tải file.
- `package.json`, `package-lock.json`: dependency xuất tài liệu; npm run build tích hợp exporter và không xóa bundle khác trong dist.
- `tests/workflows.test.mjs`, `tests/browser-workflows.test.mjs`: mở rộng kiểm thử các luồng trên.

## Kiểm thử

- `npm run build`: typecheck, build hiện tại và build exporter đạt.
- `node tests/workflows.test.mjs`: kiểm quyền, đăng ký pending, chống trùng, clone với quyền create-only, mẫu hệ thống bất biến, phiên bản/mặc định, cảnh báo tiếng Việt, snapshot hợp đồng đã ký đạt.
- `node tests/browser-workflows.test.mjs`: Edge với profile tạm, chọn Cư dân ngay trong dropdown, tự điền/liên kết/tạo tài khoản, chèn chip/editor toàn màn hình, clone mẫu gốc, khôi phục bản nháp sau đóng, responsive 375px đạt.
- Kiểm DOCX bằng đọc ZIP/XML: nội dung tiếng Việt, bảng, khổ A4 và pageBreakBefore đạt. Kiểm PDF: signature, dung lượng khác rỗng và ít nhất hai trang sau ngắt trang đạt. Lệnh in được kiểm tra nhận HTML A4 đúng nội dung.
- Đã xem screenshot desktop của editor; kiểm bố cục header, toolbar, giấy A4, chip và sidebar.
- `node src/settings/settingsStore.test.mjs`: regression đạt. `git diff --check`: đạt.

## Giới hạn thực tế

- PDF tải trực tiếp được dựng bằng canvas: giữ hình thức nhưng nội dung chữ trong PDF là hình ảnh. In qua trình duyệt vẫn là luồng in HTML riêng.
- DOCX giữ các định dạng soạn thảo phổ biến và bảng, nhưng Word có thể dàn dòng khác trình duyệt; font phụ thuộc máy mở file. Ảnh/đối tượng không hỗ trợ được chặn và hướng dẫn dùng PDF. Đây không phải bộ chuyển đổi mọi loại HTML/CSS sang Word.
- Header/footer của DOCX là vùng lặp thật; PDF theo bố cục HTML, chưa tự lặp header/footer ở mọi trang.
- Draft lưu trên máy/trình duyệt hiện tại; không đồng bộ sang máy khác. Khi bộ nhớ đầy có cảnh báo trạng thái thay vì báo đã lưu.
- Repo chưa có backend: permission tại lớp xử lý là kiểm trong RH/localStorage, không phải cơ chế bảo mật server. Không tự bổ sung backend ngoài phạm vi.
- npm audit phát hiện source-map-js 1.2.1 trong chuỗi vite → postcss có advisory GHSA-68fv-2mgg-jv7q. Chuỗi này đã có trước dependency export; không tự nâng công cụ build ngoài phạm vi.

Tài liệu này cập nhật các giới hạn editor/export trong WORKFLOW-UPDATE.md của lượt trước. Không push, merge hoặc đổi branch.

Tham chiếu thư viện: [docx Packer](https://docx.js.org/api/classes/index.Packer.html), [html2pdf.js](https://github.com/eKoopmans/html2pdf.js).
