# ResidentHuB — Tài liệu giới thiệu sản phẩm dành cho Marketing

> **Mục đích:** cung cấp cho đội Marketing/Content một nguồn thông tin thống nhất để lên bài giới thiệu, landing page, bài đăng mạng xã hội, kịch bản demo và nội dung hình ảnh.
>
> **Đối tượng sử dụng:** nội bộ. Những ghi chú về giới hạn kỹ thuật, dữ liệu và trạng thái tích hợp không phải câu chữ quảng cáo; cần dùng để kiểm chứng tuyên bố trước khi xuất bản.
>
> **Căn cứ:** giao diện, mã nguồn và tài liệu trong repository ResidentHuB. Tài liệu này mô tả những gì dự án đang thể hiện; không thay cho xác nhận về chính sách kinh doanh, giá bán, SLA, triển khai thương mại hay bảo mật.

## 1. ResidentHuB là gì?

**ResidentHuB là ứng dụng web hỗ trợ ban quản lý vận hành các nghiệp vụ chung cư và cung cấp một cổng tiện ích dành cho cư dân.** Sản phẩm gom các công việc như quản lý tòa nhà, căn hộ, khách thuê, hợp đồng, ghi chỉ số, hóa đơn và thông báo vào các khu vực làm việc có liên kết với nhau.

ResidentHuB có hai trải nghiệm chính:

1. **Khu vực Quản lý:** dành cho nhân sự vận hành và quản lý. Giao diện cung cấp các màn hình quản lý tài sản/tòa nhà, căn hộ, khách hàng, đặt cọc, hợp đồng, chỉ số, hóa đơn, hỗ trợ, thông báo, tài khoản và báo cáo.
2. **Khu vực Cư dân:** một giao diện riêng cho cư dân theo dõi thông tin tổng quan, hóa đơn, yêu cầu hỗ trợ, hợp đồng, thông báo, lịch hẹn và cài đặt cá nhân.

### Mô tả ngắn

> ResidentHuB kết nối công việc của ban quản lý với trải nghiệm thông tin của cư dân — từ hồ sơ căn hộ và hợp đồng đến chỉ số, hóa đơn, thông báo và yêu cầu hỗ trợ.

### Mô tả một câu

> **ResidentHuB — một nơi để ban quản lý vận hành gọn hơn và cư dân theo dõi thông tin chung cư thuận tiện hơn.**

## 2. Bối cảnh và nhu cầu sản phẩm hướng tới

Trong vận hành chung cư, thông tin thường đi qua nhiều nhóm công việc: hồ sơ tòa nhà/căn hộ, khách thuê, hợp đồng, ghi nhận điện nước, lập và theo dõi hóa đơn, gửi thông báo, tiếp nhận yêu cầu. Khi các phần này tách rời, nhân sự có thể phải chuyển qua nhiều màn hình hoặc tự đối chiếu thông tin.

ResidentHuB được tổ chức quanh các thực thể và quy trình đó. Nội dung giới thiệu nên tập trung vào **tính liên kết và khả năng theo dõi nghiệp vụ**, thay vì hứa hẹn rằng phần mềm tự động loại bỏ mọi thao tác thủ công hoặc mọi sai sót.

### Giá trị truyền thông có thể nhấn mạnh

- **Tập trung nghiệp vụ:** nhiều nhóm việc quản lý chung cư được đặt trong cùng một ứng dụng.
- **Thông tin có ngữ cảnh:** hóa đơn liên quan đến hợp đồng, căn hộ và dịch vụ; chỉ số điện/nước có kỳ ghi nhận và trạng thái duyệt.
- **Quản lý theo phạm vi:** khu vực quản lý có khái niệm vai trò và phạm vi tòa nhà.
- **Kết nối hai phía:** ban quản lý có khu vực quản trị; cư dân có giao diện riêng để xem thông tin và tương tác với các mục được hỗ trợ.
- **Theo dõi trạng thái:** một số luồng có trạng thái rõ ràng như nháp/đã duyệt/đã phát hành, hoặc yêu cầu hỗ trợ và thông báo.

