# Audit đăng nhập, phân quyền và dữ liệu ResidentHub

Ngày: 21/10/2026. Branch: `Chi`, HEAD `076d7d4`. Phạm vi: mã nguồn local và lịch sử Git; không truy cập dữ liệu trình duyệt thật, máy của thành viên khác hoặc hosting. Không chỉnh mã ứng dụng, tài khoản, mật khẩu, quyền hoặc dữ liệu thật.

## A. Nguyên nhân đã xác minh

### 1. Không có nguồn tài khoản và dữ liệu tập trung

`auth.js:10–16` khai báo các khóa localStorage: `residenthub_users` (tài khoản, mật khẩu, role, accountTypeId, buildingIds), `residenthub_internal_data` (các bản ghi riêng theo người dùng), `residenthub_account_requests`, khóa phục hồi mật khẩu và bộ đếm đăng nhập. `permissions.js:21` dùng `residenthub_account_types` cho danh sách loại quyền. Tài khoản và loại quyền không tách live/demo.

`data.js:150–203` đọc/ghi `residenthub_<live|demo>_<entity>` cho buildings, apartments, customers, contracts, invoices và các tập nghiệp vụ khác. `RHD.list()` trả dữ liệu local chưa lọc; UI phải gọi cơ chế scope riêng. Không có backend xác thực/database chung trong luồng này; không tìm thấy IndexedDB hoặc cơ chế đồng bộ mạng trong các module được truy vết. Những URL/tài nguyên bên ngoài, nếu có, không tạo một kho người dùng chung.

localStorage phân tách theo scheme + hostname + port và theo browser/profile. `localhost`, IP LAN và domain hosting có các kho khác nhau; cùng origin trên hai thiết bị vẫn là hai kho. Chỉ đổi path trong cùng origin không tạo kho mới. Vì vậy cùng email có thể không tồn tại, có mật khẩu khác, accountTypeId khác hoặc dữ liệu nghiệp vụ khác giữa các nơi. Các bản ghi cùng ID cũng không chứng minh được đồng bộ, vì mã seed có ID cố định. Không có cơ chế chia sẻ tài khoản vừa tạo sang máy khác.

Kiểm tra VM với hai kho độc lập xác nhận tài khoản và tòa nhà tạo ở A không xuất hiện ở B. Đây là tái hiện cơ chế lưu trữ, chưa phải phép thử hai origin trên trình duyệt thật.

### 2. Chuỗi chính xác gây thông báo “Thêm · Tòa nhà”

`manager-modules.js:753`: `RHUI.openBuildingForm(id)` gọi `guard(id ? 'buildings.update' : 'buildings.create')`. Khi lưu, `RHUI.saveBuilding` kiểm tra lại cùng khóa tại dòng 832. Wrapper `guard` dòng 288 chuyển sang `RHP.guard()`.

`permissions.js:326`: `guard()` gọi `can(key)`; false thì alert `deniedMessage(key)`. `deniedMessage` dòng 321 ghép nhãn từ schema (`buildings` / `create`) thành đúng thông báo người dùng gặp.

`RHP.resolve()` dòng 228 lấy ID phiên, đọc lại `residenthub_users`, tra `accountTypeId` trong `residenthub_account_types`. Cache phụ thuộc chuỗi dữ liệu users/types và ID, không chỉ bản sao quyền trong phiên. `typeForUser()` dòng 142 dùng loại phù hợp portal; tài khoản manager thiếu loại hoặc có loại không phù hợp sẽ fallback sang `at-building-manager`.

Loại mặc định “Quản lý tòa nhà” có `buildings.view`, `buildings.update`, `buildings.assignable`, **không có `buildings.create`**. `role: manager` chỉ thể hiện cổng quản lý, không tương đương Admin hoặc quyền tạo tòa. Admin là loại có `fullAccess`; nhân viên có loại riêng và cư dân dùng portal riêng. Một tài khoản ghi “Quản lý” nhưng không được thêm tòa có thể hoàn toàn đúng chính sách hiện tại. Cần đối chiếu loại quyền thực của hai máy trước khi kết luận máy kia sai.

