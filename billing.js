/*
 * ResidentHub - billing engine (RHB): monthly invoice generation + invoice workflow.
 *
 * One engine for both automatic and manual invoices, reading only real data:
 *   Building  -> billingDay, autoInvoice, services (unit price, tax, calc method)
 *   Contract  -> tenant, rent, payment cycle, start/end, selected services + price overrides
 *   Meters    -> CLOSED *and APPROVED* readings only (Ghi chỉ số); never estimated
 * and writing invoices into the same RHD 'invoices' store the manual form uses.
 *
 * Workflow (status):
 *   draft (Bản nháp) -> approved (Đã duyệt) -> unpaid (Đã phát hành) -> sent -> paid / overdue
 *   An issued invoice is never edited in place: it is adjusted with a linked
 *   "adjustment" invoice, or cancelled (status 'cancelled', with a reason).
 *   Only issued statuses (unpaid/sent/paid/overdue) reach residents and the
 *   Dashboard figures — see RHD.isIssuedInvoice in data.js.
 *
 * Idempotency: every automatic invoice has a key contractId|YYYY-MM|monthly that
 * is recorded in the 'billingRuns' ledger. Re-running (or running in several
 * tabs) never creates a second invoice for the same contract + period, and a
 * draft the manager deliberately deleted is not re-created.
 *
 * Catch-up: run() walks every period from the building's autoInvoiceFrom up to
 * today, so periods whose billing day passed while nothing was running are
 * generated on the next run (issueDate stays the real billing date).
 *
 * Scheduling: this project has no backend — all data lives in the browser's
 * localStorage — so run() is triggered by the manager workspace (on load, hourly
 * and on demand). The module is pure and has no DOM dependency, so a server
 * cron can call RHB.run() unchanged once the data moves to a backend.
 *
 * Depends on: data.js (RHD).
 */
