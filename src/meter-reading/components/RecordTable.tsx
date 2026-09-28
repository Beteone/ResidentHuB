import type { ReactNode } from 'react';
import type { Apartment, Building, MeterRecord, TableRow, TypeFilter } from '../types';
import { KIND_META, STATUS_META } from '../types';
import { cx, dateTimeLabel, formatNumber } from '../format';

interface RecordTableProps {
    rows: TableRow[];
    typeFilter: TypeFilter;
    onTypeChange: (filter: TypeFilter) => void;
    buildings: Map<string, Building>;
    apartments: Map<string, Apartment>;
    onToggleApprove: (record: MeterRecord) => void;
    onEdit: (row: TableRow) => void;
    onDelete: (record: MeterRecord) => void;
    onRecord: (row: TableRow) => void;
    onViewPhoto: (record: MeterRecord) => void;
    emptyText: string;
}

const TYPE_TABS: Array<{ value: TypeFilter; label: string }> = [
    { value: 'all', label: 'Tất cả' },
    { value: 'dien', label: 'Công tơ điện' },
    { value: 'nuoc', label: 'Công tơ nước' }
];

const KIND_TAG = { dien: 'bg-orange-100 text-orange-700', nuoc: 'bg-sky-100 text-sky-700' } as const;

function TypeTabs({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
    return (
        <div role="tablist" aria-label="Loại công tơ" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {TYPE_TABS.map(tab => (
                <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={value === tab.value}
                    onClick={() => onChange(tab.value)}
                    className={cx(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm',
                        value === tab.value ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-500 hover:text-slate-800'
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

function Tag({ className, children }: { className: string; children: ReactNode }) {
    return <span className={cx('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>{children}</span>;
}

function IconButton({ title, onClick, className, icon }: { title: string; onClick: () => void; className: string; icon: string }) {
    return (
        <button type="button" title={title} aria-label={title} onClick={onClick} className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all', className)}>
            <i className={cx('fas', icon)} aria-hidden="true" />
        </button>
    );
}

export function RecordTable(props: RecordTableProps) {
    const { rows, typeFilter, onTypeChange, buildings, apartments, emptyText } = props;

    const place = (row: TableRow) => {
        const b = buildings.get(row.buildingId);
        const a = apartments.get(row.apartmentId);
        return { building: b ? b.shortName || b.name : '—', apartment: a ? a.name : '—' };
    };

    const latestCell = (row: TableRow) => {
        if (!row.record) return <span className="text-slate-400">—</span>;
        const r = row.record;
        return (
            <span className="inline-flex items-center gap-2">
                <span className="font-semibold text-slate-900">{formatNumber(r.latestIndex)}</span>
                <button
                    type="button"
                    disabled={!r.photo}
                    title={r.photo ? 'Xem ảnh đồng hồ' : 'Chưa có ảnh'}
                    aria-label={r.photo ? 'Xem ảnh đồng hồ' : 'Chưa có ảnh'}
                    onClick={() => props.onViewPhoto(r)}
                    className={cx('text-sm', r.photo ? 'text-blue-600 hover:text-blue-800' : 'cursor-not-allowed text-slate-300')}
                >
                    <i className="fas fa-image" aria-hidden="true" />
                </button>
            </span>
        );
    };

    const actions = (row: TableRow) => {
        if (!row.record) {
            return (
                <button type="button" onClick={() => props.onRecord(row)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                    <i className="fas fa-pen-to-square" aria-hidden="true" /> Ghi số
                </button>
            );
        }
        const record = row.record;
        return (
            <div className="flex items-center justify-end gap-1.5">
                {/* Always shown: toggles between Chưa duyệt ⇄ Đã chốt. */}
                {record.status === 'chưa_duyệt' ? (
                    <IconButton title="Duyệt" icon="fa-shield-halved" onClick={() => props.onToggleApprove(record)} className="bg-green-500 text-white hover:bg-green-600" />
                ) : (
                    <IconButton title="Bỏ duyệt (chuyển về Chưa duyệt)" icon="fa-shield-halved" onClick={() => props.onToggleApprove(record)} className="border border-green-200 bg-green-50 text-green-600 hover:bg-green-100" />
                )}
                <IconButton title="Sửa" icon="fa-pen" onClick={() => props.onEdit(row)} className="border border-slate-200 text-slate-500 hover:bg-slate-100" />
                <IconButton title="Xoá" icon="fa-trash" onClick={() => props.onDelete(record)} className="border border-red-100 text-red-500 hover:bg-red-50" />
            </div>
        );
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-slate-900">Danh sách bản ghi</h2>
                    <p className="text-xs text-slate-500">{rows.length} dòng theo bộ lọc hiện tại</p>
                </div>
                <TypeTabs value={typeFilter} onChange={onTypeChange} />
            </div>

            {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-12 text-center">
                    <i className="fas fa-gauge-high mb-3 text-4xl text-slate-300" aria-hidden="true" />
                    <p className="text-sm text-slate-500">{emptyText}</p>
                </div>
            ) : (
                <>
                    {/* Desktop / tablet: table */}
                    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                        <table className="w-full min-w-[860px] text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Tòa nhà / Căn hộ</th>
                                    <th className="px-4 py-3">Loại công tơ</th>
                                    <th className="px-4 py-3 text-right">Chỉ số trước</th>
                                    <th className="px-4 py-3 text-right">Chỉ số kỳ này</th>
                                    <th className="px-4 py-3 text-right">Tiêu thụ</th>
                                    <th className="px-4 py-3">Ngày ghi &amp; Người ghi</th>
                                    <th className="px-4 py-3">Trạng thái</th>
                                    <th className="px-4 py-3 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map(row => {
                                    const p = place(row);
                                    const r = row.record;
                                    return (
                                        <tr key={row.key} className="hover:bg-slate-50/70" data-row-status={row.status}>
                                            <td className="px-4 py-3"><div className="font-bold text-slate-900">{p.building}</div><div className="text-xs text-slate-500">{p.apartment}</div></td>
                                            <td className="px-4 py-3"><Tag className={KIND_TAG[row.kind]}>{KIND_META[row.kind].label}</Tag></td>
                                            <td className="px-4 py-3 text-right text-slate-600">{r ? formatNumber(r.previousIndex) : '—'}</td>
                                            <td className="px-4 py-3 text-right">{latestCell(row)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-blue-600">{r ? formatNumber(r.consumption) + ' ' + KIND_META[row.kind].unit : '—'}</td>
                                            <td className="px-4 py-3">{r ? <><div className="text-slate-800">{dateTimeLabel(r.recordedAt)}</div><div className="text-xs text-slate-500">{r.recordedBy || '—'}</div></> : <span className="text-slate-400">—</span>}</td>
                                            <td className="px-4 py-3"><Tag className={STATUS_META[row.status].tag}>{STATUS_META[row.status].label}</Tag></td>
                                            <td className="px-4 py-3 text-right">{actions(row)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile: stacked cards */}
                    <ul className="flex flex-col gap-3 md:hidden">
                        {rows.map(row => {
                            const p = place(row);
                            const r = row.record;
                            return (
                                <li key={row.key} className="rounded-xl border border-slate-200 p-3" data-row-status={row.status}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div><div className="font-bold text-slate-900">{p.building}</div><div className="text-xs text-slate-500">{p.apartment}</div></div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Tag className={KIND_TAG[row.kind]}>{KIND_META[row.kind].label}</Tag>
                                            <Tag className={STATUS_META[row.status].tag}>{STATUS_META[row.status].label}</Tag>
                                        </div>
                                    </div>
                                    {r && (
                                        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Trước</dt><dd className="font-semibold">{formatNumber(r.previousIndex)}</dd></div>
                                            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Kỳ này</dt><dd>{latestCell(row)}</dd></div>
                                            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Tiêu thụ</dt><dd className="font-bold text-blue-600">{formatNumber(r.consumption)} {KIND_META[row.kind].unit}</dd></div>
                                        </dl>
                                    )}
                                    <div className="mt-3 flex items-center justify-between gap-2">
                                        <div className="text-xs text-slate-500">{r ? dateTimeLabel(r.recordedAt) + (r.recordedBy ? ' · ' + r.recordedBy : '') : 'Chưa ghi số'}</div>
                                        {actions(row)}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
}
