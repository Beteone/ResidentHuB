# ResidentHub — đối chiếu và khôi phục UI từng phần

Ngày kiểm tra: 16/10/2026. Branch làm việc: `Chi`.

**Cập nhật sau khi nhận hai ảnh tham chiếu:** [BUILDING-ACCOUNT-RESTORATION.md](BUILDING-ACCOUNT-RESTORATION.md) ghi lại đợt sửa tiếp theo trong `dashboard.html`: CSS Tòa nhà và menu nhóm Tài khoản từ `97aa3ef`. Các mô tả “dashboard.html không thay đổi” bên dưới là kết quả của đợt sửa trước khi nhận ảnh, không phải trạng thái mới nhất.

**Trạng thái: đã sửa các lỗi nối UI được xác nhận; chưa hoàn tất toàn bộ việc khôi phục. Những phần cần thay đổi dữ liệu, phân quyền hoặc nghiệp vụ đang chờ xác nhận.**

Kiểm tra bổ sung theo yêu cầu tiếp theo: xem [MISSING-LOGIC-REPORT.md](MISSING-LOGIC-REPORT.md) để có kết quả tái hiện riêng, chức năng bị ảnh hưởng, nguyên nhân, cách sửa an toàn và nguy cơ xung đột. Không sửa các phần logic đó. UI hỗ trợ được bổ sung giữ focus/caret của ô tìm kiếm và focus của dropdown sau khi lọc.

## Mốc và cách đối chiếu

- HEAD, `origin/main` và backup đều ở `fc00fe6edf175598b31008770e677d898af1b1ad` khi bắt đầu sửa.
- Backup giữ nguyên: `backup/main-before-ui-restore-20261016-fc00fe6`.
- Commit đúng tên “Lý khôi phục”: `991f4eb730ee212cb7d3110838351a2bd1af748a`, đưa vào main qua `419541d`.
- So sánh cả hai parent của `4475c45`, main trước `419541d` (`eba223b`), kết quả hai merge và HEAD. Không coi parent nào là bản đúng tuyệt đối.
- So sánh script, tab, renderer, hàm trợ giúp và các API liên kết; chạy UI thực tế bằng Edge với profile/localStorage thử riêng.
- Không reset, revert merge, checkout nguyên file, commit, push hoặc merge. Không sửa dữ liệu thật.
- Thay đổi `97aa3ef` xóa mô tả Tòa nhà được giữ nguyên.

Lưu ý lịch sử: một số chức năng đã mất ở các merge trước hai mốc người dùng nêu. Chỉ so sánh `991f4eb^..991f4eb` sẽ bỏ sót các lỗi đó.

## Đối chiếu từng khu vực