(function (global) {
    var CYCLE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
    var ISSUED = ['unpaid', 'sent', 'paid', 'overdue'];
    var EDITABLE = ['draft', 'approved'];
    var ENDED_CONTRACT = ['ended', 'terminated', 'liquidated', 'settled', 'closed', 'deposit', 'deposited', 'forfeited', 'deposit_forfeited'];

    var INVOICE_TYPES = [
        { id: 'monthly', label: 'Hóa đơn định kỳ', templateCategory: 'Định kỳ hàng tháng' },
        { id: 'deposit', label: 'Đặt cọc', templateCategory: 'Đặt cọc' },
        { id: 'deposit_refund', label: 'Hoàn cọc', templateCategory: 'Đặt cọc' },
        { id: 'incidental', label: 'Phí phát sinh', templateCategory: '' },
        { id: 'liquidation', label: 'Thanh lý hợp đồng', templateCategory: 'Thanh lý / Chuyển phòng' },
        { id: 'renewal', label: 'Gia hạn hợp đồng', templateCategory: '' },
        { id: 'adjustment', label: 'Điều chỉnh', templateCategory: '' }
    ];

    var METER_LABEL = { electricity: { name: 'điện', unit: 'kWh' }, water: { name: 'nước', unit: 'm³' } };

    // ------------------------------------------------------------- dates

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function today() { return isoDate(new Date()); }
    function monthOf(iso) { return String(iso || '').slice(0, 7); }
    function daysInMonth(period) { var p = period.split('-'); return new Date(Number(p[0]), Number(p[1]), 0).getDate(); }
    function addMonths(period, n) {
        var p = period.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1);
    }
    function monthsBetween(from, to) {
        var a = from.split('-'), b = to.split('-');
        return (Number(b[0]) - Number(a[0])) * 12 + (Number(b[1]) - Number(a[1]));
    }
    function dayDiff(fromIso, toIso) { return Math.round((new Date(toIso + 'T00:00:00') - new Date(fromIso + 'T00:00:00')) / 86400000); }
    function addDays(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
    function periodLabel(period) { return period ? period.slice(5, 7) + '/' + period.slice(0, 4) : ''; }

    // Billing day 1–31; months without that day bill on their last day (31 -> 30/04, 28|29/02).
    function billingDate(period, billingDay) {
        var day = Math.min(Math.max(1, Number(billingDay) || 1), daysInMonth(period));
        return period + '-' + pad(day);
    }

    // ------------------------------------------------------------- lookups

    function typeMeta(id) { return INVOICE_TYPES.filter(function (t) { return t.id === id; })[0] || INVOICE_TYPES[0]; }
    function isIssued(inv) { return !!inv && ISSUED.indexOf(inv.status) !== -1; }
    function isEditable(inv) { return !!inv && EDITABLE.indexOf(inv.status || 'draft') !== -1; }
    function invoiceType(inv) { return (inv && inv.type) || 'monthly'; }

    function contractEnded(contract) {
        return ENDED_CONTRACT.indexOf(String(contract.status || '').toLowerCase()) !== -1;
    }

    // The latest closed + approved reading of one meter for one period.
    // (meters store: meterType electricity|water, periodMonth, approvalStatus
    //  'đã_duyệt' — legacy rows used status 'đã_chốt' to mean approved.)
    function approvedReading(apartmentId, meterType, period) {
        var rows = RHD.list('meters').filter(function (m) {
            return m.apartmentId === apartmentId && m.meterType === meterType && m.periodMonth === period;
        }).sort(function (a, b) { return (b.recordedAt || b.createdAt || 0) - (a.recordedAt || a.createdAt || 0); });
        var latest = rows[0] || null;
        if (!latest) return { reading: null, state: 'missing' };
        var approved = latest.approvalStatus ? latest.approvalStatus === 'đã_duyệt' : latest.status === 'đã_chốt';
        var closed = latest.latestIndex !== undefined && latest.latestIndex !== null && latest.latestIndex !== '' && isFinite(Number(latest.latestIndex));
        if (!closed) return { reading: latest, state: 'missing' };
        return { reading: latest, state: approved ? 'approved' : 'unapproved' };
    }

    // Share (0–1] of [fromIso, toIso] that the contract actually covers.
    function occupiedShare(contract, fromIso, toIso) {
        var start = contract.startDate && contract.startDate > fromIso ? contract.startDate : fromIso;
        var end = contract.endDate && contract.endDate < toIso ? contract.endDate : toIso;
        if (start > end) return { share: 0, days: 0, total: dayDiff(fromIso, toIso) + 1 };
        var total = dayDiff(fromIso, toIso) + 1;
        var days = dayDiff(start, end) + 1;
        return { share: days / total, days: days, total: total };
    }

    function line(serviceId, label, qty, unitPrice, taxRate, extra) {
        var amount = Math.round(Number(qty) * Number(unitPrice));
        var tax = Math.round(amount * (Number(taxRate) || 0) / 100);
        return Object.assign({ serviceId: serviceId, label: label, qty: Number(qty), unitPrice: Number(unitPrice), taxRate: Number(taxRate) || 0, amount: amount, tax: tax }, extra || {});
    }

    function totals(items) {
        var subtotal = items.reduce(function (s, it) { return s + (Number(it.amount) || 0); }, 0);
        var tax = items.reduce(function (s, it) { return s + (Number(it.tax) || 0); }, 0);
        return { subtotal: subtotal, tax: tax, total: subtotal + tax };
    }

    // ------------------------------------------------------- monthly charges

    /*
     * Charges of one contract for billing period YYYY-MM (calendar month).
     *  - Rent follows the CONTRACT's payment cycle: billed in the months where
     *    (period - start month) % cycle == 0, for the whole cycle, prorated by
     *    the days the contract covers (start/end mid-period).
     *  - Utilities (meter services) are billed every month from APPROVED readings
     *    of the consumption month (building.meterPeriod: 'previous' = month
     *    before the billing period [default], 'current' = same month).
     *    Missing / unapproved reading -> line flagged, amount 0, invoice issue.
     *  - Other services are monthly fees prorated by occupied days.
     * Prices are read at calculation time and snapshotted into the lines, so a
     * later price change only affects invoices calculated after it.
     * Returns null when the contract does not cover the period at all.
     */
    function computeMonthly(contract, period) {
        if (!contract || !period) return null;
        var building = RHD.get('buildings', contract.buildingId);
        if (!building) return null;
        var periodStart = period + '-01';
        var periodEnd = period + '-' + pad(daysInMonth(period));
        var month = occupiedShare(contract, periodStart, periodEnd);
        if (!month.days) return null;

        var items = [];
        var issues = [];

        // Rent per contract cycle.
        var cycle = CYCLE_MONTHS[contract.paymentCycle] || 1;
        var startMonth = monthOf(contract.startDate) || period;
        var offset = monthsBetween(startMonth, period);
        if (offset >= 0 && offset % cycle === 0) {
            var cycleEndPeriod = addMonths(period, cycle - 1);
            var cycleEnd = cycleEndPeriod + '-' + pad(daysInMonth(cycleEndPeriod));
            var months = 0;
            for (var i = 0; i < cycle; i++) {
                var p = addMonths(period, i);
                months += occupiedShare(contract, p + '-01', p + '-' + pad(daysInMonth(p))).share;
            }
            months = Math.round(months * 10000) / 10000;
            var rentLabel = 'Tiền thuê nhà ' + (cycle === 1 ? 'tháng ' + periodLabel(period) : periodLabel(period) + ' – ' + periodLabel(cycleEndPeriod) + ' (' + cycle + ' tháng)');
            if (months < cycle) rentLabel += cycle === 1 ? ' (' + month.days + '/' + month.total + ' ngày)' : ' (tính theo ngày ở thực tế)';
            items.push(line('rent', rentLabel, months, Number(contract.rentPrice) || 0, 0, { kind: 'rent', coverFrom: periodStart, coverTo: cycleEnd }));
        }

        var serviceIds = contract.serviceIds || [];
        var overrides = contract.serviceOverrides || {};
        var consumption = building.meterPeriod === 'current' ? period : addMonths(period, -1);
        (building.services || []).forEach(function (s) {
            if (s.feeType === 'rent' || s.feeType === 'deposit' || serviceIds.indexOf(s.id) === -1) return;
            var unitPrice = overrides[s.id] != null && overrides[s.id] !== '' ? Number(overrides[s.id]) : Number(s.unitPrice) || 0;
            if (s.calcMethod === 'meter') {
                var meterType = s.feeType === 'water' ? 'water' : 'electricity';
                // Tenant must have lived there during the consumption month.
                var cStart = consumption + '-01', cEnd = consumption + '-' + pad(daysInMonth(consumption));
                if (!occupiedShare(contract, cStart, cEnd).days) return;
                var found = approvedReading(contract.apartmentId, meterType, consumption);
                var meta = METER_LABEL[meterType];
                if (found.state === 'approved') {
                    var qty = Number(found.reading.consumption) || 0;
                    items.push(line(s.id, s.name + ' tháng ' + periodLabel(consumption) + ' (' + qty + ' ' + meta.unit + ': ' + found.reading.previousIndex + ' → ' + found.reading.latestIndex + ')', qty, unitPrice, s.taxRate, { kind: 'meter', meterId: found.reading.id, consumptionPeriod: consumption }));
                } else {
                    var msg = found.state === 'unapproved'
                        ? 'Chỉ số ' + meta.name + ' tháng ' + periodLabel(consumption) + ' đã chốt nhưng chưa được duyệt'
                        : 'Chưa có chỉ số ' + meta.name + ' tháng ' + periodLabel(consumption);
                    issues.push(msg);
                    items.push(line(s.id, s.name + ' tháng ' + periodLabel(consumption) + ' — ' + msg.toLowerCase(), 0, unitPrice, s.taxRate, { kind: 'meter', missing: true, consumptionPeriod: consumption }));
                }
                return;
            }
            var share = Math.round(month.share * 10000) / 10000;
            var label = s.name + ' tháng ' + periodLabel(period) + (share < 1 ? ' (' + month.days + '/' + month.total + ' ngày)' : '');
            items.push(line(s.id, label, share, unitPrice, s.taxRate, { kind: 'service' }));
        });

        return Object.assign({ items: items, issues: issues, periodStart: periodStart, periodEnd: periodEnd }, totals(items));
    }

    // Lines a new manual invoice of a given type starts with (all editable).
    function prefill(type, contract, period) {
        if (!contract) return { items: [], issues: [] };
        var deposit = Number(contract.depositPrice) || 0;
        var simple = function (label, amount) { var items = [line(type, label, 1, amount, 0)]; return Object.assign({ items: items, issues: [] }, totals(items)); };
        switch (type) {
            case 'monthly': return computeMonthly(contract, period) || Object.assign({ items: [], issues: ['Hợp đồng không có hiệu lực trong kỳ ' + periodLabel(period)] }, totals([]));
            case 'deposit': return simple('Tiền đặt cọc hợp đồng ' + (contract.code || ''), deposit);
            case 'deposit_refund': return simple('Hoàn tiền cọc hợp đồng ' + (contract.code || ''), -deposit);
            case 'liquidation': return simple('Thanh lý hợp đồng ' + (contract.code || ''), 0);
            case 'renewal': return simple('Phí gia hạn hợp đồng ' + (contract.code || ''), 0);
            case 'incidental': return simple('Phí phát sinh', 0);
            default: return simple('Khoản điều chỉnh', 0);
        }
    }

    // Recomputes amount/tax of edited lines; a "missing reading" line stays an
    // issue until the manager enters an amount for it (manual override).
    function normalizeLines(items) {
        var issues = [];
        var out = (items || []).map(function (it) {
            var l = line(it.serviceId || 'custom', String(it.label || '').trim() || 'Khoản phí', Number(it.qty) || 0, Number(it.unitPrice) || 0, it.taxRate, {
                kind: it.kind || 'custom', meterId: it.meterId, consumptionPeriod: it.consumptionPeriod, coverFrom: it.coverFrom, coverTo: it.coverTo
            });
            if (it.missing && !l.amount) { l.missing = true; issues.push('Cần nhập: ' + l.label); }
            else if (it.missing) l.manualOverride = true;
            return l;
        });
        return Object.assign({ items: out, issues: issues }, totals(out));
    }

    // ------------------------------------------------------- duplicates

    function sameMonthlyInvoice(contractId, period, exceptId) {
        return RHD.list('invoices').filter(function (inv) {
            return inv.id !== exceptId && inv.contractId === contractId && inv.period === period &&
                invoiceType(inv) === 'monthly' && inv.status !== 'cancelled';
        })[0] || null;
    }

    // ------------------------------------------------------------ ledger

    function metaKey() { return 'residenthub_' + RHD.mode() + '_billingMeta'; }
    function readMeta() { try { return JSON.parse(localStorage.getItem(metaKey()) || '{}'); } catch (e) { return {}; } }
    function writeMeta(m) { localStorage.setItem(metaKey(), JSON.stringify(m)); }
    function ledgerHas(key) { return RHD.list('billingRuns').some(function (r) { return r.key === key; }); }

    // Cross-tab guard: two open tabs must not run the generator at once.
    function acquireLock() {
        var k = metaKey() + '_lock';
        var now = Date.now();
        var held = Number(localStorage.getItem(k) || 0);
        if (held && now - held < 30000) return false;
        localStorage.setItem(k, String(now));
        return true;
    }
    function releaseLock() { localStorage.removeItem(metaKey() + '_lock'); }

    function history(inv, action, actor, note) {
        return (inv && inv.history || []).concat([{ at: Date.now(), action: action, by: actor || 'Hệ thống', note: note || '' }]);
    }

    function dueDateFor(building, issueDate) {
        var days = building && building.dueDays !== '' && building.dueDays != null ? Number(building.dueDays) : NaN;
        return isFinite(days) && days >= 0 ? addDays(issueDate, days) : RHD.defaultDueDate(issueDate);
    }

    function templateFor(type, contract, building) {
        var cat = typeMeta(type).templateCategory;
        if (cat && global.RHT && type !== 'monthly') {
            var match = global.RHT.list('INVOICE').filter(function (t) { return t.category === cat; })[0];
            if (match) return match.id;
        }
        return (contract && contract.invoiceTemplateId) || (building && building.invoiceTemplateId) || '';
    }

    /*
     * Generates every due monthly draft. Safe to call any number of times.
     * opts.today (YYYY-MM-DD) is for tests / a server cron.
     * Returns { created: [invoice], duplicates, skipped: [{key, reason}], ran }.
     */
    function run(opts) {
        opts = opts || {};
        var todayIso = opts.today || today();
        var result = { created: [], duplicates: 0, skipped: [], ran: false, today: todayIso };
        if (!acquireLock()) return result;
        try {
            result.ran = true;
            var currentPeriod = monthOf(todayIso);
            RHD.list('buildings').forEach(function (b) {
                if (b.active === false || !b.autoInvoice || !b.billingDay) return;
                var from = b.autoInvoiceFrom || currentPeriod;
                var contracts = RHD.list('contracts').filter(function (c) { return c.buildingId === b.id; });
                for (var period = from; period <= currentPeriod; period = addMonths(period, 1)) {
                    var issueDate = billingDate(period, b.billingDay);
                    if (issueDate > todayIso) continue; // billing day not reached yet
                    contracts.forEach(function (c) {
                        // A liquidated contract is still caught up for the periods it ran;
                        // without a usable end date it is not billed any more.
                        if (contractEnded(c) && (!c.endDate || period > monthOf(c.endDate))) return;
                        var key = c.id + '|' + period + '|monthly';
                        if (ledgerHas(key)) return;
                        var existing = sameMonthlyInvoice(c.id, period);
                        if (existing) { // e.g. created manually first: link it, never duplicate
                            RHD.create('billingRuns', { key: key, invoiceId: existing.id, buildingId: b.id, contractId: c.id, period: period, linked: true });
                            result.duplicates++;
                            return;
                        }
                        var calc = computeMonthly(c, period);
                        if (!calc) return; // contract not active in this period
                        var data = {
                            code: RHD.nextInvoiceCode(),
                            type: 'monthly', source: 'auto', status: 'draft',
                            contractId: c.id, buildingId: b.id, apartmentId: c.apartmentId, customerId: c.customerId,
                            invoiceTemplateId: templateFor('monthly', c, b),
                            period: period, periodStart: calc.periodStart, periodEnd: calc.periodEnd,
                            issueDate: issueDate, dueDate: dueDateFor(b, issueDate),
                            items: calc.items, subtotal: calc.subtotal, tax: calc.tax, total: calc.total,
                            issues: calc.issues, billingKey: key, catchUp: issueDate < todayIso,
                            history: history(null, 'auto_created', 'Hệ thống', issueDate < todayIso ? 'Chạy bù kỳ ' + periodLabel(period) : '')
                        };
                        var res = RHD.create('invoices', data);
                        if (!res.ok) { result.skipped.push({ key: key, reason: res.error }); return; }
                        RHD.create('billingRuns', { key: key, invoiceId: res.item.id, buildingId: b.id, contractId: c.id, period: period });
                        result.created.push(res.item);
                    });
                }
            });
            var meta = readMeta();
            meta.lastRunAt = Date.now();
            meta.lastResult = { created: result.created.length, duplicates: result.duplicates, skipped: result.skipped.length };
            writeMeta(meta);
        } finally {
            releaseLock();
        }
        return result;
    }

    // --------------------------------------------------------- workflow
    // Each returns { ok, item?, error? } and writes the change. Permission
    // checks happen in the UI layer (RHP.guard) before these are called.

    function patch(id, changes) { return RHD.update('invoices', id, Object.assign({ updatedAt: Date.now() }, changes)); }

    function approve(id, actor) {
        var inv = RHD.get('invoices', id);
        if (!inv) return { ok: false, error: 'Không tìm thấy hóa đơn.' };
        if ((inv.status || 'draft') !== 'draft') return { ok: false, error: 'Chỉ duyệt được hóa đơn ở trạng thái Bản nháp.' };
        if ((inv.issues || []).length) return { ok: false, error: 'Hóa đơn còn mục cần kiểm tra: ' + inv.issues.join('; ') + '.' };
        return patch(id, { status: 'approved', approvedAt: Date.now(), approvedBy: actor, history: history(inv, 'approved', actor) });
    }

    function backToDraft(id, actor) {
        var inv = RHD.get('invoices', id);
        if (!inv || inv.status !== 'approved') return { ok: false, error: 'Chỉ hóa đơn Đã duyệt mới trả về Bản nháp.' };
        return patch(id, { status: 'draft', approvedAt: null, approvedBy: '', history: history(inv, 'reopened', actor) });
    }

    // Issue = make it official and visible to the resident.
    function issue(id, actor, send) {
        var inv = RHD.get('invoices', id);
        if (!inv) return { ok: false, error: 'Không tìm thấy hóa đơn.' };
        if (inv.status !== 'approved') return { ok: false, error: 'Hóa đơn phải được duyệt trước khi phát hành.' };
        return patch(id, { status: send ? 'sent' : 'unpaid', issuedAt: Date.now(), issuedBy: actor, sentAt: send ? Date.now() : null, history: history(inv, send ? 'issued_sent' : 'issued', actor) });
    }

    function cancel(id, actor, reason) {
        var inv = RHD.get('invoices', id);
        if (!inv) return { ok: false, error: 'Không tìm thấy hóa đơn.' };
        if (!isIssued(inv)) return { ok: false, error: 'Chỉ hủy được hóa đơn đã phát hành (bản nháp thì xóa trực tiếp).' };
        if (inv.status === 'paid') return { ok: false, error: 'Hóa đơn đã thu tiền: hãy lập hóa đơn điều chỉnh thay vì hủy.' };
        if (!String(reason || '').trim()) return { ok: false, error: 'Vui lòng nhập lý do hủy.' };
        return patch(id, { status: 'cancelled', cancelledAt: Date.now(), cancelledBy: actor, cancelReason: String(reason).trim(), history: history(inv, 'cancelled', actor, reason) });
    }

    // A linked draft carrying only the difference; the original stays as issued.
    function createAdjustment(id, actor) {
        var inv = RHD.get('invoices', id);
        if (!inv) return { ok: false, error: 'Không tìm thấy hóa đơn.' };
        if (!isIssued(inv)) return { ok: false, error: 'Chỉ điều chỉnh hóa đơn đã phát hành; bản nháp thì sửa trực tiếp.' };
        var items = [line('adjustment', 'Điều chỉnh cho hóa đơn ' + inv.code, 1, 0, 0)];
        return RHD.create('invoices', Object.assign({
            code: RHD.nextInvoiceCode(), type: 'adjustment', source: 'manual', status: 'draft',
            contractId: inv.contractId, buildingId: inv.buildingId, apartmentId: inv.apartmentId, customerId: inv.customerId,
            invoiceTemplateId: inv.invoiceTemplateId, period: inv.period, issueDate: today(),
            dueDate: dueDateFor(RHD.get('buildings', inv.buildingId), today()),
            items: items, issues: [], adjustsInvoiceId: inv.id,
            history: history(null, 'created', actor, 'Điều chỉnh ' + inv.code)
        }, totals(items)));
    }

    // Re-reads contract/building/meter data into an editable monthly invoice.
    function recalculate(id, actor) {
        var inv = RHD.get('invoices', id);
        if (!inv || !isEditable(inv)) return { ok: false, error: 'Chỉ tính lại được hóa đơn chưa phát hành.' };
        if (invoiceType(inv) !== 'monthly') return { ok: false, error: 'Chỉ hóa đơn định kỳ mới tính lại từ dữ liệu.' };
        var calc = computeMonthly(RHD.get('contracts', inv.contractId), inv.period);
        if (!calc) return { ok: false, error: 'Hợp đồng không còn hiệu lực trong kỳ ' + periodLabel(inv.period) + '.' };
        return patch(id, { status: 'draft', approvedAt: null, approvedBy: '', items: calc.items, issues: calc.issues, subtotal: calc.subtotal, tax: calc.tax, total: calc.total, history: history(inv, 'recalculated', actor) });
    }

    global.RHB = {
        INVOICE_TYPES: INVOICE_TYPES,
        ISSUED_STATUSES: ISSUED,
        typeMeta: typeMeta,
        invoiceType: invoiceType,
        isIssued: isIssued,
        isEditable: isEditable,
        billingDate: billingDate,
        nextBillingDate: function (building, fromIso) {
            if (!building || !building.billingDay) return '';
            var t = fromIso || today();
            var d = billingDate(monthOf(t), building.billingDay);
            return d >= t ? d : billingDate(addMonths(monthOf(t), 1), building.billingDay);
        },
        computeMonthly: computeMonthly,
        prefill: prefill,
        normalizeLines: normalizeLines,
        sameMonthlyInvoice: sameMonthlyInvoice,
        dueDateFor: dueDateFor,
        templateFor: templateFor,
        history: history,
        run: run,
        lastRun: function () { return readMeta(); },
        approve: approve,
        backToDraft: backToDraft,
        issue: issue,
        cancel: cancel,
        createAdjustment: createAdjustment,
        recalculate: recalculate,
        periodLabel: periodLabel,
        addMonths: addMonths,
        today: today
    };
})(window);
