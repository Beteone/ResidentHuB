// Data shapes for the "Ghi chỉ số điện nước" module.
//
// Two independent dimensions per meter reading:
//  - CHỐT (closing): derived, never stored. A meter with a reading for the
//    period is "đã_chốt"; one without is "chưa_chốt". Whoever records the
//    reading is the closer (recordedBy / recordedAt).
//  - DUYỆT (approval): stored on the record, "chưa_duyệt" ⇄ "đã_duyệt".
//    Approving stores approvedBy / approvedAt. Closer and approver are separate
//    fields so a multi-user workflow needs no change here.

/** Meter kind as used by this module's UI and payloads. */
export type MeterKind = 'dien' | 'nuoc';

/** Meter kind as stored in RHD (data.js `meters` entity). */
export type StoredMeterType = 'electricity' | 'water';

/** Closing status — derived from whether a reading exists for the period. */
export type ClosingStatus = 'chưa_chốt' | 'đã_chốt';

/** Approval status — stored on each record. */
export type ApprovalStatus = 'chưa_duyệt' | 'đã_duyệt';

/** View mode of the table: which meter(s) the cells show. Never hides rows. */
export type TypeFilter = 'all' | MeterKind;

/** Quick filter from the overview cards; closing and approval filters are separate predicates. */
export type StatusFilter = 'all' | ClosingStatus | ApprovalStatus;

/** YYYY-MM */
export type MonthKey = string;

export interface Building {
    id: string;
    name: string;
    shortName?: string;
    address?: string;
}

export interface Apartment {
    id: string;
    buildingId: string;
    name: string;
    floor?: string;
    active?: boolean;
}

/** The signed-in user performing an action (from the auth session, never hard-coded). */
export interface Actor {
    id: string;
    name: string;
}

/** One reading of one meter for one period — Điện and Nước are separate records. */
export interface MeterRecord {
    id: string;
    kind: MeterKind;
    buildingId: string;
    apartmentId: string;
    periodMonth: MonthKey;
    closingDate: string;
    meterCode: string;
    previousIndex: number;
    latestIndex: number;
    consumption: number;
    photo: string;
    /** Closer: who entered the reading, and when. */
    recordedAt: number;
    recordedById: string;
    recordedBy: string;
    /** Approver: independent from the closer. */
    approvalStatus: ApprovalStatus;
    approvedAt: number | null;
    approvedById: string;
    approvedBy: string;
}

/**
 * A table row: ONE apartment for one period. Điện and Nước share the row;
 * a side is null while that meter has no reading yet ("chưa_chốt").
 */
export interface TableRow {
    key: string;
    buildingId: string;
    apartmentId: string;
    dien: MeterRecord | null;
    nuoc: MeterRecord | null;
    /** "đã_chốt" only once both meters have a reading for the period. */
    closing: ClosingStatus;
    // No room-level approval field on purpose: approval lives on each reading
    // and the room summary is derived from dien/nuoc (see approval.ts).
}

/** Contract / tenant linked to an apartment, read from the existing store. */
export interface ApartmentContext {
    contractCode: string;
    tenantName: string;
    tenantPhone: string;
}

/** One meter's part of an apartment payload. */
export interface MeterReadingPayload {
    recordId: string | null;
    maCongTo: string;
    chiSoTruoc: number;
    chiSoKyNay: number;
    tieuThu: number;
    anh: string;
}

/**
 * What the Add/Edit modal submits — ONE object per apartment. A side is null
 * when it was left blank or did not change.
 */
export interface ApartmentPayload {
    buildingId: string;
    apartmentId: string;
    thangChot: MonthKey;
    ngayChot: string;
    dien: MeterReadingPayload | null;
    nuoc: MeterReadingPayload | null;
}

/** Per-meter state of the modal (kept separately for Điện and Nước). */
export interface MeterInputState {
    recordId: string | null;
    meterCode: string;
    chiSoTruoc: string;
    hasPrevious: boolean;
    chiSoKyNay: string;
    anh: string;
}

/** Pre-selection when opening the modal (from "Ghi số" on a pending row or "Sửa"). */
export interface ModalTarget {
    buildingId?: string;
    apartmentId?: string;
    periodMonth?: MonthKey;
    focusKind?: MeterKind;
}

export interface SaveResult {
    ok: boolean;
    error?: string;
    saved: MeterRecord[];
}

export const KIND_META: Record<MeterKind, { label: string; unit: string; stored: StoredMeterType; icon: string; title: string }> = {
    dien: { label: 'Công tơ điện', unit: 'kWh', stored: 'electricity', icon: 'fa-bolt', title: 'ĐIỆN' },
    nuoc: { label: 'Công tơ nước', unit: 'm³', stored: 'water', icon: 'fa-droplet', title: 'NƯỚC' }
};

export const CLOSING_META: Record<ClosingStatus, { label: string; tag: string; icon: string }> = {
    'chưa_chốt': { label: 'Chưa chốt', tag: 'bg-slate-100 text-slate-600', icon: 'fa-circle-minus' },
    'đã_chốt': { label: 'Đã chốt', tag: 'bg-blue-50 text-blue-700', icon: 'fa-lock' }
};

export const APPROVAL_META: Record<ApprovalStatus, { label: string; tag: string; icon: string }> = {
    'chưa_duyệt': { label: 'Chưa duyệt', tag: 'bg-amber-100 text-amber-700', icon: 'fa-hourglass-half' },
    'đã_duyệt': { label: 'Đã duyệt', tag: 'bg-emerald-100 text-emerald-700', icon: 'fa-circle-check' }
};