Các điểm trên mô tả định hướng và hành vi của giao diện hiện có. Không chuyển chúng thành tuyên bố định lượng về tiết kiệm thời gian, tăng doanh thu, giảm nhân sự hay độ chính xác nếu chưa có số liệu đo lường được phê duyệt.

## 3. Nhóm người dùng và nhu cầu nội dung

| Nhóm | Công việc/quan tâm | Góc nội dung phù hợp |
| --- | --- | --- |
| Ban quản lý / quản lý vận hành | Theo dõi tình hình tòa nhà, căn hộ, hợp đồng, công nợ, thông báo và yêu cầu | Bức tranh vận hành tổng quan; theo dõi quy trình theo từng khu vực |
| Nhân viên quản lý tòa nhà | Cập nhật hồ sơ, ghi chỉ số, xử lý hợp đồng và trao đổi với cư dân | Nghiệp vụ hằng ngày trong một luồng làm việc có tổ chức |
| Kế toán / nhân sự phụ trách thu phí | Theo dõi dữ liệu dịch vụ, kỳ hóa đơn, trạng thái phát hành và thu tiền | Tính nhất quán dữ liệu đầu vào và khả năng theo dõi vòng đời hóa đơn |
| Cư dân / khách thuê | Xem hóa đơn, hợp đồng, thông báo, lịch hẹn và gửi yêu cầu | Dễ tìm thông tin liên quan đến nơi ở và biết thông tin cần theo dõi |
| Đội kinh doanh / đối tác triển khai | Hiểu phạm vi sản phẩm và cách trình diễn | Demo theo kịch bản; nói rõ phần đang hoạt động, phần cần cấu hình/tích hợp |

Không khẳng định dự án đã hỗ trợ nhiều vai trò/nhóm người dùng hơn các vai trò và quyền hiện có trong ứng dụng nếu chưa kiểm tra cấu hình triển khai cụ thể.

## 4. Bản đồ tính năng

### 4.1. Khu vực Quản lý

#### Dashboard và theo dõi

- Dashboard có các thẻ tổng quan và lối tắt đến khu vực nghiệp vụ.
- Có các chỉ báo liên quan đến trạng thái vận hành, ví dụ hóa đơn quá hạn và hợp đồng sắp hết hạn theo cấu hình.
- Khu vực báo cáo và luồng tiền được thể hiện trong menu quản lý.

**Gợi ý diễn đạt:** “Nắm các đầu việc cần chú ý từ dashboard” hoặc “Đi từ tổng quan đến hồ sơ nghiệp vụ liên quan.”

**Không nên diễn đạt:** “Báo cáo thời gian thực toàn diện” hay “Dự báo tài chính bằng AI”; repository không chứng minh các năng lực này.

#### Tòa nhà, căn hộ và khách hàng

- Quản lý có màn hình tòa nhà và căn hộ; có tìm kiếm/bộ lọc ở một số danh sách.
- Quản lý thông tin khách hàng/cư dân và liên kết với căn hộ/hợp đồng theo dữ liệu hiện có.
- Phạm vi tòa nhà có thể được dùng trong quyền tài khoản.

**Gợi ý diễn đạt:** “Tra cứu hồ sơ theo tòa nhà và căn hộ” và “Liên kết dữ liệu khách thuê với hồ sơ vận hành.”

#### Đặt cọc và hợp đồng

- Luồng đặt cọc hỗ trợ các bước khách hàng → giữ chỗ → hợp đồng.
- Hợp đồng hỗ trợ nhiều khách thuê, người đại diện, thông tin dịch vụ và dữ liệu bàn giao tài sản theo luồng đang có.
- Có thư viện mẫu hợp đồng, trình soạn thảo mẫu, xem trước và luồng in/xuất tài liệu.
- Hợp đồng đã ký có thể lưu bản chụp nội dung/dữ liệu mẫu để những thay đổi ở mẫu về sau không tự thay nội dung snapshot đã lưu.
- Có các thao tác quản lý hợp đồng và theo dõi tình trạng hợp đồng trong giao diện.

**Gợi ý diễn đạt:** “Hỗ trợ quản lý hồ sơ thuê từ đặt cọc đến hợp đồng” và “Tạo/xem trước tài liệu từ mẫu có thể tùy chỉnh.”

