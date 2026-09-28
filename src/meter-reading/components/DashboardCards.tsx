import type { StatusFilter } from '../types';
import { cx } from '../format';

export interface StatusCounts {
    daChot: number;
    chuaDuyet: number;
    chuaChot: number;
    total: number;
}

interface DashboardCardsProps {
    counts: StatusCounts;
    statusFilter: StatusFilter;
    onSelect: (filter: StatusFilter) => void;
}

interface CardDef {
    filter: Exclude<StatusFilter, 'all'>;
    label: string;
    hint: string;
    value: (c: StatusCounts) => number;
    tone: string;
    icon: string;
}

const CARDS: CardDef[] = [
    { filter: 'đã_chốt', label: 'Đã chốt', hint: 'Đã được quản lý duyệt', value: c => c.daChot, tone: 'text-emerald-600', icon: 'fa-circle-check' },
    { filter: 'chưa_duyệt', label: 'Chưa duyệt', hint: 'Đã ghi số, chờ duyệt', value: c => c.chuaDuyet, tone: 'text-amber-600', icon: 'fa-hourglass-half' },
    { filter: 'chưa_chốt', label: 'Chưa chốt', hint: 'Công tơ chưa ghi số', value: c => c.chuaChot, tone: 'text-rose-600', icon: 'fa-circle-exclamation' }
];

/** Overview cards that double as quick status filters. Clicking the active card clears the filter. */
export function DashboardCards({ counts, statusFilter, onSelect }: DashboardCardsProps) {
    const progress = counts.total ? Math.round((counts.daChot / counts.total) * 100) : 0;
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">Tổng quan chốt chỉ số</h2>
                <button
                    type="button"
                    onClick={() => onSelect('all')}
                    className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-all', statusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                    Tất cả · {counts.total}
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                <i className={cx('fas', card.icon, card.tone)} aria-hidden="true" />
                                {card.label}
                            </div>
                            <div className={cx('mt-2 text-3xl font-extrabold', card.tone)}>
                                {card.value(counts)}
                                <span className="ml-1 text-base font-semibold text-slate-400">/{counts.total}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{card.hint}</div>
                        </button>
                    );
                })}
            </div>
            <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Tiến độ chốt</span>
                    <span className="font-semibold text-slate-700">{progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: progress + '%' }} />
                </div>
            </div>
        </section>
    );
}
