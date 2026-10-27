# ResidentHub — chuẩn bị lưu trữ tập trung

Ngày 21/10/2026. Người dùng xác nhận **chưa có Supabase project**. Theo điểm dừng cấu hình ở giai đoạn B, công việc hiện tại hoàn tất audit dependency, thiết kế, SQL nền tảng và công cụ sao lưu. **Chưa hoàn thành đồng bộ đa thiết bị; tiêu chí nghiệm thu cuối cùng chưa đạt.**

## Trạng thái theo giai đoạn

| Giai đoạn | Đã thực hiện | Chưa thực hiện |
|---|---|---|
| A | Đọc audit, kiểm tra lại storage/call sites, lập bản đồ dữ liệu và kế hoạch async | Chưa đối chiếu storage thật trên các máy |
| B | Viết `.env.example`, SQL schema/RLS nền tảng, test SQL rollback và hướng dẫn tạo project | Chưa có project, chưa chạy migration/RLS trên PostgreSQL |
| C | Thiết kế identity và quy trình mời/đặt mật khẩu | Chưa tích hợp Supabase Auth, trang invite/reset, membership/role APIs |
| D | Xác định lớp dữ liệu/call sites và giao dịch cần chuyển | **Chưa module nghiệp vụ nào chuyển sang Supabase** |
| E | Công cụ sao lưu mã hóa, kiểm tra cơ bản và so sánh nguồn | Chưa chọn nguồn chuẩn, chưa viết/chạy importer, chưa nhập dữ liệu |
| F | Test công cụ mới, test nghiệp vụ local và build | Chưa test Auth/RLS thật, hai trình duyệt hoặc hai máy dùng chung DB |

Không thay runtime của ứng dụng sang một adapter chưa được kiểm chứng. Không có cấu hình kết nối giả, không SDK được gắn hình thức, không báo kết nối thành công.

## Dependency và nguồn dữ liệu cần chuyển

| Nguồn hiện tại | Module đọc/ghi | Đích và việc cần làm |
|---|---|---|
| `residenthub_users` | auth.js, permissions.js, account-modules.js, dashboard | Supabase Auth + rh_memberships + rh_account_types. Legacy ID giữ riêng với Auth UID; bỏ password/pass khỏi DB ứng dụng |
| `residenthub_account_types` | permissions.js/account-modules.js | Loại quyền theo organization; giữ ma trận hiện có, loại Admin không tự gán |
| `residenthub_<live/demo>_{buildings,apartments,customers,meters,contracts,invoices,deposits,depositTransactions,cashflows}` | data.js, manager-modules, contracts/deposits, rental-domain, billing, báo cáo, resident/staff | Các bảng rh_* cùng đơn vị, truy vấn async; transaction/RPC cho thao tác nhiều bản ghi |
| RHD dynamic entities assets/assetTypes | asset-module.js, contracts | rh_assets/rh_asset_types; xác minh liên kết bàn giao, không chỉ ENTITIES trong data.js |
| RHD financialAccounts + đọc thẳng raw JSON | financial-accounts.js | rh_financial_accounts; owner là membership cùng đơn vị; server kiểm tra settings.view/update và owner/Admin, không chỉ UI |
| `residenthub_<mode>_templates` + ghi tham chiếu thẳng | templates.js, template-editor, template-library, contract-documents | rh_templates; lưu thay template và cập nhật tham chiếu có transaction; giữ snapshot đã ký |
| `residenthub_internal_data` theo user | auth.js, cư dân, notification-manager/general-settings | Phân loại từng collection; bản sao contracts/invoices cũ đối chiếu và hợp nhất nguồn chuẩn, không tiếp tục hai sổ độc lập. Requests/appointments cần quyết định map sang support; notifications sang rh_notifications |
| `residenthub_notification_campaigns_v1` | notification-manager.js, resident-web.html | rh_notification_campaigns + recipient scope; không để cư dân tải nguyên danh sách người nhận |
| `residenthub_account_requests` | auth.js, dashboard, account modules | rh_account_requests, không mang mật khẩu đăng ký cũ; approval gọi server/Auth admin an toàn |
| `residenthub_<mode>_settings`, `residenthub_settings_v1_<actor>`, resident settings | data.js, general-settings, src/settings/settingsStore.ts, contract-documents, resident-web | rh_settings theo org/member; phân biệt cấu hình tài chính chung với tùy chọn cá nhân |
| `residenthub_<mode>_activity_v1` | activity-store.js/general-settings | rh_activity append-only từ RPC; redaction trên server |
| local invoices TS | src/invoices/invoiceService.ts | Cũng đọc/ghi rh_invoices; không bỏ sót đường ghi riêng này |
| billingMeta, billing lock | billing.js | RPC idempotent cho chu kỳ hóa đơn, DB uniqueness/transaction; khóa local không bảo vệ nhiều thiết bị |
| residentHubResidents; rh_db_* | dashboard và fallback auth | Nguồn cũ để đối chiếu/migration, không giữ fallback live sau cutover |
| trạng thái gia hạn hợp đồng, notice/sent/read flags | resident-web và resident-live-workspaces | Trạng thái gia hạn là nghiệp vụ cần DB; trạng thái đã đọc/thông báo đã gửi cần DB/idempotency theo người dùng; không coi tất cả là UI |
| draft template chưa lưu, sidebar/filter, báo cáo sample, export history | template-editor, statistics-report, financial-report và UI | Có thể ở local nếu chỉ là bản nháp/trạng thái máy; dữ liệu sample không nhập vào sổ thật. Export history cần phân loại nếu nhóm muốn dùng chung |

