# ResidentHub — logic thiếu và tác động chức năng hiện tại

Kiểm tra ngày 16/10/2026, trên branch `Chi`, HEAD `fc00fe6`.

**Chỉ kiểm tra và báo cáo. Không phục hồi logic cũ, sửa auth/data/permissions/billing/rental-domain, commit, push hoặc merge.** Các phép thử dùng bộ nhớ sandbox hoặc profile Edge riêng, không dùng dữ liệu người dùng.

## 1. Tài khoản và phạm vi phân quyền — xác nhận lỗi chức năng

**Chức năng bị ảnh hưởng:** tạo/sửa người dùng có loại tài khoản, phạm vi tòa nhà và thông tin nhân viên; truy cập Management của tài khoản mới.

**Tái hiện:** gọi API hiện tại `RH.createUser` với loại Admin, `allBuildings: true`, `buildingIds`, `department`, rồi gọi `RH.updateUser` với các trường đó. API báo thành công nhưng bản ghi đọc lại không có các trường này. Sau đăng nhập bằng tài khoản thử vừa tạo, `RHP.can('dashboard.view')` trả `false`.

**Nguyên nhân:** `auth.js` không lưu các trường mà `permissions.js` và `account-modules.js` yêu cầu. UI Tài khoản hiện tại còn dùng bảng legacy, không phải renderer người dùng có phân quyền. Không phải mọi tài khoản sẵn có đều hỏng: tài khoản đã có metadata hợp lệ trong storage vẫn có thể hoạt động.

**Kiểm tra bổ sung khi phục hồi menu theo ảnh:** thao tác khóa qua `toggleAccountLock` vẫn để tài khoản thử ở `active`: `RH.updateUser` không ghi patch `status`. Chưa sửa logic. Xem `BUILDING-ACCOUNT-RESTORATION.md` để có bằng chứng UI/CRUD/duyệt tài khoản và phạm vi menu đã phục hồi.

**Phương án an toàn:** bổ sung xử lý metadata vào đúng API tạo/sửa người dùng; kiểm tra người thao tác có quyền gán loại tài khoản và scope, giữ trường không được phép sửa, không tự gán Admin cho mọi tài khoản cũ. Xác định cách xử lý tài khoản thiếu metadata trước khi nối renderer mới. Giữ nguyên đăng ký/phê duyệt và liên kết cư dân.

**Nguy cơ xung đột:** cao. Việc chép auth cũ có thể làm mất các thay đổi đăng ký, phê duyệt cư dân, tạo hợp đồng nháp, liên kết căn hộ và thông báo. Việc gán scope mặc định sai có thể mở rộng hoặc chặn quyền ngoài ý muốn.

## 2. Tài sản — xác nhận thiếu điểm nối và không thể dùng đầy đủ

**Chức năng bị ảnh hưởng:** truy cập module từ menu, mở form thêm/sửa, chọn tình trạng và tạo mã tài sản.

**Tái hiện:** module không được nối trong dashboard hiện tại. Trong profile thử, tải chính `asset-module.js` đang có mà không sửa code: mở chi tiết tài sản thử không phát sinh lỗi; mở form gặp `RHMoney is not defined`. Dropdown tình trạng có 0 lựa chọn. `RHD.nextAssetCode` và `RHD.ASSET_CONDITIONS` đều là `undefined`; registry thiếu `assets`/`assetTypes`.

**Nguyên nhân:** thiếu script/UI wiring và API dữ liệu mà module cần. Không kết luận rằng mọi thao tác hoặc dữ liệu tài sản đều mất: `RHD.list/create` vẫn nhận entity tùy ý và helper tình trạng có fallback. Tuy nhiên nhánh tạo mới gọi `RHD.nextAssetCode()` nên không thể tạo mã; catch hiện tại có thể báo nhầm lỗi này thành đầy bộ nhớ.

**Phương án an toàn:** phục hồi dependency `money-input.js`, constants/API mã tài sản và registry còn thiếu theo cách chỉ bổ sung; giữ dữ liệu hiện tại, tạo mã theo mã lớn nhất và kiểm tra trùng. Sau khi kiểm tra đọc/sửa/thêm và phân quyền mới nối menu/container/renderer.

**Nguy cơ xung đột:** vừa đến cao. Entity/seed/reset demo, mã tài sản, scope tòa nhà và tài sản bàn giao hợp đồng cùng dùng dữ liệu này. Không seed lại toàn bộ hoặc thay `data.js` bằng bản cũ.

## 3. Phản hồi và quy trình xử lý hỗ trợ — xác nhận lỗi hai phía

**Chức năng bị ảnh hưởng:** phản hồi trong form xử lý gửi tới Resident, lịch hẹn, kết quả xử lý và mốc thời gian của tiến trình yêu cầu.