**Lưu ý:** PDF phụ thuộc vào khả năng in/render của trình duyệt; xuất Word có giới hạn định dạng. Không hứa hẹn tương thích tuyệt đối với mọi tài liệu Word hoặc mọi trình duyệt.

#### Ghi chỉ số điện/nước

- Khu vực Ghi chỉ số có bảng theo căn hộ và kỳ; hỗ trợ ghi nhận chỉ số điện, nước.
- Có thể xem ảnh gắn với bản ghi và xem chi tiết bản ghi.
- Trạng thái **chốt** (đã có bản ghi) và **duyệt** được quản lý riêng; có bộ lọc trạng thái duyệt.
- Dữ liệu chỉ số đã chốt và đã duyệt được dùng trong quy trình tính hóa đơn phù hợp.

**Gợi ý diễn đạt:** “Theo dõi chỉ số theo căn hộ, kỳ ghi và trạng thái xác nhận.”

**Không nên diễn đạt:** “Đọc chỉ số tự động bằng AI” hoặc “Đồng bộ từ công tơ thông minh”; không thấy các năng lực này được triển khai trong mã nguồn được rà soát.

#### Hóa đơn và theo dõi thu

- Luồng hóa đơn hiện có hỗ trợ lập tự động/thủ công theo dữ liệu hợp đồng, dịch vụ và chỉ số đủ điều kiện.
- Vòng đời hóa đơn gồm nháp, duyệt, phát hành và theo dõi thanh toán/quá hạn theo trạng thái.
- Có chống tạo trùng kỳ tự động theo hợp đồng/kỳ.
- Hóa đơn đã phát hành không được âm thầm ghi đè; thay đổi được xử lý theo luồng điều chỉnh hoặc hủy.
- Khu vực Hóa đơn và luồng tiền xuất hiện trong dashboard.

**Gợi ý diễn đạt:** “Theo dõi hóa đơn theo kỳ và trạng thái” hoặc “Tập hợp dữ liệu hợp đồng, dịch vụ và chỉ số cho nghiệp vụ hóa đơn.”

**Lưu ý quan trọng:** module Hóa đơn React độc lập trong `src/invoices/` chưa thay thế renderer Hóa đơn cũ trên dashboard. Nghiệp vụ thanh toán trực tuyến thực tế chưa được xác nhận. Cài đặt có thể hiện nút thanh toán cho cư dân, nhưng không đồng nghĩa đã tích hợp cổng thanh toán hoặc xử lý giao dịch thật.

#### Thông báo

- Khu vực quản lý thông báo hỗ trợ tạo nội dung, lưu nháp, xem lịch sử và gửi theo phạm vi như toàn bộ cư dân, tòa nhà hoặc căn hộ.
- Có thể đính kèm tối đa bốn ảnh JPG, PNG hoặc WebP; ảnh được nén theo giới hạn của ứng dụng.
- Cư dân có mục Thông báo để xem nội dung; trạng thái đã đọc được theo dõi trong luồng hiện có.
- Có hỗ trợ lên lịch trong giao diện.

**Gợi ý diễn đạt:** “Soạn và phân phối thông báo theo phạm vi cư dân” và “Lưu lịch sử chiến dịch thông báo.”

**Lưu ý quan trọng:** không có backend chạy nền. Lịch gửi được xử lý khi dashboard quản lý đang mở hoặc vào lần mở tiếp theo sau giờ hẹn. Không quảng bá đây là hệ thống gửi thông báo nền 24/7, SMS, email, push notification hoặc ứng dụng di động nếu chưa có tích hợp thực tế.

#### Hỗ trợ cư dân

- Cư dân có khu vực Yêu cầu; phía quản lý có khu vực Hỗ trợ và luồng xem/trả lời hội thoại theo các màn hình đang có.
- Có các bộ lọc và trạng thái để quản lý xem danh sách yêu cầu.

**Gợi ý diễn đạt:** “Tiếp nhận và theo dõi yêu cầu hỗ trợ trong giao diện quản lý.”

