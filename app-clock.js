(function (global) {
    const TIME_ZONE = 'Asia/Ho_Chi_Minh';
    const DATE_FORMAT = new Intl.DateTimeFormat('vi-VN', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const CLOCK_FORMAT = new Intl.DateTimeFormat('vi-VN', {
        timeZone: TIME_ZONE,
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });

    function getParts(date) {
        const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).map(part => [part.type, part.value]));
        return values;
    }

    function dateKey(value) {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const parts = getParts(date);
        return parts.year + '-' + parts.month + '-' + parts.day;
    }

    function dateOnly(value) {
        const key = dateKey(value);
        if (!key) return null;
        const [year, month, day] = key.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day, 12));
    }

    function formatDate(value) {
        const date = dateOnly(value);
        return date ? DATE_FORMAT.format(date) : '—';
    }

    function compareDays(left, right) {
        const leftKey = dateKey(left);
        const rightKey = dateKey(right);
        if (!leftKey || !rightKey) return null;
        const toUtc = key => {
            const [year, month, day] = key.split('-').map(Number);
            return Date.UTC(year, month - 1, day);
        };
        return Math.round((toUtc(leftKey) - toUtc(rightKey)) / 86400000);
    }

    function addDays(value, amount) {
        const date = dateOnly(value);
        if (!date) return '';
        date.setUTCDate(date.getUTCDate() + Number(amount || 0));
        return date.toISOString().slice(0, 10);
    }

    // Tính kỳ thu theo ngày lịch tại Việt Nam, không dựa vào múi giờ của máy.
    function getPeriod(date, configuration) {
        const parts = getParts(date || new Date());
        const settings = Object.assign({ startDay: 28, endDay: 5 }, configuration || {});
        const year = Number(parts.year);
        const month = Number(parts.month);
        const previousMonth = new Date(Date.UTC(year, month - 2, 1, 12));
        const startYear = previousMonth.getUTCFullYear();
        const startMonth = String(previousMonth.getUTCMonth() + 1).padStart(2, '0');
        const currentMonth = String(month).padStart(2, '0');
        return {
            label: currentMonth + '/' + year,
            startDate: startYear + '-' + startMonth + '-' + String(settings.startDay).padStart(2, '0'),
            endDate: year + '-' + currentMonth + '-' + String(settings.endDay).padStart(2, '0'),
            startDay: settings.startDay,
            endDay: settings.endDay
        };
    }

    // Việt Nam dùng UTC+7; 16:59:59.999 UTC là cuối ngày địa phương.
    function endOfDay(value) {
        const key = dateKey(value);
        if (!key) return null;
        const [year, month, day] = key.split('-').map(Number);
        return Date.UTC(year, month - 1, day, 16, 59, 59, 999);
    }

    function isPastDue(value, now) {
        const deadline = endOfDay(value);
        return deadline !== null && (now || new Date()).getTime() > deadline;
    }

    function daysRemaining(value, now) {
        return compareDays(value, dateKey(now || new Date()));
    }

    // Giữ nguyên trạng thái đã trả/đang xác nhận; các hóa đơn còn lại xét theo hạn.
    function invoiceStatus(invoice, now) {
        if (invoice.status === 'paid' || invoice.status === 'payment_pending') return invoice.status;
        if (invoice.dueDate && isPastDue(invoice.dueDate, now)) return 'overdue';
        return invoice.status === 'overdue' ? 'unpaid' : invoice.status;
    }

    // So sánh ngày thuần để nhãn hạn không lệch khi máy ở múi giờ khác.
    function countdown(value, now) {
        const days = daysRemaining(value, now);
        if (days === null) return 'Chưa có hạn thanh toán';
        if (days > 0) return 'Còn ' + days + ' ngày';
        if (days === 0 && !isPastDue(value, now)) return 'Hết hạn hôm nay';
        return 'Quá hạn ' + Math.max(1, Math.abs(days)) + ' ngày';
    }

    function formatClock(now) {
        const value = CLOCK_FORMAT.format(now || new Date());
        return value.charAt(0).toLocaleUpperCase('vi-VN') + value.slice(1);
    }

    function start(onTick, interval) {
        let timer = null;
        const tick = () => onTick(new Date());
        const stop = () => {
            if (timer !== null) global.clearInterval(timer);
            timer = null;
        };
        const resume = () => {
            stop();
            if (global.document && global.document.hidden) return;
            tick();
            timer = global.setInterval(tick, interval || 1000);
        };
        global.document && global.document.addEventListener('visibilitychange', resume);
        resume();
        return () => {
            stop();
            global.document && global.document.removeEventListener('visibilitychange', resume);
        };
    }

    global.AppClock = {
        TIME_ZONE: TIME_ZONE,
        addDays: addDays,
        compareDays: compareDays,
        countdown: countdown,
        dateKey: dateKey,
        daysRemaining: daysRemaining,
        formatClock: formatClock,
        formatDate: formatDate,
        getParts: getParts,
        getPeriod: getPeriod,
        invoiceStatus: invoiceStatus,
        isPastDue: isPastDue,
        start: start
    };
})(window);