| Khu vực | Kết quả đối chiếu / kiểm tra | Xử lý |
|---|---|---|
| Hỗ trợ Management | Trước `4475c45`, phía main có hộp thư, hội thoại trong drawer, gửi tin nhắn và `refreshOpenSupportConversation`. Sau merge các phần này mất nhưng dashboard vẫn gọi hàm refresh. Bộ lọc mới vẫn hữu ích. | Phục hồi hội thoại, tab hộp thư, bố cục bảng và lọc nhanh trạng thái; giữ tìm kiếm và bộ lọc trạng thái/loại/mức độ hiện tại. |
| Hỗ trợ Resident | Chi tiết yêu cầu gọi `refreshRequestData()` nhưng helper bị mất; helper đọc lại context cũng mất so với parent thứ nhất của `4475c45`. | Phục hồi các helper chỉ đọc. Đã thử nhận tin Management và trả lời từ giao diện Resident. |
| Khởi tạo Resident | `RH_SETTINGS` được dùng nhưng không còn khai báo. Thực tế phát sinh `ReferenceError` làm dừng script chính. Khai báo còn trong parent thứ nhất của `4475c45`. | Nối lại `RHD.getSettings()` và không thay cơ chế lưu cài đặt hiện tại. |
| Tòa nhà | Renderer, form, quản lý, dịch vụ và bộ lọc hiện tại khác phiên bản cũ; có phần phát triển mới cần giữ. | Mở trang và form thành công; không khôi phục hàng loạt. Giữ việc xóa mô tả. |
| Căn hộ | Có các thay đổi form/hiển thị và liên kết thuê; không đủ bằng chứng để coi chúng đều là lỗi. | Mở trang và form thành công; giữ nguyên. |
| Khách hàng | Nhánh Lý có phát triển UI/logic khách hàng mới. | Mở trang và form thành công; giữ nguyên các tính năng mới. |
| Ghi chỉ số | Các hàm meter cũ trong manager-modules đã được thay bằng `MeterReadingApp` React. Đây không phải bằng chứng phải mang UI cũ trở lại. | Trang React mở được, bundle build đạt. Không phục hồi các hàm meter cũ. Lỗi nối hóa đơn báo riêng bên dưới. |
| Hợp đồng | Module mới giữ luồng cọc → hợp đồng, tệp, dịch vụ, công tơ. Form bị dừng vì `customServices` nằm ngoài scope. Checkbox dịch vụ thiếu `value`, trong khi code đọc `.value`, làm sai/mất lựa chọn khi render lại. | Truyền đúng danh sách có sẵn qua hàm nối sự kiện và submit; gắn ID thật vào checkbox. Không đổi validation, giá, luật cọc hoặc xử lý thuê. |
| Hóa đơn | Có billing.js và giao diện hiện tại; các helper invoice cũ không còn nguyên dạng. Chưa thể coi mọi helper bị thay là lỗi. | Trang và form mở được. Không thay công thức, vòng đời hoặc chức năng mới. Hai test nghiệp vụ báo riêng. |
| Tài khoản / loại tài khoản | Parent thứ nhất có nhóm menu và renderer `RHAccounts.renderUsersTab`. Hiện tại dùng bảng legacy. Module mới yêu cầu trường account type/scope nhưng auth hiện tại không lưu chúng. | Chưa nối lại renderer để tránh một UI có vẻ đầy đủ nhưng lưu quyền không đúng. Giữ nguyên code hiện tại, chờ duyệt phần auth. |
| Tài sản | Script/menu/container/renderer bị mất so với parent thứ nhất. `asset-module.js` còn nhưng data thiếu `ASSET_CONDITIONS`, `nextAssetCode`, khai báo entity/seed tương ứng. | Chưa nối UI khi API còn thiếu. Cần phục hồi tương thích dữ liệu trước, chờ duyệt. |
| Dashboard | Các tab chính mở được. `runScheduledBilling` không còn so với parent thứ nhất; thiếu liên kết chạy billing tự động là thay đổi nghiệp vụ. | Không tự nối lịch tạo hóa đơn. Sửa hàm refresh hỗ trợ mà dashboard đang gọi. |
| Resident — các mục khác | Giữ nguyên `app-clock.js`, `resident-live-workspaces.js`, hệ thống thông báo và các màn hình mới. Một số helper nhắc hợp đồng/hóa đơn cũ không còn. | Sau sửa khởi tạo, mở được Tổng quan, Hóa đơn, Yêu cầu, Hợp đồng, Thông báo, Cài đặt, Lịch hẹn. Không thay quy tắc nhắc hạn/thanh toán. |

## Thay đổi đã thực hiện

### manager-modules.js

- Phục hồi render tin nhắn, danh sách hội thoại, tab Tin nhắn và gửi tin từ inbox/drawer.
- Phục hồi bảng hỗ trợ theo các class CSS vốn còn trong dashboard và các nút lọc trạng thái; giữ các bộ lọc mới.
- Export lại `refreshOpenSupportConversation` mà dashboard đang gọi.
- Gửi qua `RHD.update('supportRequests', ...)`, giữ nguyên mảng tin cũ, trường phản hồi, trạng thái và các trường khác. Giữ kênh thông báo `RH.syncManagerNotification` có sẵn.
- Áp dụng quyền `support.view`, `support.update` và danh sách trong phạm vi tòa nhà cho các handler phục hồi; không thay schema quyền.
- Giữ nội dung đang nhập khi inbox nhận cập nhật; drawer chỉ làm mới vùng hội thoại, không dựng lại form.

