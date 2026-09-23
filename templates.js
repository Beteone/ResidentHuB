/*
 * ResidentHub - system template library (RHT).
 * Same localStorage pattern as auth.js / data.js: no backend, so this module
 * plays the role of a "templates" table + seeder + tiny render engine.
 *
 * Two kinds of legal/business documents, per Vietnam rental-management practice:
 *  - type 'CONTRACT': the signed lease paperwork (Hợp đồng thuê, Phụ lục gia hạn).
 *  - type 'INVOICE' : the internal Phiếu thu / Bảng kê / Biên bản that records
 *    money movement (deposit, monthly collection, room transfer, liquidation).
 *    These are NOT the VAT e-invoice required by Decree 123/2020/ND-CP + Circular
 *    78/2021/TT-BTC for deductible/official revenue — that is a separate,
 *    provider-issued document (VNPT/Viettel/...). Every INVOICE-type template
 *    here prints a footer note saying so, so managers don't mistake one for
 *    the other. A building's "Hóa đơn điện tử" config (data.js) only toggles
 *    whether that footer mentions an e-invoice will be issued alongside it.
 *
 * Templates are seeded once per dataset (live / demo, see data.js RHD_MODE)
 * and are NOT subject to RHD.DEMO_LIMITS — they are shared system config, not
 * tenant records, so a demo visitor can freely preview/clone/customize them.
 */
