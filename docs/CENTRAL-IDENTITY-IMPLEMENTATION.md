# Xác thực và phân quyền tập trung — mã chuẩn bị ngày 04/11/2026

## Trạng thái thực tế

Đã triển khai trong mã nguồn chế độ Supabase Auth và RPC tài khoản/quyền, tái sử dụng schema Supabase nền tảng hiện có. Không tạo backend/database thứ hai. Cấu hình mặc định `auth-config.js` vẫn là `mode: 'local'`; **chưa bật, chưa deploy, chưa chạy SQL trên VPS/Supabase thật**.

Trong workspace chỉ có `.env.example`; không có `.env` hoặc biến môi trường Supabase/ResidentHub để kết nối trong phiên làm việc này. Không có thông tin project, organization UUID, public key, cấu hình Auth/email hay quyền thao tác hạ tầng được cung cấp. Không kiểm chứng được dịch vụ thực, database hiện hữu trên VPS hoặc hash bản deploy. Tệp SQL và hướng dẫn cũ không được coi là bằng chứng dịch vụ đang chạy.

Mục tiêu đồng bộ tài khoản/quyền đã có mã tích hợp và kiểm thử cục bộ; **chưa nghiệm thu với Supabase thật**. Không thể khẳng định website VPS đã đăng nhập/đồng bộ thành công.

## Những phần đã triển khai

| Phần | Mã và hành vi |
|---|---|
| Cấu hình công khai | `auth-config.js`, `.env.example`, `tools/auth-config.mjs`. Chỉ nhận URL HTTPS, publishable/anon key và organization UUID. Công cụ tạo tệp mới `auth-config.generated.js`, không ghi đè cấu hình đang dùng, không kết nối dịch vụ. |
| Đăng nhập | `central-auth.js` gọi Supabase Auth email/password, sau đó RPC lấy membership đang active và loại quyền từ DB. Không tìm mật khẩu trong localStorage, không fallback khi mất mạng/sai cấu hình/DB từ chối. |
| Phiên | Token mới chỉ lưu trong namespace sessionStorage riêng. Refresh token trước khi hết hạn, nạp lại identity khi mở trang/focus và mỗi 30 giây. UI đọc snapshot trong bộ nhớ; DB kiểm tra quyền hiện hành ở mỗi RPC. Không dùng `RH_SESSION.demo` hoặc loại quyền local để cấp quyền trung tâm. |
| Bảo toàn kho cũ | Không xóa/nhập/normalize `residenthub_users`, `residenthub_account_types`, phiên local cũ hoặc dữ liệu nghiệp vụ khi dùng central identity. `auth.js` bỏ qua seed/đường ghi identity local. Kho cũ chỉ phục vụ chế độ legacy và backup có kiểm soát. |
| Loại tài khoản | Giữ nguyên schema quyền trong `permissions.js`, các khóa nghiệp vụ và loại Admin/Quản lý tòa nhà/Nhân viên/Cư dân. Không fallback loại quyền khi liên kết central thiếu. Giữ quyền ngoài registry hiện hành khi lưu một loại cũ. Không seed hoặc tự gán Admin. |
| Quản trị tài khoản/quyền | Các form hiện tại trong `account-modules.js` chờ kết quả RPC thật trước khi báo lưu. RPC kiểm tra quyền, tổ chức, scope, giới hạn quyền của người sửa, portal, trạng thái và khóa ngoại. Không có browser grant ghi trực tiếp bảng identity. |
| Khóa/mở và mật khẩu | Tài khoản khóa bị từ chối ở DB, kể cả JWT cũ. Thay đổi trạng thái làm các phiên trước đó mất quyền; mở khóa yêu cầu đăng nhập mới. Trigger sau thay đổi mật khẩu Auth cập nhật mốc vô hiệu hóa phiên cho mọi membership của người dùng. Không xuất/lưu hash mật khẩu trong bảng ứng dụng. |
| Đổi/reset mật khẩu | Reauthenticate qua Auth bằng mật khẩu người dùng vừa nhập, cập nhật mật khẩu tại Auth, yêu cầu đăng nhập lại. Khôi phục gửi liên kết email; `auth-callback.html` nhận invite/recovery token, xóa token khỏi URL, đặt mật khẩu và đăng xuất các phiên. Không còn hiển thị mã phục hồi local trong central mode. |
| Tạo tài khoản | `supabase/functions/identity-invite/` kiểm tra JWT bằng Auth, kiểm tra quyền bằng DB rồi gửi lời mời Auth. Gắn UID mới vào membership qua RPC chỉ dành cho server. Không nhận mật khẩu/legacy ID/Auth UID do browser chỉ định, không tự liên kết tài khoản có email trùng, không mời Admin qua đường này. |
| Hồ sơ nhân viên | Cập nhật liên hệ/tùy chọn qua RPC, lịch sử thay đổi hồ sơ do server tạo; người quản lý có quyền phù hợp theo dõi qua RPC. Nhóm Kỹ thuật/Vệ sinh/An ninh vẫn là metadata trên loại Nhân viên. |
| Nạp trang | Các script khởi tạo trang bảo vệ chờ identity trước khi chạy, vẫn thực thi ở global scope để giữ handler/UI hiện tại. Sửa guard phần hợp đồng rỗng để tài khoản cư dân mới không lỗi khi chưa có dữ liệu nghiệp vụ local. |
| Demo local | Không thêm mật khẩu mặc định công khai. Bộ tài khoản demo mới dùng mật khẩu vừa được người dùng cung cấp lúc bootstrap; tài khoản/demo và mật khẩu đã tồn tại được giữ nguyên. Legacy vẫn là môi trường local, chưa phải xác thực server. |