**Không nên diễn đạt:** “Cam kết phản hồi trong X phút”, “trung tâm hỗ trợ 24/7” hoặc SLA khác nếu chưa có chính sách vận hành được xác nhận.

#### Tài khoản, quyền và cài đặt

- Khu vực tài khoản có màn hình người dùng và loại tài khoản/quyền.
- Quyền được cấu hình theo module, hành động và một số quyền nghiệp vụ; phạm vi có thể giới hạn theo tòa nhà.
- Có các cài đặt quản lý và mục Nhật ký hoạt động trong giao diện Cài đặt.

**Gợi ý diễn đạt:** “Phân vai trò và phạm vi làm việc theo tài khoản.”

**Lưu ý:** đây là kiểm tra phía ứng dụng/trình duyệt, không phải kiểm soát truy cập phía máy chủ.

### 4.2. Khu vực Cư dân

Menu cư dân hiện có các khu vực:

- **Tổng quan:** thông tin tổng hợp liên quan đến tài khoản/căn hộ.
- **Hóa đơn:** xem hóa đơn được hiển thị cho cư dân theo trạng thái phát hành/cấu hình.
- **Yêu cầu:** gửi hoặc theo dõi các yêu cầu hỗ trợ theo luồng hiện có.
- **Hợp đồng:** xem thông tin/tài liệu hợp đồng liên quan đến cư dân.
- **Thông báo:** xem thông tin do ban quản lý đăng.
- **Cài đặt:** cấu hình trải nghiệm cá nhân hiện có, bao gồm giao diện sáng/tối.
- **Lịch hẹn:** xem các mục lịch liên quan được hiển thị trong portal.

**Gợi ý diễn đạt:** “Cư dân có một nơi để theo dõi hóa đơn, hợp đồng, thông báo và yêu cầu.”

Không gọi ResidentHuB là ứng dụng iOS/Android hoặc khẳng định có push notification trên điện thoại. Repository cho thấy giao diện web.

## 5. Hành trình sản phẩm để làm nội dung

Các hành trình dưới đây là cách kể chuyện gợi ý, không phải cam kết rằng mọi bước đều tự động.

### Hành trình A — Từ hồ sơ thuê đến hợp đồng

1. Nhân sự quản lý tra cứu khách hàng, tòa nhà và căn hộ.
2. Ghi nhận đặt cọc/giữ chỗ theo luồng hiện có.
3. Tạo hoặc cập nhật hợp đồng, thông tin khách thuê, dịch vụ và bàn giao.
4. Chọn mẫu, xem trước nội dung và in/xuất tài liệu theo khả năng đang hỗ trợ.
5. Cư dân có thể xem thông tin hợp đồng liên quan trong portal.

**Ý tưởng câu chuyện:** “Một hồ sơ thuê có ngữ cảnh xuyên suốt — từ căn hộ được chọn đến giấy tờ hợp đồng.”

### Hành trình B — Từ ghi chỉ số đến hóa đơn

1. Nhân sự chọn kỳ và căn hộ cần ghi.
2. Nhập chỉ số điện/nước và lưu bản ghi.
3. Người có quyền thực hiện bước duyệt; chốt và duyệt là hai trạng thái riêng.
4. Engine hóa đơn dùng dữ liệu hợp lệ cùng hợp đồng và dịch vụ để lập hóa đơn.
5. Hóa đơn đi qua các trạng thái và có thể được theo dõi trong dashboard; hóa đơn đã phát hành hiển thị theo luồng cư dân.

**Ý tưởng câu chuyện:** “Chỉ số, hợp đồng và dịch vụ cùng cung cấp ngữ cảnh cho kỳ hóa đơn.”

### Hành trình C — Từ thông báo đến phản hồi cư dân

1. Quản lý soạn thông báo và chọn phạm vi người nhận.
2. Có thể lưu nháp, đính kèm ảnh và xem lại lịch sử chiến dịch.
3. Cư dân đọc thông báo trên portal.
4. Với vấn đề cần trao đổi, cư dân gửi yêu cầu; phía quản lý theo dõi và phản hồi trong luồng hỗ trợ.

