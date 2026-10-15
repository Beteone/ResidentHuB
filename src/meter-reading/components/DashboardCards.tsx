import type { StatusFilter } from '../types';
import { cx } from '../format';

export interface StatusCounts {
    chuaChot: number;
    daChot: number;
    chuaDuyet: number;
    daDuyet: number;
    /** Apartment rows in scope. */
    total: number;
    /** Rows with at least one reading — the ones that can be approved. */
    recorded: number;
}

interface DashboardCardsProps {
    counts: StatusCounts;
    statusFilter: StatusFilter;
    onSelect: (filter: StatusFilter) => void;
}

interface CardDef {
    filter: Exclude<StatusFilter, 'all'>;
    group: 'Chốt số' | 'Duyệt';
    label: string;
    hint: string;
    value: (c: StatusCounts) => number;
    of: (c: StatusCounts) => number;
    tone: string;
    icon: string;
}

const CARDS: CardDef[] = [
    { filter: 'chưa_chốt', group: 'Chốt số', label: 'Chưa chốt', hint: 'Còn công tơ chưa có chỉ số kỳ này', value: c => c.chuaChot, of: c => c.total, tone: 'text-rose-600', icon: 'fa-circle-exclamation' },
    { filter: 'đã_chốt', group: 'Chốt số', label: 'Đã chốt', hint: 'Đã nhập đủ điện & nước', value: c => c.daChot, of: c => c.total, tone: 'text-blue-600', icon: 'fa-lock' },
    { filter: 'chưa_duyệt', group: 'Duyệt', label: 'Chưa duyệt', hint: 'Đã có số, chờ người duyệt', value: c => c.chuaDuyet, of: c => c.recorded, tone: 'text-amber-600', icon: 'fa-hourglass-half' },
    { filter: 'đã_duyệt', group: 'Duyệt', label: 'Đã duyệt', hint: 'Mọi chỉ số đã nhập đều được duyệt', value: c => c.daDuyet, of: c => c.recorded, tone: 'text-emerald-600', icon: 'fa-circle-check' }
];

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function Progress({ label, value, bar }: { label: string; value: number; bar: string }) {
    return (
        <div>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>{label}</span>
                <span className="font-semibold text-slate-700">{value}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={cx('h-full rounded-full transition-all', bar)} style={{ width: value + '%' }} />
            </div>
        </div>
    );
}

/** Overview cards that double as quick status filters. Clicking the active card clears the filter. */
export function DashboardCards({ counts, statusFilter, onSelect }: DashboardCardsProps) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">Tổng quan chốt &amp; duyệt chỉ số</h2>
                <button
                    type="button"
                    onClick={() => onSelect('all')}
                    className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-all', statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                    Tất cả · {counts.total}
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {CARDS.map(card => {
                    const active = statusFilter === card.filter;
                    return (
                        <button
                            key={card.filter}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onSelect(active ? 'all' : card.filter)}
                            className={cx(
                                'cursor-pointer rounded-xl border border-b-4 p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md',
                                active ? 'border-blue-200 border-b-blue-600 bg-blue-50' : 'border-slate-200 border-b-transparent bg-slate-50/60'
                            )}
                        >
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{card.group}</div>
                            <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-slate-600">
                                <i className={cx('fas', card.icon, card.tone)} aria-hidden="true" />
                                {card.label}
                            </div>
                            <div className={cx('mt-2 text-3xl font-extrabold', card.tone)}>
                                {card.value(counts)}
                                <span className="ml-1 text-base font-semibold text-slate-400">/{card.of(counts)}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
                        </button>
                    );
                })}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Progress label="Tiến độ chốt" value={pct(counts.daChot, counts.total)} bar="bg-blue-500" />
                <Progress label="Tiến độ duyệt" value={pct(counts.daDuyet, counts.recorded)} bar="bg-emerald-500" />
            </div>
        </section>
    );
}