Tìm kiếm hiện tại ghi nhận khoảng 124 dòng gọi nhóm RH/RHD/RHP mutation trong mã nguồn ngoài tests/dist/node_modules. Con số này không bao gồm mọi helper/inline code và không dùng làm bằng chứng đã chuyển đủ. Khi triển khai D phải tìm lại toàn bộ localStorage setItem/removeItem lẫn các wrapper và kiểm tra từng đường ghi.

## Thiết kế database và quan hệ

SQL: `supabase/migrations/202610210001_foundation.sql`. **24 bảng dự kiến**, chưa được tạo trên dịch vụ:

- Identity/đơn vị: rh_organizations, rh_account_types, rh_memberships, rh_building_assignments.
- Nghiệp vụ: rh_buildings, rh_apartments, rh_customers, rh_meters, rh_contracts, rh_invoices, rh_deposits, rh_deposit_transactions, rh_cashflows, rh_financial_accounts, rh_support_requests, rh_assets, rh_asset_types, rh_templates, rh_notification_campaigns.
- Quan hệ và phụ trợ: rh_contract_tenants, rh_settings, rh_notifications, rh_account_requests, rh_activity.

Supabase `auth.users` là bảng Auth do dịch vụ quản lý, không lưu password trong membership. Trường profile giữ metadata nhân viên/cư dân sau khi làm sạch. Bảng nghiệp vụ giữ JSONB payload để bảo toàn thuộc tính và công thức hiện tại; ID và khóa liên kết được sinh từ payload thành cột quan hệ. PK `(organization_id,id)` cho phép giữ legacy IDs trùng giữa các nguồn/đơn vị mà không giao thoa dữ liệu.

FK composite chặn tòa/căn hộ/cư dân/hợp đồng thuộc đơn vị khác; một số FK thêm cả apartment/building để chặn liên kết sai tòa. Xóa mặc định RESTRICT, không cascade mất sổ nghiệp vụ. Contract tenants là quan hệ riêng cho nhiều người thuê; C/D phải duy trì tenantIds/customerIds/customerId nhất quán trong transaction. Các alias accountId/receivingAccountId/tenant arrays, tham chiếu template và tài sản bàn giao cần kiểm tra RPC/dry run, **chưa được schema hiện tại bao phủ đầy đủ**.

`version` chuẩn bị optimistic concurrency nhưng **chưa có RPC compare-and-swap**; bản thân cột không ngăn mất cập nhật. Billing và approve/issue/collect/adjust phải vào RPC riêng, giữ công thức hiện tại, kiểm tra khóa hóa đơn/snapshot và tạo audit trong cùng transaction. Quan hệ pending registration/appointments/các collection cũ chưa phân loại phải được bổ sung sau đối chiếu, không nhét nguyên raw internal_data vào một bảng mở quyền đọc.

## Phân quyền và RLS nền tảng

- Tất cả bảng bật RLS; revoke quyền bảng khỏi anon/public. Các policy hiện tại chỉ mở một phần SELECT cho authenticated khi membership active, đúng organization và deployment gate đã bật.
- `rh_private.can()` đọc quyền mới từ DB mỗi truy vấn, không tin role/organization trong frontend hoặc user metadata. `in_building()` kiểm tra all_buildings, assignment và managerId. SECURITY DEFINER helpers có search_path cố định, quyền EXECUTE giới hạn.
- Không có browser INSERT/UPDATE/DELETE hoặc API quản trị chưa kiểm chứng; cả người có quyền UI cũng chưa ghi DB từ frontend ở giai đoạn này. Việc chặn tất cả ghi là **điểm dừng phát triển**, không phải hoàn tất yêu cầu CRUD.
- Không mở resident SELECT nguyên hợp đồng/hóa đơn vì JSONB có thể chứa thông tin đồng thuê/tài chính không được xem. C/D cần RPC/projection trường dữ liệu được phép và kiểm tra quan hệ cư dân đã duyệt; không dùng ID từ request làm bằng chứng sở hữu.
- Các bảng thu chi/cọc/tài khoản tài chính chưa có SELECT policy hoàn chỉnh; mapping quyền và ownership cần bám logic thực tế thay vì tự thêm quyền. Một số màn không có permission key riêng, phải thống nhất cách ánh xạ trước khi bật.
- Role/membership/assignment chỉ quản trị qua endpoint/RPC kiểm quyền; C cần kiểm tra chống tự nâng quyền, chống cấp quyền vượt quyền người cấp, bảo vệ Admin cuối cùng, kiểm tra portal. Schema chưa có các endpoint này.
- Không tự cấp Admin cho người đăng ký, không tự seed tổ chức/demo/tài khoản. `buildings.create`: Admin có fullAccess hoặc loại tùy chỉnh được cấp rõ ràng; **Quản lý tòa nhà và Nhân viên mặc định không có quyền này**. Giữ quy tắc, không tự sửa ma trận.
- JSON payload/profile chặn các key credential phổ biến kể cả lồng nhau; dữ liệu nhập vẫn cần sanitizer allowlist, không xem kiểm tra key này là thay thế validation toàn bộ.

