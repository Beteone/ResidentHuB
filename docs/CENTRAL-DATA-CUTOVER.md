# Đồng bộ đa máy: tài khoản, quyền và dữ liệu nghiệp vụ tập trung — 07/11/2026

## 1. Nguyên nhân gốc (đã kiểm chứng lại trên code)

- `auth.js` đọc tài khoản/mật khẩu từ `localStorage['residenthub_users']`, `permissions.js` đọc quyền từ `residenthub_account_types`, `data.js` và các module khác đọc/ghi `residenthub_live_*`. localStorage **riêng cho từng trình duyệt × máy × origin** (`localhost:5501` ≠ `127.0.0.1:5501` ≠ `http://162.4.176.164`).
- Tài khoản demo chỉ được seed trên localhost → VPS báo sai mật khẩu; mỗi máy có loại quyền riêng → máy có/không có quyền Admin; mỗi máy có kho tòa nhà/căn hộ riêng. `git pull` chỉ đồng bộ **code**, không đồng bộ localStorage.
- Ngoài ra `.vscode/sftp.json` (trên `origin/main`) bật `uploadOnSave` lên `/var/www/html` bằng tài khoản root: mọi lần lưu file trong VS Code của bất kỳ ai cũng đẩy code chưa commit lên production → code trên VPS có thể khác Git.

## 2. Kiến trúc mới

```
Trình duyệt (mọi máy)                          Supabase (một project dùng chung)
 index/dashboard/staff/resident ──Auth──────▶  Auth (email/mật khẩu, phiên)
   RH / RHP (central-auth.js)   ──RPC───────▶  rh_identity_* : thành viên, loại quyền, khóa/mở
   RHD + mọi module             ──RPC───────▶  rh_data_load / rh_data_apply / rh_data_save_doc
     (central-data.js chặn các khóa                 → bảng rh_buildings, rh_apartments, … (FK, RLS)
      residenthub_live_* ở tầng storage)            → kiểm tra quyền + phạm vi tòa ở MỌI lần ghi
```

- **Bật bằng cấu hình**: `auth-config.js` = `{ mode:'supabase', url, publicKey, organizationId, businessData:'central' }`. Bản trong Git vẫn là `mode:'local'` (không ảnh hưởng ai đang phát triển).
- **Đọc**: khi mở trang, `rh_data_load` trả về toàn bộ dữ liệu tài khoản được phép xem (máy chủ lọc theo phạm vi tòa/vai trò). Trang chỉ chạy sau khi tải xong; lỗi tải → trang dừng, **không** quay về dữ liệu cục bộ.
- **Ghi**: mỗi lần module ghi một khóa, `central-data.js` so sánh theo từng bản ghi và gửi `rh_data_apply` **đồng bộ** — `RHD.create/update/remove` chỉ trả `ok` sau khi DB commit. Máy chủ từ chối → `{ ok:false, error }` (giao diện cũ đã hiển thị lỗi này) hoặc thông báo nổi.
- **Chống ghi đè**: mỗi bản ghi có `version`. Máy B sửa trên bản cũ → máy chủ trả xung đột, máy B tự tải lại dữ liệu mới, không mất thay đổi của máy A.
- **Làm mới**: tải lại trang; tự làm mới khi quay lại tab (focus, tối đa 15 giây/lần) và giữa các tab cùng trình duyệt. Không realtime.
- **Dữ liệu cũ trong trình duyệt** không bị đọc/sửa/xóa ở chế độ tập trung; dùng để sao lưu và nhập (mục 6).

## 3. Phạm vi

