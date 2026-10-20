# Báo cáo rà soát tính năng và đồng nhất dữ liệu

**Ngày:** 17/10/2026  
**Phạm vi:** luồng dữ liệu quản lý, nhân viên, cư dân; hợp đồng, chỉ số, hóa đơn, thu chi, hỗ trợ và báo cáo.

## 1. Kiến trúc dữ liệu hiện tại

- `data.js` (`RHD`) là kho dùng chung trong trình duyệt cho tòa nhà, căn hộ, hồ sơ cư dân, hợp đồng, chỉ số, đặt cọc, hóa đơn, thu chi và yêu cầu hỗ trợ.
- `auth.js` lưu tài khoản đăng nhập; `permissions.js` (`RHP`) giải quyết loại tài khoản, quyền và phạm vi tòa nhà.
- Hợp đồng là liên kết trung tâm từ cư dân đến căn hộ; hóa đơn và yêu cầu được tra theo các liên kết đó.
- Dữ liệu thật và dữ liệu demo dùng các khóa localStorage riêng. Báo cáo chỉ đọc dữ liệu trong phạm vi tòa nhà người đang đăng nhập được xem.

## 2. Tính năng theo nhóm sử dụng

| Nhóm | Các phần chính |
|---|---|
| Quản lý / nhân viên | Bảng tin; tòa nhà; căn hộ; phí dịch vụ; khách hàng; đặt cọc; ghi và duyệt chỉ số; hợp đồng; hóa đơn; thu chi; yêu cầu hỗ trợ; thông báo; người dùng và loại tài khoản; báo cáo; biểu mẫu; cài đặt. Các mục được giới hạn theo quyền và phạm vi tòa nhà. |
| Cư dân | Tổng quan; hóa đơn; yêu cầu hỗ trợ và trao đổi; hợp đồng; thông báo; cài đặt; lịch. Dữ liệu lấy từ tài khoản cư dân, hồ sơ cư dân, căn hộ và hợp đồng liên kết. |
| Báo cáo | Báo cáo tài chính riêng: giao dịch thu chi và đặt cọc, công nợ hóa đơn, tiền cọc đang giữ, đối soát hóa đơn–phiếu thu; trang Thống kê riêng: tòa nhà/căn hộ, cư dân, hợp đồng, hóa đơn/công nợ và yêu cầu hỗ trợ; lọc theo kỳ/tòa nhà/trạng thái. Đối soát chỉ cảnh báo, không tự sửa dữ liệu. |

## 3. Những điểm đã đồng nhất

1. **Tài khoản và quyền:** lưu loại tài khoản, phạm vi tòa nhà, trạng thái, bộ phận, chức danh và mã nhân viên khi tạo/cập nhật. Loại tài khoản được chọn quyết định cổng quản lý hay cư dân. Tài khoản cũ thiếu loại quyền quản lý dùng vai trò mặc định giới hạn; loại quyền không khớp cổng không thể cấp nhầm quyền quản lý.
2. **Tạo tài khoản cư dân:** API kiểm quyền, kiểm tra hồ sơ/căn hộ tồn tại, phạm vi tòa nhà và ngăn liên kết một hồ sơ cư dân vào nhiều tài khoản. Quy trình duyệt đăng ký vẫn dùng đường xử lý nội bộ riêng.
3. **Nhiều người thuê trong hợp đồng:** thống nhất đọc `tenantIds` hiện hành và các trường cũ `customerIds`/`customerId`. Cư dân đồng thuê được phân giải đúng hợp đồng, hóa đơn và số liệu bảng tin; mẫu hợp đồng cũng lấy đủ danh sách người thuê.
4. **Hợp đồng:** lớp lưu dùng chung chặn trùng căn hộ/người thuê trong thời gian hợp đồng và chặn tài sản bàn giao không tồn tại, sai căn hộ, số lượng không hợp lệ hoặc lặp. Khi lưu hợp đồng đã có ngày ký, lớp lưu tạo/giữ snapshot tài liệu; sửa thông tin sau đó không thay snapshot đã ký.
5. **Chỉ số và hóa đơn:** tạo/sửa/xóa chỉ số báo cho engine billing; hóa đơn nháp định kỳ đúng căn hộ/kỳ được đánh dấu cần tính lại. Số liệu chỉ số lệch kỳ không được dùng để tính phí. Thay đổi chỉ số không tự sửa hóa đơn đã phát hành/thanh toán.
6. **Thu chi demo và báo cáo:** `cashflows` được đưa vào danh sách dữ liệu demo cần xóa khi reset. Bảng báo cáo làm mới an toàn khi tab chưa được dựng; test phép tính và các bộ lọc hiện có đạt.
7. **Hỗ trợ hai phía:** khi quản lý chuyển yêu cầu sang “Đã xử lý”, phản hồi được lưu làm ghi chú kết quả cư dân nhìn thấy; thời điểm xử lý/đóng được ghi nhận. Màn cư dân có fallback đọc phản hồi cũ khi chưa có ghi chú kết quả riêng.
8. **Cổng cư dân:** bỏ khai báo trùng `RH_SETTINGS` giữa hai script cùng scope toàn cục; lỗi cú pháp này trước đó ngăn toàn bộ script giao diện cư dân chạy.
9. **Báo cáo trống:** khi khoảng thời gian đang chọn không có phát sinh tài chính, báo cáo hiển thị bộ số liệu minh họa có giao dịch, công nợ và tiền cọc để xem trước. Dòng minh họa có mã `MH`, chỉ tồn tại trong bộ nhớ hiển thị, không ghi vào localStorage hay sổ nghiệp vụ. Tệp CSV/Excel/PDF xuất ra được gắn nhãn minh họa.
10. **Thống kê:** thêm trang con `Báo cáo / Thống kê` dùng nguồn thật `RHD` và phạm vi quyền `RHP`. Tỷ lệ lấp đầy loại căn bảo trì/ngừng khai thác; biểu đồ phân loại căn hộ được khởi tạo đồng bộ với KPI; nhóm cư dân phân biệt tổng hồ sơ khách hàng (khử trùng lặp), người đang cư trú và hồ sơ tạo trong kỳ; người đang cư trú được tính từ người thuê trên hợp đồng hiệu lực và hồ sơ gắn trực tiếp với căn hộ có người ở (kể cả người thuê thiếu hồ sơ khách hàng); hóa đơn hủy bị loại khỏi công nợ; yêu cầu tạo trong kỳ tách biệt với backlog hiện tại. Có bộ lọc kết hợp, biểu đồ, bảng phân trang/tìm kiếm, CSV/in và cập nhật theo sự kiện dữ liệu hiện có. Không có backend/API riêng.
11. **Dữ liệu mẫu Thống kê:** nút tạo/xóa có xác nhận lưu bộ dữ liệu minh họa trong khóa localStorage riêng theo môi trường (`residenthub_live_statistics_sample_data` hoặc `residenthub_demo_statistics_sample_data`). Các bản ghi có mã `MH` và chỉ được ghép vào báo cáo Thống kê; không thêm/sửa hồ sơ nghiệp vụ `RHD`, báo cáo tài chính hay sổ thu chi. Tạo lại thay thế bộ mẫu duy nhất, xóa chỉ gỡ khóa mẫu tương ứng.

