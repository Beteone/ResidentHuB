# Biểu mẫu & In/Xuất hợp đồng

## Phạm vi thay đổi trong lượt này

- `contract-documents.js`: bỏ chặn In/PDF/Word khi thiếu thông tin; cảnh báo tiếng Việt nằm ngoài phần giấy in. Bản minh họa cũng có thể xuất và giữ nhãn minh họa trong nội dung. Không ghi, ký hoặc phát hành hợp đồng khi xuất.
- `manager-modules.js`: chỉ sửa nhánh xem trước bản nháp để không dùng validation của bước lưu/ký. Không sửa các module khác trong file này.
- `templates.js`: phân nhóm suy ra từ chức năng mẫu cũ, API tạo mẫu và chuyển nhóm, lưu file gốc khi import, bảo toàn ID/type/mapping/version/snapshot. Chuyển nhóm chỉ đổi metadata. Không chạy migration phân nhóm hoặc tạo thêm bản ghi cho các mẫu cũ.
- `templates.html`, `template-library.js`: thư viện 5 nhóm, đếm/tìm/lọc, tạo mẫu trắng, tải Word, xem trước, sửa, nhân bản, chuyển nhóm, tải lại file gốc. Nghiệp vụ CONTRACT/INVOICE vẫn độc lập với nhóm thư viện để dùng được trong các picker hiện có.
- `template-editor.js`, `table-tools.js`, `document-editor.css`: toolbar theo nhóm, lưới hover 8×10, form kích thước tùy chỉnh tối đa 100 hàng × 20 cột, thêm/xóa hàng/cột, gộp/tách ô, độ rộng và căn dọc. Chọn vùng ô bằng Shift + nhấp, hoặc gộp ô hiện tại với ô bên phải. Sửa lỗi con trỏ bị giữ trong chip làm chèn bảng thất bại. Giữ editor A4, binding, lưu phiên bản và khôi phục draft.
- `src/document-export/import-docx.js`: đọc OOXML bằng JSZip hiện có, chuyển text/run/paragraph/heading/list/table/merged cells/width/font/alignment/page break và header/footer phổ biến sang HTML được kiểm soát; không thực thi HTML, macro hoặc tải tài nguyên ngoài. File gốc lưu cùng mẫu mới.
- `src/document-export/main.js`, `dist/document-export/document-export.js`: cho xuất bản nháp, import DOCX, giữ độ rộng/căn ô khi xuất Word.
- `package.json`, `package-lock.json`: khai báo trực tiếp JSZip vốn đã có trong dependency docx, không thêm engine editor khác.
- `tests/workflows.test.mjs`, `tests/browser-workflows.test.mjs`: kiểm thử mở rộng. Các file module ngoài phạm vi đã có thay đổi trước lượt này được giữ nguyên; không reset chúng.

## Kiểm thử đạt

- Build/typecheck: `npm run build`.
- Logic: `node tests/workflows.test.mjs` — phân loại không đổi ID/số lượng, mẫu hệ thống, version, chuyển nhóm không đổi snapshot; validation ký vẫn từ chối thông tin bắt buộc bị thiếu.
- Edge: `node tests/browser-workflows.test.mjs` — form thiếu thông tin vẫn preview/export; grid hover/click và custom table; thêm cột/gộp/tách; file DOCX/PDF thực với dữ liệu thiếu; PDF nhiều trang; DOCX chứa text/table/A4/page break.
- Import bằng file DOCX thật: xem trước bảng, lưu một mẫu mới, giữ file gốc byte-for-byte, sửa và chèn chip, render với dữ liệu hợp đồng hiện có. Từ chối file giả DOCX và file có macro.
- Regression settings: `node src/settings/settingsStore.test.mjs` đạt.
- `git diff --check` đạt. Không push, merge hoặc đổi branch.

## Giới hạn còn lại

- DOCX tối đa 2 MB; dữ liệu giải nén tối đa 30 MB, từng thành phần tối đa 12 MB. Lưu file gốc dùng localStorage hiện tại nên tổng dung lượng thư viện phụ thuộc quota trình duyệt. Thiếu bộ nhớ sẽ báo lỗi và giữ nội dung đang soạn.
- Không nhập PDF. DOCX có ảnh, sơ đồ, chữ ký ảnh được cảnh báo là chưa nhập các phần đó; file gốc vẫn giữ để đối chiếu. Các section/header phức tạp, text box, đánh số nhiều cấp và mọi kiểu dàn trang đặc thù của Word chưa được bảo toàn đầy đủ. Không tuyên bố chuyển đổi giống Word từng pixel.
- Thêm/xóa hàng/cột trong bảng có ô gộp yêu cầu tách ô trước, tránh làm hỏng cấu trúc. Công cụ gộp hỗ trợ vùng chữ nhật chưa gộp.
- PDF tải trực tiếp vẫn dùng canvas; chữ trong PDF là ảnh. DOCX có thể dàn dòng khác trình duyệt tùy font/máy mở. Các giới hạn export chung còn lại trong UX-UPDATE.md tiếp tục áp dụng, ngoại trừ việc chặn xuất khi thiếu dữ liệu đã được bỏ ở lượt này.

Tham chiếu: [WordprocessingML tables](https://learn.microsoft.com/en-us/office/open-xml/word/working-with-wordprocessingml-tables), [JSZip loadAsync](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html).
