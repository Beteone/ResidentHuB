import type { ReactNode } from 'react';
import type { ApprovalStatus, ClosingStatus } from '../types';
import { APPROVAL_META, CLOSING_META } from '../types';
import { cx } from '../format';

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
}

/**
 * Two-way approval control: a switch labelled with the current state.
 * Clicking flips "Chưa duyệt" ⇄ "Đã duyệt".
 */
export function ApprovalToggle({ status, onToggle, subject, size = 'sm' }: ApprovalToggleProps) {
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
            {APPROVAL_META[status].label}
        </button>
    );
}
