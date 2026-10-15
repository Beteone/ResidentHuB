(function () {
    'use strict';

    const clock = window.AppClock;
    const section = document.getElementById('invoicesSection');
    const contractSection = document.getElementById('contractsSection');
    if (!clock || !section || !contractSection || !window.RHD) return;

    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
    const amount = value => Number(value) || 0;
    const moneyLabel = value => new Intl.NumberFormat('vi-VN').format(amount(value)) + ' đ';
    const normalize = value => String(value || '').toLocaleLowerCase('vi-VN').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    const fmtDate = value => clock.formatDate(value);
    const todayKey = () => clock.dateKey(new Date());
    const userKey = () => (window.RH_SESSION && window.RH_SESSION.id) || 'guest';
    const residentCustomerId = () => (window.RH_CTX && window.RH_CTX.customer && window.RH_CTX.customer.id)
        || (window.RH_CTX && window.RH_CTX.contract && window.RH_CTX.contract.customerId) || '';
    const allApartments = () => window.RHD.list('apartments');
    const allBuildings = () => window.RHD.list('buildings');
    const portfolioContracts = () => {
        const customerId = residentCustomerId();
        const apartmentId = window.RH_CTX && window.RH_CTX.apartment && window.RH_CTX.apartment.id;
        return window.RHD.list('contracts').filter(contract => customerId
            ? contract.customerId === customerId
            : apartmentId && contract.apartmentId === apartmentId);
    };
    const portfolioInvoices = () => {
        const contracts = portfolioContracts();
        const contractIds = new Set(contracts.map(contract => contract.id));
        const apartmentIds = new Set(contracts.map(contract => contract.apartmentId));
        const customerId = residentCustomerId();
        const items = window.RHD.list('invoices').filter(invoice => {
            if (invoice.contractId) return contractIds.has(invoice.contractId);
            return (customerId && invoice.customerId === customerId)
                || (invoice.apartmentId && apartmentIds.has(invoice.apartmentId));
        });
        const knownIds = new Set(items.map(invoice => invoice.id));
        ((window.RH_CTX && window.RH_CTX.invoices) || []).forEach(invoice => {
            if (!knownIds.has(invoice.id) && (!invoice.customerId || invoice.customerId === customerId)) items.push(invoice);
        });
        return items;
    };
    const apartmentFor = id => allApartments().find(apartment => apartment.id === id) || null;
    const buildingFor = id => allBuildings().find(building => building.id === id) || null;
    const contractForInvoice = invoice => window.RHD.get('contracts', invoice.contractId);
    const statusFor = (invoice, now) => clock.invoiceStatus(invoice, now);
    const displayStatus = status => ({
        unpaid: ['Chưa thanh toán', 'pending'], sent: ['Chưa thanh toán', 'pending'],
        payment_pending: ['Chờ xác nhận', 'waiting'], paid: ['Đã thanh toán', 'paid'],
        overdue: ['Quá hạn', 'overdue'], partial: ['Thanh toán một phần', 'pending']
    }[status] || ['Chưa thanh toán', 'pending']);
    const invoiceDue = invoice => invoice.status === 'paid' ? 0 : Math.max(0, amount(invoice.total) - amount(invoice.paidAmount || invoice.amountPaid));
    const isPayable = invoice => ['unpaid', 'sent', 'overdue', 'partial'].includes(statusFor(invoice));

    const stylesheet = document.createElement('style');
    stylesheet.textContent = `
        .resident-live-clock{display:grid;gap:.08rem;min-width:180px;padding:.45rem .7rem;border-left:1px solid #e4eaf2;color:#536275;font-size:.68rem;line-height:1.35}
        .resident-live-clock strong{color:#10213c;font-size:.9rem;font-variant-numeric:tabular-nums}
        .resident-feature-hero .live-period-line{display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;margin-top:.7rem;color:#fff;font-size:.78rem;font-weight:600}
        .live-period-line span+span{padding-left:.8rem;border-left:1px solid rgba(255,255,255,.35)}
        .invoice-workspace{display:grid;gap:1rem;min-width:0}
        .invoice-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
        .invoice-summary-card{min-width:0;padding:1.05rem 1.2rem;border:1px solid var(--line);border-radius:14px;background:var(--surface,#fff)}
        .invoice-summary-card small{display:block;color:#64748b;font-size:.75rem;font-weight:800}
        .invoice-summary-card strong{display:block;margin:.5rem 0;color:var(--ink,#10213c);font-size:1.45rem;font-variant-numeric:tabular-nums;transition:color .2s ease}
        .invoice-summary-card span{color:#718096;font-size:.76rem;line-height:1.45}
        .invoice-summary-card.is-overdue{border-color:#fca5a5;background:#fff5f5}
        .invoice-summary-card.is-overdue strong,.invoice-summary-card.is-overdue small{color:#b91c1c}
        .invoice-unassigned,.invoice-overdue-alert,.invoice-change-alert{display:flex;align-items:center;gap:.75rem;padding:.9rem 1rem;border:1px solid #fed7aa;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:.84rem;line-height:1.5}
        .invoice-unassigned[hidden],.invoice-overdue-alert[hidden],.invoice-change-alert[hidden]{display:none}
        .invoice-unassigned button,.invoice-change-alert button{margin-left:auto;flex:none;border:1px solid currentColor;border-radius:8px;padding:.45rem .7rem;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
        .invoice-overdue-alert{border-color:#fecaca;background:#fff1f2;color:#991b1b;font-weight:700}
        .invoice-change-alert{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}
        .invoice-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.8rem;align-items:center;margin-bottom:.9rem}
        .invoice-filter-tabs{display:flex;gap:.4rem;overflow-x:auto;padding-bottom:.15rem}
        .invoice-filter-tab{flex:none;border:1px solid var(--line);border-radius:9px;padding:.55rem .7rem;background:var(--surface,#fff);color:#536275;font:600 .75rem 'Be Vietnam Pro',sans-serif;cursor:pointer}
        .invoice-filter-tab[aria-pressed="true"]{border-color:#93c5fd;background:#eff6ff;color:#0d65d5}
        .invoice-filter-tab span{margin-left:.25rem;color:#8492a6;font-size:.68rem}
        .invoice-query-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
        .invoice-query-row input,.invoice-query-row select{min-height:38px;max-width:180px;border:1px solid var(--line);border-radius:8px;padding:.45rem .6rem;background:var(--surface,#fff);color:var(--ink,#10213c);font:500 .75rem 'Be Vietnam Pro',sans-serif}
        .invoice-search{position:relative;display:flex;align-items:center;gap:.5rem;border:1px solid var(--line);border-radius:8px;padding:0 .6rem;color:#8a99ac;background:var(--surface,#fff)}
        .invoice-search input{width:190px;border:0;padding-left:0;outline:0}
        .invoice-alert-strip{margin-bottom:.8rem}
        .invoice-table-wrap{overflow:auto;max-height:min(62vh,680px);border:1px solid var(--line);border-radius:12px}
        .invoice-table{width:100%;border-collapse:collapse;font-size:.76rem}
        .invoice-table th{position:sticky;top:0;z-index:1;padding:.75rem .65rem;background:#f8fafc;color:#64748b;text-align:left;white-space:nowrap}
        .invoice-table td{padding:.72rem .65rem;border-top:1px solid #edf1f6;color:#536275;vertical-align:middle}
        .invoice-table tbody tr[data-invoice-id]{cursor:pointer}
        .invoice-table tbody tr[data-invoice-id]:hover{background:#f8fbff}
        .invoice-table .invoice-row-overdue{background:#fff9f9}
        .invoice-code{color:#10213c;font-weight:800;white-space:nowrap}
        .invoice-row-title{color:#10213c;font-weight:700}
        .invoice-countdown{display:inline-block;white-space:nowrap;color:#64748b;font-size:.7rem}
        .invoice-countdown.is-overdue{color:#b91c1c;font-weight:800}
        .invoice-status{display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:.28rem .52rem;font-size:.66rem;font-weight:800}
        .invoice-status.pending{background:#fff4df;color:#a5680c}.invoice-status.waiting{background:#fef3c7;color:#92400e}
        .invoice-status.paid{background:#e6f8ef;color:#08794f}.invoice-status.overdue{background:#fee2e2;color:#b91c1c}
        .invoice-row-action{width:30px;height:30px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#1769e8;cursor:pointer}
        .invoice-select{width:16px;height:16px;accent-color:#1769e8}
        .invoice-foot{position:sticky;bottom:0;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:.7rem;padding:.7rem .8rem;border:1px solid #dce8f6;border-radius:12px;background:rgba(255,255,255,.97);box-shadow:0 -8px 18px rgba(15,35,64,.06)}
        .invoice-foot-note{color:#64748b;font-size:.76rem}.invoice-foot-total{margin-left:.4rem;color:#10213c;font-weight:800}
        .invoice-foot .btn-primary{padding:.62rem .85rem;white-space:nowrap}.invoice-foot .btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .invoice-empty{padding:2rem 1rem;text-align:center;color:#64748b}.invoice-empty i{display:block;margin-bottom:.6rem;color:#8aa7ca;font-size:2rem}.invoice-empty strong{display:block;margin-bottom:.3rem;color:#334155}
        .invoice-load-more{display:block;margin:.8rem auto 0;border:1px solid var(--line);border-radius:8px;padding:.55rem .8rem;background:#fff;color:#1769e8;font:700 .75rem 'Be Vietnam Pro',sans-serif;cursor:pointer}
        .invoice-skeleton{display:grid;gap:.55rem;padding:.8rem}.invoice-skeleton span{height:38px;border-radius:7px;background:linear-gradient(90deg,#eef2f7,#f8fafc,#eef2f7);background-size:200% 100%;animation:invoice-shimmer 1.1s linear infinite}
        @keyframes invoice-shimmer{to{background-position:-200% 0}}
        .live-drawer-backdrop{position:fixed;inset:0;z-index:95;display:flex;justify-content:flex-end;background:rgba(15,35,64,.42)}
        .live-drawer-backdrop[hidden]{display:none}
        .live-drawer{width:min(500px,100%);height:100%;overflow:auto;padding:1.25rem;background:var(--surface,#fff);color:var(--ink,#10213c);box-shadow:-20px 0 50px rgba(15,35,64,.18)}
        .live-drawer header{position:sticky;top:-1.25rem;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:1rem;margin:-1.25rem -1.25rem 1rem;padding:1rem 1.25rem;background:var(--surface,#fff);border-bottom:1px solid var(--line)}
        .live-drawer h2{margin:0;font-size:1.08rem}.live-drawer-close{width:36px;height:36px;border:1px solid var(--line);border-radius:9px;background:var(--surface,#fff);color:inherit;cursor:pointer}
        .live-detail-list{display:grid;gap:.6rem}.live-detail-row{display:flex;justify-content:space-between;gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--line);font-size:.82rem}.live-detail-row strong{text-align:right}
        .live-action-row{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem}.live-action-row button{flex:1 1 130px}
        .live-dialog-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:1rem;background:rgba(15,35,64,.5)}.live-dialog-backdrop[hidden]{display:none}
        .live-dialog{width:min(440px,100%);max-height:90vh;overflow:auto;border-radius:14px;padding:1.2rem;background:var(--surface,#fff);color:var(--ink,#10213c);box-shadow:0 25px 70px rgba(15,35,64,.22)}
        .live-dialog h2{margin:0 0 .5rem;font-size:1.1rem}.live-dialog p{color:#64748b;font-size:.82rem;line-height:1.55}
        .live-dialog label{display:block;margin:.65rem 0 .3rem;font-size:.78rem;font-weight:700}.live-dialog input,.live-dialog select,.live-dialog textarea{width:100%;padding:.65rem;border:1px solid var(--line);border-radius:8px;background:var(--surface,#fff);color:var(--ink,#10213c);font:inherit}
        .live-toast{position:fixed;right:1rem;bottom:1rem;z-index:120;max-width:min(420px,calc(100vw - 2rem));padding:.75rem 1rem;border-radius:10px;background:#10213c;color:#fff;font-size:.8rem;box-shadow:0 12px 32px #10213c30}
        .contract-live-panel{display:grid;gap:.9rem;margin-bottom:1rem}.contract-live-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.8rem}
        .contract-live-stat{padding:.85rem 1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface,#fff)}.contract-live-stat small{color:#64748b;font-size:.68rem;font-weight:800}.contract-live-stat strong{display:block;margin-top:.35rem;color:var(--ink,#10213c);font-size:1.3rem}
        .contract-live-toolbar{display:flex;gap:.55rem;align-items:center;flex-wrap:wrap}.contract-live-toolbar input,.contract-live-toolbar select{min-height:38px;border:1px solid var(--line);border-radius:8px;padding:.5rem .65rem;background:var(--surface,#fff);color:var(--ink,#10213c);font:500 .76rem 'Be Vietnam Pro',sans-serif}
        .contract-live-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.contract-live-card{min-width:0;padding:1rem;border:1px solid var(--line);border-radius:12px;background:var(--surface,#fff)}
        .contract-live-card-head{display:flex;justify-content:space-between;gap:.6rem;align-items:flex-start}.contract-live-card h3{margin:0;color:var(--ink,#10213c);font-size:.9rem;overflow-wrap:anywhere}
        .contract-live-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem;margin-top:.8rem;color:#64748b;font-size:.72rem}.contract-live-meta strong{display:block;margin-top:.16rem;color:var(--ink,#10213c);font-size:.76rem}
        .contract-live-progress{height:7px;margin-top:.85rem;border-radius:99px;background:#e5edf6;overflow:hidden}.contract-live-progress span{display:block;height:100%;border-radius:inherit;background:#18a878}
        .contract-live-countdown{margin-top:.5rem;color:#08794f;font-size:.75rem;font-weight:800}.contract-live-countdown.warning{color:#a5680c}.contract-live-countdown.orange{color:#c2410c}.contract-live-countdown.expired{color:#b91c1c}
        .contract-live-card.expired{border-color:#fecaca;background:#fffafa}.contract-live-empty{grid-column:1/-1;padding:1.4rem;border:1px dashed var(--line);border-radius:12px;text-align:center;color:#64748b}.contract-live-empty strong{display:block;margin-bottom:.4rem;color:#334155}
        body.resident-theme-dark .invoice-summary-card,body.resident-theme-dark .invoice-foot,body.resident-theme-dark .contract-live-stat,body.resident-theme-dark .contract-live-card{background:#172235;border-color:#304158}
        body.resident-theme-dark .invoice-table th{background:#1d2b40;color:#c3d1e3}body.resident-theme-dark .invoice-status.pending{background:#4a3512;color:#fcd34d}body.resident-theme-dark .invoice-status.waiting{background:#4a3512;color:#fde68a}body.resident-theme-dark .invoice-status.paid{background:#123b31;color:#86efac}body.resident-theme-dark .invoice-status.overdue{background:#4b2028;color:#fca5a5}
        @media(max-width:900px){.invoice-controls{grid-template-columns:1fr}.invoice-query-row{justify-content:flex-start}.contract-live-list{grid-template-columns:1fr}}
        @media(max-width:700px){.resident-live-clock{min-width:0;flex:1}.topbar-actions{flex-wrap:wrap}.invoice-summary{grid-template-columns:1fr}.contract-live-stats{grid-template-columns:1fr}.invoice-query-row>*{max-width:none!important;flex:1 1 130px}.invoice-search{flex:1 1 100%}.invoice-search input{width:100%}.invoice-table-wrap{max-height:none;border:0;overflow:visible}.invoice-table,.invoice-table tbody{display:block;width:100%}.invoice-table thead{display:none}.invoice-table tr[data-invoice-id]{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:.2rem .6rem;margin-bottom:.7rem;padding:.75rem;border:1px solid var(--line);border-radius:11px;background:var(--surface,#fff)}.invoice-table td{display:block;padding:.22rem 0;border:0}.invoice-table td[data-label="Chọn"]{grid-row:1/5;align-self:center}.invoice-table td[data-label="Khoản thu"]{grid-column:2}.invoice-table td[data-label="Trạng thái"]{grid-column:3;grid-row:1}.invoice-table td[data-label="Mã hóa đơn"],.invoice-table td[data-label="Hạn thanh toán"],.invoice-table td[data-label="Còn lại"],.invoice-table td[data-label="Thời hạn"],.invoice-table td[data-label="Tổng tiền"]{grid-column:2/4}.invoice-table td[data-label="Thao tác"]{grid-column:3;grid-row:2;justify-self:end}.invoice-table td[data-label="Tòa nhà"],.invoice-table td[data-label="Phòng"]{display:none}.invoice-foot{bottom:.25rem}.invoice-foot-note{max-width:45%;line-height:1.4}.invoice-foot .btn-primary{font-size:.72rem}.live-drawer{padding:1rem}.live-drawer header{top:-1rem;margin:-1rem -1rem .8rem;padding:.8rem 1rem}}
        @media(prefers-reduced-motion:reduce){.invoice-skeleton span{animation:none}}
    `;
    document.head.appendChild(stylesheet);

    const topbarActions = document.querySelector('.topbar-actions');
    const topbarClock = document.querySelector('.resident-live-clock');
    const hero = section.querySelector('.resident-feature-hero');
    const contractHero = contractSection.querySelector('.resident-feature-hero');
    const legacyContractWorkspace = contractSection.querySelector('.contract-workspace');
    if (legacyContractWorkspace) legacyContractWorkspace.hidden = true;

    if (hero) {
        hero.insertAdjacentHTML('beforeend', '<div class="live-period-line"><span>Kỳ hiện tại: <strong id="invoicePeriodLabel"></strong></span><span id="invoicePeriodDates"></span></div>');
    }
    if (contractHero) contractHero.querySelector('p').textContent = 'Theo dõi thời hạn, hồ sơ và yêu cầu liên quan đến các hợp đồng của bạn.';

    const feature = section.querySelector('.resident-feature');
    feature.innerHTML = `
        <div class="resident-feature-hero"><div><div><h3>Hóa đơn &amp; thanh toán</h3><p>Hóa đơn, khoản phải trả và trạng thái xác nhận theo từng căn hộ.</p><div class="live-period-line"><span>Kỳ hiện tại: <strong id="invoicePeriodLabel"></strong></span><span id="invoicePeriodDates"></span></div></div><i class="fas fa-receipt resident-feature-icon"></i></div></div>
        <div class="invoice-workspace">
            <div class="invoice-unassigned" id="invoiceUnassigned" hidden><i class="fas fa-circle-info"></i><span>Bạn chưa được gán phòng, vui lòng liên hệ ban quản lý để được hỗ trợ.</span><button type="button" data-invoice-action="contact">Liên hệ ban quản lý</button></div>
            <div class="invoice-overdue-alert" id="invoiceOverdueAlert" hidden></div>
            <div class="invoice-change-alert" id="invoiceChangeAlert" hidden><span>Dữ liệu vừa thay đổi.</span><button type="button" data-invoice-action="refresh">Bấm để làm mới</button></div>
            <div class="invoice-summary">
                <div class="invoice-summary-card" id="invoiceDueCard"><small><i class="fas fa-wallet"></i> CẦN THANH TOÁN</small><strong id="billingDue">0 đ</strong><span id="billingDueNote"></span></div>
                <div class="invoice-summary-card"><small><i class="fas fa-circle-check" style="color:#18a878"></i> ĐÃ THANH TOÁN</small><strong id="billingPaid">0 đ</strong><span>Tổng hóa đơn đã thanh toán</span></div>
                <div class="invoice-summary-card"><small><i class="fas fa-calendar-days" style="color:#1683ff"></i> KỲ HIỆN TẠI</small><strong id="billingPeriodCard"></strong><span id="billingPeriodCardDates"></span></div>
            </div>
            <div class="card">
                <div class="invoice-controls"><div class="invoice-filter-tabs" role="group" aria-label="Lọc hóa đơn">
                    <button class="invoice-filter-tab" data-invoice-filter="all" aria-pressed="true">Tất cả <span data-filter-count="all">0</span></button>
                    <button class="invoice-filter-tab" data-invoice-filter="pending" aria-pressed="false">Chưa thanh toán <span data-filter-count="pending">0</span></button>
                    <button class="invoice-filter-tab" data-invoice-filter="waiting" aria-pressed="false">Chờ xác nhận <span data-filter-count="waiting">0</span></button>
                    <button class="invoice-filter-tab" data-invoice-filter="paid" aria-pressed="false">Đã thanh toán <span data-filter-count="paid">0</span></button>
                    <button class="invoice-filter-tab" data-invoice-filter="overdue" aria-pressed="false">Quá hạn <span data-filter-count="overdue">0</span></button>
                </div><div class="invoice-query-row">
                    <label class="invoice-search"><i class="fas fa-search"></i><input id="billingSearch" type="search" placeholder="Tìm mã hoặc khoản thu" aria-label="Tìm mã hoặc khoản thu"></label>
                    <select id="invoiceBuildingFilter" aria-label="Lọc theo tòa nhà"><option value="all">Tất cả tòa nhà</option></select>
                    <select id="invoiceRoomFilter" aria-label="Lọc theo phòng"><option value="all">Tất cả phòng</option></select>
                    <input id="invoicePeriodFilter" type="month" aria-label="Lọc theo kỳ thu">
                    <select id="invoiceSort" aria-label="Sắp xếp hóa đơn"><option value="due">Hạn thanh toán gần nhất</option><option value="amount-desc">Số tiền cao nhất</option><option value="amount-asc">Số tiền thấp nhất</option></select>
                </div></div>
                <div class="invoice-table-wrap"><table class="invoice-table"><thead><tr><th><input id="invoiceSelectVisible" class="invoice-select" type="checkbox" aria-label="Chọn hóa đơn có thể thanh toán"></th><th>Khoản thu</th><th>Tòa nhà</th><th>Phòng</th><th>Mã hóa đơn</th><th>Hạn thanh toán</th><th>Còn lại</th><th>Thời hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody id="billingRows"><tr><td colspan="10"><div class="invoice-skeleton"><span></span><span></span><span></span></div></td></tr></tbody></table></div>
                <div class="invoice-foot"><span class="invoice-foot-note" id="billingCount">Đang tải hóa đơn</span><span class="invoice-foot-note">Đã chọn <strong id="invoiceSelectedCount">0</strong><strong class="invoice-foot-total" id="invoiceSelectedTotal">0 đ</strong></span><button type="button" class="btn-primary" id="invoicePaySelected" disabled><i class="fas fa-credit-card"></i> Thanh toán</button></div>
                <button type="button" class="invoice-load-more" id="invoiceLoadMore" hidden>Xem thêm hóa đơn</button>
            </div>
        </div>`;

    if (topbarActions && topbarClock && !topbarActions.contains(topbarClock)) topbarActions.prepend(topbarClock);
    if (topbarClock && !document.getElementById('residentClockDate')) {
        topbarClock.innerHTML = '<span id="residentClockDate"></span><strong id="residentClockTime"></strong>';
    }

    if (contractHero && !document.getElementById('contractLivePanel')) {
        contractHero.insertAdjacentHTML('afterend', `
            <div class="contract-live-panel" id="contractLivePanel">
                <div class="contract-live-stats">
                    <div class="contract-live-stat"><small>HỢP ĐỒNG ĐANG HIỆU LỰC</small><strong id="contractActiveCount">0</strong></div>
                    <div class="contract-live-stat"><small>SẮP HẾT HẠN</small><strong id="contractExpiringCount">0</strong></div>
                    <div class="contract-live-stat"><small>ĐÃ KẾT THÚC</small><strong id="contractEndedCount">0</strong></div>
                </div>
                <div class="contract-live-toolbar"><div class="invoice-filter-tabs" role="group" aria-label="Lọc trạng thái hợp đồng">
                    <button class="invoice-filter-tab" data-contract-filter="all" aria-pressed="true">Tất cả</button><button class="invoice-filter-tab" data-contract-filter="active" aria-pressed="false">Hiệu lực</button><button class="invoice-filter-tab" data-contract-filter="expiring" aria-pressed="false">Sắp hết hạn</button><button class="invoice-filter-tab" data-contract-filter="waiting" aria-pressed="false">Chờ ký</button><button class="invoice-filter-tab" data-contract-filter="ended" aria-pressed="false">Đã kết thúc</button><button class="invoice-filter-tab" data-contract-filter="cancelled" aria-pressed="false">Đã hủy</button>
                </div><input id="contractLiveSearch" type="search" placeholder="Tìm mã hợp đồng hoặc phòng" aria-label="Tìm mã hợp đồng hoặc phòng"></div>
                <div class="contract-live-list" id="contractLiveList"></div>
            </div>`);
    }

    const drawer = document.createElement('div');
    drawer.className = 'live-drawer-backdrop';
    drawer.id = 'liveDrawerBackdrop';
    drawer.hidden = true;
    drawer.innerHTML = '<aside class="live-drawer" role="dialog" aria-modal="true" aria-labelledby="liveDrawerTitle"><header><h2 id="liveDrawerTitle"></h2><button type="button" class="live-drawer-close" aria-label="Đóng chi tiết"><i class="fas fa-xmark"></i></button></header><div id="liveDrawerContent"></div></aside>';
    document.body.appendChild(drawer);
    const dialog = document.createElement('div');
    dialog.className = 'live-dialog-backdrop';
    dialog.id = 'liveDialogBackdrop';
    dialog.hidden = true;
    dialog.innerHTML = '<section class="live-dialog" role="dialog" aria-modal="true" aria-labelledby="liveDialogTitle"><div id="liveDialogContent"></div></section>';
    document.body.appendChild(dialog);

    let activeInvoiceFilter = 'all';
    let activeContractFilter = 'all';
    let selectedInvoices = new Set();
    let pageSize = 10;
    let searchTimer = null;
    let paymentInFlight = false;
    let internalInvoiceWrite = false;
    let activePaymentIds = [];
    let lastRenderedDay = '';
    let lastPeriod = '';
    let initialInvoiceIds = null;
    let previouslyFocused = null;

    function currentPeriod(now) {
        const building = window.RH_CTX && window.RH_CTX.building;
        const config = building && building.config || {};
        return clock.getPeriod(now, {
            startDay: Number(config.billingStartDay) || 28,
            endDay: Number(config.billingEndDay) || 5
        });
    }

    function invoicesForView() {
        const buildingId = document.getElementById('invoiceBuildingFilter').value;
        const apartmentId = document.getElementById('invoiceRoomFilter').value;
        const period = document.getElementById('invoicePeriodFilter').value;
        return portfolioInvoices().map(invoice => {
            const contract = contractForInvoice(invoice);
            const apartment = apartmentFor(invoice.apartmentId || (contract && contract.apartmentId));
            const building = buildingFor(invoice.buildingId || (contract && contract.buildingId) || (apartment && apartment.buildingId));
            const status = statusFor(invoice);
            return Object.assign({}, invoice, { contract, apartment, building, effectiveStatus: status, outstanding: invoiceDue(invoice) });
        }).filter(invoice => (buildingId === 'all' || (invoice.building && invoice.building.id === buildingId))
            && (apartmentId === 'all' || (invoice.apartment && invoice.apartment.id === apartmentId))
            && (!period || String(invoice.period || '').slice(0, 7) === period));
    }

    function populateResidenceFilters() {
        const apartments = new Map();
        const buildings = new Map();
        portfolioInvoices().forEach(invoice => {
            const contract = contractForInvoice(invoice);
            const apartment = apartmentFor(invoice.apartmentId || (contract && contract.apartmentId));
            const building = buildingFor(invoice.buildingId || (contract && contract.buildingId) || (apartment && apartment.buildingId));
            if (apartment) apartments.set(apartment.id, apartment);
            if (building) buildings.set(building.id, building);
        });
        portfolioContracts().forEach(contract => {
            const apartment = apartmentFor(contract.apartmentId);
            const building = buildingFor(contract.buildingId || (apartment && apartment.buildingId));
            if (apartment) apartments.set(apartment.id, apartment);
            if (building) buildings.set(building.id, building);
        });
        const buildingSelect = document.getElementById('invoiceBuildingFilter');
        const roomSelect = document.getElementById('invoiceRoomFilter');
        const selectedBuilding = buildingSelect.value;
        const selectedRoom = roomSelect.value;
        buildingSelect.innerHTML = '<option value="all">Tất cả tòa nhà</option>' + Array.from(buildings.values()).map(building => '<option value="' + esc(building.id) + '">' + esc(building.shortName || building.name) + '</option>').join('');
        if ([...buildingSelect.options].some(option => option.value === selectedBuilding)) buildingSelect.value = selectedBuilding;
        const buildingFilter = buildingSelect.value;
        const visibleApartments = Array.from(apartments.values()).filter(apartment => buildingFilter === 'all' || apartment.buildingId === buildingFilter);
        roomSelect.innerHTML = '<option value="all">Tất cả phòng</option>' + visibleApartments.map(apartment => '<option value="' + esc(apartment.id) + '">' + esc(apartment.name) + '</option>').join('');
        if ([...roomSelect.options].some(option => option.value === selectedRoom)) roomSelect.value = selectedRoom;
    }

    function animateMoney(element, value) {
        if (!element) return;
        const target = Math.max(0, amount(value));
        const start = Number(element.dataset.value) || 0;
        element.dataset.value = String(target);
        if (start === target || !window.requestAnimationFrame) {
            element.textContent = moneyLabel(target);
            return;
        }
        const started = performance.now();
        const frame = time => {
            const progress = Math.min(1, (time - started) / 360);
            const eased = 1 - Math.pow(1 - progress, 3);
            element.textContent = moneyLabel(start + (target - start) * eased);
            if (progress < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    function statusMarkup(status) {
        const [label, bucket] = displayStatus(status);
        return '<span class="invoice-status ' + bucket + '">' + label + '</span>';
    }

    function emptyMessage() {
        if (!(window.RH_CTX && window.RH_CTX.apartment) && portfolioContracts().length === 0) {
            return '<div class="invoice-empty"><i class="fas fa-house-circle-exclamation"></i><strong>Bạn chưa được gán phòng</strong><span>Vui lòng liên hệ ban quản lý để được gán phòng và nhận hóa đơn.</span></div>';
        }
        const labels = { waiting: 'Chưa có giao dịch nào đang chờ xác nhận', paid: 'Chưa có hóa đơn đã thanh toán', overdue: 'Không có hóa đơn quá hạn', pending: 'Không có hóa đơn cần thanh toán', all: 'Chưa có hóa đơn nào trong kỳ này' };
        return '<div class="invoice-empty"><i class="fas fa-file-invoice"></i><strong>' + (labels[activeInvoiceFilter] || labels.all) + '</strong><span>Hóa đơn mới sẽ xuất hiện tại đây sau khi ban quản lý phát hành.</span></div>';
    }

    function rowMarkup(invoice) {
        const [statusLabel] = displayStatus(invoice.effectiveStatus);
        const dueDate = invoice.dueDate || '';
        const locked = invoice.effectiveStatus === 'payment_pending' || !isPayable(invoice);
        const selected = selectedInvoices.has(invoice.id);
        const details = invoice.items || [];
        const name = details.slice(0, 2).map(item => item.label).join(', ') || ('Kỳ thu ' + (invoice.period || ''));
        const bucket = displayStatus(invoice.effectiveStatus)[1];
        const code = invoice.code || invoice.id;
        const buildingName = invoice.building && (invoice.building.shortName || invoice.building.name) || '—';
        const roomName = invoice.apartment && invoice.apartment.name || '—';
        const dueLabel = dueDate ? fmtDate(dueDate) : 'Chưa cập nhật';
        const days = dueDate ? clock.daysRemaining(dueDate) : null;
        const paid = amount(invoice.paidAmount || invoice.amountPaid);
        const remaining = invoice.outstanding;
        const remainingLabel = paid > 0 && remaining > 0 ? moneyLabel(paid) + ' / ' + moneyLabel(invoice.total) : moneyLabel(remaining);
        return '<tr data-invoice-id="' + esc(invoice.id) + '" class="' + (bucket === 'overdue' ? 'invoice-row-overdue' : '') + '" tabindex="0">' +
            '<td data-label="Chọn"><input class="invoice-select" type="checkbox" data-invoice-select="' + esc(invoice.id) + '" aria-label="Chọn hóa đơn ' + esc(code) + '" ' + (selected ? 'checked' : '') + (locked ? 'disabled' : '') + '></td>' +
            '<td data-label="Khoản thu"><span class="invoice-row-title">' + esc(name) + '</span></td>' +
            '<td data-label="Tòa nhà">' + esc(buildingName) + '</td><td data-label="Phòng">' + esc(roomName) + '</td>' +
            '<td data-label="Mã hóa đơn"><span class="invoice-code">' + esc(code) + '</span></td>' +
            '<td data-label="Hạn thanh toán">' + esc(dueLabel) + '</td>' +
            '<td data-label="Còn lại"><strong>' + esc(remainingLabel) + '</strong></td>' +
            '<td data-label="Thời hạn"><span class="invoice-countdown ' + (bucket === 'overdue' ? 'is-overdue' : '') + '" data-countdown="' + esc(dueDate) + '">' + (dueDate ? esc(clock.countdown(dueDate)) : 'Chưa có hạn') + '</span></td>' +
            '<td data-label="Trạng thái"><span class="invoice-status ' + bucket + '" data-live-status="' + esc(invoice.id) + '">' + statusLabel + '</span></td>' +
            '<td data-label="Thao tác"><button type="button" class="invoice-row-action" data-invoice-action="detail" data-invoice-id="' + esc(invoice.id) + '" aria-label="Xem hóa đơn ' + esc(code) + '" title="Xem chi tiết"><i class="fas fa-eye"></i></button></td></tr>';
    }

    function renderInvoiceRows() {
        const now = new Date();
        const invoices = invoicesForView();
        const byStatus = invoices.reduce((counts, invoice) => {
            const [, bucket] = displayStatus(invoice.effectiveStatus);
            counts[bucket] = (counts[bucket] || 0) + 1;
            return counts;
        }, { all: invoices.length, pending: 0, waiting: 0, paid: 0, overdue: 0 });
        Object.keys(byStatus).forEach(status => {
            const badge = document.querySelector('[data-filter-count="' + status + '"]');
            if (badge) badge.textContent = byStatus[status];
        });
        const query = normalize(document.getElementById('billingSearch').value);
        const sort = document.getElementById('invoiceSort').value;
        let filtered = invoices.filter(invoice => {
            const bucket = displayStatus(invoice.effectiveStatus)[1];
            const queryText = [invoice.code, invoice.period, ...(invoice.items || []).map(item => item.label), invoice.building && invoice.building.name, invoice.apartment && invoice.apartment.name].join(' ');
            return (activeInvoiceFilter === 'all' || bucket === activeInvoiceFilter) && (!query || normalize(queryText).includes(query));
        });
        filtered.sort((left, right) => {
            const leftOverdue = left.effectiveStatus === 'overdue' ? 0 : 1;
            const rightOverdue = right.effectiveStatus === 'overdue' ? 0 : 1;
            if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
            if (sort === 'amount-desc') return right.outstanding - left.outstanding;
            if (sort === 'amount-asc') return left.outstanding - right.outstanding;
            return String(left.dueDate || '9999-12-31').localeCompare(String(right.dueDate || '9999-12-31'));
        });
        const overdue = invoices.filter(invoice => invoice.effectiveStatus === 'overdue');
        const overdueAlert = document.getElementById('invoiceOverdueAlert');
        overdueAlert.hidden = overdue.length === 0;
        overdueAlert.innerHTML = overdue.length ? '<i class="fas fa-triangle-exclamation"></i> Bạn có ' + overdue.length + ' hóa đơn quá hạn với tổng số tiền còn nợ ' + moneyLabel(overdue.reduce((sum, invoice) => sum + invoice.outstanding, 0)) + '.' : '';
        const unassigned = !(window.RH_CTX && window.RH_CTX.apartment) && portfolioContracts().length === 0;
        document.getElementById('invoiceUnassigned').hidden = !unassigned;
        document.getElementById('invoiceDueCard').classList.toggle('is-overdue', overdue.length > 0);
        const unpaid = invoices.filter(invoice => invoice.effectiveStatus !== 'paid');
        const payable = invoices.filter(invoice => isPayable(invoice));
        const paid = invoices.filter(invoice => invoice.effectiveStatus === 'paid');
        animateMoney(document.getElementById('billingDue'), unpaid.reduce((sum, invoice) => sum + invoice.outstanding, 0));
        animateMoney(document.getElementById('billingPaid'), paid.reduce((sum, invoice) => sum + amount(invoice.total), 0));
        document.getElementById('billingDueNote').textContent = unassigned
            ? 'Bạn chưa được gán phòng, vui lòng liên hệ ban quản lý'
            : overdue.length ? overdue.length + ' hóa đơn quá hạn' : invoices.some(invoice => invoice.effectiveStatus === 'payment_pending')
                ? invoices.filter(invoice => invoice.effectiveStatus === 'payment_pending').length + ' hóa đơn chờ xác nhận'
                : unpaid.length ? unpaid.length + ' hóa đơn cần thanh toán' : 'Bạn không có hóa đơn cần thanh toán';
        const period = currentPeriod(now);
        document.getElementById('invoicePeriodLabel').textContent = period.label;
        document.getElementById('billingPeriodCard').textContent = period.label;
        const periodDates = 'Thu từ ' + fmtDate(period.startDate) + ' đến ' + fmtDate(period.endDate);
        document.getElementById('invoicePeriodDates').textContent = periodDates;
        document.getElementById('billingPeriodCardDates').textContent = periodDates;
        const page = filtered.slice(0, pageSize);
        document.getElementById('billingRows').innerHTML = page.length ? page.map(rowMarkup).join('')
            : '<tr><td colspan="10">' + emptyMessage() + '</td></tr>';
        document.getElementById('billingCount').textContent = filtered.length > page.length
            ? 'Hiển thị ' + page.length + '/' + filtered.length + ' hóa đơn'
            : 'Hiển thị ' + filtered.length + ' hóa đơn';
        const more = document.getElementById('invoiceLoadMore');
        more.hidden = filtered.length <= page.length;
        more.textContent = 'Xem thêm ' + Math.min(10, filtered.length - page.length) + ' hóa đơn';
        const availableIds = new Set(invoices.filter(isPayable).map(invoice => invoice.id));
        selectedInvoices = new Set([...selectedInvoices].filter(id => availableIds.has(id)));
        updatePaymentBar(invoices);
        updateCountdowns(now);
        notifyInvoiceEvents(invoices);
    }

    function updatePaymentBar(invoices) {
        const selected = invoices.filter(invoice => selectedInvoices.has(invoice.id) && isPayable(invoice));
        document.getElementById('invoiceSelectedCount').textContent = selected.length;
        document.getElementById('invoiceSelectedTotal').textContent = moneyLabel(selected.reduce((sum, invoice) => sum + invoice.outstanding, 0));
        document.getElementById('invoicePaySelected').disabled = selected.length === 0 || paymentInFlight;
        const visible = invoices.filter(invoice => {
            const bucket = displayStatus(invoice.effectiveStatus)[1];
            return (activeInvoiceFilter === 'all' || bucket === activeInvoiceFilter) && isPayable(invoice);
        });
        const selectVisible = document.getElementById('invoiceSelectVisible');
        selectVisible.checked = visible.length > 0 && visible.every(invoice => selectedInvoices.has(invoice.id));
        selectVisible.disabled = visible.length === 0;
    }

    function updateCountdowns(now) {
        document.querySelectorAll('[data-countdown]').forEach(element => {
            const dueDate = element.dataset.countdown;
            if (!dueDate) return;
            const invoice = window.RHD.get('invoices', element.closest('[data-invoice-id]')?.dataset.invoiceId);
            if (!invoice) return;
            const status = statusFor(invoice, now);
            element.textContent = clock.countdown(dueDate, now);
            element.classList.toggle('is-overdue', status === 'overdue');
            const badge = document.querySelector('[data-live-status="' + CSS.escape(invoice.id) + '"]');
            if (badge) {
                const [label, bucket] = displayStatus(status);
                badge.textContent = label;
                badge.className = 'invoice-status ' + bucket;
            }
        });
    }

    function openDrawer(title, html) {
        previouslyFocused = document.activeElement;
        document.getElementById('liveDrawerTitle').textContent = title;
        document.getElementById('liveDrawerContent').innerHTML = html;
        drawer.hidden = false;
        drawer.querySelector('.live-drawer-close').focus();
    }

    function closeDrawer() {
        drawer.hidden = true;
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    }

    function invoiceDetail(invoice) {
        const apartment = apartmentFor(invoice.apartmentId) || invoice.apartment;
        const building = buildingFor(invoice.buildingId) || invoice.building;
        const items = invoice.items || [];
        const rows = items.map(item => {
            const label = String(item.label || 'Khoản thu');
            const quantity = amount(item.qty || item.quantity);
            const rate = amount(item.unitPrice || item.price);
            const meterMatch = label.match(/(điện|nước).*?(\d+(?:[.,]\d+)?)/i);
            const extra = /điện/i.test(label) || /nước/i.test(label)
                ? '<small>Chỉ số/tiêu thụ: ' + esc(meterMatch && meterMatch[2] || quantity || '—') + ' · Đơn giá: ' + moneyLabel(rate) + '</small>' : '';
            return '<div class="live-detail-row"><span>' + esc(label) + extra + '</span><strong>' + moneyLabel(item.total || item.amount) + '</strong></div>';
        }).join('') || '<p>Hóa đơn chưa có chi tiết khoản thu.</p>';
        const paid = amount(invoice.paidAmount || invoice.amountPaid);
        const actions = '<div class="live-action-row"><button class="billing-filter" data-invoice-action="copy" data-invoice-id="' + esc(invoice.id) + '"><i class="fas fa-copy"></i> Sao chép mã</button><button class="billing-filter" data-invoice-action="print" data-invoice-id="' + esc(invoice.id) + '"><i class="fas fa-print"></i> In / PDF</button><button class="billing-filter" data-invoice-action="complaint" data-invoice-id="' + esc(invoice.id) + '"><i class="fas fa-comment-dots"></i> Khiếu nại khoản thu</button></div>';
        const payment = isPayable(invoice) ? '<button type="button" class="btn-primary" data-invoice-action="pay-one" data-invoice-id="' + esc(invoice.id) + '" style="width:100%;margin-top:.6rem">Thanh toán hóa đơn</button>' : '';
        return '<div class="live-detail-list"><div class="live-detail-row"><span>Tòa nhà</span><strong>' + esc(building && (building.name || building.shortName) || '—') + '</strong></div><div class="live-detail-row"><span>Phòng</span><strong>' + esc(apartment && apartment.name || '—') + '</strong></div><div class="live-detail-row"><span>Kỳ thu</span><strong>' + esc(invoice.period || '—') + '</strong></div><div class="live-detail-row"><span>Hạn thanh toán</span><strong>' + esc(fmtDate(invoice.dueDate)) + '</strong></div><div class="live-detail-row"><span>Trạng thái</span><strong>' + statusMarkup(statusFor(invoice)) + '</strong></div><h3 style="margin:.6rem 0 0;font-size:.9rem">Chi tiết khoản thu</h3>' + rows + '<div class="live-detail-row"><span>Đã trả / Tổng</span><strong>' + moneyLabel(paid) + ' / ' + moneyLabel(invoice.total) + '</strong></div><div class="live-detail-row"><span>Còn phải trả</span><strong>' + moneyLabel(invoiceDue(invoice)) + '</strong></div></div>' + actions + payment;
    }

    function showDialog(title, body) {
        const root = document.getElementById('liveDialogBackdrop');
        document.getElementById('liveDialogContent').innerHTML = '<h2 id="liveDialogTitle">' + esc(title) + '</h2>' + body;
        root.hidden = false;
        root.querySelector('button, input, select, textarea')?.focus();
    }

    function closeDialog() {
        document.getElementById('liveDialogBackdrop').hidden = true;
    }

    function toast(message) {
        const previous = document.querySelector('.live-toast');
        if (previous) previous.remove();
        const element = document.createElement('div');
        element.className = 'live-toast';
        element.setAttribute('role', 'status');
        element.textContent = message;
        document.body.appendChild(element);
        window.setTimeout(() => element.remove(), 4000);
    }

    function openPayment(ids) {
        const invoices = portfolioInvoices().filter(invoice => ids.includes(invoice.id) && isPayable(invoice));
        if (!invoices.length) return toast('Không còn hóa đơn đủ điều kiện thanh toán. Hãy tải lại dữ liệu.');
        activePaymentIds = invoices.map(invoice => invoice.id);
        const total = invoices.reduce((sum, invoice) => sum + invoiceDue(invoice), 0);
        const codes = invoices.map(invoice => invoice.code || invoice.id).join(', ');
        showDialog('Chọn phương thức thanh toán', '<p>Tổng số tiền cần thanh toán: <strong>' + moneyLabel(total) + '</strong></p><label>Phương thức</label><select id="paymentMethod"><option value="bank_transfer">Chuyển khoản ngân hàng</option><option value="qr">Quét mã QR</option><option value="wallet">Ví điện tử</option></select><div class="invoice-payment-details" id="invoicePaymentDetails"><p>Nội dung chuyển khoản: <strong>' + esc(codes) + '</strong></p><p>Mã hóa đơn: ' + esc(codes) + '</p><div id="invoicePaymentQr"></div></div><div class="live-action-row"><button type="button" class="btn-secondary" data-invoice-action="close-dialog">Hủy</button><button type="button" class="btn-primary" data-invoice-action="payment-confirm" data-invoice-ids="' + esc(ids.join(',')) + '">Tôi đã chuyển khoản</button></div>');
        document.getElementById('paymentMethod').addEventListener('change', updatePaymentMethod);
        document.getElementById('paymentMethod').addEventListener('change', event => {
            const button = document.querySelector('[data-invoice-action="payment-confirm"]');
            if (button) button.textContent = event.target.value === 'wallet' ? 'Tôi đã thanh toán' : 'Tôi đã chuyển khoản';
        });
        updatePaymentMethod();
    }

    function updatePaymentMethod() {
        const method = document.getElementById('paymentMethod').value;
        const details = document.getElementById('invoicePaymentDetails');
        const bankBuilding = window.RH_CTX && window.RH_CTX.building;
        const bank = bankBuilding && bankBuilding.config || {};
        const codes = activePaymentIds.map(id => portfolioInvoices().find(invoice => invoice.id === id)).filter(Boolean).map(invoice => invoice.code || invoice.id).join(', ');
        details.innerHTML = '<p id="invoicePaymentMethodNote"></p><p>Mã hóa đơn: <strong>' + esc(codes) + '</strong></p><div id="invoicePaymentQr"></div>';
        const qr = document.getElementById('invoicePaymentQr');
        if (method === 'wallet') {
            document.getElementById('invoicePaymentMethodNote').textContent = 'Thanh toán ví sẽ được ghi nhận chờ xác nhận. Hãy hoàn tất giao dịch trong ứng dụng ví của bạn trước khi xác nhận bên dưới.';
            return;
        }
        if (method === 'qr' && bank.bankAccountNumber) {
            const bins = { vietcombank: '970436', vietinbank: '970415', bidv: '970418', agribank: '970405', techcombank: '970407', mbbank: '970422', acb: '970416', vpbank: '970432', tpbank: '970423' };
            const bin = bins[normalize(bank.bankName).replace(/[^a-z]/g, '')];
            if (bin) qr.innerHTML = '<img src="https://img.vietqr.io/image/' + bin + '-' + encodeURIComponent(bank.bankAccountNumber) + '-compact2.png?amount=' + encodeURIComponent(portfolioInvoices().filter(invoice => activePaymentIds.includes(invoice.id)).reduce((sum, invoice) => sum + invoiceDue(invoice), 0)) + '&addInfo=' + encodeURIComponent(portfolioInvoices().filter(invoice => activePaymentIds.includes(invoice.id)).map(invoice => invoice.code).join(' ')) + '" alt="Mã QR thanh toán" style="display:block;width:190px;height:190px;object-fit:contain;margin:.7rem auto">';
        }
        document.getElementById('invoicePaymentMethodNote').innerHTML = 'Ngân hàng: <strong>' + esc(bank.bankName || 'Chưa cấu hình') + '</strong> · Số tài khoản: <strong>' + esc(bank.bankAccountNumber || 'Chưa cấu hình') + '</strong>';
    }

    function submitPayment(ids, button) {
        if (paymentInFlight || button.disabled) return;
        paymentInFlight = true;
        button.disabled = true;
        const method = document.getElementById('paymentMethod').value;
        try {
            internalInvoiceWrite = true;
            ids.forEach(id => {
                const invoice = window.RHD.get('invoices', id);
                if (!invoice || !isPayable(invoice)) throw new Error('Hóa đơn ' + id + ' không còn ở trạng thái có thể thanh toán.');
                const result = window.RHD.update('invoices', id, {
                    status: 'payment_pending',
                    paymentMethod: method,
                    paymentRequestedAt: Date.now()
                });
                if (!result || !result.ok) throw new Error(result && result.error || 'Không thể gửi yêu cầu thanh toán.');
            });
            selectedInvoices.clear();
            closeDialog();
            renderAll();
            toast('Đã gửi yêu cầu. Hóa đơn đang chờ ban quản lý xác nhận.');
        } catch (error) {
            toast(error.message || 'Gửi thanh toán chưa thành công. Vui lòng thử lại.');
            button.disabled = false;
        } finally {
            internalInvoiceWrite = false;
            paymentInFlight = false;
            renderAll();
        }
    }

    function printInvoice(invoice) {
        const rows = (invoice.items || []).map(item => '<tr><td>' + esc(item.label) + '</td><td>' + moneyLabel(item.amount) + '</td></tr>').join('');
        const printWindow = window.open('', '_blank');
        if (!printWindow) return toast('Trình duyệt đang chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.');
        printWindow.opener = null;
        printWindow.document.write('<!doctype html><html lang="vi"><meta charset="utf-8"><title>Hóa đơn ' + esc(invoice.code) + '</title><style>body{font:15px/1.6 Arial,sans-serif;max-width:760px;margin:36px auto;color:#10213c}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:20px;margin-top:24px}@media print{button{display:none}}</style><h1>Hóa đơn ' + esc(invoice.code) + '</h1><p>Kỳ thu: ' + esc(invoice.period) + ' · Hạn thanh toán: ' + esc(fmtDate(invoice.dueDate)) + '</p><table><thead><tr><th>Khoản thu</th><th>Số tiền</th></tr></thead><tbody>' + rows + '</tbody></table><div class="total">Tổng cộng: ' + moneyLabel(invoice.total) + '</div><script>window.onload=()=>window.print()<\/script></html>');
        printWindow.document.close();
    }

    function complainAbout(invoice) {
        const note = window.prompt('Mô tả khoản thu cần Ban quản lý kiểm tra:');
        if (!note || !note.trim()) return;
        const apartment = apartmentFor(invoice.apartmentId);
        const building = buildingFor(invoice.buildingId);
        const result = window.RHD.create('supportRequests', {
            code: window.RHD.nextSupportCode(), buildingId: invoice.buildingId || '', apartmentId: invoice.apartmentId || '',
            customerId: residentCustomerId(), residentEmail: window.RH_SESSION && window.RH_SESSION.email || '',
            residentName: window.RH_SESSION && window.RH_SESSION.name || '', category: 'Phí & thanh toán',
            title: 'Đề nghị kiểm tra hóa đơn ' + (invoice.code || ''), description: note.trim(),
            location: (building && building.name || '') + ' / Phòng ' + (apartment && apartment.name || ''), priority: 'normal', status: 'new', assignee: '', attachments: 0, messages: []
        });
        if (!result.ok) return toast(result.error || 'Không thể gửi khiếu nại. Vui lòng thử lại.');
        toast('Đã gửi yêu cầu kiểm tra hóa đơn đến Ban quản lý.');
        closeDrawer();
    }

    function notifyInvoiceEvents(invoices) {
        const storageKey = 'residenthub_invoice_notices_' + userKey();
        let seen = {};
        try { seen = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (error) { seen = {}; }
        const ids = invoices.map(invoice => invoice.id);
        if (initialInvoiceIds === null) initialInvoiceIds = new Set(ids);
        else invoices.filter(invoice => !initialInvoiceIds.has(invoice.id)).forEach(invoice => {
            initialInvoiceIds.add(invoice.id);
            sendNotification('Hóa đơn mới ' + (invoice.code || ''), 'Đã phát hành hóa đơn kỳ ' + (invoice.period || '') + ' với số tiền ' + moneyLabel(invoice.total) + '.', 'invoice');
        });
        invoices.forEach(invoice => {
            if (invoice.effectiveStatus === 'paid' || !invoice.dueDate) return;
            const days = clock.daysRemaining(invoice.dueDate);
            if (![3, 1, 0].includes(days)) return;
            const key = invoice.id + ':' + days + ':' + todayKey();
            if (seen[key]) return;
            seen[key] = true;
            const dueText = days === 0 ? 'đến hạn hôm nay' : 'còn ' + days + ' ngày đến hạn';
            sendNotification('Nhắc hạn hóa đơn ' + (invoice.code || ''), 'Hóa đơn ' + dueText + ', số tiền còn lại ' + moneyLabel(invoiceDue(invoice)) + '.', 'invoice');
        });
        try { localStorage.setItem(storageKey, JSON.stringify(seen)); } catch (error) { /* Không chặn giao diện nếu bộ nhớ đầy. */ }
    }

    function sendNotification(title, body, type) {
        window.dispatchEvent(new CustomEvent('residenthub:notification', { detail: {
            id: 'resident-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            type: 'BILLING', subType: type, title: title, body: body, actionUrl: 'invoices', refType: 'invoice'
        } }));
    }

    function contractStatus(contract, now) {
        const status = String(contract.status || '').toLowerCase();
        if (['cancelled', 'canceled', 'terminated'].includes(status)) return 'cancelled';
        if (['pending_signature', 'waiting_signature', 'pending_sign', 'waiting'].includes(status)) return 'waiting';
        if (['ended', 'expired', 'closed'].includes(status)) return 'ended';
        const remaining = contract.endDate ? clock.daysRemaining(contract.endDate, now) : null;
        if (remaining !== null && remaining < 0) return 'ended';
        if (remaining !== null && remaining <= 60) return 'expiring';
        return 'active';
    }

    function statusText(status) {
        return ({ active: 'Đang hiệu lực', expiring: 'Sắp hết hạn', waiting: 'Chờ ký', ended: 'Đã kết thúc', cancelled: 'Đã hủy' })[status] || status;
    }

    function contractProgress(contract) {
        const total = clock.compareDays(contract.endDate, contract.startDate);
        const passed = clock.compareDays(todayKey(), contract.startDate);
        if (total === null || total <= 0 || passed === null) return 0;
        return Math.max(0, Math.min(100, Math.round(passed / total * 100)));
    }

    function renderContracts() {
        const list = document.getElementById('contractLiveList');
        if (!list) return;
        const now = new Date();
        const contracts = portfolioContracts().map(contract => {
            const apartment = apartmentFor(contract.apartmentId);
            const building = buildingFor(contract.buildingId || (apartment && apartment.buildingId));
            return Object.assign({}, contract, { apartment, building, liveStatus: contractStatus(contract, now) });
        });
        const counts = { active: 0, expiring: 0, waiting: 0, ended: 0, cancelled: 0 };
        contracts.forEach(contract => counts[contract.liveStatus]++);
        document.getElementById('contractActiveCount').textContent = counts.active;
        document.getElementById('contractExpiringCount').textContent = counts.expiring;
        document.getElementById('contractEndedCount').textContent = counts.ended;
        const query = normalize(document.getElementById('contractLiveSearch').value);
        const filtered = contracts.filter(contract => {
            const text = normalize([contract.code, contract.apartment && contract.apartment.name, contract.building && contract.building.name].join(' '));
            return (activeContractFilter === 'all' || contract.liveStatus === activeContractFilter) && (!query || text.includes(query));
        }).sort((left, right) => {
            const rank = { waiting: 0, expiring: 1, active: 2, ended: 3, cancelled: 4 };
            return rank[left.liveStatus] - rank[right.liveStatus] || String(left.endDate || '').localeCompare(String(right.endDate || ''));
        });
        if (!contracts.length) {
            list.innerHTML = '<div class="contract-live-empty"><i class="fas fa-file-signature" style="font-size:1.5rem"></i><strong>' + (window.RH_CTX && window.RH_CTX.apartment ? 'Chưa có hợp đồng được ghi nhận' : 'Bạn chưa được gán phòng') + '</strong><span>' + (window.RH_CTX && window.RH_CTX.apartment ? 'Liên hệ Ban quản lý nếu bạn cần tra cứu hồ sơ thuê.' : 'Vui lòng liên hệ Ban quản lý để được gán phòng và cập nhật hợp đồng.') + '</span><p><button type="button" class="billing-filter" data-contract-action="contact">Liên hệ ban quản lý</button></p></div>';
            return;
        }
        if (!filtered.length) {
            list.innerHTML = '<div class="contract-live-empty"><strong>Không tìm thấy hợp đồng phù hợp</strong><span>Thử đổi trạng thái hoặc nội dung tìm kiếm.</span></div>';
            return;
        }
        list.innerHTML = filtered.map(contract => {
            const days = contract.endDate ? clock.daysRemaining(contract.endDate, now) : null;
            const countdownClass = days !== null && days < 0 ? 'expired' : days !== null && days < 30 ? 'orange' : days !== null && days <= 60 ? 'warning' : '';
            const countdown = days === null ? 'Chưa có ngày kết thúc' : days < 0 ? 'Đã hết hạn ' + Math.abs(days) + ' ngày' : 'Còn ' + days + ' ngày hết hạn';
            const status = contract.liveStatus;
            const badge = status === 'ended' || status === 'cancelled' ? 'badge-overdue' : status === 'waiting' ? 'badge-pending' : status === 'expiring' ? 'badge-pending' : 'badge-paid';
            const apartmentLabel = contract.apartment && contract.apartment.name || '—';
            const buildingLabel = contract.building && (contract.building.shortName || contract.building.name) || '—';
            return '<article class="contract-live-card ' + (status === 'ended' ? 'expired' : '') + '"><div class="contract-live-card-head"><h3>' + esc(contract.code || contract.id) + '</h3><span class="badge ' + badge + '">' + statusText(status) + '</span></div><div class="contract-live-meta"><div>Tòa nhà<strong>' + esc(buildingLabel) + '</strong></div><div>Số phòng<strong>' + esc(apartmentLabel) + '</strong></div><div>Ngày bắt đầu<strong>' + esc(fmtDate(contract.startDate)) + '</strong></div><div>Ngày kết thúc<strong>' + esc(fmtDate(contract.endDate)) + '</strong></div><div>Tiền thuê<strong>' + moneyLabel(contract.rentPrice) + '</strong></div><div>Tiền cọc<strong>' + moneyLabel(contract.depositPrice) + '</strong></div></div><div class="contract-live-progress" aria-label="Đã qua ' + contractProgress(contract) + '% thời hạn"><span style="width:' + contractProgress(contract) + '%"></span></div><div class="contract-live-countdown ' + countdownClass + '" data-contract-countdown="' + esc(contract.id) + '">' + countdown + '</div><div class="live-action-row"><button class="billing-filter" data-contract-action="detail" data-contract-id="' + esc(contract.id) + '">Chi tiết</button>' + (status === 'waiting' ? '<button class="btn-primary" data-contract-action="sign" data-contract-id="' + esc(contract.id) + '">Ký xác nhận</button>' : status === 'ended' || status === 'cancelled' ? '' : '<button class="btn-primary" data-contract-action="renew" data-contract-id="' + esc(contract.id) + '">Yêu cầu gia hạn</button>') + '<button class="billing-filter" data-contract-action="invoices" data-contract-id="' + esc(contract.id) + '">Hóa đơn phòng</button></div></article>';
        }).join('');
        notifyContractDeadlines(contracts, now);
    }

    function contractDetails(contract) {
        const apartment = apartmentFor(contract.apartmentId);
        const building = buildingFor(contract.buildingId || (apartment && apartment.buildingId));
        const coResidents = Array.isArray(contract.occupants) ? contract.occupants : Array.isArray(contract.residents) ? contract.residents : [];
        const assets = Array.isArray(contract.handoverAssets) ? contract.handoverAssets : Array.isArray(contract.assets) ? contract.assets : [];
        const appendices = Array.isArray(contract.appendices) ? contract.appendices : [];
        const history = Array.isArray(contract.history) ? contract.history : [];
        const relatedInvoices = portfolioInvoices().filter(invoice => invoice.contractId === contract.id);
        const list = (values, fallback) => values.length ? '<ul>' + values.map(value => '<li>' + esc(typeof value === 'string' ? value : value.name || value.fullName || value.title || 'Thông tin hồ sơ') + '</li>').join('') + '</ul>' : '<p>' + fallback + '</p>';
        const documentActions = '<div class="live-action-row"><button class="billing-filter" data-contract-action="preview" data-contract-id="' + esc(contract.id) + '"><i class="fas fa-eye"></i> Xem trước / In PDF</button>' + (Array.isArray(contract.files) && contract.files.length ? '<button class="billing-filter" data-contract-action="download" data-contract-id="' + esc(contract.id) + '"><i class="fas fa-download"></i> Tải tài liệu</button>' : '') + '</div>';
        return '<div class="live-detail-list"><div class="live-detail-row"><span>Tòa nhà</span><strong>' + esc(building && building.name || '—') + '</strong></div><div class="live-detail-row"><span>Phòng</span><strong>' + esc(apartment && apartment.name || '—') + '</strong></div><div class="live-detail-row"><span>Thời hạn</span><strong>' + esc(fmtDate(contract.startDate) + ' – ' + fmtDate(contract.endDate)) + '</strong></div><div class="live-detail-row"><span>Tiền thuê / cọc</span><strong>' + moneyLabel(contract.rentPrice) + ' / ' + moneyLabel(contract.depositPrice) + '</strong></div><h3>Điều khoản</h3><p>' + esc(contract.note || 'Điều khoản chi tiết được lưu trong tài liệu hợp đồng.') + '</p><h3>Người ở cùng</h3>' + list(coResidents, 'Chưa có người ở cùng được ghi nhận.') + '<h3>Tài sản bàn giao</h3>' + list(assets, 'Danh sách tài sản sẽ hiển thị khi Ban quản lý cập nhật biên bản bàn giao.') + '<h3>Lịch sử gia hạn</h3>' + list(history, 'Chưa có lịch sử gia hạn.') + '<h3>Phụ lục</h3>' + list(appendices, 'Chưa có phụ lục.') + '<h3>Hóa đơn của phòng</h3>' + list(relatedInvoices.map(invoice => (invoice.code || invoice.id) + ' · ' + moneyLabel(invoice.total)), 'Chưa có hóa đơn liên kết.') + '</div>' + documentActions + '<div class="live-action-row"><button class="btn-primary" data-contract-action="renew" data-contract-id="' + esc(contract.id) + '">Yêu cầu gia hạn</button><button class="billing-filter" data-contract-action="terminate" data-contract-id="' + esc(contract.id) + '">Yêu cầu chấm dứt</button></div>';
    }

    function submitRenewal(contract, duration, note) {
        const request = window.RHD.create('supportRequests', {
            code: window.RHD.nextSupportCode(), buildingId: contract.buildingId || '', apartmentId: contract.apartmentId || '', customerId: contract.customerId || residentCustomerId(),
            residentEmail: window.RH_SESSION && window.RH_SESSION.email || '', residentName: window.RH_SESSION && window.RH_SESSION.name || '',
            category: 'Hợp đồng', title: 'Yêu cầu gia hạn hợp đồng ' + (contract.code || ''),
            description: 'Thời hạn mong muốn: ' + duration + ' tháng.' + (note ? ' Ghi chú: ' + note : ''), location: 'Phòng ' + ((apartmentFor(contract.apartmentId) || {}).name || ''),
            priority: 'normal', status: 'new', assignee: '', attachments: 0, messages: []
        });
        if (!request.ok) throw new Error(request.error || 'Không gửi được yêu cầu gia hạn.');
        const result = window.RHD.update('contracts', contract.id, { renewalRequest: { status: 'submitted', durationMonths: duration, note: note, requestId: request.item.id, createdAt: Date.now() } });
        if (!result.ok) throw new Error(result.error || 'Đã tạo yêu cầu nhưng không thể cập nhật hợp đồng.');
    }

    function notifyContractDeadlines(contracts, now) {
        const key = 'residenthub_contract_notices_' + userKey();
        let sent = {};
        try { sent = JSON.parse(localStorage.getItem(key) || '{}'); } catch (error) { sent = {}; }
        contracts.forEach(contract => {
            if (contractStatus(contract, now) === 'ended' || !contract.endDate) return;
            const days = clock.daysRemaining(contract.endDate, now);
            if (![60, 30, 7].includes(days)) return;
            const noticeKey = contract.id + ':' + days;
            if (sent[noticeKey]) return;
            sent[noticeKey] = true;
            sendNotification('Hợp đồng sắp hết hạn', 'Hợp đồng ' + (contract.code || '') + ' còn ' + days + ' ngày. Bạn có thể gửi đề nghị gia hạn.', 'contract');
        });
        try { localStorage.setItem(key, JSON.stringify(sent)); } catch (error) { /* Không chặn giao diện nếu bộ nhớ đầy. */ }
    }

    function renderAll() {
        populateResidenceFilters();
        renderInvoiceRows();
        renderContracts();
        lastRenderedDay = todayKey();
        lastPeriod = currentPeriod().label;
    }

    function refreshResidentWorkspace(change) {
        renderAll();
        if (change && change.entity === 'invoices' && !internalInvoiceWrite) document.getElementById('invoiceChangeAlert').hidden = false;
    }
    window.refreshResidentWorkspace = refreshResidentWorkspace;

    document.getElementById('invoiceBuildingFilter').addEventListener('change', () => { pageSize = 10; populateResidenceFilters(); renderInvoiceRows(); });
    document.getElementById('invoiceRoomFilter').addEventListener('change', () => { pageSize = 10; renderInvoiceRows(); });
    document.getElementById('invoicePeriodFilter').addEventListener('change', () => { pageSize = 10; renderInvoiceRows(); });
    document.getElementById('invoiceSort').addEventListener('change', renderInvoiceRows);
    document.getElementById('billingSearch').addEventListener('input', () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => { pageSize = 10; renderInvoiceRows(); }, 300);
    });
    document.getElementById('contractLiveSearch').addEventListener('input', renderContracts);
    document.addEventListener('click', event => {
        const invoiceTab = event.target.closest('[data-invoice-filter]');
        if (invoiceTab) {
            activeInvoiceFilter = invoiceTab.dataset.invoiceFilter;
            document.querySelectorAll('[data-invoice-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === invoiceTab)));
            pageSize = 10;
            renderInvoiceRows();
            return;
        }
        const contractTab = event.target.closest('[data-contract-filter]');
        if (contractTab) {
            activeContractFilter = contractTab.dataset.contractFilter;
            document.querySelectorAll('[data-contract-filter]').forEach(button => button.setAttribute('aria-pressed', String(button === contractTab)));
            renderContracts();
            return;
        }
        const invoiceAction = event.target.closest('[data-invoice-action]');
        if (invoiceAction) {
            const action = invoiceAction.dataset.invoiceAction;
            const invoice = portfolioInvoices().find(item => item.id === invoiceAction.dataset.invoiceId);
            if (action === 'contact') {
                document.querySelector('.nav-item[data-target="requests"]')?.click();
                return;
            }
            if (action === 'refresh') {
                window.RH_CTX = window.RHD.residentContext(window.RH_SESSION);
                renderAll();
                document.getElementById('invoiceChangeAlert').hidden = true;
                return;
            }
            if (action === 'close-dialog') { closeDialog(); return; }
            if (action === 'pay-selected') { openPayment([...selectedInvoices]); return; }
            if (action === 'pay-one' && invoice) { closeDrawer(); openPayment([invoice.id]); return; }
            if (action === 'payment-confirm') { submitPayment(invoiceAction.dataset.invoiceIds.split(',').filter(Boolean), invoiceAction); return; }
            if (!invoice) return;
            if (action === 'detail') { openDrawer('Hóa đơn ' + (invoice.code || ''), invoiceDetail(invoice)); return; }
            if (action === 'copy') { navigator.clipboard?.writeText(invoice.code || invoice.id).then(() => toast('Đã sao chép mã hóa đơn.')).catch(() => toast('Không thể sao chép mã hóa đơn trên trình duyệt này.')); return; }
            if (action === 'print') { printInvoice(invoice); return; }
            if (action === 'complaint') { complainAbout(invoice); return; }
        }
        const contractAction = event.target.closest('[data-contract-action]');
        if (contractAction) {
            const action = contractAction.dataset.contractAction;
            const contract = portfolioContracts().find(item => item.id === contractAction.dataset.contractId);
            if (action === 'contact') { document.querySelector('.nav-item[data-target="requests"]')?.click(); return; }
            if (!contract) return;
            if (action === 'detail') { openDrawer('Hợp đồng ' + (contract.code || ''), contractDetails(contract)); return; }
            if (action === 'invoices') {
                document.getElementById('invoiceRoomFilter').value = contract.apartmentId;
                document.querySelector('.nav-item[data-target="invoices"]')?.click();
                renderInvoiceRows();
                return;
            }
            if (action === 'preview') {
                const apartment = apartmentFor(contract.apartmentId);
                const building = buildingFor(contract.buildingId);
                openDrawer('Bản xem trước · ' + (contract.code || ''), '<div class="live-detail-list"><h2>HỢP ĐỒNG THUÊ NHÀ</h2><div class="live-detail-row"><span>Mã hợp đồng</span><strong>' + esc(contract.code) + '</strong></div><div class="live-detail-row"><span>Bên thuê</span><strong>' + esc((window.RH_CTX.customer && window.RH_CTX.customer.fullName) || window.RH_SESSION.name) + '</strong></div><div class="live-detail-row"><span>Căn hộ</span><strong>' + esc(building && building.name || '') + ' / ' + esc(apartment && apartment.name || '') + '</strong></div><div class="live-detail-row"><span>Thời hạn</span><strong>' + esc(fmtDate(contract.startDate) + ' - ' + fmtDate(contract.endDate)) + '</strong></div><div class="live-detail-row"><span>Tiền thuê</span><strong>' + moneyLabel(contract.rentPrice) + '</strong></div><div class="live-detail-row"><span>Tiền cọc</span><strong>' + moneyLabel(contract.depositPrice) + '</strong></div></div><button type="button" class="btn-primary" onclick="window.print()" style="width:100%;margin-top:1rem">In / Lưu PDF</button>');
                return;
            }
            if (action === 'download') {
                const file = (contract.files || [])[0];
                if (!file || !(file.dataUrl || file.url)) return toast('Hợp đồng chưa có tài liệu tải xuống.');
                const link = document.createElement('a'); link.href = file.dataUrl || file.url; link.download = file.name || 'hop-dong'; link.click(); return;
            }
            if (action === 'renew') {
                if (contract.renewalRequest && contract.renewalRequest.status === 'submitted') {
                    showDialog('Yêu cầu gia hạn đang chờ duyệt', '<p>Yêu cầu gia hạn đã được gửi. Bạn có thể hủy yêu cầu nếu Ban quản lý chưa xử lý.</p><div class="live-action-row"><button class="billing-filter" data-contract-action="cancel-renewal" data-contract-id="' + esc(contract.id) + '">Hủy yêu cầu</button><button class="btn-secondary" data-contract-action="close-dialog">Đóng</button></div>');
                } else {
                    showDialog('Yêu cầu gia hạn hợp đồng', '<form id="renewalForm"><label>Thời hạn muốn gia hạn</label><select name="duration" required><option value="3">3 tháng</option><option value="6">6 tháng</option><option value="12" selected>12 tháng</option></select><label>Ghi chú</label><textarea name="note" maxlength="1000" rows="3"></textarea><p id="renewalError" role="alert"></p><div class="live-action-row"><button type="button" class="billing-filter" data-contract-action="close-dialog">Hủy</button><button type="submit" class="btn-primary">Gửi yêu cầu</button></div></form>');
                    document.getElementById('renewalForm').addEventListener('submit', formEvent => {
                        formEvent.preventDefault();
                        const form = formEvent.currentTarget;
                        const duration = Number(new FormData(form).get('duration'));
                        const note = String(new FormData(form).get('note') || '').trim();
                        if (![3, 6, 12].includes(duration)) { document.getElementById('renewalError').textContent = 'Vui lòng chọn thời hạn 3, 6 hoặc 12 tháng.'; return; }
                        try { submitRenewal(contract, duration, note); closeDialog(); renderAll(); toast('Đã gửi yêu cầu gia hạn.'); }
                        catch (error) { document.getElementById('renewalError').textContent = error.message; }
                    });
                }
                return;
            }
            if (action === 'cancel-renewal') {
                const result = window.RHD.update('contracts', contract.id, { renewalRequest: Object.assign({}, contract.renewalRequest, { status: 'cancelled', cancelledAt: Date.now() }) });
                if (!result.ok) return toast(result.error || 'Không thể hủy yêu cầu.');
                closeDialog(); renderAll(); toast('Đã hủy yêu cầu gia hạn.'); return;
            }
            if (action === 'sign') {
                if (!window.confirm('Bạn xác nhận đã đọc và đồng ý ký hợp đồng ' + (contract.code || '') + '?')) return;
                const result = window.RHD.update('contracts', contract.id, { status: 'active', signedAt: Date.now() });
                if (!result.ok) return toast(result.error || 'Không thể cập nhật chữ ký.');
                renderAll(); toast('Đã ghi nhận xác nhận hợp đồng.'); return;
            }
            if (action === 'terminate') {
                const days = contract.endDate ? clock.daysRemaining(contract.endDate) : null;
                const noticeDays = Number(contract.noticeDays) || 30;
                if (!window.confirm('Hợp đồng quy định báo trước ' + noticeDays + ' ngày. Thời hạn còn lại: ' + (days == null ? 'chưa xác định' : days + ' ngày') + '. Tiền cọc dự kiến đối soát: ' + moneyLabel(contract.depositPrice) + '. Tiếp tục bước xác nhận?')) return;
                if (!window.confirm('Xác nhận gửi yêu cầu chấm dứt hợp đồng ' + (contract.code || '') + '? Ban quản lý sẽ kiểm tra tiền cọc và thời hạn báo trước.')) return;
                const request = window.RHD.create('supportRequests', { code: window.RHD.nextSupportCode(), buildingId: contract.buildingId || '', apartmentId: contract.apartmentId || '', customerId: contract.customerId || residentCustomerId(), residentEmail: window.RH_SESSION.email || '', residentName: window.RH_SESSION.name || '', category: 'Hợp đồng', title: 'Yêu cầu chấm dứt hợp đồng ' + (contract.code || ''), description: 'Đề nghị chấm dứt hợp đồng. Quy định báo trước: ' + noticeDays + ' ngày; số ngày còn lại theo hệ thống: ' + (days == null ? 'chưa xác định' : days) + '. Tiền cọc dự kiến đối soát: ' + moneyLabel(contract.depositPrice) + '.', location: 'Phòng ' + ((apartmentFor(contract.apartmentId) || {}).name || ''), priority: 'normal', status: 'new', assignee: '', attachments: 0, messages: [] });
                if (!request.ok) return toast(request.error || 'Không thể gửi yêu cầu chấm dứt.');
                toast(days !== null && days < noticeDays ? 'Yêu cầu đã gửi. Thời gian báo trước chưa đủ; Ban quản lý sẽ giải thích khoản đối soát.' : 'Đã gửi yêu cầu chấm dứt hợp đồng.');
            }
        }
    });

    document.addEventListener('change', event => {
        if (event.target.matches('[data-invoice-select]')) {
            const id = event.target.dataset.invoiceSelect;
            if (event.target.checked) selectedInvoices.add(id); else selectedInvoices.delete(id);
            updatePaymentBar(invoicesForView());
        }
        if (event.target.id === 'invoiceSelectVisible') {
            const visible = invoicesForView().filter(invoice => isPayable(invoice) && (activeInvoiceFilter === 'all' || displayStatus(invoice.effectiveStatus)[1] === activeInvoiceFilter));
            visible.forEach(invoice => event.target.checked ? selectedInvoices.add(invoice.id) : selectedInvoices.delete(invoice.id));
            renderInvoiceRows();
        }
    });

    document.getElementById('invoicePaySelected').addEventListener('click', () => openPayment([...selectedInvoices]));
    document.getElementById('invoiceLoadMore').addEventListener('click', () => { pageSize += 10; renderInvoiceRows(); });
    drawer.querySelector('.live-drawer-close').addEventListener('click', closeDrawer);
    drawer.addEventListener('click', event => { if (event.target === drawer) closeDrawer(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') { closeDrawer(); closeDialog(); }
        if (event.key === 'Enter' && event.target.matches('#billingRows tr[data-invoice-id]')) {
            openDrawer('Hóa đơn', invoiceDetail(portfolioInvoices().find(invoice => invoice.id === event.target.dataset.invoiceId)));
        }
    });
    document.getElementById('billingRows').addEventListener('click', event => {
        if (event.target.closest('button,input')) return;
        const row = event.target.closest('[data-invoice-id]');
        if (!row) return;
        const invoice = portfolioInvoices().find(item => item.id === row.dataset.invoiceId);
        if (invoice) openDrawer('Hóa đơn ' + (invoice.code || ''), invoiceDetail(invoice));
    });
    document.getElementById('liveDialogContent').addEventListener('click', event => {
        const action = event.target.closest('[data-contract-action]');
        if (action && action.dataset.contractAction === 'close-dialog') closeDialog();
    });
    if (topbarClock) {
        clock.start(now => {
            const weekday = new Intl.DateTimeFormat('vi-VN', { timeZone: clock.TIME_ZONE, weekday: 'long' }).format(now);
            document.getElementById('residentClockDate').textContent = weekday + ', ' + clock.formatDate(now);
            document.getElementById('residentClockTime').textContent = new Intl.DateTimeFormat('vi-VN', { timeZone: clock.TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now);
            const day = clock.dateKey(now);
            const period = currentPeriod(now).label;
            updateCountdowns(now);
            if (day !== lastRenderedDay || period !== lastPeriod) renderAll();
            contractSection.querySelectorAll('[data-contract-countdown]').forEach(element => {
                const contract = portfolioContracts().find(item => item.id === element.dataset.contractCountdown);
                if (!contract || !contract.endDate) return;
                const days = clock.daysRemaining(contract.endDate, now);
                element.textContent = days < 0 ? 'Đã hết hạn ' + Math.abs(days) + ' ngày' : 'Còn ' + days + ' ngày hết hạn';
            });
        });
    }

    requestAnimationFrame(() => {
        populateResidenceFilters();
        renderAll();
    });
})();