Chưa mang lại chức năng xóa yêu cầu hoặc các quy tắc chuyển trạng thái cũ: cần xác nhận cách ghép với quyền và nghiệp vụ hiện tại.

### resident-web.html

- Khai báo lại `RH_SETTINGS` bằng API cài đặt hiện tại.
- Phục hồi `refreshResidentContext` và `refreshRequestData` từ luồng UI cũ. Các biến `REAL_*` được phép cập nhật để phản ánh context mới.
- Không sửa nguồn dữ liệu, bộ nhớ, thanh toán, hợp đồng, thông báo hoặc các module mới.

### contracts-module.js

- Nối tham số `customServices` từ form sang hàm gắn sự kiện và submit, dùng cùng danh sách đã khởi tạo từ hợp đồng/cọc.
- Checkbox dịch vụ có `value` đúng ID để code thu thập và render lại lựa chọn hoạt động đúng.
- Không thay `RHLease`, validation, công thức tiền, quy tắc cọc hay dữ liệu mẫu.

## Hai lỗi nghiệp vụ — báo cáo riêng, chưa sửa

### 1. Chỉ số thay đổi nhưng hóa đơn không được đánh dấu tính lại

- Test thất bại tại `src/invoices/billing.integration.test.mjs:66`: `needsRecalculation` là `undefined`, mong đợi `true`.
- `RHB.meterChanged` vẫn tồn tại trong `billing.js`, nhưng `RHD.create/update/remove` hiện tại không gọi nó khi thay đổi meters.
- Probe lịch sử cho thao tác tạo/sửa/xóa meter: `b521367` và `b04eae6` gọi hook 4 lần; `6fe440f` gọi 0 lần. Parent thứ nhất của `4475c45` vẫn có hook, phía main (`eba223b`) và kết quả merge không có.
- Vì vậy, lỗi đã có trong kết quả merge **`6fe440f`**, trước `4475c45`/`419541d`; hai merge sau không phục hồi nó. Đây là kết quả truy nguyên bổ sung, chính xác hơn việc chỉ nhìn diff của `4475c45`.
- Cách sửa dự kiến cần duyệt: nối lại các hook, xử lý cả kỳ/căn hộ trước và sau sửa, bảo đảm không tự tính lại hóa đơn đã phát hành và không đổi luật tạo hóa đơn mới.

### 2. Tạo hợp đồng qua RHD không chặn số lượng tài sản vượt mức

- Test thất bại tại `tests/workflows.test.mjs:42`: `RHD.create('contracts', ...)` trả `ok: true` khi tài sản bàn giao vượt số lượng.
- `RHDocuments.validate()` vẫn có kiểm tra số lượng tài sản; code hiện tại của `RHD.create/update` không gọi `RHDocuments.prepare()`.
- `b521367` và `b04eae6` có tích hợp prepare; `6fe440f` mất tích hợp. Probe validator trả lỗi: bản trước merge từ chối tạo, bản sau merge vẫn cho tạo.
- Module hợp đồng mới dùng `RHLease`; không thể tự ghép validator cũ vào CRUD mà bỏ qua khác biệt `tenantIds`/`customerIds`, lifecycle, biểu mẫu và snapshot.
- Cách sửa cần duyệt: thiết kế adapter/điểm validate chung tương thích cả hai luồng, giữ toàn bộ chức năng cọc và hợp đồng mới. Không chèn lại nguyên đoạn cũ một cách máy móc.

## Các xung đột cần xác nhận trước khi sửa tiếp