**Ý tưởng câu chuyện:** “Thông tin chung cư đến đúng ngữ cảnh hơn; trao đổi không chỉ dừng ở bảng tin.”

## 6. Định vị và thông điệp

### Định vị đề xuất

> **ResidentHuB là nền tảng web hỗ trợ ban quản lý tổ chức nghiệp vụ chung cư và giúp cư dân theo dõi thông tin thiết yếu trong một trải nghiệm kết nối.**

Đây là mô tả định vị biên tập, không phải tuyên bố về mô hình triển khai thương mại hoặc kiến trúc backend.

### Ba trụ cột thông điệp

1. **Vận hành có tổ chức**  
   Tập trung tòa nhà, căn hộ, khách thuê, hợp đồng, chỉ số và hóa đơn.
2. **Quy trình có thể theo dõi**  
   Trạng thái rõ trong các luồng như duyệt chỉ số, vòng đời hóa đơn, thông báo và yêu cầu hỗ trợ.
3. **Trải nghiệm cho cả hai phía**  
   Quản lý có dashboard nghiệp vụ; cư dân có portal riêng để theo dõi thông tin liên quan.

### Từ khóa gợi ý

Quản lý chung cư · vận hành tòa nhà · hồ sơ căn hộ · hợp đồng thuê · ghi chỉ số điện nước · hóa đơn theo kỳ · thông báo cư dân · yêu cầu hỗ trợ · cổng thông tin cư dân · quy trình có trạng thái.

### Giọng điệu

- Rõ ràng, tin cậy, hiện đại và thực tế.
- Dùng ngôn ngữ mô tả công việc cụ thể thay cho khẩu hiệu công nghệ chung.
- Ưu tiên “hỗ trợ”, “theo dõi”, “quản lý”, “kết nối”, “tập trung” hơn “tự động hoàn toàn”, “cam kết”, “tối ưu tuyệt đối”.
- Có thể dùng “ResidentHuB” đúng cách viết thương hiệu hiện tại. Chưa có tài liệu nhận diện thương hiệu chính thức để xác nhận màu/typography/brand voice chuẩn.

## 7. Mẫu nội dung tham khảo

### Mô tả ngắn cho website

> ResidentHuB hỗ trợ ban quản lý theo dõi các nghiệp vụ chung cư từ tòa nhà, căn hộ và hợp đồng đến ghi chỉ số, hóa đơn, thông báo và yêu cầu hỗ trợ. Cư dân có portal riêng để xem thông tin liên quan và kết nối với ban quản lý.

### Giới thiệu sản phẩm

> Công việc quản lý chung cư trải dài từ hồ sơ căn hộ, hợp đồng thuê đến điện nước, hóa đơn và thông tin gửi cư dân. ResidentHuB tập hợp các nhóm nghiệp vụ này trong một ứng dụng web có khu vực riêng cho ban quản lý và cư dân. Nhân sự có thể tra cứu dữ liệu, theo dõi các bước xử lý và quản lý thông tin theo tòa nhà; cư dân có thể xem hóa đơn, hợp đồng, thông báo và yêu cầu trong portal của mình.

### Mẫu bài đăng mạng xã hội

> Một ngày vận hành chung cư có nhiều đầu việc: hồ sơ căn hộ, hợp đồng, chỉ số điện nước, hóa đơn và những thông báo cần đến với cư dân.  
>  
> ResidentHuB kết nối các nghiệp vụ ấy trong một trải nghiệm web dành cho ban quản lý — đồng thời mang đến portal để cư dân theo dõi thông tin liên quan.  
>  
> **ResidentHuB — kết nối vận hành và trải nghiệm cư dân.**

### Mẫu tiêu đề chiến dịch

- “Từ hồ sơ căn hộ đến thông tin cư dân — kết nối trên ResidentHuB”
- “Một trải nghiệm chung cho công việc quản lý và thông tin cư dân”
- “Theo dõi hợp đồng, chỉ số và hóa đơn theo từng bước”
- “Thông tin chung cư rõ ràng hơn, trải nghiệm cư dân thuận tiện hơn”

Các tiêu đề này là phương án sáng tạo; cần rà soát tuyên bố sản phẩm theo cấu hình/demo thực tế trước khi xuất bản.