## Ranh giới và hạn chế phải biết trước khi bật

**Đây là bước chuyển identity, không phải cutover toàn bộ dữ liệu nghiệp vụ.** Tòa nhà/căn hộ/cư dân/hợp đồng/hóa đơn/nhiệm vụ/tiền công và các module dữ liệu khác vẫn dùng adapter local hiện tại. RLS foundation chưa mở ghi nghiệp vụ, cũng chưa có đầy đủ RPC giao dịch nghiệp vụ. Đăng nhập central không tự tải, nhập hay đồng bộ các kho đó. Các bản ghi local không được coi là dữ liệu đã được server bảo vệ; guard UI/local có thể bị bỏ qua như audit trước đã chứng minh. Muốn đảm bảo thu hồi quyền cho **mọi thao tác nghiệp vụ** phải chuyển các thao tác đó sang API/RLS server và nghiệm thu tiếp, không chỉ bật Auth.

Không đổi cổng `data_access_enabled` để vượt qua giới hạn này. Cổng mới `identity_enabled` cho phép thử nghiệm Auth/RBAC riêng trên staging mà không mở dữ liệu nghiệp vụ. Migration mới bổ sung kiểm tra phiên vào RLS hiện có; không thêm quyền ghi nghiệp vụ và không nhập dữ liệu.

Các giới hạn central mode hiện tại:

