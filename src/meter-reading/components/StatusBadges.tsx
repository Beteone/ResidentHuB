import type { ReactNode } from 'react';
import type { ApprovalStatus, ClosingStatus, MeterKind, TableRow } from '../types';
import { APPROVAL_META, CLOSING_META } from '../types';
import { cx } from '../format';
import { approvalSummary, type MeterApprovalState } from '../approval';

export function Tag({ className, children, title }: { className: string; children: ReactNode; title?: string }) {
    return <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>{children}</span>;
}

/** "Chưa chốt" / "Đã chốt" — whether the reading for the period exists. */
export function ClosingBadge({ status, title }: { status: ClosingStatus; title?: string }) {
    const meta = CLOSING_META[status];
    return (
        <Tag className={meta.tag} title={title}>
            <i className={cx('fas text-[10px]', meta.icon)} aria-hidden="true" /> {meta.label}
        </Tag>
    );
}

/** Read-only "Chưa duyệt" / "Đã duyệt" badge. */
export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
    const meta = APPROVAL_META[status];
    return (
        <Tag className={meta.tag}>
            <i className={cx('fas text-[10px]', meta.icon)} aria-hidden="true" /> {meta.label}
        </Tag>
    );
}

interface ApprovalToggleProps {
    status: ApprovalStatus;
    onToggle: () => void;
    /** What is being approved, for the accessible name (e.g. "căn 501"). */
    subject: string;
    size?: 'sm' | 'md';
    /** Text next to the switch; defaults to the current state ("Chưa duyệt" / "Đã duyệt"). */
    label?: string;
}

/**
 * Two-way approval control: a switch labelled with the current state.
 * Clicking flips "Chưa duyệt" ⇄ "Đã duyệt".
 */
export function ApprovalToggle({ status, onToggle, subject, size = 'sm', label }: ApprovalToggleProps) {
    const approved = status === 'đã_duyệt';
    return (
        <button
            type="button"
            role="switch"
            aria-checked={approved}
            aria-label={'Trạng thái duyệt ' + subject}
            title={approved ? 'Bấm để bỏ duyệt' : 'Bấm để duyệt'}
            onClick={e => { e.stopPropagation(); onToggle(); }}
            className={cx(
                'group inline-flex items-center gap-2 whitespace-nowrap rounded-full border font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
                size === 'md' ? 'py-1 pl-1 pr-3 text-sm' : 'py-0.5 pl-0.5 pr-2.5 text-xs',
                approved ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            )}
        >
            <span className={cx('relative inline-flex shrink-0 items-center rounded-full transition-colors', size === 'md' ? 'h-5 w-9' : 'h-4 w-7', approved ? 'bg-emerald-500' : 'bg-slate-300')}>
                <span className={cx(
                    'absolute rounded-full bg-white shadow transition-all',
                    size === 'md' ? 'h-4 w-4' : 'h-3 w-3',
                    approved ? (size === 'md' ? 'left-[18px]' : 'left-[14px]') : 'left-0.5'
                )} />
            </span>
            {label ?? APPROVAL_META[status].label}
        </button>
    );
}

const SUMMARY_KINDS: MeterKind[] = ['dien', 'nuoc'];
const SEGMENT: Record<MeterApprovalState, string> = { approved: 'bg-emerald-500', pending: 'bg-amber-300', not_closed: 'bg-slate-200' };
const MARK: Record<MeterApprovalState, { icon: string; tone: string; hint: string }> = {
    approved: { icon: 'fas fa-check', tone: 'text-emerald-600', hint: 'đã duyệt' },
    pending: { icon: 'far fa-circle', tone: 'text-amber-500', hint: 'chưa duyệt' },
    not_closed: { icon: 'fas fa-minus', tone: 'text-slate-300', hint: 'chưa chốt' }
};
const SUMMARY_TONE = { none: 'text-slate-500', partial: 'text-amber-700', all: 'text-emerald-700' } as const;

const KIND_NAME: Record<MeterKind, string> = { dien: 'Điện', nuoc: 'Nước' };
/** One half of the room status strip, per meter state. */
const CHIP: Record<MeterApprovalState, { icon: string; box: string; hint: string }> = {
    approved: { icon: 'fa-circle-check', box: 'bg-emerald-500 text-white', hint: 'đã duyệt' },
    pending: { icon: 'fa-hourglass-half', box: 'bg-amber-50 text-amber-700', hint: 'chờ duyệt' },
    not_closed: { icon: 'fa-minus', box: 'bg-slate-50 text-slate-400', hint: 'chưa có số' }
};

/**
 * Room approval strip for the "Tất cả" tab — DISPLAY ONLY. Two halves,
 * [Điện | Nước], filled green once that meter is approved, so a partial
 * approval ("Đã duyệt: Điện") is visible at a glance.
 */
export function RoomApprovalStatus({ row }: { row: Pick<TableRow, 'dien' | 'nuoc'> }) {
    const s = approvalSummary(row);
    return (
        <div className="flex cursor-default select-none flex-col items-start gap-1" data-summary={s.tone} data-approved-count={s.approvedCount}>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-[11px] font-semibold">
                {SUMMARY_KINDS.map((k, i) => {
                    const chip = CHIP[s.meters[k]];
                    return (
                        <span
                            key={k}
                            title={KIND_NAME[k] + ' ' + chip.hint}
                            className={cx('inline-flex items-center gap-1 whitespace-nowrap px-2 py-1', chip.box, i > 0 && 'border-l border-slate-200')}
                            data-meter-kind={k}
                            data-approval={s.meters[k]}
                        >
                            <i className={cx('fas text-[10px]', chip.icon)} aria-hidden="true" /> {KIND_NAME[k]}
                        </span>
                    );
                })}
            </div>
            <span className={cx('text-[11px] font-semibold', SUMMARY_TONE[s.tone])} data-out="approval-summary">{s.label} · {s.approvedCount}/{s.total}</span>
        </div>
    );
}

/**
 * Room approval summary — DISPLAY ONLY (not a control). Derived on every
 * render from the room's own Điện / Nước readings; nothing is stored for it.
 */
export function ApprovalSummaryBar({ row }: { row: Pick<TableRow, 'dien' | 'nuoc'> }) {
    const s = approvalSummary(row);
    const text = s.label + ' · ' + s.approvedCount + '/' + s.total;
    return (
        <div
            className="flex w-full min-w-[150px] max-w-[190px] cursor-default select-none flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1.5"
            title={SUMMARY_KINDS.map(k => (k === 'dien' ? 'Điện' : 'Nước') + ' ' + MARK[s.meters[k]].hint).join(' · ')}
            data-summary={s.tone}
            data-approved-count={s.approvedCount}
        >
            <div className="flex gap-1" aria-hidden="true">
                {SUMMARY_KINDS.map(k => <span key={k} className={cx('h-1.5 flex-1 rounded-full', SEGMENT[s.meters[k]])} />)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500" aria-hidden="true">
                {SUMMARY_KINDS.map((k, i) => (
                    <span key={k} className="inline-flex items-center gap-1">
                        {i > 0 && <span className="text-slate-300">|</span>}
                        {k === 'dien' ? 'Điện' : 'Nước'} <i className={cx(MARK[s.meters[k]].icon, MARK[s.meters[k]].tone, 'text-[10px]')} />
                    </span>
                ))}
            </div>
            <div className={cx('text-xs font-semibold', SUMMARY_TONE[s.tone])} data-out="approval-summary">{text}</div>
        </div>
    );
}