## 8. Gợi ý kịch bản demo và hình ảnh

### Kịch bản demo 5–7 phút

1. **Mở đầu:** giới thiệu hai khu vực Quản lý và Cư dân.
2. **Tổng quan quản lý:** cho xem dashboard và các lối tắt nghiệp vụ.
3. **Hồ sơ:** mở tòa nhà/căn hộ hoặc hợp đồng để minh họa dữ liệu có liên hệ.
4. **Chỉ số:** trình diễn một kỳ ghi, trạng thái chốt và duyệt.
5. **Hóa đơn:** trình bày nguồn dữ liệu và trạng thái; dùng dữ liệu demo, không nhận thanh toán thật.
6. **Cư dân:** mở portal, xem thông báo/hóa đơn/yêu cầu.
7. **Kết:** nhấn mạnh phạm vi hỗ trợ và mời trao đổi về quy trình triển khai cụ thể.

### Cảnh giao diện nên chụp

- Dashboard quản lý với dữ liệu demo đã được làm sạch.
- Danh sách tòa nhà/căn hộ với bộ lọc.
- Quy trình đặt cọc/hợp đồng và màn hình xem trước hợp đồng.
- Ghi chỉ số có trạng thái duyệt dễ hiểu.
- Trang hóa đơn minh họa nháp và đã phát hành, không dùng thông tin khách hàng thật.
- Trình soạn thông báo với phạm vi người nhận và lịch sử.
- Portal cư dân ở màn hình thông báo, hóa đơn hoặc yêu cầu.
- Giao diện responsive trên màn hình hẹp nếu ảnh được chụp và kiểm tra thực tế.

### Quy tắc an toàn khi chụp/quay

- Chỉ dùng dữ liệu demo/fixture đã rà soát; không chụp tài khoản thật, số điện thoại, địa chỉ, số căn hộ gắn với cá nhân, thông tin ngân hàng hoặc hợp đồng thật.
- Che hoặc thay tên, ảnh, mã định danh và dữ liệu liên hệ có thể nhận diện cá nhân.
- Không dùng ảnh kiểm toán nội bộ hoặc dữ liệu lịch sử trong repository như bằng chứng khách hàng/triển khai thương mại.
- Kiểm tra banner, trạng thái và dữ liệu mẫu trong ảnh để không khiến người xem tưởng số liệu minh họa là kết quả kinh doanh thật.

## 9. Tuyên bố cần tránh hoặc phải xác minh

| Không nên tuyên bố | Vì sao / cách nói an toàn hơn |
| --- | --- |
| “Nền tảng cloud nhiều người dùng đồng bộ thời gian thực” | Dữ liệu hiện dùng localStorage, chưa có backend. Nói “ứng dụng web hỗ trợ các luồng quản lý” cho đến khi kiến trúc triển khai được xác nhận. |
| “Bảo mật cấp ngân hàng”, “phân quyền an toàn tuyệt đối” | Quyền hiện được kiểm tra phía client; chưa có bằng chứng kiểm định bảo mật. Chỉ mô tả “có cấu hình vai trò/phạm vi trong giao diện”. |
| “Tự động gửi thông báo 24/7” | Hẹn giờ phụ thuộc dashboard được mở hoặc mở lại sau giờ hẹn. Không hứa lịch chạy nền liên tục. |
| “Thanh toán online ngay trên ứng dụng” | Có hiển thị/cấu hình nút thanh toán ở một số luồng nhưng không có xác nhận tích hợp cổng và xử lý giao dịch thật. |
| “Có ứng dụng iOS/Android, push notification, SMS/email” | Repository thể hiện giao diện web; các kênh này chưa được xác nhận. |
| “AI đọc công tơ / AI dự đoán công nợ” | Không có căn cứ triển khai trong mã nguồn đã rà soát. |
| “Đảm bảo giảm X% chi phí/thời gian/sai sót” | Chưa có benchmark hoặc nghiên cứu định lượng được cung cấp. |
| “Tuân thủ tiêu chuẩn/chứng nhận bảo mật X” | Chỉ nêu khi có hồ sơ chứng nhận, phạm vi và phê duyệt chính thức. |
| “Tích hợp với mọi phần mềm kế toán/cổng thanh toán” | Chưa có bằng chứng connector/API tương ứng. Xác minh từng tích hợp riêng. |
| “Hóa đơn điện tử hợp lệ theo quy định” | Tính năng quản lý hóa đơn trong ứng dụng không tự chứng minh tích hợp nhà cung cấp hóa đơn điện tử hoặc tuân thủ thuế. |

