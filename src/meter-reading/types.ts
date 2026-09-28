// Data shapes for the "Ghi chỉ số điện nước" module.
//
// Workflow: a meter (one apartment × one meter kind) starts the month as
// "chưa_chốt" (no reading yet). Recording a reading creates a record in
// "chưa_duyệt"; a manager approval moves it to "đã_chốt".

/** Meter kind as used by this module's UI and payloads. */
export type MeterKind = 'dien' | 'nuoc';

/** Meter kind as stored in RHD (data.js `meters` entity). */
export type StoredMeterType = 'electricity' | 'water';

/** Status stored on a record. "chưa_chốt" is never stored — it is a missing record. */
export type RecordStatus = 'chưa_duyệt' | 'đã_chốt';

/** Row status shown in the table / used for filtering. */
export type RowStatus = RecordStatus | 'chưa_chốt';

export type TypeFilter = 'all' | MeterKind;
export type StatusFilter = 'all' | RowStatus;

/** YYYY-MM */
export type MonthKey = string;

export interface Building {
    id: string;
    name: string;
    shortName?: string;
}

export interface Apartment {
    id: string;
    buildingId: string;
    name: string;
    floor?: string;
    active?: boolean;
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
    status: RecordStatus;
    recordedAt: number;
    recordedBy: string;
    approvedAt: number | null;
    approvedBy: string;
}

/** A table row: either an existing record, or a meter still waiting for its reading. */
export type TableRow =
    | { key: string; status: RecordStatus; record: MeterRecord; kind: MeterKind; buildingId: string; apartmentId: string }
    | { key: string; status: 'chưa_chốt'; record: null; kind: MeterKind; buildingId: string; apartmentId: string };

/** What the Add/Edit modal submits — one object per meter that was filled in. */
export interface MeterPayload {
    loai: MeterKind;
    recordId: string | null;
    buildingId: string;
    apartmentId: string;
    thangChot: MonthKey;
    ngayChot: string;
    maCongTo: string;
    chiSoTruoc: number;
    chiSoKyNay: number;
    tieuThu: number;
    anh: string;
    status: RecordStatus;
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

export const STATUS_META: Record<RowStatus, { label: string; tag: string }> = {
    'chưa_chốt': { label: 'Chưa chốt', tag: 'bg-slate-100 text-slate-600' },
    'chưa_duyệt': { label: 'Chưa duyệt', tag: 'bg-amber-100 text-amber-700' },
    'đã_chốt': { label: 'Đã chốt', tag: 'bg-emerald-100 text-emerald-700' }
};
