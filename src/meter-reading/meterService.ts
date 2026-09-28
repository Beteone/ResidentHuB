// Single data boundary of the module. There is no backend: records live in the
// shared RHD `meters` store (data.js), the same one Hóa đơn reads consumption
// from — so this file is the "API". Components never touch window.RHD directly.
import type { Apartment, Building, MeterKind, MeterPayload, MeterRecord, MonthKey, RecordStatus, SaveResult, StoredMeterType } from './types';
import { KIND_META } from './types';

const toKind = (t: StoredMeterType): MeterKind => (t === 'water' ? 'nuoc' : 'dien');
const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

// Records written before the approval step existed have no status; they
// still need a manager to review them.
function normalizeStatus(status: unknown): RecordStatus {
    return status === 'đã_chốt' ? 'đã_chốt' : 'chưa_duyệt';
}

function fromRow(row: RhdMeterRow): MeterRecord {
    return {
        id: row.id,
        kind: toKind(row.meterType),
        buildingId: row.buildingId,
        apartmentId: row.apartmentId,
        periodMonth: row.periodMonth || '',
        closingDate: row.closingDate || '',
        meterCode: row.meterCode || '',
        previousIndex: num(row.previousIndex),
        latestIndex: num(row.latestIndex),
        consumption: num(row.consumption),
        photo: row.photo || '',
        status: normalizeStatus(row.status),
        recordedAt: row.recordedAt || row.createdAt || 0,
        recordedBy: row.recordedBy || '',
        approvedAt: row.approvedAt ?? null,
        approvedBy: row.approvedBy || ''
    };
}

function currentUserName(): string {
    const session = window.RH_SESSION;
    return session ? session.name : '';
}

function notifyOtherModules(): void {
    // Dashboard KPIs / recent activity read the same store.
    window.RHUI?.renderDashboardCounts?.();
}

export const meterService = {
    listRecords(): MeterRecord[] {
        return window.RHD.list('meters').map(fromRow);
    },

    listBuildings(): Building[] {
        return window.RHD.list('buildings').map(b => ({ id: b.id, name: b.name, shortName: b.shortName }));
    },

    listApartments(): Apartment[] {
        return window.RHD.list('apartments').map(a => ({ id: a.id, buildingId: a.buildingId, name: a.name, floor: a.floor, active: a.active }));
    },

    /** Latest reading of a meter strictly before `periodMonth` (its "Chỉ số trước"). */
    previousReading(records: MeterRecord[], apartmentId: string, kind: MeterKind, periodMonth: MonthKey): MeterRecord | null {
        return records
            .filter(r => r.apartmentId === apartmentId && r.kind === kind && (!r.periodMonth || r.periodMonth < periodMonth))
            .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth) || b.recordedAt - a.recordedAt)[0] || null;
    },

    /** Existing record of a meter for the period — saving again updates it (no duplicates). */
    findRecord(records: MeterRecord[], apartmentId: string, kind: MeterKind, periodMonth: MonthKey): MeterRecord | null {
        return records.find(r => r.apartmentId === apartmentId && r.kind === kind && r.periodMonth === periodMonth) || null;
    },

    /** Persists the modal's payload array — each payload becomes exactly one record. */
    savePayloads(payloads: MeterPayload[]): SaveResult {
        const saved: MeterRecord[] = [];
        const by = currentUserName();
        for (const p of payloads) {
            const data: Omit<RhdMeterRow, 'id'> = {
                buildingId: p.buildingId,
                apartmentId: p.apartmentId,
                meterType: KIND_META[p.loai].stored,
                meterCode: p.maCongTo,
                periodMonth: p.thangChot,
                closingDate: p.ngayChot,
                previousIndex: p.chiSoTruoc,
                latestIndex: p.chiSoKyNay,
                consumption: p.tieuThu,
                photo: p.anh,
                status: p.status,
                recordedAt: Date.now(),
                recordedBy: by,
                approvedAt: null,
                approvedBy: ''
            };
            const res = p.recordId ? window.RHD.update('meters', p.recordId, data) : window.RHD.create('meters', data);
            if (!res.ok || !res.item) return { ok: false, error: res.error || 'Không thể lưu chỉ số.', saved };
            saved.push(fromRow(res.item));
        }
        notifyOtherModules();
        return { ok: true, saved };
    },

    /** Approve ("đã_chốt") or send back for review ("chưa_duyệt"). */
    setStatus(id: string, status: RecordStatus): SaveResult {
        const patch: Partial<RhdMeterRow> = status === 'đã_chốt'
            ? { status, approvedAt: Date.now(), approvedBy: currentUserName() }
            : { status, approvedAt: null, approvedBy: '' };
        const res = window.RHD.update('meters', id, patch);
        if (!res.ok || !res.item) return { ok: false, error: res.error || 'Không thể cập nhật trạng thái bản ghi.', saved: [] };
        notifyOtherModules();
        return { ok: true, saved: [fromRow(res.item)] };
    },

    remove(id: string): { ok: boolean; error?: string } {
        const res = window.RHD.remove('meters', id);
        if (res.ok) notifyOtherModules();
        return { ok: res.ok, error: res.error };
    },

    /** Other tabs/windows writing the same dataset. */
    isOwnStorageKey(key: string | null): boolean {
        return !key || key === 'residenthub_' + window.RHD.mode() + '_meters';
    }
};
