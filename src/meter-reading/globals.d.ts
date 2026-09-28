// Globals provided by the existing static scripts loaded before this bundle
// (auth.js → RH, data.js → RHD, manager-modules.js → RHUI, dashboard.html → session).

interface RhdResult<T> {
    ok: boolean;
    item?: T;
    error?: string;
    limitReached?: boolean;
}

/** Raw `meters` record as stored by data.js. */
interface RhdMeterRow {
    id: string;
    buildingId: string;
    apartmentId: string;
    meterType: 'electricity' | 'water';
    meterCode?: string;
    periodMonth?: string;
    closingDate?: string;
    previousIndex?: number | string;
    latestIndex?: number | string;
    consumption?: number | string;
    photo?: string;
    status?: string;
    recordedAt?: number;
    recordedBy?: string;
    approvedAt?: number | null;
    approvedBy?: string;
    createdAt?: number;
}

interface RhdApi {
    list(entity: 'meters'): RhdMeterRow[];
    list(entity: 'buildings'): Array<{ id: string; name: string; shortName?: string }>;
    list(entity: 'apartments'): Array<{ id: string; buildingId: string; name: string; floor?: string; active?: boolean }>;
    get(entity: string, id: string): Record<string, unknown> | null;
    create(entity: 'meters', data: Omit<RhdMeterRow, 'id'>): RhdResult<RhdMeterRow>;
    update(entity: 'meters', id: string, patch: Partial<RhdMeterRow>): RhdResult<RhdMeterRow>;
    remove(entity: 'meters', id: string): RhdResult<never>;
    mode(): 'live' | 'demo';
}

interface Window {
    RHD: RhdApi;
    RHUI?: { renderDashboardCounts?: () => void };
    RH_SESSION?: { id: string; name: string; demo?: boolean } | null;
    MeterReadingApp?: { mount(el: HTMLElement): void; unmount(): void };
}
