// Room-level approval is NEVER stored: it is derived on every render from the
// room's own Điện and Nước readings (apartmentId + meterType + period), so it
// cannot drift from them. Only `import type` here — keeps this file pure.
import type { MeterKind, MeterRecord, MonthKey, StatusFilter, TableRow } from './types';

const KINDS: MeterKind[] = ['dien', 'nuoc'];

type Readings = Pick<TableRow, 'dien' | 'nuoc'>;

/** Per-meter state as shown in the summary bar. */
export type MeterApprovalState = 'approved' | 'pending' | 'not_closed';

export interface ApprovalSummary {
    /** Per meter: approved ✓, recorded but not approved ○, or no reading yet. */
    meters: Record<MeterKind, MeterApprovalState>;
    approvedCount: number;
    /** Always 2: every room has one Điện and one Nước meter. */
    total: number;
    /** "Chưa duyệt" · "Đã duyệt: Điện" · "Đã duyệt: Nước" · "Đã duyệt tất cả" */
    label: string;
    tone: 'none' | 'partial' | 'all';
}

export const isApproved = (r: MeterRecord | null): r is MeterRecord => !!r && r.approvalStatus === 'đã_duyệt';

export function approvalSummary(row: Readings): ApprovalSummary {
    const meters = {} as Record<MeterKind, MeterApprovalState>;
    for (const kind of KINDS) {
        const r = row[kind];
        meters[kind] = !r ? 'not_closed' : isApproved(r) ? 'approved' : 'pending';
    }
    const dien = meters.dien === 'approved';
    const nuoc = meters.nuoc === 'approved';
    const approvedCount = Number(dien) + Number(nuoc);
    const label = dien && nuoc ? 'Đã duyệt tất cả' : dien ? 'Đã duyệt: Điện' : nuoc ? 'Đã duyệt: Nước' : 'Chưa duyệt';
    return { meters, approvedCount, total: KINDS.length, label, tone: approvedCount === KINDS.length ? 'all' : approvedCount ? 'partial' : 'none' };
}

/** Status-card predicate for the approval dimension, derived from the readings. */
export function matchesApprovalFilter(row: Readings, filter: Extract<StatusFilter, 'chưa_duyệt' | 'đã_duyệt'>): boolean {
    const recorded = KINDS.map(k => row[k]).filter((r): r is MeterRecord => !!r);
    if (!recorded.length) return false; // nothing recorded → nothing to approve
    const pending = recorded.some(r => !isApproved(r));
    return filter === 'chưa_duyệt' ? pending : !pending;
}

/**
 * Readings "Duyệt tất cả" may approve: only those in the given (visible,
 * filtered) rows, of the working period, that are closed (have a reading) and
 * are not approved yet. A missing meter has no record, so it is never touched.
 */
export function approvableReadings(rows: Readings[], period: MonthKey): MeterRecord[] {
    return rows.flatMap(row => KINDS.map(k => row[k])).filter((r): r is MeterRecord => !!r && r.periodMonth === period && !isApproved(r));
}
