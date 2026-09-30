import type { KeyboardEvent, ReactNode } from 'react';
import type { Apartment, Building, MeterKind, MeterRecord, TableRow, TypeFilter } from '../types';
import { KIND_META } from '../types';
import { cx, dateTimeLabel, formatNumber } from '../format';
import { ApprovalToggle, ClosingBadge, Tag } from './StatusBadges';

interface RecordTableProps {
    rows: TableRow[];
    typeFilter: TypeFilter;
    onTypeChange: (filter: TypeFilter) => void;
    buildings: Map<string, Building>;
    apartments: Map<string, Apartment>;
    selectedKey: string | null;
    onOpen: (row: TableRow) => void;
    onToggleApprove: (row: TableRow) => void;
    onEdit: (row: TableRow) => void;
    onDelete: (row: TableRow) => void;
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
const KIND_TEXT = { dien: 'text-orange-600', nuoc: 'text-blue-600' } as const;

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

function IconButton({ title, onClick, className, icon }: { title: string; onClick: () => void; className: string; icon: string }) {
    return (
        <button type="button" title={title} aria-label={title} onClick={onClick} className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all', className)}>
            <i className={cx('fas', icon)} aria-hidden="true" />
        </button>
    );
}

/** Clicks on controls inside a row must not also open the detail drawer. */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function RecordTable(props: RecordTableProps) {
    const { rows, typeFilter, onTypeChange, buildings, apartments, emptyText, selectedKey } = props;
    // View mode: the tabs choose which meter lines the cells show; rows stay the same.
    const visibleKinds: MeterKind[] = typeFilter === 'all' ? ['dien', 'nuoc'] : [typeFilter];

    const place = (row: TableRow) => {
        const b = buildings.get(row.buildingId);
        const a = apartments.get(row.apartmentId);
        return { building: b ? b.shortName || b.name : '—', apartment: a ? a.name : '—' };
    };

    /** Stacks one line per visible meter inside a cell: Điện on top (cam), Nước below (xanh dương). */
    const stacked = (row: TableRow, render: (r: MeterRecord, kind: MeterKind) => ReactNode, align: 'left' | 'right' = 'right', empty?: (kind: MeterKind) => ReactNode) => (
        <div className={cx('flex flex-col gap-1', align === 'right' && 'items-end')}>
            {visibleKinds.map(kind => {
                const r = row[kind];
                return (
                    <div key={kind} className={cx('flex min-h-[22px] items-center whitespace-nowrap', KIND_TEXT[kind])} data-meter-kind={kind}>
                        {r ? render(r, kind) : empty ? empty(kind) : <span className="text-slate-400">—</span>}
                    </div>
                );
            })}
        </div>
    );

    // Most recent reading among the meters in view (for the closer line).
    const lastRecorded = (row: TableRow): MeterRecord | null =>
        visibleKinds.map(k => row[k]).filter((r): r is MeterRecord => !!r).sort((a, b) => b.recordedAt - a.recordedAt)[0] || null;

    // Most recent approval among the meters in view (for the approver line).
    const lastApproved = (row: TableRow): MeterRecord | null =>
        visibleKinds.map(k => row[k]).filter((r): r is MeterRecord => !!r && r.approvalStatus === 'đã_duyệt').sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0))[0] || null;

    const latestCell = (r: MeterRecord) => (
        <span className="inline-flex items-center gap-2">
            <span className="font-semibold">{formatNumber(r.latestIndex)}</span>
            <button
                type="button"
                disabled={!r.photo}
                title={r.photo ? 'Xem ảnh đồng hồ' : 'Chưa có ảnh'}
                aria-label={r.photo ? 'Xem ảnh đồng hồ' : 'Chưa có ảnh'}
                onClick={e => { stop(e); props.onViewPhoto(r); }}
                className={cx('text-sm', r.photo ? 'text-blue-600 hover:text-blue-800' : 'cursor-not-allowed text-slate-300')}
            >
                <i className="fas fa-image" aria-hidden="true" />
            </button>
        </span>
    );

    const closingCell = (row: TableRow, align: 'left' | 'right' = 'left') => {
        const r = lastRecorded(row);
        return (
            <div className="flex flex-col gap-1">
                {stacked(
                    row,
                    m => <ClosingBadge status="đã_chốt" title={'Chốt bởi ' + (m.recordedBy || '—') + ' lúc ' + dateTimeLabel(m.recordedAt)} />,
                    align,
                    () => <ClosingBadge status="chưa_chốt" />
                )}
                {r && <div className="text-[11px] leading-tight text-slate-500">{r.recordedBy ? r.recordedBy + ' · ' : ''}{dateTimeLabel(r.recordedAt)}</div>}
            </div>
        );
    };

    const approvalCell = (row: TableRow) => {
        if (!row.approval) return <span className="text-xs text-slate-400">Chưa có số để duyệt</span>;
        const a = lastApproved(row);
        return (
            <div className="flex flex-col items-start gap-1">
                <ApprovalToggle status={row.approval} subject={'căn ' + place(row).apartment} onToggle={() => props.onToggleApprove(row)} />
                <div className="text-[11px] leading-tight text-slate-500">
                    {row.approval === 'đã_duyệt' && a ? <>{a.approvedBy || '—'} · {dateTimeLabel(a.approvedAt || 0)}</> : 'Chờ người duyệt'}
                </div>
            </div>
        );
    };

    // Actions apply to the whole apartment (Điện + Nước).
    const actions = (row: TableRow) => {
        if (!row.dien && !row.nuoc) {
            return (
                <button type="button" onClick={() => props.onRecord(row)} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                    <i className="fas fa-pen-to-square" aria-hidden="true" /> Ghi số
                </button>
            );
        }
        return (
            <div className="flex items-center justify-end gap-1.5">
                <IconButton title="Sửa" icon="fa-pen" onClick={() => props.onEdit(row)} className="border border-slate-200 text-slate-500 hover:bg-slate-100" />
                <IconButton title="Xoá" icon="fa-trash" onClick={() => props.onDelete(row)} className="border border-red-100 text-red-500 hover:bg-red-50" />
            </div>
        );
    };

    const rowProps = (row: TableRow) => {
        const p = place(row);
        return {
            tabIndex: 0,
            'aria-label': 'Xem chi tiết chỉ số căn ' + p.apartment + ' — ' + p.building,
            onClick: () => props.onOpen(row),
            onKeyDown: (e: KeyboardEvent) => {
                if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                e.preventDefault();
                props.onOpen(row);
            },
            'data-closing': row.closing,
            'data-approval': row.approval || 'none'
        };
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-slate-900">Danh sách bản ghi</h2>
                    <p className="text-xs text-slate-500">{rows.length} dòng theo bộ lọc hiện tại · bấm vào một dòng để xem chi tiết</p>
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
                        <table className="w-full min-w-[980px] text-sm">
                            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Tòa nhà / Căn hộ</th>
                                    <th className="px-4 py-3">Loại công tơ</th>
                                    <th className="px-4 py-3 text-right">Chỉ số trước</th>
                                    <th className="px-4 py-3 text-right">Chỉ số kỳ này</th>
                                    <th className="px-4 py-3 text-right">Tiêu thụ</th>
                                    <th className="px-4 py-3">Chốt số &amp; Người chốt</th>
                                    <th className="px-4 py-3">Duyệt &amp; Người duyệt</th>
                                    <th className="px-4 py-3 text-right">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map(row => {
                                    const p = place(row);
                                    return (
                                        <tr
                                            key={row.key}
                                            {...rowProps(row)}
                                            className={cx(
                                                'cursor-pointer align-top outline-none transition-colors focus-visible:bg-blue-50/60',
                                                selectedKey === row.key ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                                            )}
                                        >
                                            <td className="px-4 py-3"><div className="font-bold text-slate-900">{p.building}</div><div className="text-xs text-slate-500">{p.apartment}</div></td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col items-start gap-1">
                                                    {visibleKinds.map(kind => <div key={kind} className="flex min-h-[22px] items-center"><Tag className={KIND_TAG[kind]}>{KIND_META[kind].label}</Tag></div>)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">{stacked(row, m => formatNumber(m.previousIndex))}</td>
                                            <td className="px-4 py-3 text-right">{stacked(row, m => latestCell(m))}</td>
                                            <td className="px-4 py-3 text-right font-bold">{stacked(row, (m, kind) => formatNumber(m.consumption) + ' ' + KIND_META[kind].unit)}</td>
                                            <td className="px-4 py-3">{closingCell(row)}</td>
                                            <td className="px-4 py-3">{approvalCell(row)}</td>
                                            <td className="px-4 py-3 text-right" onClick={stop} onKeyDown={stop}>{actions(row)}</td>
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
                            return (
                                <li
                                    key={row.key}
                                    {...rowProps(row)}
                                    className={cx('cursor-pointer rounded-xl border p-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-300', selectedKey === row.key ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200')}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div><div className="font-bold text-slate-900">{p.building}</div><div className="text-xs text-slate-500">{p.apartment}</div></div>
                                        <div className="flex flex-col items-end gap-1">
                                            {visibleKinds.map(kind => <Tag key={kind} className={KIND_TAG[kind]}>{KIND_META[kind].label}</Tag>)}
                                        </div>
                                    </div>
                                    {(row.dien || row.nuoc) && (
                                        <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Trước</dt><dd className="font-semibold">{stacked(row, m => formatNumber(m.previousIndex), 'left')}</dd></div>
                                            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Kỳ này</dt><dd>{stacked(row, m => latestCell(m), 'left')}</dd></div>
                                            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-slate-500">Tiêu thụ</dt><dd className="font-bold">{stacked(row, (m, kind) => formatNumber(m.consumption) + ' ' + KIND_META[kind].unit, 'left')}</dd></div>
                                        </dl>
                                    )}
                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Chốt số</div>{closingCell(row)}</div>
                                        <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Duyệt</div>{approvalCell(row)}</div>
                                    </div>
                                    <div className="mt-3 flex justify-end" onClick={stop} onKeyDown={stop}>{actions(row)}</div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </section>
    );
}