| Nhóm | Nguồn | Ghi chú |
|---|---|---|
| Tài khoản, mật khẩu, khóa/mở, đổi/đặt lại mật khẩu | Supabase Auth + `rh_memberships` | Đã có từ lượt trước (central-auth.js) |
| Loại tài khoản, quyền, phạm vi tòa | `rh_account_types`, `rh_building_assignments` | Không còn phụ thuộc localStorage |
| Tòa nhà (kèm phí dịch vụ `services`), căn hộ, khách hàng/cư dân, chỉ số điện nước, hợp đồng (+ đồng thuê), đặt cọc, giao dịch cọc, hóa đơn, thu chi, yêu cầu hỗ trợ/nhiệm vụ nhân viên, tài sản, loại tài sản, tài khoản tài chính, biểu mẫu, sổ chạy hóa đơn | Bảng `rh_*` qua `rh_data_*` | **Mới chuyển trong lượt này** |
| Chiến dịch thông báo (`residenthub_notification_campaigns_v1`) | `rh_notification_campaigns` | Cư dân chỉ thấy chiến dịch gửi cho mình |
| Nhật ký hoạt động (`activity_v1`) | `rh_records` (chỉ thêm, không sửa/xóa) | |
| Cài đặt cá nhân (`residenthub_settings_v1_<id>`), module hóa đơn TS, billing meta | `rh_settings` | Cài đặt vẫn **theo từng tài khoản** như hiện tại, nay đồng bộ giữa các máy của cùng tài khoản |
| Vẫn cục bộ | localStorage/sessionStorage | Demo (`residenthub_demo_*`), giao diện/theme, bản nháp biểu mẫu, mẫu báo cáo thống kê, lịch sử xuất báo cáo, cờ "đã nhắc" của cư dân, khóa chống chạy trùng giữa các tab, cờ migration cục bộ, token phiên (sessionStorage) |
| **Chưa chuyển** | localStorage | `residenthub_internal_data` (yêu cầu/lịch hẹn/thông báo nội bộ theo người dùng do auth.js quản lý) và luồng đăng ký/duyệt tài khoản cư dân — chế độ tập trung đang tắt các luồng đăng ký này, tạo tài khoản bằng lời mời. Cần thiết kế riêng. |

## 4. Quy tắc quyền thực thi tại database

- Mọi RPC đọc lại membership, loại quyền, phạm vi và phiên Auth ở mỗi lần gọi: khóa tài khoản / đổi mật khẩu / đổi quyền có hiệu lực ngay lần gọi kế tiếp, kể cả JWT cũ. Tổ chức có `data_access_enabled=false` → từ chối tất cả.
- **Quản lý**: đọc mọi dữ liệu trong phạm vi tòa (giống giao diện hiện tại); **ghi** cần đúng quyền module (`buildings.create`, `apartments.update`, …). Hóa đơn: chuyển "đã thanh toán" cần `invoices.collect`, "đã duyệt" cần `invoices.approve`; duyệt chỉ số cần `meters.approve`. Tạo tòa cần `buildings.create` và phạm vi toàn bộ (hoặc tự là người quản lý tòa).
- Ánh xạ cần nhóm duyệt lại (ứng dụng chưa có khóa quyền riêng): đặt cọc/giao dịch cọc ← `contracts.create|contracts.update|customers.update`; thu chi ← `invoices.collect|update|create`, `support.update`, `settings.update`; tài khoản tài chính ← `settings.update`.
- **Nhân viên**: chỉ thấy tòa/căn trong phạm vi, nhiệm vụ được giao, yêu cầu của chính mình; tiền công bị ẩn nếu không có `staffIncome.view`; chỉ sửa đúng các trường data.js cho phép; không xóa, không tự ghi tiền công/phiếu chi.
- **Cư dân**: chỉ thấy hợp đồng mình là người thuê, căn/tòa liên quan, hóa đơn đã phát hành của mình, yêu cầu của mình; chỉ được gửi yêu cầu, báo thanh toán (`payment_pending`), ký/gia hạn hợp đồng, nhắn tin/đánh giá yêu cầu.
- Toàn vẹn: khóa ngoại (căn hộ ↔ tòa, hợp đồng ↔ căn/khách, hóa đơn ↔ hợp đồng cùng căn/tòa, …), xóa bản ghi đang được dùng bị chặn, không lưu trường mật khẩu/token, mỗi khóa sổ chạy hóa đơn duy nhất.
- Không còn cách tự nâng quyền Admin từ trình duyệt; Admin đầu tiên chỉ được tạo bằng script SQL của người vận hành.