## Kế hoạch tích hợp async ở C/D

Không thể thay localStorage bằng fetch đồng bộ hoặc ghi local trước rồi báo lưu thành công. Cần:

1. Bundle cấu hình/SDK Supabase riêng cho các HTML tĩnh, bootstrap Auth trước khi render trang bảo vệ. Trang login await signInWithPassword; khôi phục phiên từ SDK, sau đó đọc membership trạng thái hiện hành. Invite/reset nhận link và cho người dùng đặt mật khẩu mới. Không import password rõ.
2. RH.getSession/requireRole và bootstrap trang chuyển sang async. RHP có snapshot quyền trong bộ nhớ phục vụ render, refresh từ server khi load/làm mới; server vẫn kiểm quyền mọi request. Không fallback sang RH_SESSION cũ nếu Auth thất bại.
3. Lớp repository có `load/list/get/create/update/remove`, mọi mutation trả Promise. Có thể giữ snapshot bộ nhớ cho tính toán đồng bộ sau bootstrap; không giữ bản live localStorage song song. Refresh phải thay snapshot bằng nguồn server, không âm thầm merge dữ liệu máy.
4. Chuyển các handler dùng `res.ok` sang await, chỉ đóng form/hiện thành công sau xác nhận commit; nút lưu đang chờ phải chặn double submit. Network/RLS/concurrency errors giữ bản nháp trong bộ nhớ và hiện lỗi. Không dùng sync XHR, không coi hàng đợi offline là đã lưu.
5. Mọi đường dữ liệu tài chính/billing/template/notification/TS services và inline resident/dashboard phải đi qua repository/RPC; chạy tìm kiếm để không còn ghi local nghiệp vụ. RHD mutation không được chỉ fire-and-forget upload.
6. Lưu thông báo, transaction nghiệp vụ và audit có idempotency/transaction phù hợp; không thay công thức tính tiền hoặc schema signed snapshot. Cần kiểm thử mất mạng và response không rõ kết quả, không retry mù tạo trùng hóa đơn.
7. Cutover live chỉ khi tất cả luồng đã chuyển và kiểm thử; thiếu project/config báo lỗi rõ, không quay về local. Demo cục bộ nếu giữ phải biệt lập và do người dùng chủ động khởi tạo; bỏ seed tự chạy trong auth/data/resident ở cùng đợt cutover. Không reset localStorage cũ.

Các lỗi seed, phiên khóa và bảo mật local trong audit **vẫn còn ở runtime cũ**. Chưa sửa lẻ trong đợt chuẩn bị này để không làm gián đoạn luồng cũ khi backend chưa sẵn sàng; đây là hạng mục bắt buộc C/D, không được coi đã khắc phục.

## Sao lưu và xác nhận dữ liệu (E)

Đã thêm `tools/migration/backup.html` và module độc lập, không import app/auth/data; CSP chặn network. Export chỉ đọc localStorage, giữ nguyên raw values và mã hóa AES-GCM/PBKDF2. Không ghi storage, không reset, không upload, không có importer. Session/recovery/login guard không nằm trong backup; phiên sessionStorage không được chuyển sang Auth mới.

Kiểm tra basic: JSON lỗi, mảng/ID thiếu hoặc trùng, email trùng, mật khẩu cũ, một số FK/multi-tenant array/apartment-building mismatch. So sánh hai nguồn theo raw key; khác thứ tự JSON cũng được báo khác. Chưa gộp từng record hoặc quyết định dữ liệu nào mới hơn. Không chứng nhận tính hợp lệ toàn bộ contract/invoice/cashflow chỉ dựa trên validator này.

