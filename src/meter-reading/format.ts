import type { MonthKey } from './types';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Current month as YYYY-MM (local time, never hard-coded). */
export function currentMonth(): MonthKey {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}

/** Today as YYYY-MM-DD (local time). */
export function today(): string {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function monthLabel(month: MonthKey): string {
    const [y, m] = month.split('-');
    return m && y ? 'Tháng ' + Number(m) + '/' + y : month;
}

export function dateTimeLabel(ts: number): string {
    if (!ts) return '—';
    const d = new Date(ts);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function dateLabel(date: string): string {
    const [y, m, d] = date.split('-');
    return y && m && d ? d + '/' + m + '/' + y : date || '—';
}

export function formatNumber(n: number): string {
    return n.toLocaleString('vi-VN');
}

export function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}