## 5. Kích hoạt — từng bước

Người vận hành làm các bước có dấu 🔒; **không** gửi mật khẩu, service_role key, mật khẩu DB hay SSH key vào chat/Git.

1. **Tạo Supabase project** (supabase.com → New project, gói Free, region Singapore). 🔒 Mật khẩu DB lưu riêng.
2. **Chạy migration** — SQL Editor → New query → dán và chạy lần lượt, mỗi file một lần:
   `202610210001_foundation.sql` → `202611040001_identity.sql` → `202611040002_identity_invites.sql` → `202611070001_business_data.sql`.
3. **Auth**: Authentication → Providers → Email bật; tắt "Allow new users to sign up". URL Configuration: Site URL = địa chỉ website; Redirect URLs thêm `http://162.4.176.164/auth-callback.html` (và `http://localhost:5501/auth-callback.html` nếu thử trên máy).
4. 🔒 **Tạo người dùng Admin**: Authentication → Users → Add user → `manager@residenthub.vn`, đặt mật khẩu mạnh, tick *Auto Confirm User*.
5. 🔒 **Bootstrap tổ chức**: chạy `supabase/sql/bootstrap-organization.sql` (sửa 4 giá trị đầu nếu cần). Ghi lại *Organization UUID* in ra. Chạy lại sẽ bị từ chối, không ghi đè.
6. **Sinh cấu hình công khai**: tạo `.env` (đã gitignore) từ `.env.example` với Project URL, publishable key, Organization UUID; chạy `node --env-file=.env tools/auth-config.mjs` → tạo `auth-config.generated.js`. Ba giá trị này là **công khai** (an toàn khi nằm ở frontend vì DB đã khóa bằng RPC/RLS).
7. **Triển khai VPS** (mục 7) với `auth-config.generated.js` đổi tên thành `auth-config.js` **chỉ trên VPS**.
8. **Nhập dữ liệu cũ** nếu cần (mục 6).
9. **Kiểm thử khói** trên 2 máy thật: đăng nhập cùng tài khoản; máy A thêm tòa → máy B tải lại thấy; đổi quyền/khóa tài khoản → cả hai máy nhận. `RH.inspectAuthEnvironment()` trong Console phải trả `businessData: 'central'`.
10. Thêm thành viên: Auth → Add user (người đó tự đặt mật khẩu), rồi chạy khối *OPTIONAL* cuối file bootstrap; hoặc dùng lời mời trong app sau khi deploy Edge Function `identity-invite`.

**Môi trường:** dùng một project cho giai đoạn thử có kiểm soát (localhost chỉ trỏ vào đó khi cố ý thay `auth-config.js` cục bộ — khi đó máy local ghi vào DB thật). Khi có dữ liệu thật, tạo project thứ hai cho staging/dev; `auth-config.js` trong Git luôn để `mode:'local'`.

## 6. Chuyển dữ liệu cũ (an toàn, có thể chạy thử)

1. Trên **mỗi** máy/origin có dữ liệu: mở `/tools/migration/backup.html` từ đúng origin đó, xuất bản sao mã hóa, kiểm tra giải mã. Có thể so sánh hai bản sao để thấy khác biệt.
2. Nhóm **chọn một nguồn chuẩn**. Nếu dữ liệu nhiều máy khác nhau, phải quyết định thủ công — công cụ không tự hợp nhất.
3. Trên máy nguồn chuẩn, origin cũ đã được deploy bản mới với cấu hình trung tâm: đăng nhập Admin, trong **cùng tab** mở `/tools/migration/central-import.html` → *Phân tích (chạy thử)*. Bảng hiện: sẽ thêm / đã có giống hệt / xung đột / lỗi. Bước này không ghi gì.
4. Mọi xung đột (cùng mã, khác nội dung), liên kết hỏng, trường mật khẩu, trùng mã, `managerId` chưa có tài khoản trung tâm **chặn toàn bộ**; gửi bảng cho nhóm quyết định.
5. Kế hoạch hợp lệ → tick xác nhận → *Nhập dữ liệu*. Chỉ **thêm mới** (version 0): máy chủ từ chối mọi bản ghi đã tồn tại. Chạy lại an toàn, không tạo trùng.
6. Mật khẩu cũ **không** được chuyển. Mỗi người được tạo tài khoản Auth mới và tự đặt mật khẩu (hoặc dùng "Quên mật khẩu" qua email). Mã thành viên giữ ID cũ (`u-manager-1`, …) để `managerId` của tòa vẫn đúng.
7. Lưu ý: biểu mẫu hệ thống được Admin tạo khi đăng nhập lần đầu; biểu mẫu cũ cũng được nhập (khác mã) nên có thể thấy hai bộ biểu mẫu mặc định — có thể xóa bộ không dùng sau khi kiểm tra.

