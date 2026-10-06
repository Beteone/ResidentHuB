import type { ReactNode } from 'react';
import type { Apartment, ApartmentContext, ApprovalStatus, Building, MeterKind, MeterRecord, MonthKey, TableRow } from '../types';
import { KIND_META } from '../types';
import { cx, dateLabel, dateTimeLabel, formatNumber, monthLabel } from '../format';
import { Overlay } from './Overlay';
import { ApprovalSummaryBar, ApprovalToggle, ClosingBadge } from './StatusBadges';

interface RecordDrawerProps {
    row: TableRow;
    month: MonthKey;
    building: Building | undefined;
    apartment: Apartment | undefined;
    context: ApartmentContext | null;
    onClose: () => void;
    onSetApproval: (records: MeterRecord[], approval: ApprovalStatus, subject: string) => void;
    onEdit: (row: TableRow, kind?: MeterKind) => void;
    onDelete: (row: TableRow) => void;
    onViewPhoto: (record: MeterRecord) => void;
}

const KINDS: MeterKind[] = ['dien', 'nuoc'];

const THEME: Record<MeterKind, { box: string; icon: string }> = {
    dien: { box: 'border-amber-200 bg-amber-50/40', icon: 'text-amber-500' },
    nuoc: { box: 'border-sky-200 bg-sky-50/40', icon: 'text-sky-500' }
};

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
    return (
        <div className={cx('min-w-0', wide && 'col-span-2')}>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{children}</dd>
        </div>
    );
}

const dash = <span className="text-slate-400">—</span>;

/**
 * Right-hand side panel with everything known about one apartment's readings
 * for the period. It reads the live row, so approving here updates it in place.
 */