## 10. FAQ nội bộ cho đội Content

### ResidentHuB dành cho ai?

Giao diện hiện có phục vụ hai nhóm chính: nhân sự/ban quản lý chung cư và cư dân/khách thuê sử dụng portal cư dân.

### Đây là website hay ứng dụng điện thoại?

Repository hiện cho thấy ứng dụng web gồm trang quản lý và trang cư dân. Có thể thiết kế responsive, nhưng không gọi là ứng dụng native iOS/Android nếu chưa có sản phẩm native riêng.

### ResidentHuB có tự động lập hóa đơn không?

Có engine lập hóa đơn theo cấu hình/dữ liệu nghiệp vụ trong luồng quản lý hiện có. Cách chạy hiện tại phụ thuộc dashboard và localStorage; không mô tả là dịch vụ backend chạy tự động liên tục.

### Cư dân có thanh toán trực tuyến không?

Chưa thể kết luận có xử lý thanh toán trực tuyến thực. Cần xác nhận tích hợp payment gateway và môi trường triển khai trước khi đưa thông tin này vào nội dung.

### Cư dân nhận thông báo bằng cách nào?

Portal có khu vực Thông báo. Chưa có căn cứ để quảng bá SMS, email, push notification hoặc ứng dụng điện thoại.

### Dữ liệu có đồng bộ giữa nhiều người dùng không?

Repository hiện lưu nhiều dữ liệu ở localStorage và chưa có backend. Vì vậy không hứa hẹn đồng bộ đa thiết bị/người dùng như dịch vụ production.

### Có thể tùy chỉnh biểu mẫu hợp đồng không?

Ứng dụng có thư viện mẫu và editor để chỉnh sửa/nhân bản mẫu trong phạm vi hiện có. Cần kiểm tra nội dung, font, định dạng và yêu cầu pháp lý của từng hợp đồng trước khi phát hành.

## 11. Checklist duyệt nội dung trước khi xuất bản

- [ ] Nội dung phân biệt tính năng đang có với ý tưởng/tầm nhìn tương lai.
- [ ] Không đưa số liệu hiệu quả, khách hàng, giá, SLA hoặc chứng nhận chưa được xác nhận.
- [ ] Không ám chỉ có backend, đồng bộ thời gian thực, ứng dụng native, thanh toán thật hoặc gửi tin nền nếu chưa được xác minh.
- [ ] Ảnh/video chỉ dùng dữ liệu demo đã làm sạch và không lộ thông tin cá nhân.
- [ ] Tên sản phẩm được viết thống nhất: **ResidentHuB**.
- [ ] Có người phụ trách sản phẩm/kỹ thuật rà soát nội dung có tuyên bố chức năng.
- [ ] Các câu chữ về bảo mật, dữ liệu cá nhân, thanh toán, tuân thủ và điều khoản pháp lý được bộ phận phụ trách duyệt riêng.

## 12. Nguồn tham chiếu trong repository

- [README.md](../README.md): mô tả dự án, phát triển, quyền và hóa đơn.
- [PLAYBOOK.md](../PLAYBOOK.md): hướng dẫn vận hành/phát triển nội bộ.
- [WORKFLOW-UPDATE.md](../WORKFLOW-UPDATE.md): tài khoản, hợp đồng, biểu mẫu và giới hạn xuất tài liệu.
- [src/invoices/README.md](../src/invoices/README.md): phạm vi module Hóa đơn và giới hạn tích hợp.
- [src/settings/README.md](../src/settings/README.md): phạm vi Cài đặt và giới hạn dữ liệu.
- `dashboard.html`: menu, dashboard và khu vực Quản lý.
- `resident-web.html`: menu và khu vực Cư dân.
