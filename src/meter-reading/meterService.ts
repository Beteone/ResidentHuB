// Single data boundary of the module. There is no backend: records live in the
// shared RHD `meters` store (data.js), the same one Hóa đơn reads consumption
// from — so this file is the "API". Components never touch window.RHD directly.
import type { Actor, Apartment, ApartmentContext, ApartmentPayload, ApprovalStatus, Building, MeterKind, MeterRecord, MonthKey, SaveResult, StoredMeterType } from './types';
import { KIND_META } from './types';

const KINDS: MeterKind[] = ['dien', 'nuoc'];

const toKind = (t: StoredMeterType): MeterKind => (t === 'water' ? 'nuoc' : 'dien');
const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

// Records written before closing and approval were split stored a single
// `status` where "đã_chốt" meant "approved by a manager".
function normalizeApproval(row: RhdMeterRow): ApprovalStatus {
    if (row.approvalStatus) return row.approvalStatus === 'đã_duyệt' ? 'đã_duyệt' : 'chưa_duyệt';
    return row.status === 'đã_chốt' ? 'đã_duyệt' : 'chưa_duyệt';
}

function fromRow(row: RhdMeterRow): MeterRecord {
    const approvalStatus = normalizeApproval(row);
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
        recordedAt: row.recordedAt || row.createdAt || 0,
        recordedById: row.recordedById || '',
        recordedBy: row.recordedBy || '',
        approvalStatus,
        approvedAt: approvalStatus === 'đã_duyệt' ? row.approvedAt ?? null : null,
        approvedById: approvalStatus === 'đã_duyệt' ? row.approvedById || '' : '',
        approvedBy: approvalStatus === 'đã_duyệt' ? row.approvedBy || '' : ''
    };
}

/** The signed-in user from auth — the live session first, then the page's session snapshot (demo). */
function currentActor(): Actor {
    const session = window.RH?.getSession?.() || window.RH_SESSION;
    return session ? { id: session.id, name: session.name } : { id: '', name: '' };
}

function notifyOtherModules(): void {
    // Dashboard KPIs / recent activity read the same store.
    window.RHUI?.renderDashboardCounts?.();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const meterService = {
    listRecords(): MeterRecord[] {
        return window.RHD.list('meters').map(fromRow);
    },

    listBuildings(): Building[] {
        return window.RHD.list('buildings').map(b => ({
            id: b.id,
            name: b.name,
            shortName: b.shortName,
            address: [b.addressDetail, b.ward, b.province].filter(Boolean).join(', ')
        }));
    },

    listApartments(): Apartment[] {
        return window.RHD.list('apartments').map(a => ({ id: a.id, buildingId: a.buildingId, name: a.name, floor: a.floor, active: a.active }));
    },

    /** Active contract and tenant of an apartment (managed by Hợp đồng / Khách hàng). */
    apartmentContext(apartmentId: string): ApartmentContext | null {
        const contract = window.RHD.activeContractFor?.(apartmentId);
        if (!contract) return null;
        const customer = contract.customerId ? window.RHD.get('customers', contract.customerId) : null;
        return {
            contractCode: contract.code || '',
            tenantName: str(customer?.fullName),
            tenantPhone: str(customer?.phone)
        };
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

    /**
     * Persists one apartment payload (Điện + Nước together). Saving a reading
     * closes the meter ("đã_chốt") with the current user as closer; a new or
     * changed reading always needs (re-)approval. The shared RHD `meters` store
     * stays keyed per meterType because Hóa đơn and the dashboard read
     * consumption from it that way.
     */
    saveApartment(p: ApartmentPayload): SaveResult {
        const saved: MeterRecord[] = [];
        const actor = currentActor();
        for (const kind of KINDS) {
            const m = p[kind];
            if (!m) continue;
            const data: Omit<RhdMeterRow, 'id'> = {
                buildingId: p.buildingId,
                apartmentId: p.apartmentId,
                meterType: KIND_META[kind].stored,
                meterCode: m.maCongTo,
                periodMonth: p.thangChot,
                closingDate: p.ngayChot,
                previousIndex: m.chiSoTruoc,
                latestIndex: m.chiSoKyNay,
                consumption: m.tieuThu,
                photo: m.anh,
                status: undefined, // drop the legacy combined field
                recordedAt: Date.now(),
                recordedById: actor.id,
                recordedBy: actor.name,
                approvalStatus: 'chưa_duyệt',
                approvedAt: null,
                approvedById: '',
                approvedBy: ''
            };
            const res = m.recordId ? window.RHD.update('meters', m.recordId, data) : window.RHD.create('meters', data);
            if (!res.ok || !res.item) return { ok: false, error: res.error || 'Không thể lưu chỉ số.', saved };
            saved.push(fromRow(res.item));
        }
        notifyOtherModules();
        return { ok: true, saved };
    },

    /** Approve ("đã_duyệt") or revoke approval ("chưa_duyệt") of the given readings. Never touches the closer. */
    setApproval(records: MeterRecord[], approval: ApprovalStatus): SaveResult {
        const saved: MeterRecord[] = [];
        const actor = currentActor();
        const patch: Partial<RhdMeterRow> = approval === 'đã_duyệt'
            ? { status: undefined, approvalStatus: approval, approvedAt: Date.now(), approvedById: actor.id, approvedBy: actor.name }
            : { status: undefined, approvalStatus: approval, approvedAt: null, approvedById: '', approvedBy: '' };
        for (const r of records) {
            const res = window.RHD.update('meters', r.id, patch);
            if (!res.ok || !res.item) return { ok: false, error: res.error || 'Không thể cập nhật trạng thái duyệt.', saved };
            saved.push(fromRow(res.item));
        }
        notifyOtherModules();
        return { ok: true, saved };
    },

    /** Deletes every meter reading of an apartment row. */
    remove(records: MeterRecord[]): { ok: boolean; error?: string } {
        for (const r of records) {
            const res = window.RHD.remove('meters', r.id);
            if (!res.ok) { notifyOtherModules(); return { ok: false, error: res.error }; }
        }
        notifyOtherModules();
        return { ok: true };
    },

    /** Other tabs/windows writing the same dataset. */
    isOwnStorageKey(key: string | null): boolean {
        return !key || key === 'residenthub_' + window.RHD.mode() + '_meters';
    }
};