(function (global) {
    var KEY_PREFIX = 'residenthub_';

    function mode() { return global.RHD_MODE || 'live'; }
    function key() { return KEY_PREFIX + mode() + '_templates'; }

    function readAll() {
        try {
            var raw = localStorage.getItem(key());
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function writeAll(list) { localStorage.setItem(key(), JSON.stringify(list)); }

    function genId(p) { return (p || 'tpl') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

    function extractVariables(html) {
        var found = {}, re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, m;
        while ((m = re.exec(html))) found[m[1]] = true;
        return Object.keys(found);
    }

    // ---- print chrome shared by every template --------------------------

    var DOC_STYLE = '<style>' +
        '.doc{font:14px/1.6 "Be Vietnam Pro",Arial,sans-serif;color:#10213c;max-width:100%}' +
        '.doc h1{font:800 18px/1.3 "Plus Jakarta Sans",sans-serif;text-align:center;margin:0 0 2px;letter-spacing:.01em;text-transform:uppercase}' +
        '.doc .doc-sub{text-align:center;color:#61708a;font-size:12px;margin-bottom:14px}' +
        '.doc .doc-national{text-align:center;font-weight:700;margin-bottom:2px}' +
        '.doc .doc-motto{text-align:center;font-size:12px;margin-bottom:16px;border-bottom:1px solid #10213c;display:inline-block;padding:0 0 2px}' +
        '.doc .doc-national-wrap{text-align:center;margin-bottom:10px}' +
        '.doc .doc-meta{display:flex;justify-content:space-between;font-size:12px;color:#61708a;margin-bottom:10px}' +
        '.doc table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}' +
        '.doc th,.doc td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}' +
        '.doc th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.03em}' +
        '.doc td.num,.doc th.num{text-align:right}' +
        '.doc .doc-row{display:flex;gap:24px;margin:4px 0}' +
        '.doc .doc-row div{flex:1}' +
        '.doc .doc-label{color:#61708a;font-size:12px}' +
        '.doc .doc-total{display:flex;justify-content:flex-end;margin-top:8px;font-size:15px}' +
        '.doc .doc-total strong{color:#0d65d5;margin-left:8px}' +
        '.doc .doc-qr{display:flex;align-items:center;gap:14px;margin-top:14px;padding:10px;border:1px dashed #94a3b8;border-radius:8px}' +
        '.doc .doc-qr img{width:88px;height:88px;border-radius:6px;background:#eef2f7}' +
        '.doc .doc-signs{display:flex;justify-content:space-between;margin-top:36px;text-align:center;font-size:13px}' +
        '.doc .doc-signs div{flex:1}' +
        '.doc .doc-signs small{display:block;color:#61708a;font-style:italic;margin-bottom:52px}' +
        '.doc .doc-footnote{margin-top:18px;padding-top:8px;border-top:1px dashed #cbd5e1;color:#94a3b8;font-size:11px;line-height:1.5}' +
        '.doc .doc-clause{margin:10px 0}.doc .doc-clause b{display:block;margin-bottom:3px}' +
        '</style>';

    var NATIONAL_HEADER = '<div class="doc-national-wrap"><div class="doc-national">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div><div class="doc-motto">Độc lập - Tự do - Hạnh phúc</div></div>';

    var RECEIPT_FOOTNOTE = '<div class="doc-footnote">Đây là chứng từ nội bộ của đơn vị quản lý (Phiếu thu / Bảng kê / Biên bản), không phải hóa đơn giá trị gia tăng điện tử theo Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC. {{einvoice_note}}</div>';

    // ---- 3 CONTRACT templates ------------------------------------------

    var contractStandard = '<div class="doc">' + NATIONAL_HEADER +
        '<h1>Hợp đồng thuê phòng / căn hộ</h1><div class="doc-sub">Số: {{contract_code}} · Ký ngày {{sign_date}}</div>' +
        '<div class="doc-clause"><b>Bên cho thuê (Bên A)</b>{{company_name}} — Đại diện: {{manager_name}} · Tòa nhà: {{building_name}}, {{building_address}}</div>' +
        '<div class="doc-clause"><b>Bên thuê (Bên B)</b>{{tenant_name}} · SĐT: {{tenant_phone}} · CCCD: {{tenant_id_number}}</div>' +
        '<div class="doc-row"><div><div class="doc-label">Căn hộ thuê</div><strong>{{room_number}}</strong></div><div><div class="doc-label">Diện tích</div><strong>{{room_area}} m²</strong></div><div><div class="doc-label">Chu kỳ thanh toán</div><strong>{{payment_cycle}}</strong></div></div>' +
        '<div class="doc-row"><div><div class="doc-label">Thời hạn thuê</div><strong>{{start_date}} — {{end_date}}</strong></div><div><div class="doc-label">Giá thuê</div><strong>{{rent_price}}/kỳ</strong></div><div><div class="doc-label">Tiền đặt cọc</div><strong>{{deposit_price}}</strong></div></div>' +
        '<div class="doc-clause"><b>Điều 1. Nghĩa vụ thanh toán</b>Bên B thanh toán tiền thuê và các khoản dịch vụ phát sinh (điện, nước, vệ sinh, internet, phí quản lý, phí gửi xe...) theo bảng kê hàng kỳ do Bên A lập, chậm nhất 05 ngày kể từ ngày lập bảng kê.</div>' +
        '<div class="doc-clause"><b>Điều 2. Đặt cọc</b>Tiền đặt cọc dùng để bảo đảm thực hiện hợp đồng, được hoàn trả khi thanh lý theo Điều 328 Bộ luật Dân sự 2015, sau khi đối trừ các khoản còn nợ (nếu có).</div>' +
        '<div class="doc-clause"><b>Điều 3. Quyền và nghĩa vụ khác</b>Hai bên cam kết thực hiện đúng các điều khoản đã thoả thuận; mọi thay đổi phải lập phụ lục kèm theo hợp đồng này.</div>' +
        '<div class="doc-signs"><div><strong>ĐẠI DIỆN BÊN A</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>BÊN B - NGƯỜI THUÊ</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
        '</div>';

    var contractShortStay = '<div class="doc">' + NATIONAL_HEADER +
        '<h1>Hợp đồng thuê lưu trú ngắn ngày / Homestay</h1><div class="doc-sub">Số: {{contract_code}} · Ký ngày {{sign_date}}</div>' +
        '<div class="doc-clause"><b>Cơ sở lưu trú (Bên A)</b>{{company_name}} · {{building_name}}, {{building_address}}</div>' +
        '<div class="doc-clause"><b>Khách lưu trú (Bên B)</b>{{tenant_name}} · SĐT: {{tenant_phone}} · CCCD/Hộ chiếu: {{tenant_id_number}}</div>' +
        '<div class="doc-row"><div><div class="doc-label">Phòng</div><strong>{{room_number}}</strong></div><div><div class="doc-label">Nhận phòng</div><strong>{{start_date}}</strong></div><div><div class="doc-label">Trả phòng</div><strong>{{end_date}}</strong></div></div>' +
        '<div class="doc-row"><div><div class="doc-label">Số đêm</div><strong>{{nights}}</strong></div><div><div class="doc-label">Giá/đêm</div><strong>{{rate_per_night}}</strong></div><div><div class="doc-label">Đặt cọc giữ phòng</div><strong>{{deposit_price}}</strong></div></div>' +
        '<div class="doc-clause"><b>Điều 1. Thanh toán</b>Bên B thanh toán toàn bộ chi phí lưu trú khi nhận phòng hoặc theo thoả thuận trên phiếu thanh toán lưu trú kèm theo.</div>' +
        '<div class="doc-clause"><b>Điều 2. Quy định lưu trú</b>Bên B tuân thủ nội quy cơ sở lưu trú, chịu trách nhiệm bồi thường nếu gây hư hỏng tài sản; Bên A có trách nhiệm khai báo tạm trú theo quy định.</div>' +
        '<div class="doc-signs"><div><strong>ĐẠI DIỆN BÊN A</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>BÊN B - KHÁCH LƯU TRÚ</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
        '</div>';

    var contractExtension = '<div class="doc">' + NATIONAL_HEADER +
        '<h1>Phụ lục gia hạn hợp đồng thuê</h1><div class="doc-sub">Kèm theo Hợp đồng số {{contract_code}} · Lập ngày {{sign_date}}</div>' +
        '<div class="doc-clause"><b>Bên A</b>{{company_name}} — {{manager_name}} · <b>Bên B</b> {{tenant_name}} — {{tenant_phone}}</div>' +
        '<div class="doc-row"><div><div class="doc-label">Căn hộ</div><strong>{{room_number}}, {{building_name}}</strong></div></div>' +
        '<div class="doc-row"><div><div class="doc-label">Thời hạn cũ</div><strong>đến {{old_end_date}}</strong></div><div><div class="doc-label">Thời hạn mới</div><strong>{{start_date}} — {{end_date}}</strong></div><div><div class="doc-label">Giá thuê áp dụng</div><strong>{{rent_price}}/kỳ</strong></div></div>' +
        '<div class="doc-clause">Hai bên thống nhất gia hạn thời gian thuê căn hộ nêu trên; các điều khoản khác của hợp đồng gốc giữ nguyên hiệu lực.</div>' +
        '<div class="doc-signs"><div><strong>ĐẠI DIỆN BÊN A</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>BÊN B</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
        '</div>';

    // ---- 8 INVOICE / RECEIPT templates -----------------------------------

    function receiptDoc(titleHtml, subLabel, bodyHtml) {
        return '<div class="doc">' + NATIONAL_HEADER +
            '<h1>' + titleHtml + '</h1><div class="doc-sub">Số: {{invoice_code}} · ' + subLabel + '</div>' +
            '<div class="doc-meta"><span>Đơn vị: {{company_name}} — {{building_name}}</span><span>Ngày lập: {{issue_date}}</span></div>' +
            '<div class="doc-clause"><b>Người nộp / Khách hàng</b>{{tenant_name}} · SĐT: {{tenant_phone}} · Căn hộ: {{room_number}}</div>' +
            bodyHtml +
            '<div class="doc-qr"><img src="{{bank_qr_code}}" alt="QR thanh toán"><div><div class="doc-label">Chuyển khoản</div><strong>{{bank_name}} · {{bank_account_number}}</strong><div class="doc-label">Chủ tài khoản: {{bank_account_holder}}</div></div></div>' +
            '<div class="doc-signs"><div><strong>NGƯỜI LẬP</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>NGƯỜI NỘP TIỀN</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
            RECEIPT_FOOTNOTE + '</div>';
    }

    var invDeposit = receiptDoc('Phiếu thu tiền đặt cọc giữ phòng', 'Loại: Đặt cọc',
        '<table><tr><th>Nội dung</th><th class="num">Số tiền (đ)</th></tr>' +
        '<tr><td>Đặt cọc giữ phòng {{room_number}}, {{building_name}}</td><td class="num">{{deposit_amount}}</td></tr></table>' +
        '<div class="doc-total">Tổng thu: <strong>{{total_amount}}</strong></div>');

    var invMonthly = receiptDoc('Bảng kê thanh toán tiền phòng &amp; dịch vụ hàng tháng', 'Kỳ: {{payment_period}} · Hạn TT: {{due_date}}',
        '<table><tr><th>Khoản mục</th><th class="num">Số lượng</th><th class="num">Đơn giá</th><th class="num">Thành tiền (đ)</th></tr>' +
        '{{service_rows_html}}' +
        '<tr><td colspan="2">Điện: {{electric_old}} → {{electric_new}} ({{electric_consumption}} kWh)</td><td class="num" colspan="2">{{electric_amount}}</td></tr>' +
        '<tr><td colspan="2">Nước: {{water_old}} → {{water_new}} ({{water_consumption}} m³)</td><td class="num" colspan="2">{{water_amount}}</td></tr>' +
        '</table><div class="doc-total">Tổng cộng: <strong>{{total_amount}}</strong></div>');

    var invShortStay = receiptDoc('Phiếu thanh toán lưu trú ngắn ngày', 'Loại: Lưu trú ngắn ngày',
        '<table><tr><th>Nội dung</th><th class="num">Số đêm</th><th class="num">Đơn giá/đêm</th><th class="num">Thành tiền (đ)</th></tr>' +
        '<tr><td>Tiền phòng {{room_number}} ({{start_date}} — {{end_date}})</td><td class="num">{{nights}}</td><td class="num">{{rate_per_night}}</td><td class="num">{{room_charge}}</td></tr>' +
        '<tr><td colspan="3">Dịch vụ khác</td><td class="num">{{other_fees}}</td></tr></table>' +
        '<div class="doc-total">Tổng thanh toán: <strong>{{total_amount}}</strong></div>');

    var invNewContract = receiptDoc('Phiếu thu kỳ đầu (Cọc + tiền phòng tháng đầu)', 'Loại: Kỳ đầu hợp đồng {{contract_code}}',
        '<table><tr><th>Nội dung</th><th class="num">Số tiền (đ)</th></tr>' +
        '<tr><td>Tiền đặt cọc giữ chỗ</td><td class="num">{{deposit_amount}}</td></tr>' +
        '<tr><td>Tiền phòng tháng đầu ({{payment_period}})</td><td class="num">{{first_month_rent}}</td></tr></table>' +
        '<div class="doc-total">Tổng thu: <strong>{{total_amount}}</strong></div>');

    var invExtension = receiptDoc('Phiếu thu gia hạn hợp đồng', 'Loại: Gia hạn hợp đồng {{contract_code}}',
        '<table><tr><th>Nội dung</th><th class="num">Số tiền (đ)</th></tr>' +
        '<tr><td>Tiền thuê kỳ gia hạn ({{start_date}} — {{end_date}})</td><td class="num">{{rent_price}}</td></tr></table>' +
        '<div class="doc-total">Tổng thu: <strong>{{total_amount}}</strong></div>');

    var invRoomTransfer = '<div class="doc">' + NATIONAL_HEADER +
        '<h1>Biên bản bàn giao &amp; đối soát đổi/nhượng phòng</h1><div class="doc-sub">Số: {{invoice_code}} · Ngày lập: {{issue_date}}</div>' +
        '<div class="doc-clause"><b>Khách hàng</b>{{tenant_name}} · SĐT: {{tenant_phone}}</div>' +
        '<div class="doc-row"><div><div class="doc-label">Phòng cũ</div><strong>{{old_room_number}}</strong></div><div><div class="doc-label">Phòng mới</div><strong>{{room_number}}</strong></div><div><div class="doc-label">Ngày chuyển</div><strong>{{issue_date}}</strong></div></div>' +
        '<table><tr><th>Chỉ số bàn giao</th><th class="num">Điện</th><th class="num">Nước</th></tr>' +
        '<tr><td>Phòng cũ (chốt)</td><td class="num">{{electric_old}}</td><td class="num">{{water_old}}</td></tr>' +
        '<tr><td>Phòng mới (nhận)</td><td class="num">{{electric_new}}</td><td class="num">{{water_new}}</td></tr></table>' +
        '<div class="doc-total">Chênh lệch đối soát: <strong>{{total_amount}}</strong></div>' +
        '<div class="doc-signs"><div><strong>ĐẠI DIỆN QUẢN LÝ</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>KHÁCH HÀNG</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
        RECEIPT_FOOTNOTE + '</div>';

    var invLiquidationForfeited = '<div class="doc">' + NATIONAL_HEADER +
        '<h1>Biên bản thanh lý hợp đồng &amp; xử lý mất cọc</h1><div class="doc-sub">Số: {{invoice_code}} · Hợp đồng {{contract_code}} · Ngày lập: {{issue_date}}</div>' +
        '<div class="doc-clause"><b>Bên A</b>{{company_name}} — {{manager_name}} · <b>Bên B</b> {{tenant_name}} — {{tenant_phone}}</div>' +
        '<div class="doc-clause"><b>Lý do thanh lý</b>Bên B vi phạm điều khoản hợp đồng thuê căn hộ {{room_number}} (ghi rõ lý do cụ thể tại mục ghi chú khi phát hành).</div>' +
        '<table><tr><th>Nội dung</th><th class="num">Số tiền (đ)</th></tr>' +
        '<tr><td>Tiền đặt cọc đã nộp</td><td class="num">{{deposit_amount}}</td></tr>' +
        '<tr><td>Mức phạt / khấu trừ do vi phạm</td><td class="num">{{penalty_amount}}</td></tr>' +
        '<tr><td>Còn nợ dịch vụ, tiền phòng (nếu có)</td><td class="num">{{outstanding_amount}}</td></tr></table>' +
        '<div class="doc-total">Số tiền hoàn lại Bên B: <strong>{{total_amount}}</strong></div>' +
        '<div class="doc-clause">Căn cứ Điều 328 Bộ luật Dân sự 2015 về đặt cọc, hai bên xác nhận Bên B không được hoàn lại phần cọc tương ứng mức vi phạm nêu trên; hợp đồng thuê chính thức chấm dứt hiệu lực kể từ ngày ký biên bản này.</div>' +
        '<div class="doc-signs"><div><strong>ĐẠI DIỆN BÊN A</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>BÊN B</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
        RECEIPT_FOOTNOTE + '</div>';

    var invLiquidationStandard = '<div class="doc">' + NATIONAL_HEADER +
        '<h1>Biên bản quyết toán trả phòng &amp; thanh lý hợp đồng</h1><div class="doc-sub">Số: {{invoice_code}} · Hợp đồng {{contract_code}} · Ngày lập: {{issue_date}}</div>' +
        '<div class="doc-clause"><b>Bên A</b>{{company_name}} — {{manager_name}} · <b>Bên B</b> {{tenant_name}} — {{tenant_phone}}</div>' +
        '<div class="doc-row"><div><div class="doc-label">Căn hộ</div><strong>{{room_number}}, {{building_name}}</strong></div><div><div class="doc-label">Ngày trả phòng</div><strong>{{issue_date}}</strong></div></div>' +
        '<table><tr><th>Nội dung</th><th class="num">Số tiền (đ)</th></tr>' +
        '<tr><td>Tiền đặt cọc đã nộp</td><td class="num">{{deposit_amount}}</td></tr>' +
        '<tr><td>Trừ: chi phí dịch vụ, hư hỏng còn nợ (nếu có)</td><td class="num">-{{outstanding_amount}}</td></tr></table>' +
        '<div class="doc-total">Số tiền hoàn lại Bên B: <strong>{{total_amount}}</strong></div>' +
        '<div class="doc-clause">Hai bên xác nhận đã bàn giao lại căn hộ trong tình trạng như thoả thuận, không còn khiếu nại hay khoản nợ nào khác ngoài số liệu nêu trên. Hợp đồng thuê chính thức thanh lý kể từ ngày ký.</div>' +
        '<div class="doc-signs"><div><strong>ĐẠI DIỆN BÊN A</strong><small>(Ký, ghi rõ họ tên)</small>{{manager_name}}</div><div><strong>BÊN B</strong><small>(Ký, ghi rõ họ tên)</small>{{tenant_name}}</div></div>' +
        RECEIPT_FOOTNOTE + '</div>';

    var SEED_TEMPLATES = [
        { code: 'contract_standard_longterm', type: 'CONTRACT', name: 'Hợp đồng thuê phòng / căn hộ tiêu chuẩn (Dài hạn)', category: 'Hợp đồng', html: contractStandard, is_system_default: true },
        { code: 'contract_short_stay', type: 'CONTRACT', name: 'Hợp đồng thuê lưu trú ngắn ngày / Homestay', category: 'Hợp đồng', html: contractShortStay, is_system_default: false },
        { code: 'contract_extension_appendix', type: 'CONTRACT', name: 'Phụ lục gia hạn hợp đồng thuê', category: 'Hợp đồng', html: contractExtension, is_system_default: false },

        { code: 'invoice_deposit', type: 'INVOICE', name: 'Phiếu thu tiền đặt cọc giữ phòng', category: 'Đặt cọc', html: invDeposit, is_system_default: false },
        { code: 'invoice_monthly', type: 'INVOICE', name: 'Bảng kê thanh toán tiền phòng & dịch vụ hàng tháng', category: 'Định kỳ hàng tháng', html: invMonthly, is_system_default: true },
        { code: 'invoice_short_stay', type: 'INVOICE', name: 'Phiếu thanh toán lưu trú ngắn ngày', category: 'Định kỳ hàng tháng', html: invShortStay, is_system_default: false },
        { code: 'invoice_new_contract', type: 'INVOICE', name: 'Phiếu thu kỳ đầu (Cọc + tiền phòng tháng đầu)', category: 'Đặt cọc', html: invNewContract, is_system_default: false },
        { code: 'invoice_contract_extension', type: 'INVOICE', name: 'Phiếu thu gia hạn hợp đồng', category: 'Định kỳ hàng tháng', html: invExtension, is_system_default: false },
        { code: 'invoice_room_transfer', type: 'INVOICE', name: 'Biên bản bàn giao & đối soát đổi/nhượng phòng', category: 'Thanh lý / Chuyển phòng', html: invRoomTransfer, is_system_default: false },
        { code: 'invoice_liquidation_deposit_forfeited', type: 'INVOICE', name: 'Biên bản thanh lý hợp đồng & xử lý mất cọc (Vi phạm hợp đồng)', category: 'Thanh lý / Chuyển phòng', html: invLiquidationForfeited, is_system_default: false },
        { code: 'invoice_liquidation_standard', type: 'INVOICE', name: 'Biên bản quyết toán trả phòng & thanh lý hợp đồng', category: 'Thanh lý / Chuyển phòng', html: invLiquidationStandard, is_system_default: false }
    ];

    function seed() {
        if (readAll().length > 0) return;
        var now = Date.now();
        var list = SEED_TEMPLATES.map(function (t, i) {
            var fullHtml = DOC_STYLE + t.html;
            return {
                id: genId(t.code), code: t.code, type: t.type, name: t.name, category: t.category,
                html_template: fullHtml, metadata: { variables: extractVariables(fullHtml) },
                is_system_default: !!t.is_system_default, is_system: true, headerNote: '', footerNote: '',
                createdAt: now + i
            };
        });
        writeAll(list);
    }

    function list(type) {
        var all = readAll();
        return type ? all.filter(function (t) { return t.type === type; }) : all;
    }

    function get(id) {
        var all = readAll();
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
        return null;
    }

    function getDefault(type) {
        var items = list(type);
        return items.filter(function (t) { return t.is_system_default; })[0] || items[0] || null;
    }

    function clone(id) {
        var src = get(id);
        if (!src) return { ok: false, error: 'Không tìm thấy mẫu.' };
        var all = readAll();
        var copy = Object.assign({}, src, {
            id: genId(src.code), name: src.name + ' (bản sao)', is_system_default: false,
            is_system: false, createdAt: Date.now()
        });
        all.push(copy);
        writeAll(all);
        return { ok: true, item: copy };
    }

    function update(id, patch) {
        var all = readAll();
        var idx = -1;
        for (var i = 0; i < all.length; i++) if (all[i].id === id) { idx = i; break; }
        if (idx === -1) return { ok: false, error: 'Không tìm thấy mẫu.' };
        var next = Object.assign({}, all[idx], patch, { id: all[idx].id });
        if (patch.html_template) next.metadata = { variables: extractVariables(patch.html_template) };
        all[idx] = next;
        writeAll(all);
        return { ok: true, item: next };
    }

    function remove(id) {
        var all = readAll();
        var target = all.filter(function (t) { return t.id === id; })[0];
        if (target && target.is_system) return { ok: false, error: 'Không thể xoá mẫu hệ thống — chỉ có thể nhân bản rồi tuỳ chỉnh.' };
        var next = all.filter(function (t) { return t.id !== id; });
        if (next.length === all.length) return { ok: false, error: 'Không tìm thấy mẫu.' };
        writeAll(next);
        return { ok: true };
    }

    function setDefault(id) {
        var tpl = get(id);
        if (!tpl) return { ok: false, error: 'Không tìm thấy mẫu.' };
        var all = readAll();
        all.forEach(function (t) { t.is_system_default = (t.type === tpl.type) ? (t.id === id) : t.is_system_default; });
        writeAll(all);
        return { ok: true };
    }

    // Simple {{token}} substitution — no loops/conditionals by design; callers
    // pre-render any repeating rows (e.g. service_rows_html) before calling this.
    function render(html, data) {
        return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, function (m, key) {
            var v = data ? data[key] : undefined;
            return v == null || v === '' ? '' : String(v);
        });
    }

    global.RHT = {
        seed: seed,
        list: list,
        get: get,
        getDefault: getDefault,
        clone: clone,
        update: update,
        remove: remove,
        setDefault: setDefault,
        render: render,
        DOC_STYLE: DOC_STYLE
    };
})(window);
