# Thiết lập Supabase cho ResidentHub — điểm dừng cấu hình

Trạng thái 21/10/2026: **chưa có Supabase project** (người dùng xác nhận). Chưa kết nối, chưa tạo bảng trên dịch vụ, chưa nhập dữ liệu, chưa chuyển website sang lưu tập trung. SQL trong thư mục migrations là nền tảng giai đoạn B, không phải bản triển khai đầy đủ C/D.

## 1. Tạo project

1. Mở https://supabase.com/dashboard, đăng nhập và tạo Organization cho nhóm nếu chưa có.
2. Chọn New project, chọn gói Free nếu khả dụng trong tài khoản, đặt tên ResidentHub, chọn region phù hợp nhóm. Tạo database password mạnh và lưu riêng; **không gửi password đó vào chat, không đưa vào mã nguồn**.
3. Đợi project sẵn sàng. Trong phần Connect hoặc Settings / API Keys, lấy **Project URL** và **publishable key** (hoặc legacy anon public key). Chỉ hai thông tin public này cần gửi để tiếp tục tích hợp. Không gửi secret/service_role key.
4. Dùng **cùng project này** cho localhost, LAN và Vercel khi kiểm thử chia sẻ dữ liệu. Không tạo project cho mỗi máy.

Project public URL/key không phải quyền quản trị. Bảo vệ dữ liệu bằng RLS và phiên người dùng; service/secret key có thể vượt RLS và không bao giờ được đưa vào browser. Nguồn: [Securing your data](https://supabase.com/docs/guides/database/secure-data).

## 2. Cấu hình Auth

1. Authentication → Providers: bật Email/password; giữ email confirmation. Trong giai đoạn nhóm thử nghiệm, tắt đăng ký công khai và mời từng người bằng Auth Dashboard. Không bật anonymous sign-in để thay tài khoản thật.
2. Authentication → URL Configuration: đặt Site URL là URL HTTPS Vercel thật của nhóm. Additional Redirect URLs: thêm URL cụ thể cho localhost (đúng port) và callback/password setup dự kiến. Chưa có callback trong app hiện tại, nên chưa gửi thư mời hàng loạt ở bước này.
3. Sau giai đoạn C có trang nhận invite/reset, thêm chính xác URL trang đó cho localhost/Vercel. Với preview Vercel, chỉ cho phép các URL nhóm sử dụng; không mở wildcard cho mọi domain.
4. LAN dùng HTTPS cho luồng cần secure context. Phiên Supabase có thể riêng trên mỗi origin, nhưng tài khoản/dữ liệu sẽ cùng ở một DB sau khi C/D hoàn tất.

Tham khảo chính thức: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Password Auth](https://supabase.com/docs/guides/auth/passwords), [Users / invitations](https://supabase.com/docs/guides/auth/users). Kiểm tra quota email trong Dashboard trước khi mời nhóm; chưa đo giới hạn của tài khoản thực.

## 3. SQL nền tảng

Đọc `migrations/202610210001_foundation.sql` và thiết kế trong `../CENTRAL-DATA-IMPLEMENTATION.md` trước khi chạy. Dành cho **project mới**, không chạy lên DB đã có dữ liệu. SQL có transaction, tạo mới các đối tượng `rh_*` và schema `rh_private`; cố ý không dùng `IF NOT EXISTS` để không che schema xung đột. Không chạy lại nếu đã áp dụng thành công.

Sau khi bạn cung cấp project, cần chạy SQL trên môi trường thử và kiểm tra policy thực, rồi mới dùng cho dữ liệu nhóm. Nếu tự chạy trên project mới: SQL Editor → New query → dán toàn bộ file → Run; lưu lại kết quả/lỗi. Chưa có thông tin kết nối nên agent **chưa chạy SQL này**.

Các bảo vệ đã viết:

- RLS trên toàn bộ bảng `rh_*`; anon không có quyền bảng.
- Org membership được xác minh bằng `auth.uid()` và trạng thái hiện hành ở DB.
- Không dùng org ID hoặc role do frontend gửi để cấp quyền.
- Khóa membership chặn các truy vấn bảo vệ tiếp theo, kể cả JWT còn hạn; dữ liệu đã tải trước đó không thể bị thu hồi khỏi bộ nhớ máy từ xa.
- Không có trigger tạo Admin sau signup. Tạo membership/đơn vị/role chỉ qua quy trình quản trị được xác nhận.
- Mọi đơn vị mặc định `data_access_enabled=false`.
- **Chưa cấp quyền ghi trực tiếp hoặc RPC nghiệp vụ cho browser**. Đây là nền tảng an toàn để phát triển tiếp; chưa thể dùng frontend cũ để CRUD.
- Chưa mở dữ liệu hợp đồng/hóa đơn cho cư dân; cần projection và policy được kiểm thử trong C/D để không lộ thông tin đồng thuê/người khác.

Không bật `data_access_enabled` chỉ để thử vượt lỗi. Phải hoàn tất C/D và các bài kiểm thử RLS/quan hệ/giao dịch trước khi bật. Supabase RLS hướng dẫn: https://supabase.com/docs/guides/database/postgres/row-level-security.

## 4. Môi trường và Vercel

`.env.example` chỉ có tên biến và giá trị trống; không có kết nối giả. Khi được hướng dẫn ở giai đoạn C, sao chép sang `.env.local` (đã gitignore) và điền URL + publishable key thật. Chưa có SDK hoặc module đọc các biến này trong app hiện tại.

Frontend hiện là HTML tĩnh + ba Vite library bundles, **không phải Vite SPA**. Chỉ thêm VITE_* vào Vercel chưa đủ: giai đoạn C phải thêm entry cấu hình/bootstrap được build ra JS và đưa vào các trang trước khi gọi RH/RHD. Nếu thiếu cấu hình, phải báo lỗi cấu hình, không fallback sang kho live cục bộ.

Sau khi module cấu hình đó được triển khai: Vercel → Project → Settings → Environment Variables → đặt cùng hai giá trị cho các environment cần dùng chung. Redeploy để build nhận cấu hình mới. Không đặt service_role/database password trong biến frontend, kể cả tên không có tiền tố VITE_. Không thay deployment hiện tại trước khi hoàn tất thử nghiệm cutover.

## 5. Sao lưu và chuyển tài khoản

Trước khi mở ResidentHub cũ để thu thập dữ liệu, lưu ý auth.js hiện vẫn chạy seed. Mở trực tiếp `/tools/migration/backup.html` từ **đúng origin cũ**, không cần vào index.html hoặc dashboard trước. Trang sao lưu không nạp auth/data và không chạy seed.

1. Mỗi thành viên xuất bản sao lưu riêng ở từng origin/profile đã sử dụng. Dùng mật khẩu ít nhất 12 ký tự, giữ tệp và mật khẩu riêng.
2. Sao lưu dùng AES-256-GCM + PBKDF2-SHA256 600.000 vòng, giữ nguyên raw values kể cả JSON hỏng. Không xuất session/recovery/login guard hoặc khóa ứng dụng khác. Không có nút upload/import/reset.
3. Dùng phần kiểm tra để giải mã lại tệp trong bộ nhớ và xác minh mở được. Dùng hai tệp để so sánh khác biệt **theo khóa**. Công cụ chỉ cảnh báo; chưa gộp/xác minh mọi quan hệ nghiệp vụ, không chứng nhận dữ liệu đủ điều kiện nhập.
4. Nếu origin cũ là HTTP LAN, WebCrypto có thể không có. Không đổi sang hostname/port khác để “lấy” dữ liệu vì đó là kho khác. Cần phương án xuất offline có kiểm soát tại chính thiết bị hoặc HTTPS cho đúng kho; công cụ hiện từ chối chạy khi không có secure context. Không dùng dịch vụ chuyển đổi online để đọc bản sao lưu.
5. Chọn nguồn chuẩn, lập bảng đối chiếu và giải quyết email/ID/quan hệ trùng. Không lấy máy đầu tiên làm chuẩn mặc định. Không nhập demo lẫn live.
6. Sau khi nhóm xác nhận bản sao lưu, nguồn và đơn vị đích, mới phát triển/chạy importer có dry run và transaction. Không dùng upsert ghi đè để gộp nguồn xung đột.
7. Tài khoản cũ có mật khẩu rõ: **không import password/pass vào bảng ứng dụng, không đồng bộ lại mật khẩu cũ**. Mời từng email đã xác minh bằng Supabase Auth, người dùng tự đặt mật khẩu mới. Giữ mapping legacy ID → Supabase UID để không gãy owner/manager/resident links. Bản sao cũ được mã hóa chỉ phục vụ bảo toàn, không là kho xác thực mới.
8. Cấp Admin cho người khởi tạo/đơn vị phải có danh sách được xác nhận. Loại `at-building-manager` vẫn không có `buildings.create`; không tự nâng quyền.

## 6. Thông tin cần để tiếp tục

Gửi **Project URL + publishable/anon public key** sau khi tạo project. Khi tới bước nhập dữ liệu, sẽ cần xác nhận riêng danh sách đơn vị, tài khoản quản trị, nguồn chuẩn và báo cáo dry run. Hiện chưa yêu cầu gửi dữ liệu thật hoặc file backup chứa tài khoản vào chat.
