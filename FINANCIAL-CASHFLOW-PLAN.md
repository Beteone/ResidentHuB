# Phương án chờ xác nhận: liên kết tài khoản và khóa kỳ Thu chi

## Vì sao dừng

Tệp yêu cầu ghi: **“Nếu cần sửa sâu module khác để triển khai Khóa sổ, Xóa tài khoản hoặc liên kết Thu chi, phải báo cáo trước và chờ xác nhận.”**

Audit xác nhận phiếu Thu chi hiện lưu tên sổ quỹ, chưa có ID ổn định và chưa kiểm tra ngày khóa. Chỉ lưu ngày khóa trong Cài đặt sẽ không ngăn được việc ghi/sửa phiếu cũ, nên phiên bản hiện tại chặn thao tác đó. Không thay đổi luồng Thu chi khi chưa được xác nhận.

## Phạm vi đề xuất để duyệt

1. **`data.js` — hook kiểm tra riêng entity `cashflows` trước ghi:**
   - Với phiếu mới: giữ toàn bộ trường/công thức hiện tại. Bổ sung `financialAccountId` khi có ID hợp lệ hoặc tên khớp duy nhất một tài khoản thuộc người thực hiện. Không đoán khi tên trùng, không tự gán lại phiếu cũ.
   - Với sửa phiếu: giữ ID hiện có; không cho bỏ ID/chuyển tài khoản để vượt ngày khóa. Kiểm tra cả tài khoản/ngày trước và sau sửa.
   - Nếu ngày thu chi trước hoặc bằng `lockedThrough`, trả lỗi qua `{ ok:false, error }` hiện có trước khi ghi. Kiểm tra này bao phủ form/CSV vì cùng đi qua RHD. Không đổi tính tiền/hóa đơn/hợp đồng hoặc thiết kế lại Thu chi.
   - Phiếu cũ không liên quan tài khoản mới tiếp tục luồng hiện tại. Phiếu tên mơ hồ không tự tham gia tồn quỹ. Xóa phiếu trong kỳ đã khóa cũng phải bị chặn để giữ kỳ đã chốt; cần duyệt điểm này cùng phương án.

2. **`financial-accounts.js` — bật lưu ngày khóa sau khi kiểm tra ở nguồn đã hoạt động:**
   - Ngày hợp lệ, lưu theo từng tài khoản; tài khoản tiếp tục hoạt động cho các ngày sau khóa.
   - Đổi ngày khóa về trước để mở lại kỳ phải có xác nhận rõ và log trước/sau. Không sửa/xóa các phiếu cũ.
   - Ghi action `lock` trong store nhật ký hiện có; gửi cảnh báo nội bộ theo cấu hình đã lưu.

3. **Kiểm thử bắt buộc trước khi bật:**
   - Thu/chi trước, đúng và sau ngày khóa; sửa cả ngày cũ/ngày mới; thử đổi tài khoản để lách khóa.
   - Form, import CSV và thao tác xóa đều bị kiểm tra tại nguồn; phiếu không liên quan vẫn hoạt động như trước.
   - Giữ nguyên số tiền, ID phiếu, lịch sử, hóa đơn, hợp đồng và số lượng bản ghi khi bị từ chối.
   - Quyền/scope, mã tài khoản, tồn quỹ, cutoff đầu kỳ, hủy phiếu và nhật ký/cảnh báo.

## Chưa nằm trong phần xin duyệt

- Không tự migrate hoặc phân bổ phiếu cũ theo tên. Nếu cần gán ID lịch sử, phải có danh sách phiếu/tài khoản xem trước riêng để người quản lý xác nhận.
- Không chuyển liên kết khi xóa tài khoản đã có phiếu, không cộng gộp số dư đầu kỳ hay thay tài khoản hóa đơn. Hiện chưa có transaction đa khóa; vẫn chặn xóa và nêu lý do. Cần một phương án riêng để giữ số dư, cutoff, phạm vi và lịch sử chính xác trước khi cho phép chuyển.
- Không sửa UI Thu chi, nghiệp vụ ngân hàng hay tính tiền.

Việc cần xác nhận: cho phép bổ sung hook kiểm tra và ID liên kết ở RHD/Thu chi theo mục 1–3, kể cả chặn xóa phiếu thuộc kỳ đã khóa. Chưa triển khai các thay đổi này.
