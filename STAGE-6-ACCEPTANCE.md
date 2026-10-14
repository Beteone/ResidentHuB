# Giai đoạn 6 — Checklist nghiệm thu hợp đồng và đặt cọc

Ngày nghiệp vụ cố định cho checklist này: **14/10/2026**. Chạy tự động bằng:

```powershell
node --test tests/rental-domain.test.mjs
```

## Kiểm thử tự động

- [x] Mặc định tiền cọc bằng một tháng tiền thuê; thay số tháng cọc cập nhật được tổng cọc.
- [x] Chặn hai cọc giữ cùng căn hộ; căn hộ có cọc giữ được hiển thị là đã đặt cọc.
- [x] Chuyển cọc thành hợp đồng giữ liên kết và chuyển giao dịch cọc vào hợp đồng.
- [x] Chặn hợp đồng trùng lịch và trả về mã hợp đồng đang xung đột.
- [x] Hủy cọc hoàn một phần thành `cancelled`; hoàn 0 thành `forfeited`; lịch sử ghi đủ nhận, hoàn và/hoặc khấu trừ.
- [x] Trạng thái hợp đồng độc quyền, dùng mốc 14/10/2026; lưu ngày chuyển đi và lịch sử thao tác.
- [x] Khách hàng Nguyễn Thị Hoa tra được hợp đồng CT1-501-2026-001 và căn hộ 501.
- [x] Thanh lý chờ duyệt chỉ số điện nước cuối; sau khi duyệt, tính phí tiện ích và số hoàn.
- [x] Chặn xóa hợp đồng có hóa đơn hoặc bản ghi chỉ số.

## Kiểm tra thủ công trên giao diện

- [ ] Tạo cọc cho căn hộ trống. Xác nhận trạng thái căn hộ thành “Đã giữ chỗ”; thử tạo cọc thứ hai cho cùng căn hộ và xác nhận bị chặn.
- [ ] Mở cọc giữ chỗ và ký hợp đồng từ cọc. Xác nhận cọc thành “Đã ký”, hợp đồng có mã cọc nguồn, tiền đã nhận được chuyển sang hợp đồng và căn hộ thành “Đang thuê”.
- [ ] Tạo hợp đồng có khoảng ngày chồng với `CT1-501-2026-001`. Xác nhận không lưu và thông báo mã hợp đồng gây trùng.
- [ ] Tạo cọc mới. Xác nhận số tháng cọc ban đầu là 1 và tổng cọc bằng một tháng tiền thuê; sửa số tháng hoặc tiền cọc rồi lưu để xác nhận cho phép tùy chỉnh.
- [ ] Hủy cọc với số hoàn nhỏ hơn số đã nhận; xác nhận “Đã hủy” và lịch sử có giao dịch hoàn cùng khấu trừ.
- [ ] Hủy cọc với số hoàn bằng 0; xác nhận “Bỏ cọc” và lịch sử có giao dịch khấu trừ.
- [ ] Tìm `CT1-502-2025-002` với ngày nghiệm thu 14/10/2026; xác nhận hợp đồng hết hạn 31/12/2025 thuộc “Quá hạn”.
- [ ] Đăng ký ngày chuyển đi cho hợp đồng trên; xác nhận ngày và lịch sử được lưu. **Cần quyết định trạng thái tab mong muốn:** ưu tiên ở Giai đoạn 4 là “Quá hạn” trước “Sắp chuyển đi”, trong khi yêu cầu nghiệm thu Giai đoạn 6 nói hợp đồng này phải chuyển sang “Sắp chuyển đi”.
- [ ] Tìm khách hàng Nguyễn Thị Hoa. Xác nhận thông tin cư trú hiển thị tòa CT1 và căn hộ 501.
- [ ] Thanh lý hợp đồng có phí điện/nước: xác nhận wizard yêu cầu chỉ số cuối khi kỳ hiện tại chưa chốt; chỉ số nhập chưa được tự duyệt. Duyệt theo luồng ghi chỉ số bình thường rồi hoàn tất thanh lý; đối chiếu số cần thu/trả và giao dịch cọc.
- [ ] Thanh lý với lựa chọn khách bỏ cọc; xác nhận hợp đồng vào tab “Bỏ cọc”.
- [ ] Thử xóa hợp đồng có hóa đơn và hợp đồng có bản ghi chỉ số trong thời hạn; xác nhận từng thao tác bị chặn và nêu lý do.

## Điểm cần chốt

Quy tắc phân loại Giai đoạn 4 đặt “Quá hạn” cao hơn “Sắp chuyển đi”. Theo quy tắc đó, đăng ký ngày chuyển đi cho hợp đồng đã hết hạn vẫn ở tab “Quá hạn”. Cần xác nhận có muốn thay ưu tiên này để đáp ứng trường hợp nghiệm thu ở trên hay không.