**Rollback:** đổi `auth-config.js` trên VPS về `mode:'local'` (hoặc `businessData:'local'` để giữ đăng nhập tập trung) và tải lại — ứng dụng quay về kho trình duyệt cũ còn nguyên. Không xóa DB; dữ liệu ghi trên DB trong thời gian bật không tự gộp ngược về trình duyệt. Khóa tạm cả tổ chức: `update public.rh_organizations set data_access_enabled=false where id='<uuid>';`.

## 7. Triển khai VPS Ubuntu 24.04 (1 CPU / 2 GB) — chưa thực hiện, cần phê duyệt

Ứng dụng là web tĩnh; mọi xử lý nằm ở Supabase → VPS chỉ cần Nginx.

1. 🔒 **Ngay lập tức**: đổi mật khẩu root VPS (mật khẩu hiện tại đã nằm công khai trong `origin/main:.vscode/sftp.json`), tạo user deploy dùng SSH key, đặt `PermitRootLogin no`. Xóa `.vscode/sftp.json` khỏi repo (cân nhắc xóa khỏi lịch sử cùng cả nhóm) và **tắt `uploadOnSave`**.
2. Kiểm tra web server hiện tại: `systemctl status nginx apache2`, thư mục đang phục vụ (`/var/www/html`).
3. Cài/khởi tạo (ví dụ Nginx):
   ```bash
   sudo apt update && sudo apt install -y nginx git rsync
   sudo git clone https://github.com/Beteone/ResidentHuB.git /opt/residenthub-src
   sudo mkdir -p /var/www/residenthub /etc/residenthub
   # đặt cấu hình công khai đã review vào /etc/residenthub/auth-config.js
   ```
4. Script deploy (chạy khi muốn phát hành, từ nhánh `main` đã review):
   ```bash
   cd /opt/residenthub-src && sudo git fetch && sudo git checkout --detach origin/main
   sudo rsync -a --delete --exclude .git --exclude .vscode --exclude node_modules --exclude tests \
     --exclude supabase --exclude docs --exclude '*.md' --exclude .env --exclude auth-config.js ./ /var/www/residenthub/
   sudo cp /etc/residenthub/auth-config.js /var/www/residenthub/auth-config.js
   ```
5. `/etc/nginx/sites-available/residenthub`:
   ```nginx
   server {
       listen 80 default_server;
       server_name _;
       root /var/www/residenthub;
       index index.html;
       location / { try_files $uri $uri/ =404; }
       location ~* \.(html|js|css)$ { add_header Cache-Control "no-cache"; }
       location ~* \.mjs$ { types {} default_type text/javascript; add_header Cache-Control "no-cache"; }
       add_header X-Content-Type-Options nosniff;
   }
   ```
   `sudo ln -s /etc/nginx/sites-available/residenthub /etc/nginx/sites-enabled/ && sudo rm /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx`. `.mjs` phải trả MIME JavaScript, nếu không công cụ sao lưu/nhập không chạy.
6. **HTTPS khuyến nghị mạnh**: website HTTP để kẻ trung gian có thể chèn script đọc mật khẩu khi người dùng gõ (dù mật khẩu gửi thẳng tới Supabase qua HTTPS). Ngoài ra `crypto.randomUUID` (dùng khi lưu Cài đặt) chỉ có ở HTTPS/localhost — đây là lỗi **có sẵn** trên bản HTTP. Gắn tên miền (kể cả miễn phí) rồi `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d <domain>`; cập nhật Site URL/Redirect URLs trên Supabase.