1. **Tài khoản/phân quyền:** khôi phục tương thích của auth cho `accountTypeId`, `allBuildings`, `buildingIds` và metadata nhân viên; bảo toàn đăng ký/phê duyệt cư dân hiện tại, chống đổi quyền trái phép. Sau đó mới nối giao diện quản lý người dùng và nhóm menu cũ.
2. **Tài sản:** bổ sung lại constants, mã tài sản và phần khai báo/seed còn thiếu với cơ chế chỉ thêm phần thiếu, không reset hoặc ghi đè dữ liệu hiện tại; sau đó nối lại UI.
3. **Hỗ trợ mở rộng:** các trường lịch hẹn, ghi chú, kết quả xử lý và timestamp chuyển trạng thái từng tồn tại nhưng handler mới chỉ lưu status/assignee/response. Mang lại đầy đủ cần ghép nghiệp vụ, không chỉ đổi HTML. Chức năng xóa cần xác định quyền vì schema hiện tại chỉ có view/update.
4. **Billing và hợp đồng:** hai lỗi riêng ở trên; lịch chạy billing tự động và logic nhắc hạn cũ cũng cần duyệt trước khi nối lại.
5. **Biểu mẫu hợp đồng cũ:** bộ test browser cũ gọi `RHUI.previewContractForm` và các field `cf*`; UI mới dùng `contractWorkflowForm` và `RHLease`. Không khôi phục nguyên form cũ vì sẽ mất các tính năng mới. Cần phương án ghép tính năng xem trước/snapshot/export vào form mới.

## Xác minh và giới hạn

- `npm run typecheck`: đạt.
- Hai bước Vite của `npm run build`: đạt, xuất vào thư mục tạm để không ghi lại các bundle đang có trong repo.
- `node --check manager-modules.js`, `node --check contracts-module.js`: đạt.
- `git -c core.whitespace=cr-at-eol diff --check`: đạt. Tùy chọn chỉ để kiểm tra đúng file HTML vốn được lưu CRLF, không sửa cấu hình repo.
- `src/invoices/domain.test.mjs`, `src/settings/settingsStore.test.mjs`: đạt.
- `src/invoices/billing.integration.test.mjs`, `tests/workflows.test.mjs`: vẫn thất bại đúng hai điểm nghiệp vụ đã ghi, chưa sửa.
- `node tests/ui-restoration.browser.mjs`: đạt với Edge thật, profile thử riêng. Kiểm tra 11 tab Management, 6 form, 7 mục Resident; ID dịch vụ sau render, validation bản nháp không hợp lệ; nhận/gửi hỗ trợ hai phía; refresh qua sự kiện storage; giữ bản nháp; chặn yêu cầu ngoài scope/quyền.
- Test live dùng tài khoản fixture có `accountTypeId` được cấu hình rõ ràng trong storage thử. **Không chứng minh luồng tạo/lưu phân quyền bằng auth hiện tại đã đúng**; xung đột đó vẫn đang chờ duyệt.
- Test hỗ trợ kiểm tra dữ liệu tồn tại qua hai phiên đăng nhập và sự kiện storage mô phỏng. Chưa thử mọi trường hợp nhiều cửa sổ đồng thời hoặc mọi vai trò thực tế.
- CDN trang trí được bỏ trong server thử để chạy offline; ảnh chụp thiếu font/icon CDN. Đã xem ảnh desktop hội thoại và chi tiết Resident.
- Ở viewport 390px, shell Management hiện tại còn sidebar chồng nội dung. Chưa tự sửa shell hoặc khẳng định toàn bộ mobile UI đã đạt; cần đối chiếu riêng nguồn của phần responsive.
- Chưa kiểm thử toàn bộ giao dịch thật, upload/export/in, mọi bộ lọc hoặc toàn bộ tổ hợp quyền. Không thể tuyên bố website đã được khôi phục đầy đủ khi các xung đột trên chưa giải quyết.

## Tệp phục vụ kiểm tra

- `tests/ui-merge-audit.mjs`: inventory và probe lịch sử, chỉ đọc Git và chạy sandbox bộ nhớ.
- `tests/ui-restoration.browser.mjs`: smoke test UI/hội thoại bằng profile Edge tạm.

Không có thay đổi nào trong `auth.js`, `permissions.js`, `data.js`, `rental-domain.js`, module đặt cọc, module Resident mới, biểu mẫu hoặc các bundle đã build. `dashboard.html` cuối cùng không thay đổi; phương án đổi renderer Tài khoản được rút lại khi phát hiện xung đột API.