- Đăng nhập bằng email Auth; tên hiển thị/số điện thoại legacy không được dùng để dò tài khoản hoặc mật khẩu. SMS Auth và ánh xạ tên đăng nhập cần thiết kế/kiểm thử riêng.
- Đăng ký tự do, checkout tạo manager và luồng đăng ký cư dân local không được dùng để tạo identity trung tâm. UI thông báo liên hệ quản lý nhận lời mời đã xác minh. Legacy mode giữ các chức năng cũ. Cần hoàn thiện luồng yêu cầu/duyệt trung tâm trước khi yêu cầu đầy đủ parity các chức năng đăng ký.
- Không đổi email đăng nhập bằng patch membership: Auth phải xác minh thay đổi email. Central profile hỗ trợ email liên hệ; các chỉnh sửa tên/phân căn hộ vẫn cần quyền quản lý. Xóa membership yêu cầu quyền phù hợp, không tự xóa chính mình/Admin hoặc cascade dữ liệu nghiệp vụ; xóa Auth identity cần quy trình riêng.
- Xóa loại quyền trung tâm hiện chỉ cho Admin, loại hệ thống/loại còn người dùng không được xóa. Đây là hạn chế có chủ đích của RPC hiện tại; cần duyệt chính sách ủy quyền rộng hơn nếu nhóm đang dùng.
- Checkbox duy trì đăng nhập bị vô hiệu hóa trong central mode: token chỉ tồn tại trong phiên trình duyệt hiện tại. Không đưa token dài hạn vào kho tài khoản local cũ.
- Cập nhật UI có thể trễ tối đa chu kỳ kiểm tra/focus; RPC từ chối theo DB ngay. Khi mất kết nối, snapshot identity bị vô hiệu hóa và trang yêu cầu đăng nhập lại; có thể mất form chưa lưu. Không chạy chế độ offline với quyền cũ.
- Invite Auth và ghi membership không cùng transaction. Nếu email đã gửi nhưng bước gắn membership thất bại, tài khoản mới không có quyền; Edge Function trả lỗi và ghi UID cần đối soát. Không tự thử lại bằng email, không tự xóa Auth user hoặc tăng quyền. Người vận hành phải kiểm tra và xử lý phần mời dở.

Do đó chưa đủ điều kiện bật đại trà trên VPS hoặc tuyên bố giữ đầy đủ parity ở central mode. Cần hoàn thành cấu hình thật, các luồng còn thiếu và bước dữ liệu nghiệp vụ theo phạm vi rollout được duyệt. Mã legacy/UI hiện tại được giữ để không phá môi trường đang chạy.

## Cấu hình staging còn thiếu — thực hiện riêng sau khi xác nhận nguồn hiện hữu