Phạm vi tòa tại `buildingScope()` dòng 275 là buildingIds cộng tòa có managerId bằng ID người dùng; Admin/allBuildings cho phạm vi toàn bộ. Phạm vi này độc lập với quyền `buildings.create` và không phải điều kiện sinh thông báo đang xét.

UI thêm tòa được tạo bằng `addButton(..., 'buildings.create')` tại `manager-modules.js:499`, cùng khóa với form/lưu. Tuy nhiên lớp lưu `RHD.create()` dòng 280 không kiểm tra quyền hoặc scope: phép thử gọi trực tiếp khi không đăng nhập vẫn tạo tòa thành công. Các kiểm tra giao diện hiện tại không phải ranh giới bảo mật.

### 3. Khởi tạo có thể thay đổi dữ liệu đang tồn tại

`auth.js:546–585`: `seedDemoStaffAccount()` và `seedDemoResidentAccount()` tìm theo email rồi gán lại tên, mật khẩu, role và status active ngay cả khi đã tồn tại. Các hàm chạy mỗi lần nạp `auth.js` (dòng 1148–1150). Kiểm tra thay mật khẩu và khóa tài khoản demo trong kho giả rồi nạp lại xác nhận mật khẩu bị ghi lại và tài khoản được mở khóa. Đây là hành vi có sẵn, không phải thay đổi của audit; chưa có bằng chứng nó giải thích lỗi của tài khoản quản lý thực tế.

`seedIfEmpty()` dòng 526 tạo tài khoản quản lý mặc định nếu `readUsers()` trả mảng rỗng. `readUsers()` trả rỗng cả khi JSON hỏng hoặc schema không hợp lệ; có thể dẫn tới ghi dữ liệu seed thay dữ liệu tài khoản không đọc được khi tải lại. `readUsers()` cũng tự normalize và ghi lại bản ghi cũ, lọc bỏ bản ghi không đủ id/email/password. Đây là migration ngầm, không có version và không có bản sao phục hồi tại bước này.

`data.js:774`: `seedDataset(targetMode)` chỉ dùng điều kiện danh sách buildings có phần tử để quyết định bỏ qua seed. Nếu buildings rỗng, nó ghi thay toàn bộ apartments, customers, contracts, meters, invoices, supportRequests bằng dữ liệu mẫu. `setMode()` dòng 863 gọi seed cho **cả live và demo**; `index.html:139` gọi `setMode('live')`. Phép thử giữ khách hàng cũ nhưng để buildings trống xác nhận khách hàng cũ bị thay thế. Không có migration schema/version tổng thể hoặc transaction bảo vệ chuỗi ghi này.

### 4. Phiên và quyền có thể còn hiệu lực ngoài dự kiến

Luồng: `index.html:123` → `RH.authenticateDetailed()` (`auth.js:773`) → `usersForLogin()` → `readUsers()` → so sánh mật khẩu dạng chuỗi trực tiếp → kiểm tra locked/inactive → `RH.login()` → chuyển cổng. Email được trim/lowercase/bỏ khoảng trắng; mật khẩu so sánh chính xác. Có kiểm tra theo tên hiển thị, nhưng không tra số điện thoại dù nhãn login có ghi số điện thoại. Tên hiển thị không có tính duy nhất, có thể chọn một trong nhiều bản ghi theo mật khẩu/thứ tự dữ liệu.

Mật khẩu lưu plaintext ở phía client. Bộ đếm sai và mã phục hồi cũng chỉ ở localStorage; không có xác thực hay cưỡng chế bảo mật từ server. Thời gian khóa chỉ được kiểm tra khi không khớp mật khẩu: mật khẩu đúng vẫn qua nhánh rate limit (nhưng locked/inactive tài khoản vẫn bị từ chối ở lần đăng nhập mới).

