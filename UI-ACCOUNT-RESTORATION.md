# Điều tra giao diện và tài khoản — 27/10/2026

## Trạng thái và phạm vi

- Branch `Chi`, HEAD `61c4d62`; working tree sạch trước chỉnh sửa.
- `origin/main` trong máy tại `a0f84d2` có cùng tree với HEAD (`git diff origin/main HEAD` rỗng). Local `main` tại `87ccb50` chậm 172 commit, không dùng làm nguồn phục hồi.
- Đã đối chiếu lịch sử các ref hiện có bằng `git log --all`, diff từng commit, blame và diff các parent merge. Không fetch; các kết luận về remote dựa trên ref đã có trong máy.
- Không reset, revert, checkout file cũ, merge, commit hoặc push. Không thay đổi dữ liệu người dùng; kiểm tra trình duyệt dùng profile và localStorage riêng trong thư mục tạm.

## Bằng chứng

| Commit | File / đoạn logic | Kết quả đối chiếu |
| --- | --- | --- |
| `941bb62` | `theme.js`: fallback `system`; `auth.js`: `DEFAULT_STAFF_PREFERENCES.theme`; `theme.css`: các selector dark và `!important` | Thêm theme tự theo hệ điều hành, ép nền tối nhưng chưa đồng bộ các biến `--ink`, `--surface`, `--line` và màu chữ cố định. Parent `182a759` chưa có stylesheet theme này, là mốc đối chiếu trước lỗi nền tối. |
| `48104b0` | `auth.js`, `dashboard.html`, `index.html` | Chủ động tách hồ sơ cư dân và tài khoản, thêm đăng ký/chờ duyệt. Đây là chức năng cần giữ. |
| `5c6a3d2` | `account-modules.js`: `typeOptionsFor`; `auth.js`: tạo tài khoản, chuẩn hóa bản ghi, đăng nhập bằng điện thoại | Thêm quản lý loại tài khoản và người dùng; form tạo mới chỉ chọn loại cổng quản lý. Có hỗ trợ điện thoại và kiểm tra trùng số nhân viên. |
| `b521367` | `account-modules.js`: `openUser`, `typeOptionsFor`, `submitUser` | Mở lại tạo cư dân trực tiếp và liên kết hồ sơ, nhưng `submitUser` vẫn guard `users.create` trước khi xét `users.createResident`, làm người chỉ có quyền tạo cư dân không lưu được. |
| `4475c45` | `auth.js`: so với parent thứ nhất `689b546` | Mất `normalizePhone`, `findStaffByPhone`, nhánh đăng nhập điện thoại; quay lại bắt buộc email; mất lưu `phone` và chấp nhận bản ghi chỉ có điện thoại. Đây là bằng chứng hồi quy ở merge, không phải suy đoán commit mới nhất. Parent `689b546` là mốc gần trước merge còn các đoạn này, không khẳng định toàn bộ UI tại đó hoàn hảo. |
| `f2024ed` | `auth.js`, `account-modules.js` | Bổ sung lại metadata loại tài khoản và role theo portal, tách `createUserRecord` để giữ luồng phê duyệt. Giữ nguyên các bổ sung này. |
| `fc6c81f` | `account-modules.js` | Thêm nhóm chuyên môn nhân viên; giữ nguyên. |

Không có một commit duy nhất được xác nhận tốt cho tất cả chức năng. Các mốc trên được dùng đối chiếu từng đoạn; không phục hồi nguyên file.

## Sửa có chọn lọc

- `theme.js`, `auth.js`: mặc định sáng khi chưa chọn theme; giữ lựa chọn light/dark/system đã lưu.
- `theme.css`: nối biến màu cũ vào palette tối; đồng bộ tiêu đề, nhãn, mô tả và đầu bảng; dùng background thay background-color để loại gradient sáng trên bề mặt tối.
- `account-modules.js`: kiểm tra quyền cập nhật riêng, tạo mới kiểm tra theo portal của loại đã chọn; chuẩn hóa portal cho tài khoản staff khi sửa. Danh sách vẫn lấy từ `RHP.listTypes()`, không thêm danh sách vai trò hardcode.
- `auth.js`: khôi phục chọn lọc hỗ trợ điện thoại khi tạo/lưu/đọc/đăng nhập; bỏ dò email trống; kiểm tra trùng điện thoại tài khoản nội bộ khi thêm/sửa. Giữ kiểm tra cư dân, hồ sơ, căn hộ, phạm vi tòa nhà và logic đăng ký/phê duyệt.
- `tests/theme-accounts.browser.mjs`: kiểm tra hồi quy trên trang thật bằng Edge headless, dữ liệu cô lập.

## Kết quả

- `npm run build`: đạt (TypeScript và cả ba bundle).
- 8 bộ kiểm tra logic `*.test.mjs` không dùng browser: đạt ở lần chạy tổng; chạy lại staff settings, workflows, data consistency, auth audit sau sửa auth: đạt.
- `node tests/theme-accounts.browser.mjs`: đạt. Kiểm tra sáng mặc định với hệ điều hành tối, explicit dark và màu tiêu đề/nền; CRUD loại tài khoản; danh sách động; tạo quản lý và loại tùy chỉnh; đăng nhập điện thoại; người chỉ có quyền tạo cư dân; đăng ký/phê duyệt/liên kết hồ sơ; không có JS exception hoặc console error trong các luồng này.
- `node tests/ui-restoration.browser.mjs`: dừng ở kiểm tra thống kê kỳ vọng cao 300px, thực tế 220px. Không sửa module thống kê.
- `node --test tests/browser-workflows.test.mjs`: chạy ngoài sandbox vẫn dừng ở `RHUI.previewContractForm is not a function`. Không sửa module hợp đồng.
- Một lần tái sử dụng helper `building-account-checks.mjs` dừng ở tạo tòa nhà với fixture địa chỉ cũ; bộ kiểm tra mới tách khỏi helper này và tự tạo fixture cho tài khoản.
- `git diff --check`: đạt. Các bundle build không tạo thay đổi nội dung tracked.

Giới hạn: chưa xác minh thủ công mọi màn hình, mọi màu hoặc mọi phân quyền. Theme đã lưu rõ ràng là `dark`/`system` vẫn được tôn trọng; người dùng có thể chọn sáng nếu muốn giao diện sáng cố định. Các bài auth audit có assertion ghi nhận lỗi tồn tại ngoài phạm vi, không có nghĩa những lỗi đó đã được sửa.