1. Xác nhận VPS đang phục vụ ứng dụng tĩnh hay đã có backend, đường dẫn deploy và API/DB thực. Nếu có nguồn chung khác đang dùng, đối chiếu trước khi chọn Supabase; không tạo project mới tự động.
2. Cung cấp Project URL + publishable/anon **public key** + organization UUID cho nguồn đã chọn. Service role/database password không được gửi vào chat, frontend, `.env` frontend hoặc Git.
3. Trên **database staging đã backup**, review schema thực rồi áp dụng các migration chưa có theo thứ tự: `202610210001_foundation.sql`, `202611040001_identity.sql`, `202611040002_identity_invites.sql`. Không chạy lại foundation trên DB đã có bảng; không tự sửa migration đã áp dụng. Kiểm tra schema `auth.users`/`auth.sessions` trên phiên bản Supabase thực vì kiểm thử cục bộ dùng fixture Auth tối thiểu.
4. Chuẩn bị organization, loại quyền và membership bằng quy trình migration được xác minh bên dưới. SQL không seed người dùng, Admin, quyền mặc định hay dữ liệu demo. Chỉ bật `identity_enabled` cho organization thử nghiệm sau khi các liên kết/loại quyền đúng. Giữ `data_access_enabled=false` cho tới nghiệm thu dữ liệu nghiệp vụ.
5. Cấu hình Auth Email/password, xác nhận email, SMTP/giới hạn gửi và redirect allowlist. Site URL/redirect phải thuộc website **HTTPS**; callback là `/auth-callback.html`. Với template dùng token hash: trỏ đúng callback cùng `token_hash` và `type=invite` hoặc `type=recovery`. Callback cũng hỗ trợ fragment token từ luồng email mặc định. Chưa kiểm thử template, deliverability hoặc quota dịch vụ thật.
6. Nếu dùng chức năng mời, review/deploy riêng Edge Function `identity-invite`. Secret phía server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` và `RESIDENTHUB_SITE_ORIGIN` (origin HTTPS chính xác). `verify_jwt=false` trong cấu hình CLI vì function tự xác minh qua `getUser(JWT)` rồi kiểm tra phiên/quyền DB; không có đường mời ẩn danh. Mã Edge chưa được chạy với Deno/Supabase thật trong lượt này.
7. Tạo `.env` riêng từ `.env.example` với ba giá trị public rồi chạy `node --env-file=.env tools/auth-config.mjs`. Review tệp được tạo, sau đó mới chủ động thay `auth-config.js` trong **bản staging**. Công cụ không tự thay cấu hình hoặc deploy. Cấu hình mẫu trong Git vẫn local.
8. Host phải phục vụ đủ `auth-config.js`, `central-auth.js`, `auth-page.js`, `auth-callback.html` cùng mã cập nhật; không cache lẫn cấu hình/bundle cũ. Kiểm tra CSP cho script hiện có và `connect-src` tới đúng Supabase endpoint. Thiết lập HTTPS VPS/domain trước khi nhận mật khẩu thật; phiên này không thay Nginx/TLS/DNS.
9. Chạy smoke test hosted và checklist mutation trên staging bằng tài khoản thử riêng. Chốt các giới hạn/parity và kế hoạch chuyển adapter nghiệp vụ trước rollout production. Chưa xác minh giá/gói/quota của project; cần người phụ trách duyệt chi phí thực tế.

## Migration danh tính an toàn

Tái sử dụng backup mã hóa và quy trình đối chiếu trong `tools/migration/`, không upload bản backup trình duyệt lên server làm kho mật khẩu. Mỗi nguồn cũ giữ nguyên để đối chiếu/rollback có kiểm soát.

Thêm `tools/migration/identity-plan.mjs` xuất hàm `identityPlan()` chạy **offline/dry-run**, nhận danh sách users/types đã chọn, mapping legacy ID → Auth UID được người vận hành xác minh, organization và snapshot membership hiện có. Không có lệnh import/ghi DB. Hàm chặn ID/email/UID trùng, thiếu liên kết/loại quyền, sai portal, thiếu xác nhận Admin và xung đột membership hiện hữu. Không dựa vào email để tự chọn UID. Khi có lỗi, không xuất kế hoạch một phần. Đầu ra allowlist không mang password/pass/token, giữ trạng thái khóa, scope, nhóm nhân viên và danh sách quyền kể cả quyền nghiệp vụ ngoài registry mới. Các trường profile ngoài allowlist phải được đối chiếu riêng; công cụ này không thay thế migration toàn bộ dữ liệu/quan hệ.

Quy trình đề nghị:

1. Sao lưu mã hóa từng origin/profile và kiểm tra phục hồi bản sao. Chọn nguồn chuẩn, đối chiếu xung đột dữ liệu và các liên kết legacy. Không reset storage.
2. Người phụ trách xác minh từng người/UID và quyền sở hữu email qua Auth; mời hoặc đặt lại mật khẩu an toàn. Không chép mật khẩu plaintext hoặc hash legacy vào Auth/DB ứng dụng. Cờ `verified`/`approveAdmin` trong dry-run là chứng nhận của người vận hành sau xác minh, không được nhận từ người dùng tự đăng ký.
3. Đối với quản trị demo, xác nhận đúng **một** legacy identity `u-manager-1` / `manager@residenthub.vn`; giữ ID nghiệp vụ và ánh xạ UID riêng. Nếu có tài khoản/UID trùng hoặc membership đã tồn tại, dừng để đối soát, không upsert/ghi đè. Không gán Admin theo hostname/email hoặc tạo thêm bản quản trị để né xung đột.
4. Review kế hoạch dry-run và snapshot DB hiện hữu. Importer/giao dịch thực phải được xây dựng hoặc người vận hành thực hiện riêng sau phê duyệt; chưa có importer tự động được chạy trong lượt này. Phải đối chiếu FK cư dân/tòa/căn hộ/phân công từ nguồn nghiệp vụ chung, không đưa các ID local chưa được chuyển vào DB một cách mù quáng.
5. Kiểm tra số lượng, liên kết, role, permissions, khóa/mở, đăng nhập/reset và session trên bản staging; giữ dữ liệu/tệp backup cũ. Rollback việc bật identity bằng bản deploy/cấu hình được review, không xóa DB hoặc tự hợp nhất hai nguồn đã phát sinh ghi khác nhau.

## Kiểm thử đã chạy và chưa chạy

Đã chạy đạt:

- `npm run test:identity`: kiểm tra cấu hình sai/thiếu/secret key không fallback local; dry-run không credential/ghi đè; migration/RPC/RLS trong **PostgreSQL WASM (PGlite)**; hai **tiến trình Chrome/profile độc lập** qua Auth HTTP fixture và RPC PostgreSQL thật cục bộ.
- SQL: cách ly tổ chức, anon/direct-write denial, manager không tự nâng Admin, giới hạn grant/scope, staff/resident, khóa rồi mở không phục hồi phiên cũ, đổi mật khẩu, thu hồi session, bảo vệ Admin, mời trùng và không mất bản ghi nghiệp vụ fixture. Hồ sơ/theo dõi nhân viên cũng được kiểm tra qua RPC.
- Browser: login cùng tài khoản/cùng quyền, refresh quyền sau thu hồi Admin, từ chối chỉnh người có quyền cao hơn, không tin loại quyền/demo global local giả, khóa hai phiên, đổi mật khẩu giữa hai browser, lỗi mạng không fallback, đăng nhập đúng cổng staff/resident và bảo toàn users/business fixture cũ.
- Các bộ hiện có: auth-environment-audit, demo-admin (unit + browser), data-consistency, workflows, staff-defaults, staff-settings, general-settings, migration-backup; build và TypeScript typecheck. `staff-settings.test.mjs` được bổ sung fixture rõ ràng thay vì phụ thuộc seed khi nạp trang.

`npm run test:identity:live` hiện **SKIP** vì thiếu cấu hình staging/tài khoản thử và cờ cho phép. Nó chỉ đăng nhập/đọc identity trên hai browser và đăng xuất các phiên thử; không sửa account/role/business. Để chạy có chủ đích, đặt `RH_LIVE_BASE_URL` (HTTPS staging), `RH_LIVE_ALLOW_AUTH=staging`, `RH_TEST_EMAIL`, `RH_TEST_PASSWORD` trong môi trường riêng; không lưu credential trong repository/log.

Bộ `staff-tasks.browser.mjs` cũ đã bị dừng vì chờ bootstrap prompt trong profile sạch; các bộ browser kế tiếp trong lệnh đó chưa được chạy. Không tính chúng là đạt. Chưa nghiệm thu toàn bộ UI/luồng nghiệp vụ trong central mode.

Chưa chạy trên dịch vụ thực: Supabase Auth/JWT signing/refresh lifecycle, gửi và nhận email invite/reset, Deno Edge Function, CORS/CSP, RLS trên cấu hình project thật, hai browser qua VPS, lưu tòa qua server, các giao dịch nghiệp vụ, migration/rollback production và nghiệm thu đầy đủ mọi chức năng. Kết quả fixture **không** chứng minh các mục này đã thành công.

## Nguồn kỹ thuật đã đối chiếu

- Supabase [Auth REST](https://supabase.github.io/auth/) cho token/user/recovery/logout; [sessions](https://supabase.com/docs/guides/auth/sessions) cho `session_id`/`auth.sessions`.
- [Database functions](https://supabase.com/docs/guides/database/functions) và [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) cho quyền thực thi và hàm security definer có search_path cố định.
- [Sign out](https://supabase.com/docs/guides/auth/signout): thu hồi refresh token không tự làm JWT cũ hết hạn; mã này kiểm tra phiên DB/mốc thu hồi bên cạnh trạng thái membership.
- [PGlite](https://pglite.dev/docs/) chỉ dùng làm PostgreSQL engine cho kiểm thử local, không phải database ứng dụng mới.

Không commit, push, merge, deploy, chạy migration trên dịch vụ hoặc sửa dữ liệu người dùng trong lượt triển khai mã này.