## 4. Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| `node tests/workflows.test.mjs` | Đạt: quyền, hồ sơ, hợp đồng, số lượng bàn giao, snapshot và biểu mẫu. |
| `node tests/data-consistency.test.mjs` | Đạt: metadata tài khoản, vai trò, cư dân đồng thuê, hóa đơn liên kết và tách dữ liệu live/demo. |
| `node src/invoices/billing.integration.test.mjs` | Đạt: chỉ số đúng kỳ, đánh dấu hóa đơn nháp, duyệt/phát hành và bảo vệ hóa đơn đã phát hành. |
| `node tests/financial-report.test.mjs` | Đạt: KPI/bộ lọc, làm mới trước khi mount, số liệu minh họa khi kỳ chọn trống, giữ nguyên bản ghi thật ngoài kỳ và không ghi dữ liệu giả vào sổ nghiệp vụ. |
| `node tests/statistics-report.test.mjs` | Đạt: tòa nhà, tỷ lệ lấp đầy, căn bảo trì, hợp đồng đến hạn/trạng thái, cư dân đồng thuê, hóa đơn trả một phần/hoàn tiền, công nợ quá hạn, lọc tòa nhà/trạng thái/thời gian, bộ dữ liệu trống và phép tính trên dữ liệu mẫu. |
| `node tests/missing-logic-audit.mjs` | Chẩn đoán đạt: lưu metadata tài khoản, meter hook và chặn bàn giao tài sản sai đã được xác nhận. |
| `npm run typecheck` | Đạt. |
| `node tests/ui-restoration.browser.mjs` | Đạt: menu quản lý, tab/form chính, trang Thống kê độc lập, kiểm tra breadcrumb/tỷ lệ và xác thực khoảng ngày, hộp thư hỗ trợ, báo cáo minh họa khi kỳ trống (không hiện banner theo yêu cầu) và các khu vực cổng cư dân; không có lỗi console/runtime. Chẩn đoán tài sản vẫn ghi nhận API chưa hoàn thiện (xem giới hạn). |

## 5. Giới hạn và việc còn lại

- **Chưa có backend:** localStorage chỉ chia sẻ trong cùng trình duyệt/profile. Không thể đồng bộ thật giữa máy của nhiều nhân viên/cư dân, cũng không phải ranh giới bảo mật máy chủ. Muốn dữ liệu dùng chung nhiều thiết bị cần backend/API và đăng nhập/phân quyền phía server.
- **Tài sản:** module tài sản còn thiếu API/constants như `ASSET_CONDITIONS`, `nextAssetCode`, dependency `RHMoney` trong form và chưa nối đầy đủ vào menu/kho dữ liệu. Đã chặn dữ liệu bàn giao sai ở hợp đồng, nhưng chưa khôi phục toàn bộ quy trình quản lý tài sản.
- **Đối chiếu thu tiền:** trạng thái hóa đơn “đã thanh toán” không tự tạo phiếu thu, vì dữ liệu hiện có không nhất thiết cho biết ngày/phương thức thu thực tế. Báo cáo đối soát sẽ cảnh báo hóa đơn đã thu nhưng thiếu phiếu thu; không tự tạo giao dịch giả. Khi kỳ báo cáo không có phát sinh, phần xem trước hiển thị số liệu giả định với mã `MH`; tệp xuất được gắn nhãn minh họa.
- **Lịch chạy hóa đơn:** engine vẫn chạy trong phạm vi workspace trình duyệt; không đảm bảo tác vụ nền khi trình duyệt đóng hoặc đồng bộ lịch chạy giữa nhiều người dùng.
- **Hỗ trợ:** đã đồng nhất phản hồi khi xử lý xong; biểu mẫu quản lý hiện chưa cung cấp trường hẹn lịch riêng để đồng bộ `scheduledAt`.

Không có dữ liệu người dùng thật nào được xóa hoặc tự chỉnh trong quá trình rà soát; các kiểm tra dùng dữ liệu thử.