`login()` dòng 1071 lưu sessionStorage khi không nhớ đăng nhập, localStorage khi có nhớ; xóa bản phiên ở kho đối diện. `getSession()` dòng 1090 ưu tiên sessionStorage, tra tài khoản hiện hành và cập nhật thông tin role/type; xóa tài khoản làm phiên mất hiệu lực. Tuy nhiên hàm không kiểm tra status locked/inactive và không có TTL dù có loginAt. Khóa tài khoản đang có phiên không thu hồi phiên hoặc quyền; đã tái hiện bằng test. Đổi mật khẩu cũng không có cơ chế thu hồi toàn bộ phiên.

`RHP.sessionUserId()` còn fallback sang `window.RH_SESSION` khi `getSession()` không trả phiên; biến global/UI có thể cũ. Cache quyền đọc lại users/types khi được gọi, nhưng dashboard chỉ nghe storage của dữ liệu nghiệp vụ, users và account_requests (`dashboard.html:5429`), thiếu account_types. Đổi loại quyền ở tab khác có thể khiến menu/nút chưa refresh, trong khi guard đọc quyền mới. Storage event không đồng bộ giữa máy hoặc origin khác.

`auth.js:256` có fallback đọc khóa cũ `rh_db_<mode>_<store>` khi không dùng được RHD, khác khóa của data.js. Cần theo dõi thứ tự tải script nếu xuất hiện dữ liệu cũ; chưa chứng minh nhánh này được dùng trong sự cố thực tế.

### 5. Merge không đủ để kết luận là nguyên nhân

Commit `7c0816f` xác nhận merge main vào Chi và conflict data.js. Diff kết hợp giữ cả auditChange và notifyMeterChanges, thêm kiểm tra hợp đồng; không thấy auth hoặc permission resolver bị thay bằng logic khác trong phần giải conflict data.js. Không có conflict marker trong ba file chính.

Parent thứ nhất của merge đã có loại Quản lý tòa nhà không cấp quyền tạo. Commit `c1c8f20` trước merge đã thêm seed hai tài khoản demo. Các cơ chế này không phải chỉ phát sinh từ conflict data.js. Chưa có snapshot storage trước/sau cập nhật để xác minh dữ liệu của người dùng đã được normalize/migration ra sao.

## B. Nguyên nhân còn nghi ngờ và cách xác minh

- Máy/hosting đang phục vụ JavaScript khác phiên bản: so hash auth.js/permissions.js/data.js và commit build từ từng URL, kiểm tra Network và cache HTTP. Không thấy đăng ký service worker trong luồng rà soát; chưa kiểm tra service worker/cache đã tồn tại trên thiết bị thật.
- Cùng email nhưng mật khẩu/loại quyền khác giữa máy: đọc đối chiếu ID, role, accountTypeId, type.permissions, status và số bản ghi ở từng origin; không đưa mật khẩu vào ảnh chụp/log/báo cáo.
- Origin chạy live còn origin kia chạy demo: kiểm tra URL demo và RHD.mode(); xem khóa đang đọc. Dữ liệu nghiệp vụ tách hai namespace nhưng users/types chung trong một origin.
- Storage hỏng, đầy, bị chính sách trình duyệt chặn, tên đăng nhập trùng, hoặc hai tab ghi đè dữ liệu: chưa có log sự cố. Các thao tác read-modify-write không có transaction/khóa; cần tái hiện có kiểm soát trên bản sao dữ liệu.

## C. Phương án khắc phục

Không sửa thông báo để che lỗi, không cấp đại trà quyền tạo, không reset storage. Trong phạm vi cho phép hiện tại chỉ thêm test chẩn đoán và báo cáo. Các lỗi đã xác minh liên quan trực tiếp đến dữ liệu/quyền nên cần thống nhất chính sách trước khi chỉnh.