Trước import cần bản sao giải mã thử được, manifest nguồn/máy/origin, mapping đơn vị/Auth UID/legacy IDs, danh sách duplicate/orphan và quyết định xử lý được người dùng xác nhận. Importer tương lai phải dry run, transaction và cơ chế không import lại; không tự chạy upsert đè DB.

## Kiểm thử đã chạy

| Lệnh | Kết quả |
|---|---|
| node tests/migration-backup.test.mjs | Đạt: round trip mã hóa, sai mật khẩu/tệp bị sửa, loại session/secret khác ứng dụng, nguồn legacy, duplicate/orphan, so sánh và không ghi storage |
| node tests/auth-environment-audit.test.mjs | 9 nhóm chẩn đoán đạt; xác nhận lỗi runtime cũ vẫn tồn tại |
| node tests/data-consistency.test.mjs | Đạt |
| node tests/workflows.test.mjs | Đạt |
| node tests/financial-report.test.mjs | Đạt |
| node tests/statistics-report.test.mjs | Đạt |
| node tests/general-settings.test.mjs | Đạt |
| node src/invoices/billing.integration.test.mjs | Đạt |
| npm run build | Đạt, gồm tsc --noEmit và ba Vite builds |

`supabase/tests/foundation-rls.sql` đã viết nhưng **chưa chạy**: synthetic fixtures trong transaction rollback kiểm tra org, scope, khóa phiên, quyền manager, anonymous/direct-write denial, FK cross-org và credential check. Nó mô phỏng JWT claims trong SQL, không thay thế đăng nhập Auth thật. Không có PostgreSQL/Docker CLI khả dụng và chưa có Supabase project trong phiên hiện tại.

Chưa chạy browser UI mới trên HTTPS/LAN/Vercel; chưa chạy các browser suites hiện có trong đợt này. Build không thay đổi file dist được Git theo dõi. Không có bằng chứng đồng bộ đa máy ở bước này.

### Checklist nghiệm thu sau C/D/E — tất cả hiện chưa chạy trên Supabase

1. Hai browser/profile dùng cùng Auth account, cùng org, reload đều thấy cùng role và danh sách tòa.
2. A tạo tòa (tài khoản có buildings.create), B reload thấy bản mới; tài khoản thiếu quyền gọi thẳng REST/RPC vẫn bị từ chối.
3. A sửa căn hộ/cư dân/hợp đồng/hóa đơn, B reload thấy dữ liệu và các liên kết đúng; giữ công thức/bản ký hiện tại.
4. Thay quyền ở A, B không ghi được bằng quyền cũ; refresh UI đồng nhất. Khóa tài khoản từ A, JWT/phiên đang có ở B không đọc/ghi protected data tiếp.
5. Thay organization_id, parent ID hoặc owner/resident ID trên request không mở dữ liệu tenant khác. Cư dân không đọc hồ sơ/contract của người khác; staff bị giới hạn tòa.
6. Mất mạng/DB không phản hồi/RLS từ chối/conflict version giữ form và báo lỗi, không báo thành công, không tạo bản local riêng. Retry không tạo trùng.
7. Xóa tòa/căn hộ đã có liên kết bị chặn theo nghiệp vụ; thay contract tenants và dữ liệu tham chiếu có transaction.
8. App load, buildings trống hoặc account demo đã bị sửa không tự seed/khôi phục password/status/dữ liệu thật. Giữ backup local cũ nguyên vẹn.
9. Test đủ billing/financial/settings/templates/notifications/staff/resident và build/typecheck sau thay async. Chạy SQL RLS với authenticated/anon, không dùng service key cho các assertion bảo vệ người dùng.

## Việc người dùng cần làm tiếp

Làm theo `supabase/SETUP.md`: tạo project rồi cung cấp Project URL + publishable/anon public key. Chưa cần cấp Admin cho ai hoặc gửi file backup thật ở bước cấu hình. Chỉ có hai thông tin public này vẫn chưa đủ để agent tự thực thi SQL trên dịch vụ; cần người dùng chạy SQL Editor hoặc có công cụ truy cập DB phù hợp sau khi thống nhất, không gửi service key vào chat.

## File và Git

Trong lượt này: sửa `.gitignore`; thêm `.env.example`, báo cáo này, `supabase/SETUP.md`, migration SQL, SQL test, công cụ backup (HTML + hai MJS) và `tests/migration-backup.test.mjs`. Không sửa file runtime RH/RHD/RHP hoặc UI ResidentHub; tất cả module hiện vẫn dùng localStorage.

`AUTH-ENVIRONMENT-AUDIT.md` và `tests/auth-environment-audit.test.mjs` là thay đổi chưa commit có từ lượt audit trước, đã giữ nguyên. Không commit/push/merge/chuyển branch. Không đọc/chỉnh dữ liệu trình duyệt thật, chưa nhập dữ liệu hoặc triển khai Vercel.
