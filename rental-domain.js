/* ResidentHub lease and deposit domain rules. UI modules call this API instead of
 * implementing occupancy, schedule, deposit, or contract lifecycle rules locally.
 */
(function (global) {
    var DEPOSIT_STATUSES = ['holding', 'contracted', 'cancelled', 'forfeited'];
    var CONTRACT_STATUSES = ['active', 'liquidated', 'forfeited'];
    var MIGRATION_VERSION = 'rental-domain-v2';

    function storageKey(name) {
        return 'residenthub_' + global.RHD.mode() + '_' + name;
    }

    function today() {
        var date = new Date();
        return isoDate(date);
    }

    function isoDate(date) {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function pad(value) { return String(value).padStart(2, '0'); }

    function parseDate(value) {
        var text = String(value || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
        var date = new Date(text + 'T00:00:00');
        return isoDate(date) === text ? date : null;
    }

    function addMonths(dateString, count) {
        var date = parseDate(dateString);
        if (!date) return '';
        var day = date.getDate();
        var target = new Date(date.getFullYear(), date.getMonth() + count, 1);
        var lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(day, lastDay));
        return isoDate(target);
    }

    function defaultEndDate(startDate, months) {
        var end = parseDate(addMonths(startDate, months || 12));
        if (!end) return '';
        end.setDate(end.getDate() - 1);
        return isoDate(end);
    }

    function addDays(dateString, days) {
        var date = parseDate(dateString);
        if (!date) return '';
        date.setDate(date.getDate() + days);
        return isoDate(date);
    }

    function amount(value) {
        var number = Number(value);
        return Number.isFinite(number) ? Math.max(0, number) : 0;
    }

    function calculateDepositFull(rentPrice, depositMonths) {
        var months = Number(depositMonths);
        return amount(rentPrice) * (Number.isFinite(months) && months > 0 ? months : 1);
    }

    function unique(values) {
        return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String)));
    }

    function migrationKey() { return storageKey('migration_' + MIGRATION_VERSION); }

    function lifecycleStatus(contract) {
        if (!contract) return '';
        var status = String(contract.lifecycleStatus || contract.status || '').toLowerCase();
        if (['active', 'signed', 'effective', 'current'].indexOf(status) !== -1) return 'active';
        if (['ended', 'terminated', 'liquidated', 'settled', 'closed'].indexOf(status) !== -1) return 'liquidated';
        if (['deposit', 'deposited', 'forfeited', 'deposit_forfeited'].indexOf(status) !== -1) return 'forfeited';
        return status;
    }

    function initialize() {
        var key = migrationKey();
        if (localStorage.getItem(key) === 'done') return { ok: true, migrated: false };
        try {
            global.RHD.list('contracts').forEach(function (contract) {
                var patch = {};
                if (!contract.lifecycleStatus) patch.lifecycleStatus = lifecycleStatus(contract) || 'active';
                if (!Array.isArray(contract.tenantIds)) patch.tenantIds = unique(Array.isArray(contract.customerIds) ? contract.customerIds : [contract.customerId]);
                if (Object.prototype.hasOwnProperty.call(contract, 'customerIds')) patch.customerIds = undefined;
                if (!Object.prototype.hasOwnProperty.call(contract, 'depositId')) patch.depositId = '';
                if (!Object.prototype.hasOwnProperty.call(contract, 'depositHeldAmount') && contract.depositHeldAmount !== 0) {
                    patch.depositBalanceNeedsReview = true;
                }
                if (Object.keys(patch).length) global.RHD.update('contracts', contract.id, patch);
            });
            global.RHD.list('deposits').forEach(function (deposit) {
                if (DEPOSIT_STATUSES.indexOf(deposit.status) === -1) {
                    global.RHD.update('deposits', deposit.id, { status: 'holding' });
                }
            });
            localStorage.setItem(key, 'done');
            return { ok: true, migrated: true };
        } catch (error) {
            return { ok: false, error: 'Không thể chuyển đổi dữ liệu thuê/cọc: ' + error.message };
        }
    }

    function activeContract(contract) { return lifecycleStatus(contract) === 'active'; }
    function currentContract(contract, asOf) {
        if (!activeContract(contract)) return false;
        return !contract.endDate || contract.endDate >= (asOf || today());
    }
    function holdingDeposit(deposit) { return deposit && deposit.status === 'holding' && !deposit.isDeleted; }

    function sameSpace(left, right) {
        if (!left || !right) return false;
        if (left.buildingId && right.buildingId && left.buildingId !== right.buildingId) return false;
        if (left.apartmentId && right.apartmentId && left.apartmentId !== right.apartmentId) return false;
        if (left.roomId && right.roomId && left.roomId !== right.roomId) return false;
        if (left.bedId && right.bedId && left.bedId !== right.bedId) return false;
        return !!(left.apartmentId || left.roomId || left.bedId) && !!(right.apartmentId || right.roomId || right.bedId);
    }

    function overlaps(startA, endA, startB, endB) {
        return startA <= endB && endA >= startB;
    }

    function scheduleOf(record) {
        return {
            startDate: record.startDate || record.leaseStartDate,
            endDate: record.endDate || record.leaseEndDate
        };
    }

    function checkAvailability(input) {
        initialize();
        var dates = scheduleOf(input || {});
        if (!input || (!input.apartmentId && !input.roomId && !input.bedId)) {
            return { ok: false, error: 'Vui lòng chọn căn hộ, phòng hoặc giường.' };
        }
        if (!parseDate(dates.startDate) || !parseDate(dates.endDate)) {
            return { ok: false, error: 'Vui lòng nhập ngày bắt đầu và ngày kết thúc hợp lệ.' };
        }
        if (dates.endDate <= dates.startDate) {
            return { ok: false, error: 'Ngày kết thúc phải sau ngày bắt đầu.' };
        }
        var candidates = [];
        global.RHD.list('contracts').forEach(function (contract) {
            if (contract.id === input.excludeContractId || !activeContract(contract)) return;
            candidates.push({ type: 'contract', id: contract.id, code: contract.code || contract.id, record: contract });
        });
        global.RHD.list('deposits').forEach(function (deposit) {
            if (deposit.id === input.excludeDepositId || !holdingDeposit(deposit)) return;
            candidates.push({ type: 'deposit', id: deposit.id, code: deposit.code || deposit.id, record: deposit });
        });
        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            var otherDates = scheduleOf(candidate.record);
            if (!sameSpace(input, candidate.record) || !parseDate(otherDates.startDate) || !parseDate(otherDates.endDate)) continue;
            if (overlaps(dates.startDate, dates.endDate, otherDates.startDate, otherDates.endDate)) {
                return {
                    ok: false,
                    conflict: candidate,
                    error: 'Thời gian bị trùng với ' + (candidate.type === 'contract' ? 'hợp đồng ' : 'đặt cọc ') + candidate.code + '.'
                };
            }
        }
        return { ok: true };
    }

    function checkDepositAvailability(input, existingId) {
        initialize();
        var existingHold = global.RHD.list('deposits').filter(function (deposit) {
            return deposit.id !== existingId && holdingDeposit(deposit) && sameSpace(input, deposit);
        })[0];
        if (existingHold) {
            var error = 'Căn hộ/phòng đã có đặt cọc giữ chỗ ' + (existingHold.code || existingHold.id) + '.';
            return { ok: false, conflict: existingHold, error: error, fieldErrors: { apartmentId: error } };
        }
        var result = checkAvailability({
            buildingId: input.buildingId,
            apartmentId: input.apartmentId,
            roomId: input.roomId,
            bedId: input.bedId,
            startDate: input.leaseStartDate || input.startDate,
            endDate: input.leaseEndDate || input.endDate,
            excludeContractId: input.excludeContractId,
            excludeDepositId: existingId || input.excludeDepositId
        });
        if (!result.ok) result.fieldErrors = { apartmentId: result.error };
        return result;
    }

    function contractAlertStatus(contract, asOf, expiringDays) {
        var status = lifecycleStatus(contract);
        if (status === 'liquidated') return 'liquidated';
        if (status === 'forfeited') return 'deposit';
        if (status !== 'active') return 'liquidated';
        var now = asOf || today();
        if (contract.endDate && contract.endDate < now) return 'overdue';
        var moveOut = contract.expectedMoveOutDate || contract.moveOutDate || contract.moveOutNoticeDate;
        if (moveOut) return 'moving';
        var end = parseDate(contract.endDate);
        if (end) {
            var remaining = Math.ceil((end.getTime() - parseDate(now).getTime()) / 86400000);
            if (remaining >= 0 && remaining <= Number(expiringDays || 30)) return 'expiring';
        }
        return 'renting';
    }

    function depositAlert(deposit, asOf) {
        var now = asOf || today();
        return holdingDeposit(deposit) && !!deposit.moveInDate && deposit.moveInDate < now ? 'overdue_move_in' : '';
    }

    function depositCode(building, apartment) {
        var buildingTag = String(building.shortName || building.code || 'TN').toUpperCase().replace(/\s+/g, '').slice(0, 8);
        var unitTag = String(apartment.name || 'CH').toUpperCase().replace(/\s+/g, '').slice(0, 12);
        var prefix = 'DC-' + buildingTag + '-' + unitTag + '-';
        var highest = global.RHD.list('deposits').reduce(function (max, item) {
            if (String(item.code || '').indexOf(prefix) !== 0) return max;
            var sequence = Number(String(item.code).slice(prefix.length));
            return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
        }, 0);
        return prefix + String(highest + 1).padStart(3, '0');
    }

    function transaction(depositId, type, value, details) {
        return global.RHD.create('depositTransactions', Object.assign({
            depositId: depositId,
            type: type,
            label: ({ receive: 'Nhận cọc', refund: 'Hoàn cọc', deduction: 'Khấu trừ cọc', transfer: 'Chuyển sang hợp đồng' })[type] || type,
            amount: amount(value),
            date: today(),
            note: '',
            actorId: '',
            actorName: ''
        }, details || {}));
    }

    function transactionsFor(depositId) {
        initialize();
        return global.RHD.list('depositTransactions').filter(function (item) { return item.depositId === depositId; })
            .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0); });
    }

    function normalizeDeposit(input, existing) {
        var building = global.RHD.get('buildings', input.buildingId);
        var apartment = global.RHD.get('apartments', input.apartmentId);
        var depositMonths = Number(input.depositMonths == null ? 1 : input.depositMonths);
        var rentPrice = amount(input.rentPrice == null ? apartment && apartment.rentPrice : input.rentPrice);
        var fullAmount = input.depositFullAmount == null
            ? (existing && input.rentPrice == null && input.depositMonths == null ? amount(existing.depositFullAmount) : calculateDepositFull(rentPrice, depositMonths))
            : amount(input.depositFullAmount);
        var selectedServices = Array.isArray(input.services) ? input.services : (building ? (building.services || []).filter(function (service) {
            return service.feeType !== 'rent' && service.feeType !== 'deposit';
        }) : []);
        var tenantIds = unique(input.tenantIds || (input.customerId ? [input.customerId] : existing && existing.tenantIds));
        return Object.assign({}, input, {
            buildingId: input.buildingId || '',
            apartmentId: input.apartmentId || '',
            roomId: input.roomId || '',
            bedId: input.bedId || '',
            tenantIds: tenantIds,
            customerId: input.customerId || tenantIds[0] || '',
            occupantCount: Math.max(1, Number(input.occupantCount) || 1),
            rentPrice: rentPrice,
            depositMonths: Number.isFinite(depositMonths) && depositMonths > 0 ? depositMonths : 1,
            depositFullAmount: fullAmount,
            depositReceivedAmount: amount(input.depositReceivedAmount == null ? existing && existing.depositReceivedAmount : input.depositReceivedAmount),
            depositRemainingAmount: Math.max(0, fullAmount - amount(input.depositReceivedAmount == null ? existing && existing.depositReceivedAmount : input.depositReceivedAmount)),
            discountMonths: amount(input.discountMonths),
            discountAmountPerMonth: amount(input.discountAmountPerMonth),
            depositDate: input.depositDate || (existing && existing.depositDate) || today(),
            moveInDate: input.moveInDate || '',
            rentStartDate: input.rentStartDate || '',
            leaseStartDate: input.leaseStartDate || input.startDate || '',
            leaseEndDate: input.leaseEndDate || input.endDate || '',
            paymentCycle: input.paymentCycle || 'monthly',
            services: selectedServices.map(function (service) { return Object.assign({}, service); }),
            status: input.status || (existing && existing.status) || 'holding',
            contractId: input.contractId || (existing && existing.contractId) || '',
            isDeleted: !!(input.isDeleted || (existing && existing.isDeleted)),
            updatedAt: Date.now()
        });
    }

    function validateDeposit(item, existingId) {
        if (!global.RHD.get('buildings', item.buildingId)) return { ok: false, error: 'Vui lòng chọn tòa nhà hợp lệ.', fieldErrors: { buildingId: 'Vui lòng chọn tòa nhà.' } };
        var apartment = global.RHD.get('apartments', item.apartmentId);
        if (!apartment || apartment.buildingId !== item.buildingId) return { ok: false, error: 'Căn hộ không thuộc tòa nhà đã chọn.', fieldErrors: { apartmentId: 'Chọn căn hộ thuộc tòa nhà đã chọn.' } };
        if (!item.tenantIds.length || item.tenantIds.some(function (id) { return !global.RHD.get('customers', id); })) {
            return { ok: false, error: 'Vui lòng chọn ít nhất một khách cọc hợp lệ.', fieldErrors: { tenantIds: 'Chọn ít nhất một khách cọc.' } };
        }
        if (!parseDate(item.depositDate)) return { ok: false, error: 'Ngày đặt cọc không hợp lệ.', fieldErrors: { depositDate: 'Nhập ngày đặt cọc hợp lệ.' } };
        if (!parseDate(item.moveInDate)) return { ok: false, error: 'Ngày chuyển vào không hợp lệ.', fieldErrors: { moveInDate: 'Nhập ngày chuyển vào hợp lệ.' } };
        if (!parseDate(item.rentStartDate)) return { ok: false, error: 'Ngày bắt đầu tính tiền không hợp lệ.', fieldErrors: { rentStartDate: 'Nhập ngày bắt đầu tính tiền hợp lệ.' } };
        if (!parseDate(item.leaseStartDate)) return { ok: false, error: 'Ngày bắt đầu thuê không hợp lệ.', fieldErrors: { leaseStartDate: 'Nhập ngày bắt đầu thuê hợp lệ.' } };
        if (!parseDate(item.leaseEndDate)) return { ok: false, error: 'Ngày kết thúc thuê không hợp lệ.', fieldErrors: { leaseEndDate: 'Nhập ngày kết thúc thuê hợp lệ.' } };
        if (item.leaseEndDate <= item.leaseStartDate) return { ok: false, error: 'Ngày kết thúc phải sau ngày bắt đầu.', fieldErrors: { leaseEndDate: 'Ngày kết thúc phải sau ngày bắt đầu.' } };
        if (item.depositReceivedAmount > item.depositFullAmount) return { ok: false, error: 'Cọc giữ không được lớn hơn cọc đầy đủ.', fieldErrors: { depositReceivedAmount: 'Cọc giữ không được lớn hơn cọc full.' } };
        if (item.depositMonths <= 0 || item.rentPrice < 0 || item.depositFullAmount < 0) return { ok: false, error: 'Giá thuê và số tháng cọc không hợp lệ.', fieldErrors: { rentPrice: 'Giá thuê và số tháng cọc phải hợp lệ.', depositMonths: 'Số tháng cọc phải lớn hơn 0.', depositFullAmount: 'Cọc full không hợp lệ.' } };
        if (item.referrerUserId && global.RH && !global.RH.getUsers().some(function (user) { return user.id === item.referrerUserId; }) && !item.referrerName) {
            return { ok: false, error: 'Không tìm thấy tài khoản người giới thiệu.', fieldErrors: { referrerUserId: 'Chọn tài khoản hợp lệ hoặc nhập người giới thiệu mới.' } };
        }
        if (item.status === 'holding') {
            return checkDepositAvailability(item, existingId);
        }
        return { ok: true };
    }

    function validateDepositInput(input, existingId) {
        initialize();
        var existing = existingId ? global.RHD.get('deposits', existingId) : null;
        var item = normalizeDeposit(input || {}, existing);
        var result = validateDeposit(item, existingId);
        return result.ok ? { ok: true, item: item } : result;
    }

    function createDeposit(input, actor) {
        initialize();
        input = input || {};
        var validation = validateDepositInput(input);
        var item = validation.item;
        var invalid = validation;
        if (!invalid.ok) return invalid;
        var building = global.RHD.get('buildings', item.buildingId);
        var apartment = global.RHD.get('apartments', item.apartmentId);
        item.code = depositCode(building, apartment);
        item.createdAt = Date.now();
        item.status = 'holding';
        var result = global.RHD.create('deposits', item);
        if (!result.ok) return result;
        var tx = transaction(result.item.id, 'receive', item.depositReceivedAmount, Object.assign({ date: item.depositDate, note: 'Ghi nhận tiền cọc ban đầu.' }, actor || {}));
        if (!tx.ok) {
            global.RHD.remove('deposits', result.item.id);
            return { ok: false, error: tx.error || 'Không thể ghi giao dịch nhận cọc.' };
        }
        return result;
    }

    function updateDeposit(id, patch, actor) {
        initialize();
        var existing = global.RHD.get('deposits', id);
        if (!existing) return { ok: false, error: 'Không tìm thấy đặt cọc.' };
        if (!holdingDeposit(existing)) return { ok: false, error: 'Chỉ được sửa đặt cọc đang giữ chỗ.' };
        var history = transactionsFor(id);
        if (history.some(function (item) { return item.type === 'refund' || item.type === 'deduction'; })) {
            return { ok: false, error: 'Không thể sửa đặt cọc đã hoàn hoặc khấu trừ tiền.' };
        }
        patch = Object.assign({}, patch || {});
        var previousReceived = amount(existing.depositReceivedAmount);
        var validation = validateDepositInput(Object.assign({}, existing, patch), id);
        var item = validation.item;
        var invalid = validation;
        if (!invalid.ok) return invalid;
        if (item.depositReceivedAmount < previousReceived) return { ok: false, error: 'Không thể giảm tiền đã nhận khi sửa; hãy hủy cọc để ghi nhận hoàn/khấu trừ.' };
        item.code = existing.code;
        item.status = existing.status;
        item.contractId = existing.contractId || '';
        var result = global.RHD.update('deposits', id, item);
        if (!result.ok) return result;
        var increase = item.depositReceivedAmount - previousReceived;
        if (increase > 0) {
            var tx = transaction(id, 'receive', increase, Object.assign({ note: 'Bổ sung tiền cọc.' }, actor || {}));
            if (!tx.ok) {
                global.RHD.update('deposits', id, existing);
                return { ok: false, error: tx.error || 'Không thể ghi giao dịch nhận cọc.' };
            }
        }
        return result;
    }

    function cancelDeposit(id, details, actor) {
        initialize();
        var deposit = global.RHD.get('deposits', id);
        if (!holdingDeposit(deposit)) return { ok: false, error: 'Chỉ được hủy đặt cọc đang giữ chỗ.' };
        details = details || {};
        var refund = amount(details.refundAmount == null ? deposit.depositReceivedAmount : details.refundAmount);
        var received = amount(deposit.depositReceivedAmount);
        var reason = String(details.reason || '').trim();
        if (!reason) return { ok: false, error: 'Vui lòng nhập lý do hủy cọc.' };
        if (refund > received) return { ok: false, error: 'Số tiền hoàn không được lớn hơn số tiền đã nhận.' };
        var deduction = received - refund;
        var patch = {
            status: refund > 0 ? 'cancelled' : 'forfeited',
            cancellation: { refundAmount: refund, deductionAmount: deduction, reason: reason, note: String(details.note || '').trim(), date: details.date || today() },
            updatedAt: Date.now()
        };
        var result = global.RHD.update('deposits', id, patch);
        if (!result.ok) return result;
        var txs = [];
        if (refund > 0) txs.push(transaction(id, 'refund', refund, Object.assign({ date: patch.cancellation.date, note: reason + (patch.cancellation.note ? ' · ' + patch.cancellation.note : '') }, actor || {})));
        if (deduction > 0) txs.push(transaction(id, 'deduction', deduction, Object.assign({ date: patch.cancellation.date, note: reason }, actor || {})));
        if (txs.some(function (tx) { return !tx.ok; })) {
            global.RHD.update('deposits', id, deposit);
            txs.filter(function (tx) { return tx.ok; }).forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
            return { ok: false, error: 'Không thể ghi đầy đủ giao dịch hủy cọc.' };
        }
        return result;
    }

    function deleteDeposit(id) {
        initialize();
        var deposit = global.RHD.get('deposits', id);
        if (!holdingDeposit(deposit)) return { ok: false, error: 'Chỉ được xóa mềm đặt cọc đang giữ chỗ.' };
        if (transactionsFor(id).some(function (item) { return item.type === 'refund' || item.type === 'deduction'; })) {
            return { ok: false, error: 'Không thể xóa đặt cọc đã có giao dịch hoàn hoặc khấu trừ.' };
        }
        return global.RHD.update('deposits', id, { isDeleted: true, deletedAt: Date.now(), updatedAt: Date.now() });
    }

    function listDeposits() {
        initialize();
        return global.RHD.list('deposits').filter(function (item) { return !item.isDeleted; });
    }

    function validateContract(data, id, action) {
        if (!global.RHD.get('buildings', data.buildingId)) return { ok: false, error: 'Vui lòng chọn tòa nhà hợp lệ.', fieldErrors: { buildingId: 'Chọn tòa nhà hợp lệ.' } };
        var apartment = global.RHD.get('apartments', data.apartmentId);
        if (!apartment || apartment.buildingId !== data.buildingId) return { ok: false, error: 'Căn hộ không thuộc tòa nhà đã chọn.', fieldErrors: { apartmentId: 'Căn hộ không thuộc tòa nhà đã chọn.' } };
        var tenants = unique(data.tenantIds || (data.customerId ? [data.customerId] : []));
        if (!tenants.length || tenants.some(function (tenantId) { return !global.RHD.get('customers', tenantId); })) {
            return { ok: false, error: 'Vui lòng chọn ít nhất một khách thuê hợp lệ.', fieldErrors: { tenantIds: 'Chọn ít nhất một khách thuê hợp lệ.' } };
        }
        if (!parseDate(data.startDate) || !parseDate(data.endDate) || data.endDate <= data.startDate) {
            return { ok: false, error: 'Ngày kết thúc phải sau ngày bắt đầu.', fieldErrors: { startDate: 'Nhập ngày bắt đầu hợp lệ.', endDate: 'Ngày kết thúc phải sau ngày bắt đầu.' } };
        }
        if (data.signDate && !parseDate(data.signDate)) return { ok: false, error: 'Ngày ký không hợp lệ.', fieldErrors: { signDate: 'Nhập ngày ký hợp lệ.' } };
        if (data.landlordSignedAt && !parseDate(data.landlordSignedAt)) return { ok: false, error: 'Ngày chủ nhà ký không hợp lệ.', fieldErrors: { landlordSignedAt: 'Nhập ngày chủ nhà ký hợp lệ.' } };
        if (data.rentStartDate && !parseDate(data.rentStartDate)) return { ok: false, error: 'Ngày bắt đầu tính tiền không hợp lệ.', fieldErrors: { rentStartDate: 'Nhập ngày bắt đầu tính tiền hợp lệ.' } };
        if (data.billingDay != null && data.billingDay !== '' && (!Number.isInteger(Number(data.billingDay)) || Number(data.billingDay) < 1 || Number(data.billingDay) > 31)) {
            return { ok: false, error: 'Ngày thanh toán phải từ 1 đến 31.', fieldErrors: { billingDay: 'Chọn ngày thanh toán từ 1 đến 31.' } };
        }
        if (Number(data.rentPrice) < 0 || Number(data.depositPrice) < 0) return { ok: false, error: 'Giá thuê và tiền cọc không hợp lệ.', fieldErrors: { rentPrice: 'Số tiền không hợp lệ.', depositPrice: 'Số tiền không hợp lệ.' } };
        var building = global.RHD.get('buildings', data.buildingId);
        var selectedServices = data.serviceIds || [];
        var meterTypes = {};
        (building.services || []).concat(data.extraServices || []).forEach(function (service) {
            if (selectedServices.indexOf(service.id) === -1) return;
            var policy = global.RHD.utilityPolicy ? global.RHD.utilityPolicy(service) : { metered: service.calcMethod === 'meter', meterType: service.feeType === 'water' ? 'water' : 'electricity' };
            if (policy.metered) meterTypes[policy.meterType || (service.feeType === 'water' ? 'water' : 'electricity')] = true;
        });
        var assignments = data.meterAssignments || [];
        var missingMeterType = Object.keys(meterTypes).filter(function (type) {
            var assignment = assignments.filter(function (item) { return item.meterType === type && item.meterCode; })[0];
            return !assignment || assignment.initialIndex == null || assignment.initialIndex === '' ||
                !Number.isFinite(Number(assignment.initialIndex)) || Number(assignment.initialIndex) < 0 ||
                !global.RHD.list('meters').some(function (meter) { return meter.apartmentId === data.apartmentId && meter.meterType === type && meter.meterCode === assignment.meterCode; });
        })[0];
        if (missingMeterType) return { ok: false, error: 'Cần gắn công tơ đã khai báo ' + (missingMeterType === 'water' ? 'nước' : 'điện') + ' và nhập chỉ số đầu.', fieldErrors: { meterAssignments: 'Chọn công tơ hiện có và nhập chỉ số đầu hợp lệ.' } };
        if (data.depositId) {
            var deposit = global.RHD.get('deposits', data.depositId);
            if (!deposit || (deposit.status !== 'holding' && deposit.status !== 'contracted')) return { ok: false, error: 'Đặt cọc không còn ở trạng thái có thể ký hợp đồng.', fieldErrors: { depositId: 'Đặt cọc không còn ở trạng thái chờ ký.' } };
        }
        return checkAvailability({
            buildingId: data.buildingId,
            apartmentId: data.apartmentId,
            roomId: data.roomId,
            bedId: data.bedId,
            startDate: action === 'transferred' ? data.transferDate || data.startDate
                : action === 'assigned' ? data.assignmentDate || data.transferDate || data.startDate
                    : action === 'move_out_registered' && data.transferDate ? data.transferDate : data.startDate,
            endDate: data.endDate,
            excludeContractId: id,
            excludeDepositId: data.depositId
        });
    }

    function validateContractInput(data, id, action) {
        initialize();
        var existing = id ? global.RHD.get('contracts', id) : null;
        if (id && !existing) return { ok: false, error: 'Không tìm thấy hợp đồng.' };
        var input = Object.assign({}, existing || {}, data || {});
        if (!input.startDate) input.startDate = existing && existing.startDate || today();
        if (!input.endDate) input.endDate = existing && existing.endDate || defaultEndDate(input.startDate, 12);
        return validateContract(input, id, action);
    }

    function saveContract(data, id, actor, action) {
        initialize();
        data = Object.assign({}, data || {});
        var existing = id ? global.RHD.get('contracts', id) : null;
        if (id && !existing) return { ok: false, error: 'Không tìm thấy hợp đồng.' };
        if (existing) data = Object.assign({}, existing, data);
        if (!id) {
            data.startDate = data.startDate || today();
            data.endDate = data.endDate || defaultEndDate(data.startDate, 12);
        } else {
            data.startDate = data.startDate || existing.startDate;
            data.endDate = data.endDate || existing.endDate;
        }
        var tenantSource = Array.isArray(data.tenantIds) ? data.tenantIds
            : existing && (!data.customerId || data.customerId === existing.customerId)
                ? (existing.tenantIds || [existing.customerId])
                : (data.customerId ? [data.customerId] : []);
        var tenants = unique(tenantSource);
        data.tenantIds = tenants;
        delete data.customerIds;
        data.customerId = data.customerId || tenants[0] || (existing && existing.customerId) || '';
        data.lifecycleStatus = existing ? lifecycleStatus(existing) : (lifecycleStatus(data) || 'active');
        data.status = data.lifecycleStatus;
        data.depositPrice = amount(data.depositPrice);
        var hasHeldAmount = data.depositHeldAmount != null;
        if (existing && existing.depositBalanceNeedsReview && !hasHeldAmount) {
            delete data.depositHeldAmount;
            delete data.depositOutstandingAmount;
        } else {
            data.depositHeldAmount = hasHeldAmount ? amount(data.depositHeldAmount) : amount(existing && existing.depositHeldAmount);
            data.depositOutstandingAmount = data.depositOutstandingAmount == null
                ? Math.max(0, data.depositPrice - data.depositHeldAmount)
                : amount(data.depositOutstandingAmount);
        }
        data.discountMonths = amount(data.discountMonths);
        data.discountAmountPerMonth = amount(data.discountAmountPerMonth);
        data.signedAt = data.signedAt || data.signDate || (existing && existing.signedAt) || '';
        data.landlordSignedAt = data.landlordSignedAt || (existing && existing.landlordSignedAt) || '';
        data.billingDay = data.billingDay || (existing && existing.billingDay) || '';
        data.rentStartDate = data.rentStartDate || (existing && existing.rentStartDate) || data.startDate;
        data.meterAssignments = Array.isArray(data.meterAssignments) ? data.meterAssignments : (existing && existing.meterAssignments) || [];
        data.expectedMoveOutDate = data.expectedMoveOutDate || (existing && existing.expectedMoveOutDate) || '';
        data.history = (existing && Array.isArray(existing.history) ? existing.history.slice() : []);
        var validation = validateContractInput(data, id, action);
        if (!validation.ok) return validation;
        var event = {
            type: action || (id ? 'updated' : 'created'),
            date: today(),
            actorId: actor && actor.actorId || '',
            actorName: actor && actor.actorName || '',
            note: actor && actor.note || ''
        };
        if (existing && ['renewed', 'transferred', 'assigned', 'move_out_registered'].indexOf(action) !== -1) {
            event.from = {
                buildingId: existing.buildingId, apartmentId: existing.apartmentId, roomId: existing.roomId || '', bedId: existing.bedId || '',
                tenantIds: existing.tenantIds || [existing.customerId], startDate: existing.startDate, endDate: existing.endDate,
                rentPrice: existing.rentPrice, depositPrice: existing.depositPrice, expectedMoveOutDate: existing.expectedMoveOutDate || ''
            };
            event.to = {
                buildingId: data.buildingId, apartmentId: data.apartmentId, roomId: data.roomId || '', bedId: data.bedId || '',
                tenantIds: data.tenantIds, startDate: data.startDate, endDate: data.endDate,
                rentPrice: data.rentPrice, depositPrice: data.depositPrice, expectedMoveOutDate: data.expectedMoveOutDate || ''
            };
        }
        data.history.push(event);
        if (!id) {
            var building = global.RHD.get('buildings', data.buildingId);
            var apartment = global.RHD.get('apartments', data.apartmentId);
            data.code = data.code || global.RHD.nextContractCode(building, apartment);
            return global.RHD.create('contracts', data);
        }
        return global.RHD.update('contracts', id, data);
    }

    function createContractFromDeposit(id, overrides, actor) {
        initialize();
        var deposit = global.RHD.get('deposits', id);
        if (!holdingDeposit(deposit)) return { ok: false, error: 'Chỉ có thể ký hợp đồng từ đặt cọc đang giữ chỗ.' };
        overrides = overrides || {};
        var contractData = Object.assign({}, deposit, overrides, {
            buildingId: deposit.buildingId,
            apartmentId: deposit.apartmentId,
            roomId: deposit.roomId,
            bedId: deposit.bedId,
            tenantIds: deposit.tenantIds,
            customerId: deposit.customerId,
            startDate: overrides.startDate || deposit.leaseStartDate,
            endDate: overrides.endDate || deposit.leaseEndDate,
            rentPrice: overrides.rentPrice == null ? deposit.rentPrice : overrides.rentPrice,
            depositPrice: deposit.depositFullAmount,
            depositHeldAmount: deposit.depositReceivedAmount,
            depositOutstandingAmount: Math.max(0, deposit.depositFullAmount - deposit.depositReceivedAmount),
            discountMonths: deposit.discountMonths,
            discountAmountPerMonth: deposit.discountAmountPerMonth,
            depositId: deposit.id,
            serviceIds: overrides.serviceIds || (deposit.services || []).filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit'; }).map(function (service) { return service.id; }),
            serviceOverrides: overrides.serviceOverrides || (deposit.services || []).reduce(function (result, service) { result[service.id] = service.unitPrice; return result; }, {}),
            extraServices: overrides.extraServices || (deposit.services || []).filter(function (service) { return service.feeType !== 'rent' && service.feeType !== 'deposit' && !(global.RHD.get('buildings', deposit.buildingId).services || []).some(function (buildingService) { return buildingService.id === service.id; }); }),
            meterAssignments: overrides.meterAssignments || deposit.meterAssignments || [],
            status: 'active',
            lifecycleStatus: 'active'
        });
        delete contractData.id;
        delete contractData.code;
        var created = saveContract(contractData, null, actor, 'created_from_deposit');
        if (!created.ok) return created;
        var updated = global.RHD.update('deposits', id, { status: 'contracted', contractId: created.item.id, updatedAt: Date.now() });
        if (!updated.ok) {
            global.RHD.remove('contracts', created.item.id);
            return updated;
        }
        var tx = transaction(id, 'transfer', deposit.depositReceivedAmount, Object.assign({ note: 'Đặt cọc chuyển sang hợp đồng ' + created.item.code + '.' }, actor || {}));
        if (!tx.ok) {
            global.RHD.update('deposits', id, deposit);
            global.RHD.remove('contracts', created.item.id);
            return { ok: false, error: tx.error || 'Không thể ghi giao dịch chuyển cọc.' };
        }
        return { ok: true, item: created.item, deposit: updated.item };
    }

    function renewContract(id, dates, actor) {
        var contract = global.RHD.get('contracts', id);
        if (!contract || !activeContract(contract)) return { ok: false, error: 'Chỉ có thể gia hạn hợp đồng đang hiệu lực.' };
        dates = dates || {};
        var months = Number(dates.extensionMonths) || 12;
        var extensionStart = contract.endDate ? addDays(contract.endDate, 1) : today();
        var endDate = dates.endDate || defaultEndDate(extensionStart, months);
        var changes = Object.assign({}, dates, { endDate: endDate, renewalDate: today(), extensionStartDate: extensionStart });
        delete changes.startDate;
        delete changes.extensionMonths;
        return saveContract(Object.assign({}, contract, changes), id, actor, 'renewed');
    }

    function transferContract(id, destination, actor) {
        var contract = global.RHD.get('contracts', id);
        if (!contract || !activeContract(contract)) return { ok: false, error: 'Chỉ có thể chuyển phòng cho hợp đồng đang hiệu lực.' };
        destination = destination || {};
        var patch = Object.assign({}, contract, destination, { transferDate: destination.transferDate || today() });
        return saveContract(patch, id, Object.assign({}, actor || {}, { note: actor && actor.note || 'Chuyển phòng/giường ngày ' + (destination.transferDate || today()) }), 'transferred');
    }

    function assignContract(id, tenantIds, actor) {
        var contract = global.RHD.get('contracts', id);
        if (!contract || !activeContract(contract)) return { ok: false, error: 'Chỉ có thể nhượng hợp đồng đang hiệu lực.' };
        var ids = unique(tenantIds);
        var assignmentDate = actor && actor.assignmentDate || today();
        return saveContract(Object.assign({}, contract, { tenantIds: ids, customerId: ids[0] || '', assignmentDate: assignmentDate }), id, Object.assign({}, actor || {}, { assignmentDate: assignmentDate, note: actor && actor.note || 'Nhượng hợp đồng.' }), 'assigned');
    }

    function registerMoveOut(id, moveOutDate, actor) {
        var contract = global.RHD.get('contracts', id);
        if (!contract || !activeContract(contract)) return { ok: false, error: 'Chỉ có thể đăng ký chuyển đi cho hợp đồng đang hiệu lực.' };
        if (!parseDate(moveOutDate)) return { ok: false, error: 'Ngày chuyển đi không hợp lệ.' };
        if (contract.endDate && moveOutDate > contract.endDate) return { ok: false, error: 'Ngày chuyển đi không được sau hạn hợp đồng.' };
        return saveContract(Object.assign({}, contract, { expectedMoveOutDate: moveOutDate }), id, Object.assign({}, actor || {}, { note: 'Đăng ký chuyển đi ngày ' + moveOutDate }), 'move_out_registered');
    }

    function finalMeterRequirements(contractId, period) {
        initialize();
        var contract = global.RHD.get('contracts', contractId);
        if (!contract) return [];
        var keys = {};
        var requirements = [];
        (contract.meterAssignments || []).forEach(function (assignment) {
            if (!assignment || !assignment.meterType || !assignment.meterCode) return;
            var key = assignment.meterType + '|' + assignment.meterCode;
            if (keys[key]) return;
            keys[key] = true;
            requirements.push({ meterType: assignment.meterType, meterCode: assignment.meterCode, meterId: assignment.meterId || '', initialIndex: Number(assignment.initialIndex) || 0 });
        });
        global.RHD.list('meters').filter(function (meter) {
            return meter.apartmentId === contract.apartmentId && meter.meterType && meter.meterCode;
        }).forEach(function (meter) {
            var key = meter.meterType + '|' + meter.meterCode;
            if (keys[key]) return;
            keys[key] = true;
            requirements.push({ meterType: meter.meterType, meterCode: meter.meterCode, meterId: meter.id || '', initialIndex: 0 });
        });
        return requirements.map(function (requirement) {
            var matching = global.RHD.list('meters').filter(function (meter) {
                return meter.apartmentId === contract.apartmentId && meter.meterType === requirement.meterType && meter.meterCode === requirement.meterCode && (meter.readingPeriod || meter.periodMonth) === period;
            }).sort(function (a, b) { return (b.recordedAt || b.createdAt || 0) - (a.recordedAt || a.createdAt || 0); });
            var current = matching[0] || null;
            var approved = current && (current.approvalStatus ? current.approvalStatus === 'đã_duyệt' : current.status === 'đã_chốt') && isFinite(Number(current.latestIndex));
            var previous = current ? Number(current.previousIndex) || 0 : null;
            if (previous == null) {
                var prior = global.RHD.list('meters').filter(function (meter) {
                    return meter.apartmentId === contract.apartmentId && meter.meterType === requirement.meterType && meter.meterCode === requirement.meterCode && (meter.readingPeriod || meter.periodMonth) < period && isFinite(Number(meter.latestIndex));
                }).sort(function (a, b) { return String(b.readingPeriod || b.periodMonth).localeCompare(String(a.readingPeriod || a.periodMonth)) || (b.recordedAt || b.createdAt || 0) - (a.recordedAt || a.createdAt || 0); })[0];
                previous = prior ? Number(prior.latestIndex) : requirement.initialIndex;
            }
            return Object.assign({}, requirement, {
                current: current,
                approved: !!approved,
                previousIndex: previous,
                latestIndex: current ? Number(current.latestIndex) || 0 : null
            });
        });
    }

    function finalMeterCharge(contract, period, requirements, draftReadings) {
        var building = global.RHD.get('buildings', contract.buildingId);
        if (!building) return 0;
        var total = 0;
        var serviceIds = contract.serviceIds || [];
        var overrides = contract.serviceOverrides || {};
        draftReadings = draftReadings || [];
        (building.services || []).concat(contract.extraServices || []).forEach(function (service) {
            if (serviceIds.indexOf(service.id) === -1 || service.feeType === 'rent' || service.feeType === 'deposit') return;
            var policy = global.RHD.utilityPolicy ? global.RHD.utilityPolicy(service) : { metered: service.calcMethod === 'meter', meterType: service.feeType === 'water' ? 'water' : 'electricity' };
            if (!policy.metered) return;
            var meterType = policy.meterType || (service.feeType === 'water' ? 'water' : 'electricity');
            var reading = requirements.filter(function (item) { return item.meterType === meterType; })[0];
            if (!reading) return;
            var draft = draftReadings.filter(function (item) { return item.meterType === meterType && (!item.meterCode || item.meterCode === reading.meterCode); })[0];
            if (draft && draft.latestIndex != null && draft.latestIndex !== '') reading = Object.assign({}, reading, { latestIndex: Number(draft.latestIndex) });
            else if (!reading.current || !reading.approved) return;
            var quantity = Math.max(0, Number(reading.latestIndex) - Number(reading.previousIndex));
            var unitPrice = overrides[service.id] != null ? Number(overrides[service.id]) : Number(service.unitPrice);
            var amount = Math.round(quantity * (Number.isFinite(unitPrice) ? unitPrice : 0));
            total += amount + Math.round(amount * (Number(service.taxRate) || 0) / 100);
        });
        return total;
    }

    function calculateFinalMeterAmount(contractId, period, draftReadings) {
        var contract = global.RHD.get('contracts', contractId);
        if (!contract) return { ok: false, error: 'Không tìm thấy hợp đồng.' };
        var requirements = finalMeterRequirements(contractId, period);
        var waiting = requirements.filter(function (reading) { return !reading.approved; });
        return {
            ok: true,
            amount: finalMeterCharge(contract, period, requirements, draftReadings),
            requirements: requirements,
            waitingApproval: waiting.length > 0
        };
    }

    function recordFinalMeters(contractId, period, closingDate, readings, actor) {
        initialize();
        var contract = global.RHD.get('contracts', contractId);
        if (!contract || !activeContract(contract)) return { ok: false, error: 'Hợp đồng không còn hiệu lực.', saved: [] };
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) return { ok: false, error: 'Kỳ chốt chỉ số không hợp lệ.', saved: [] };
        var requirements = finalMeterRequirements(contractId, period);
        var payloads = Array.isArray(readings) ? readings : [];
        var saved = [];
        for (var i = 0; i < requirements.length; i++) {
            var requirement = requirements[i];
            if (requirement.approved) continue;
            var input = payloads.filter(function (item) { return item.meterType === requirement.meterType && item.meterCode === requirement.meterCode; })[0];
            if (!input || input.latestIndex == null || input.latestIndex === '') {
                return { ok: false, error: 'Cần nhập chỉ số cuối ' + requirement.meterCode + ' (' + requirement.meterType + ').', saved: saved };
            }
            var latestIndex = Number(input.latestIndex);
            if (!Number.isFinite(latestIndex) || latestIndex < requirement.previousIndex) {
                return { ok: false, error: 'Chỉ số cuối ' + requirement.meterCode + ' không hợp lệ hoặc nhỏ hơn chỉ số trước.', saved: saved };
            }
            var data = {
                buildingId: contract.buildingId,
                apartmentId: contract.apartmentId,
                meterType: requirement.meterType,
                meterCode: requirement.meterCode,
                readingPeriod: period,
                periodMonth: period,
                closingDate: closingDate || today(),
                previousIndex: requirement.previousIndex,
                latestIndex: latestIndex,
                consumption: latestIndex - requirement.previousIndex,
                status: undefined,
                approvalStatus: 'chưa_duyệt',
                recordedAt: Date.now(),
                recordedById: actor && actor.actorId || '',
                recordedBy: actor && actor.actorName || '',
                approvedAt: null,
                approvedById: '',
                approvedBy: '',
                contractId: contract.id,
                closingPurpose: 'liquidation'
            };
            var result = requirement.current
                ? global.RHD.update('meters', requirement.current.id, data)
                : global.RHD.create('meters', data);
            if (!result.ok) return { ok: false, error: result.error || 'Không thể lưu chỉ số cuối.', saved: saved };
            saved.push(result.item);
        }
        return { ok: true, saved: saved, requirements: requirements };
    }

    function contractDeleteBlock(id) {
        var contract = global.RHD.get('contracts', id);
        if (!contract) return 'Không tìm thấy hợp đồng.';
        if (contract.depositId) return 'Không thể xóa hợp đồng được ký từ đặt cọc; hãy thanh lý để giữ nguyên lịch sử giao dịch.';
        if (global.RHD.list('invoices').some(function (invoice) { return invoice.contractId === id; })) return 'Không thể xóa hợp đồng đã có hóa đơn; hãy thanh lý hợp đồng.';
        var startMonth = String(contract.startDate || '').slice(0, 7);
        var endMonth = String(contract.endDate || '').slice(0, 7);
        var hasMeter = global.RHD.list('meters').some(function (meter) {
            if (meter.contractId) return meter.contractId === id;
            var month = String(meter.periodMonth || '').slice(0, 7);
            return meter.apartmentId === contract.apartmentId && month && (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth);
        });
        return hasMeter ? 'Không thể xóa hợp đồng đã có bản ghi chỉ số; hãy thanh lý hợp đồng.' : '';
    }

    function deleteContract(id) {
        initialize();
        var blocked = contractDeleteBlock(id);
        return blocked ? { ok: false, error: blocked } : global.RHD.remove('contracts', id);
    }

    function currentResidence(customerId, asOf) {
        initialize();
        var contracts = global.RHD.list('contracts').filter(function (contract) {
            return activeContract(contract) && unique(contract.tenantIds || [contract.customerId]).indexOf(customerId) !== -1;
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        var contract = contracts[0] || null;
        if (contract) return { source: 'contract', contract: contract, deposit: null, buildingId: contract.buildingId, apartmentId: contract.apartmentId, roomId: contract.roomId || '', bedId: contract.bedId || '' };
        var deposit = listDeposits().filter(function (item) {
            return holdingDeposit(item) && item.tenantIds.indexOf(customerId) !== -1;
        }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); })[0] || null;
        return deposit ? { source: 'deposit', contract: null, deposit: deposit, buildingId: deposit.buildingId, apartmentId: deposit.apartmentId, roomId: deposit.roomId || '', bedId: deposit.bedId || '' } : null;
    }

    function apartmentStatus(apartmentId, asOf) {
        initialize();
        var contracts = global.RHD.list('contracts').filter(function (contract) { return activeContract(contract) && contract.apartmentId === apartmentId; });
        if (contracts.length) return 'occupied';
        var deposits = global.RHD.list('deposits').filter(function (item) { return holdingDeposit(item) && item.apartmentId === apartmentId; });
        if (deposits.length) return 'deposited';
        var apartment = global.RHD.get('apartments', apartmentId);
        if (apartment && (apartment.status === 'maintenance' || apartment.active === false)) return 'maintenance';
        return 'vacant';
    }

    function calculateSettlement(contract, values) {
        values = values || {};
        var invoiceDebt = values.invoiceDebt;
        if (invoiceDebt == null) {
            invoiceDebt = global.RHD.list('invoices').filter(function (invoice) { return invoice.contractId === contract.id && ['unpaid', 'sent', 'overdue'].indexOf(invoice.status) !== -1; })
                .reduce(function (total, invoice) { return total + amount(invoice.total); }, 0);
        }
        var held = amount(values.depositHeldAmount == null ? contract.depositHeldAmount : values.depositHeldAmount);
        var overpayment = amount(values.overpayment);
        var penalties = amount(values.penalties);
        var usedRent = amount(values.usedRent);
        var finalUtilityAmount = amount(values.finalUtilityAmount);
        var net = held + overpayment - amount(invoiceDebt) - penalties - usedRent - finalUtilityAmount;
        var abandoned = !!values.customerAbandoned;
        return {
            depositHeldBefore: held,
            overpayment: overpayment,
            invoiceDebt: amount(invoiceDebt),
            penalties: penalties,
            usedRent: usedRent,
            finalUtilityAmount: finalUtilityAmount,
            refundAmount: abandoned ? 0 : Math.max(0, net),
            amountToCollect: Math.max(0, -net),
            deductionAmount: abandoned ? held : Math.max(0, held - Math.max(0, net)),
            forfeited: abandoned
        };
    }

    function settleContract(id, values, actor) {
        initialize();
        var contract = global.RHD.get('contracts', id);
        if (!contract || !activeContract(contract)) return { ok: false, error: 'Hợp đồng không còn ở trạng thái hiệu lực.' };
        values = values || {};
        var finalRequirements = [];
        var finalUtilityAmount = 0;
        if (values.finalMeterPeriod) {
            var meterResult = recordFinalMeters(id, values.finalMeterPeriod, values.finalMeterClosingDate, values.finalReadings, actor);
            if (!meterResult.ok) return meterResult;
            finalRequirements = finalMeterRequirements(id, values.finalMeterPeriod);
            var unapproved = finalRequirements.filter(function (reading) { return !reading.approved; });
            if (unapproved.length) return { ok: false, pendingApproval: true, saved: meterResult.saved, error: 'Đã lưu chỉ số cuối ở trạng thái Chưa duyệt. Hãy duyệt chỉ số trong Ghi chỉ số trước khi hoàn tất thanh lý.' };
            finalUtilityAmount = finalMeterCharge(contract, values.finalMeterPeriod, finalRequirements);
        }
        var settlement = calculateSettlement(contract, Object.assign({}, values, { finalUtilityAmount: finalUtilityAmount }));
        var status = settlement.forfeited ? 'forfeited' : 'liquidated';
        var history = (contract.history || []).slice();
        history.push({ type: settlement.forfeited ? 'forfeited' : 'liquidated', date: today(), actorId: actor && actor.actorId || '', actorName: actor && actor.actorName || '', settlement: settlement, finalMeterPeriod: values.finalMeterPeriod || '', finalMeterIds: finalRequirements.map(function (reading) { return reading.current && reading.current.id; }).filter(Boolean) });
        var txs = [];
        if (contract.depositId) {
            if (settlement.refundAmount > 0) txs.push(transaction(contract.depositId, 'refund', settlement.refundAmount, Object.assign({ note: 'Hoàn cọc khi thanh lý hợp đồng ' + contract.code + '.' }, actor || {})));
            if (settlement.deductionAmount > 0) txs.push(transaction(contract.depositId, 'deduction', settlement.deductionAmount, Object.assign({ note: settlement.forfeited ? 'Khách bỏ cọc.' : 'Đối soát khi thanh lý hợp đồng ' + contract.code + '.' }, actor || {})));
            if (txs.some(function (tx) { return !tx.ok; })) {
                txs.filter(function (tx) { return tx.ok; }).forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
                return { ok: false, error: 'Không thể ghi đầy đủ giao dịch thanh lý.' };
            }
        }
        var replacementInvoice = null;
        var outstandingInvoices = global.RHD.list('invoices').filter(function (invoice) { return invoice.contractId === id && ['unpaid', 'sent', 'overdue'].indexOf(invoice.status) !== -1; });
        if (values.createInvoice && (settlement.amountToCollect > 0 || outstandingInvoices.length > 0)) {
            if (!global.RHB || !global.RHB.approve || !global.RHB.issue) {
                txs.forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
                return { ok: false, error: 'Không tải được engine hóa đơn thanh lý.' };
            }
            var cancellationError = '';
            var actorName = actor && actor.actorName || 'Ban quản lý';
            if (settlement.amountToCollect > 0) {
                var invoicePeriod = values.finalMeterPeriod || today().slice(0, 7);
                var invoiceItems = [{ serviceId: 'liquidation', label: 'Số tiền còn phải thu khi thanh lý hợp đồng ' + (contract.code || ''), qty: 1, unitPrice: settlement.amountToCollect, amount: settlement.amountToCollect, taxRate: 0, tax: 0, kind: 'liquidation', source: 'contract' }];
                var createdInvoice = global.RHD.create('invoices', {
                    code: global.RHD.nextInvoiceCode(), type: 'liquidation', source: 'manual', status: 'draft',
                    contractId: contract.id, buildingId: contract.buildingId, apartmentId: contract.apartmentId, customerId: contract.customerId,
                    invoiceTemplateId: contract.invoiceTemplateId, period: invoicePeriod, billingPeriod: invoicePeriod,
                    issueDate: today(), dueDate: global.RHB.dueDateFor(global.RHD.get('buildings', contract.buildingId), today()),
                    items: invoiceItems, subtotal: settlement.amountToCollect, tax: 0, total: settlement.amountToCollect,
                    issues: [], history: [], note: 'Hóa đơn quyết toán thanh lý hợp đồng ' + (contract.code || '')
                });
                if (!createdInvoice.ok) {
                    txs.forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
                    return createdInvoice;
                }
                var approval = global.RHB.approve(createdInvoice.item.id, actorName);
                var issued = approval.ok ? global.RHB.issue(createdInvoice.item.id, actorName, false) : approval;
                if (!issued.ok) {
                    global.RHD.remove('invoices', createdInvoice.item.id);
                    txs.forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
                    return { ok: false, error: issued.error || 'Không thể phát hành hóa đơn thanh lý.' };
                }
                replacementInvoice = global.RHD.get('invoices', createdInvoice.item.id);
            }
            outstandingInvoices.forEach(function (invoice) {
                if (cancellationError) return;
                var cancelled = global.RHB.cancel(invoice.id, actorName, 'Gộp công nợ vào quyết toán thanh lý hợp đồng ' + (contract.code || '') + '.');
                if (!cancelled.ok) cancellationError = cancelled.error;
            });
            if (cancellationError) {
                if (replacementInvoice) global.RHB.cancel(replacementInvoice.id, actorName, 'Hủy do thanh lý chưa hoàn tất.');
                outstandingInvoices.forEach(function (invoice) {
                    if (invoice.status === 'unpaid' || invoice.status === 'sent' || invoice.status === 'overdue') {
                        global.RHD.update('invoices', invoice.id, { status: invoice.status, history: invoice.history || [], cancelledAt: undefined, cancelledBy: undefined, cancelReason: undefined });
                    }
                });
                txs.forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
                return { ok: false, error: cancellationError };
            }
        }
        var result = global.RHD.update('contracts', id, {
            status: status, lifecycleStatus: status, depositHeldAmount: 0, depositOutstandingAmount: 0,
            depositStatus: settlement.forfeited ? 'forfeited' : (settlement.refundAmount > 0 ? 'refunded' : 'settled'),
            depositRefundAmount: settlement.refundAmount, depositDeductionAmount: settlement.deductionAmount,
            settlement: settlement, history: history, actualMoveOutDate: values.moveOutDate || today(), liquidatedAt: today()
        });
        if (!result.ok) {
            txs.forEach(function (tx) { global.RHD.remove('depositTransactions', tx.item.id); });
            if (replacementInvoice) global.RHB.cancel(replacementInvoice.id, actor && actor.actorName || 'Ban quản lý', 'Hủy do thanh lý chưa hoàn tất.');
            return result;
        }
        result.settlement = settlement;
        result.invoice = replacementInvoice;
        return result;
    }

    global.RHLease = {
        DEPOSIT_STATUSES: DEPOSIT_STATUSES,
        CONTRACT_STATUSES: CONTRACT_STATUSES,
        initialize: initialize,
        parseDate: parseDate,
        defaultEndDate: defaultEndDate,
        addDays: addDays,
        lifecycleStatus: lifecycleStatus,
        isActiveContract: activeContract,
        isCurrentContract: currentContract,
        validateContractInput: validateContractInput,
        checkAvailability: checkAvailability,
        checkDepositAvailability: checkDepositAvailability,
        contractAlertStatus: contractAlertStatus,
        depositAlert: depositAlert,
        calculateDepositFull: calculateDepositFull,
        validateDepositInput: validateDepositInput,
        createDeposit: createDeposit,
        updateDeposit: updateDeposit,
        cancelDeposit: cancelDeposit,
        deleteDeposit: deleteDeposit,
        listDeposits: listDeposits,
        listDepositTransactions: transactionsFor,
        saveContract: saveContract,
        createContractFromDeposit: createContractFromDeposit,
        renewContract: renewContract,
        transferContract: transferContract,
        assignContract: assignContract,
        registerMoveOut: registerMoveOut,
        finalMeterRequirements: finalMeterRequirements,
        calculateFinalMeterAmount: calculateFinalMeterAmount,
        recordFinalMeters: recordFinalMeters,
        contractDeleteBlock: contractDeleteBlock,
        deleteContract: deleteContract,
        currentResidence: currentResidence,
        apartmentStatus: apartmentStatus,
        calculateSettlement: calculateSettlement,
        settleContract: settleContract
    };
})(window);