**Tái hiện trên UI thực tế:** ở Management, nhập `AUDIT_RESPONSE_ONLY` vào `srResponse`, chọn `resolved`, lưu. Bản ghi có `status: resolved`, `response` đã lưu, nhưng `resolvedAt` và `resolutionNote` không có. Sang Resident, mở đúng yêu cầu: nội dung phản hồi vừa lưu không xuất hiện. Form Management không có trường lịch hẹn. Hội thoại tin nhắn được khôi phục vẫn gửi/nhận được bình thường.

**Nguyên nhân:** handler Management chỉ ghi `status`, `assignee`, `response`, `updatedAt`. Resident dựng phần kết quả từ `resolutionNote`, lịch từ `scheduledAt` và tiến trình từ các timestamp. `loadResidentRequests` không đưa `response` vào dữ liệu hiển thị này.

**Phương án an toàn:** xác định một schema tương thích cho phản hồi/kết quả trước; có thể đọc fallback từ dữ liệu hiện hữu nhưng không tự ghi đè `resolutionNote` bằng mọi `response`. Nối các field lịch hẹn/ghi chú/kết quả vào handler hiện tại; áp dụng timestamp theo chuyển trạng thái sau khi duyệt quy tắc; giữ nguyên mảng tin nhắn, rating và thông báo. Chức năng xóa phải có quyết định về quyền vì schema hiện tại chỉ có view/update.

**Nguy cơ xung đột:** cao. Đồng nhất sai `response` và `resolutionNote` có thể hiển thị nội dung sai, thay quy trình nghiệm thu/đóng/mở lại yêu cầu hoặc gửi thông báo trùng. Không chép lại toàn bộ handler cũ.

## 4. Chỉ số → hóa đơn — xác nhận lỗi chức năng

**Chức năng bị ảnh hưởng:** cảnh báo hóa đơn nháp cần tính lại khi tạo/sửa/xóa chỉ số cùng kỳ/căn hộ.

**Tái hiện:** phép thử tạo/sửa/xóa meter ghi nhận 0 lần gọi `RHB.meterChanged`. Test tích hợp hiện có thất bại ở `src/invoices/billing.integration.test.mjs:66` vì `needsRecalculation` không được đặt thành `true`.

**Nguyên nhân:** thiếu hook trong `RHD.create/update/remove`; engine `RHB.meterChanged` vẫn còn. Probe lịch sử cho thấy hook còn trong `b04eae6` nhưng mất ở `6fe440f`, trước hai merge đang điều tra.

**Phương án an toàn:** thêm lại điểm nối cho meters, bao gồm cả dữ liệu trước/sau khi chuyển kỳ hoặc căn hộ. Chỉ đánh dấu bản nháp cần tính lại; không tự sửa tổng tiền hóa đơn đã phát hành/thanh toán. Kiểm tra thêm tránh xử lý lặp khi đồng bộ giữa các tab.

**Nguy cơ xung đột:** vừa đến cao. Liên quan module meter React, nhiều công tơ, kỳ tính tiền, trạng thái duyệt và vòng đời hóa đơn mới. Không khôi phục toàn bộ CRUD cũ.

## 5. Tài sản bàn giao hợp đồng — xác nhận thiếu chốt kiểm tra ở tầng lưu

**Chức năng bị ảnh hưởng:** lưu hợp đồng có số lượng tài sản bàn giao vượt số lượng có sẵn qua `RHD.create`, và tính nhất quán của các luồng dùng storage trực tiếp.

**Tái hiện với cùng dữ liệu thử:** có 1 tài sản, hợp đồng bàn giao 2. `RHDocuments.validate` trả lỗi “Số lượng hoặc tài sản bàn giao không hợp lệ.”; `RHD.create('contracts', ...)` vẫn trả `ok: true`. Test `tests/workflows.test.mjs:42` thất bại tương ứng.

**Nguyên nhân:** `RHDocuments.prepare` không còn được gọi trong CRUD hợp đồng. Tích hợp có ở `b04eae6`, mất ở `6fe440f`. Module hợp đồng mới hiện đi qua `RHLease`.

**Giới hạn kết luận:** đã chứng minh storage không bảo vệ điều kiện này; không suy ra mọi thao tác lưu qua UI mới đều bỏ qua mọi validation. UI mới còn có validator riêng. Hợp đồng nháp tạo từ phê duyệt cư dân cũng là một luồng cần giữ tương thích.

**Phương án an toàn:** thống nhất điểm kiểm tra/adaptor giữa `RHDocuments`, `RHLease` và các luồng lưu trực tiếp, phân biệt nháp/ký, metadata bàn giao và snapshot. Không bắt mọi hợp đồng nháp thỏa toàn bộ điều kiện ký của validator cũ.