export function RecordDrawer({ row, month, building, apartment, context, onClose, onSetApproval, onEdit, onDelete, onViewPhoto }: RecordDrawerProps) {
    const aptName = apartment?.name || '—';
    const hasRecords = !!(row.dien || row.nuoc);

    const meterSection = (kind: MeterKind) => {
        const meta = KIND_META[kind];
        const r = row[kind];
        return (
            <section key={kind} className={cx('rounded-2xl border p-4', THEME[kind].box)} data-meter-kind={kind}>
                <header className="mb-3 flex flex-wrap items-center gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-slate-900">
                        <i className={cx('fas', meta.icon, THEME[kind].icon)} aria-hidden="true" /> {meta.label}
                    </h3>
                    <span className="ml-auto"><ClosingBadge status={r ? 'đã_chốt' : 'chưa_chốt'} /></span>
                </header>

                {!r ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                        Chưa có chỉ số kỳ này.
                        <button type="button" onClick={() => onEdit(row, kind)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                            <i className="fas fa-pen-to-square" aria-hidden="true" /> Ghi số
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center">
                            <div><dt className="text-[11px] text-slate-500">Chỉ số trước</dt><dd className="font-semibold text-slate-800">{formatNumber(r.previousIndex)}</dd></div>
                            <div><dt className="text-[11px] text-slate-500">Chỉ số kỳ này</dt><dd className="font-semibold text-slate-900">{formatNumber(r.latestIndex)}</dd></div>
                            <div><dt className="text-[11px] text-slate-500">Tiêu thụ</dt><dd className="font-extrabold text-blue-600">{formatNumber(r.consumption)} {meta.unit}</dd></div>
                        </dl>

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Field label="Loại công tơ">{meta.label}</Field>
                            <Field label="Mã công tơ">{r.meterCode || dash}</Field>
                            <Field label="Ngày chốt">{dateLabel(r.closingDate)}</Field>
                            <Field label="Kỳ">{monthLabel(r.periodMonth)}</Field>
                        </dl>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                <i className="fas fa-lock text-blue-500" aria-hidden="true" /> Chốt chỉ số
                            </h4>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <Field label="Người ghi / chốt">{r.recordedBy || dash}</Field>
                                <Field label="Thời gian ghi">{dateTimeLabel(r.recordedAt)}</Field>
                            </dl>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                    <i className="fas fa-shield-halved text-emerald-500" aria-hidden="true" /> Duyệt
                                </h4>
                                <ApprovalToggle
                                    status={r.approvalStatus}
                                    subject={meta.label.toLowerCase() + ' căn ' + aptName}
                                    onToggle={() => onSetApproval([r], r.approvalStatus === 'đã_duyệt' ? 'chưa_duyệt' : 'đã_duyệt', meta.label.toLowerCase() + ' căn ' + aptName)}
                                />
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                                <Field label="Người duyệt">{r.approvedBy || dash}</Field>
                                <Field label="Thời gian duyệt">{r.approvedAt ? dateTimeLabel(r.approvedAt) : dash}</Field>
                            </dl>
                        </div>

                        <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ảnh chỉ số</div>
                            {r.photo ? (
                                <button type="button" onClick={() => onViewPhoto(r)} className="group relative block overflow-hidden rounded-xl border border-slate-200" aria-label={'Xem ảnh ' + meta.label.toLowerCase()}>
                                    <img src={r.photo} alt={'Ảnh chỉ số ' + meta.label.toLowerCase() + ' căn ' + aptName} className="h-36 w-full object-cover transition group-hover:scale-[1.02]" />
                                    <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] text-white"><i className="fas fa-expand mr-1" aria-hidden="true" />Phóng to</span>
                                </button>
                            ) : (
                                <p className="text-sm text-slate-400">Chưa có ảnh</p>
                            )}
                        </div>
                    </div>
                )}
            </section>
        );
    };

    return (
        <Overlay placement="right" onClose={onClose}>
            <aside
                role="dialog" aria-modal="true" aria-labelledby="mr-drawer-title"
                className="flex h-full w-full max-w-[520px] animate-[rhDrawerIn_.25s_ease] flex-col bg-white shadow-2xl"
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Chi tiết chỉ số · {monthLabel(month)}</p>
                        <h2 id="mr-drawer-title" className="truncate text-lg font-bold text-slate-900">Căn {aptName} — {building?.name || '—'}</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
                        <i className="fas fa-xmark" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-4">
                    <section className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Thông tin chung</h3>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Field label="Tháng / kỳ">{monthLabel(month)}</Field>
                            <Field label="Tòa nhà">{building?.name || dash}</Field>
                            <Field label="Căn hộ / phòng">{aptName}{apartment?.floor ? ' · ' + apartment.floor : ''}</Field>
                            <Field label="Địa chỉ">{building?.address || dash}</Field>
                            {context && <Field label="Hợp đồng">{context.contractCode || dash}</Field>}
                            {context && <Field label="Khách thuê">{context.tenantName || dash}{context.tenantPhone ? ' · ' + context.tenantPhone : ''}</Field>}
                        </dl>
                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <span className="font-semibold">Cả căn:</span>
                            <ClosingBadge status={row.closing} />
                            {/* Display only — approve each meter with its own switch below. */}
                            <ApprovalSummaryBar row={row} />
                        </div>
                    </section>

                    {KINDS.map(meterSection)}
                </div>

                <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
                    {hasRecords && (
                        <button type="button" onClick={() => onDelete(row)} className="mr-auto inline-flex items-center gap-2 rounded-lg border border-red-100 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50">
                            <i className="fas fa-trash" aria-hidden="true" /> Xoá
                        </button>
                    )}
                    <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Đóng</button>
                    <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 px-5 py-2 text-sm font-semibold text-white shadow hover:opacity-95">
                        <i className={cx('fas', hasRecords ? 'fa-pen' : 'fa-pen-to-square')} aria-hidden="true" /> {hasRecords ? 'Sửa chỉ số' : 'Ghi số'}
                    </button>
                </footer>
            </aside>
        </Overlay>
    );
}