1. Trước mắt lập bản sao bảo toàn dữ liệu từng origin/profile, ghi nhận phiên bản và chọn bộ dữ liệu chuẩn bằng đối chiếu có người quản lý xác nhận. Giữ từng bản gốc; không import đè hoặc xóa kho để thử sửa.
2. Với auth.js: đề xuất tách seed demo khỏi kho tài khoản thật, không cập nhật tài khoản đã tồn tại; xử lý dữ liệu lỗi mà không reseed; định nghĩa TTL và thu hồi phiên khi locked/inactive/đổi mật khẩu. Không tự sửa mật khẩu hoặc quyền tài khoản cũ. Cần thiết kế migration có version, backup và kiểm tra trước khi ghi.
3. Với data.js và điểm gọi setMode: ngừng seed mẫu vào live, chỉ seed demo khi khởi tạo có chủ đích; không dùng buildings trống làm dấu hiệu toàn bộ DB mới. Rủi ro cần xử lý: phân biệt dữ liệu mẫu cũ với dữ liệu thật, tránh xóa nhầm.
4. Với permissions.js, dashboard.html, manager-modules.js và account-modules.js: thống nhất vai trò/loại quyền rõ ràng; thêm cơ chế refresh UI khi account_types đổi, fail closed khi không có phiên hợp lệ. Nếu chính sách cho phép một loại quản lý tạo tòa, quản trị viên cấp đúng quyền có kiểm soát. Không thay mặc định cho mọi quản lý.
5. Giải pháp bền vững cần backend/API và DB tập trung cho tài khoản, loại quyền, phạm vi tòa và nghiệp vụ; server kiểm tra quyền mọi thao tác, lưu mật khẩu bằng thuật toán hash phù hợp, quản lý phiên và audit. Frontend gọi cùng API endpoint theo cấu hình môi trường; localStorage chỉ dùng cho dữ liệu phụ thích hợp. Đây là thay đổi kiến trúc, chưa triển khai theo yêu cầu. Migration cần kiểm kê các kho phân tán, giải quyết email/ID trùng, quan hệ bản ghi và quyền mâu thuẫn, chạy thử trên bản sao, có rollback và phê duyệt trước chuyển đổi.

Chỉ đưa website về một domain không giải quyết chia sẻ dữ liệu giữa các thiết bị nếu vẫn giữ kiến trúc localStorage.

## D. Kết quả kiểm thử thực tế

Đã chạy trong Node, dùng VM + Map mô phỏng storage, không tác động dữ liệu thật:

- `node tests/auth-environment-audit.test.mjs`: 9 nhóm chẩn đoán đạt. Bao gồm hai kho độc lập; thiếu quyền tạo và thông báo; cập nhật quyền tại nguồn; reload/logout/đổi tài khoản; phiên còn quyền sau khóa; gọi data API không quyền; seed demo ghi lại mật khẩu/trạng thái; seed live ghi đè danh sách còn lại; phiên JSON lỗi/tài khoản bị xóa/dữ liệu users lỗi. Các assertion về lỗi xác nhận **lỗi vẫn tồn tại**, không phải đã sửa.
- `node tests/data-consistency.test.mjs`: đạt.
- `node tests/workflows.test.mjs`: đạt.
- `npm run typecheck`: đạt.

Chưa chạy trình duyệt thật cho hai origin, hai browser, thiết bị LAN hoặc hosting; chưa chạy E2E bấm nút thêm/lưu tòa trên tài khoản thực. Trường hợp được quyền đã xác nhận ở resolver, không phải chứng nhận UI/backend an toàn. Reload là nạp lại script VM dùng cùng kho; không mô phỏng đầy đủ vòng đời trình duyệt hoặc storage event.

Kiểm thử thủ công tiếp theo trên bản sao: cùng phiên bản app ở localhost/IP/domain; tạo tài khoản ở A rồi thử B; ghi lại origin/mode/accountTypeId và kết quả. Với cùng nguồn chuẩn, thử tài khoản có/không buildings.create, scope khác nhau, đổi quyền từ tab khác, khóa/xóa tài khoản khi còn phiên, reload, đăng xuất/đổi tài khoản và nâng phiên bản với dữ liệu cũ. Không tuyên bố các bước này đã đạt khi chưa chạy.

## E. Trạng thái Git

Ban đầu working tree sạch. Audit chỉ thêm `AUTH-ENVIRONMENT-AUDIT.md` và `tests/auth-environment-audit.test.mjs`; chưa commit. Không sửa file ứng dụng, không commit/push/merge/chuyển branch. Test chỉ thay đổi kho Map trong tiến trình Node.