**Nguy cơ xung đột:** cao. Có khác biệt `tenantIds`/`customerIds`, hợp đồng từ cọc, tài sản bàn giao, biểu mẫu, snapshot và trạng thái kết thúc. Chèn prepare cũ vào CRUD một cách máy móc có thể chặn chức năng mới.

## 6. Chạy billing tự động — thiếu trigger cũ, engine vẫn hoạt động

**Chức năng bị ảnh hưởng:** tự kiểm tra kỳ đến hạn khi mở/làm mới dashboard như luồng cũ.

**Bằng chứng:** `runScheduledBilling` không còn trong dashboard so với parent thứ nhất của `4475c45`. Tuy nhiên hiện tại **vẫn có** `RHB.run()` khi lưu tòa nhà bật autoInvoice và trong `RHUI.runAutoBilling`. Probe sandbox có tòa nhà/hợp đồng đủ điều kiện: trước khi gọi engine có 0 hóa đơn, gọi rõ ràng `RHB.run({today:'2026-10-16'})` tạo 1 hóa đơn nháp.

**Kết luận:** không được báo rằng engine tự động lập hóa đơn đã mất hoàn toàn. Engine và một số điểm gọi còn; phần chạy theo lịch khi vào dashboard không còn điểm nối cũ. Chưa thử hành vi theo nhiều ngày thực tế hoặc môi trường cron ngoài repo.

**Phương án an toàn:** xác định trigger được mong đợi; nếu bổ sung lại thì dùng engine hiện tại, khóa chống chạy đồng thời và ledger chống trùng. Kiểm tra quyền/scope trước khi cho trigger chạy, giữ cơ chế chỉ tạo nháp và báo các kỳ thiếu chỉ số.

**Nguy cơ xung đột:** cao nếu bật lại mà chưa kiểm tra quyền và lịch: có thể tạo bù nhiều kỳ hoặc tạo hóa đơn ngoài phạm vi người đang thao tác. Không tự nối lại trong đợt sửa UI này.

## 7. Xem trước/xuất hợp đồng và nhắc hạn — chưa đủ bằng chứng tái hiện đầy đủ

Form hiện tại dùng `contractWorkflowForm` và `RHLease`; bộ test browser cũ dùng các field `cf*` và `RHUI.previewContractForm`, nên không dùng việc test cũ không chạy làm bằng chứng rằng mọi chức năng mới hỏng. Một số helper nhắc hạn cũ cũng không còn nhưng Resident có module workspace mới thay thế một phần.

**Phương án kiểm tra tiếp nếu được yêu cầu:** lập mapping khả năng xem trước/in/xuất và nhắc hạn giữa module hiện tại với bản trước merge, thử hợp đồng thật ở các trạng thái phù hợp. Nếu thiếu chức năng thì ghép adapter vào form mới; không mang nguyên form cũ trở lại.

**Nguy cơ xung đột:** biểu mẫu/snapshot cũ và lifecycle hợp đồng mới có schema khác nhau. Chưa sửa, chưa kết luận phần nào đã được khôi phục đầy đủ.

## UI đã hoàn tất trong phạm vi sửa độc lập với logic

- Hội thoại hỗ trợ, hộp thư, bảng/bộ lọc trạng thái, gửi/nhận giữa hai phía và refresh giữ bản nháp.
- Khởi tạo Resident và các helper chỉ đọc khi mở chi tiết yêu cầu.
- Form Hợp đồng không còn lỗi scope của `customServices`; lựa chọn dịch vụ dùng ID thật khi render lại.
- Bổ sung lần kiểm tra này: giữ focus/caret của ô tìm kiếm hỗ trợ và focus của các dropdown sau khi danh sách được dựng lại.

Những UI phụ thuộc logic chưa tương thích (Tài khoản, Tài sản, field xử lý hỗ trợ mở rộng) vẫn giữ trạng thái hiện tại theo yêu cầu không tự phục hồi logic. Không khẳng định toàn website đã hoạt động đầy đủ.

## Cách lặp lại

- `node tests/missing-logic-audit.mjs`: probe auth, API tài sản, engine billing, hook meter và validator tài sản hợp đồng bằng storage trong bộ nhớ.
- `node tests/ui-restoration.browser.mjs`: Edge/profile tạm; smoke các tab/form và chẩn đoán hai phía. Các lỗi Tài sản được bắt để ghi nhận, không coi là UI đã đạt.
- `node tests/ui-merge-audit.mjs`: kiểm tra inventory/lịch sử các điểm nối.

Không sửa logic để làm xanh hai test nghiệp vụ cũ. Xem `UI-RESTORATION-AUDIT.md` để biết mốc lịch sử, bản sửa UI và giới hạn kiểm thử.