## 8. Kiểm thử

Đã chạy, đạt (07/11/2026, máy phát triển Windows):

| Lệnh | Loại | Nội dung |
|---|---|---|
| `node tests/central-data.sql.test.mjs` | PostgreSQL thật (PGlite) | nhập toàn bộ bộ dữ liệu mẫu do data.js sinh; 2 phiên cùng tài khoản đọc giống nhau; xung đột version; FK/RESTRICT; cách ly tổ chức; quản lý/nhân viên/cư dân; tài liệu riêng; nhật ký chỉ thêm; khóa/mở, cổng tổ chức, anon; script bootstrap (chưa xác nhận email → từ chối; chạy lần 2 → từ chối) |
| `node tests/business-import-plan.test.mjs` | Đơn vị | thứ tự phụ thuộc, chỉ thêm, chạy lại không trùng, mọi lỗi chặn toàn bộ |
| `node tests/central-data.browser.mjs` | 2 Chrome profile độc lập + PostgreSQL thật | 8 tình huống bắt buộc: cùng đăng nhập/quyền; A tạo tòa qua form thật → B thấy; A sửa căn hộ qua form → B thấy; ghi trên dữ liệu cũ bị từ chối & tự tải lại; khách–hợp đồng–hóa đơn liên kết đúng; xóa tòa còn căn bị chặn; đổi quyền/phạm vi → cả hai máy nhất quán; giả mạo quyền localStorage và gọi RPC trực tiếp bị từ chối 403/42501; khóa tài khoản → cả hai máy không ghi được; đăng xuất/đăng nhập không mất dữ liệu; trang nhân viên và cư dân tải không lỗi |
| `node tests/central-import.browser.mjs` | Chrome + PostgreSQL thật | trang nhập: chạy thử không ghi, cần xác nhận, nhập theo thứ tự FK, chạy lại không trùng, localStorage cũ giữ nguyên |
| `npm run test:identity`, các bộ `tests/*.test.mjs`, `billing.integration`, `npm run build` (tsc + 3 Vite build) | Hồi quy | đạt; `dist/` không đổi |

**Không đạt do môi trường, có sẵn trước thay đổi:** `browser-workflows.test`, `general-settings.browser`, `user-management.browser`, `theme-accounts.browser`, `ui-restoration.browser` (và `staff-tasks.browser`) cố định dùng Microsoft Edge, Edge headless không khởi động được trên máy này; chạy bằng Chrome thì treo ở `prompt()` khởi tạo demo — **bản HEAD gốc cũng lỗi y hệt**.

**Chưa kiểm thử (cần project thật):** Supabase Auth/JWT/refresh thật, CORS/độ trễ mạng tới Supabase, email mời/đặt lại mật khẩu, Edge Function, hai máy thật qua VPS. Kết quả fixture **không** chứng minh các mục này.

## 9. Giới hạn đã biết

- Ghi dùng XHR đồng bộ để giữ nguyên hợp đồng đồng bộ của 100+ chỗ gọi RHD: giao diện "đứng" trong thời gian một lần lưu (thường < 0,5 s); trình duyệt có cảnh báo deprecation trong Console. Chuyển toàn bộ sang async là bước sau.
- Tải toàn bộ dữ liệu được phép xem khi mở trang — phù hợp quy mô demo (hàng nghìn bản ghi); ảnh base64 lớn làm chậm.
- Mã tự sinh (TN0001, HD2026-0001…) đếm theo số bản ghi đang thấy — hai máy tạo cùng lúc có thể trùng **mã hiển thị** (không trùng ID). Có sẵn từ trước.
- Quản lý đọc dữ liệu theo phạm vi tòa chứ chưa theo từng quyền xem module; ghi thì theo đúng quyền.
- `internal_data` và đăng ký cư dân: xem mục 3.
