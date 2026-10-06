import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ApartmentPayload, ApprovalStatus, ClosingStatus, MeterKind, MeterRecord, ModalTarget, MonthKey, StatusFilter, TableRow, TypeFilter } from './types';
import { KIND_META } from './types';
import { meterService } from './meterService';
import { cx, currentMonth, monthLabel } from './format';
import { DashboardCards, type StatusCounts } from './components/DashboardCards';
import { RecordTable } from './components/RecordTable';
import { AddRecordModal } from './components/AddRecordModal';
import { PhotoViewer } from './components/PhotoViewer';
import { RecordDrawer } from './components/RecordDrawer';
import { ContentAreaContext } from './components/Overlay';
import { approvableReadings, matchesApprovalFilter } from './approval';
import { meterPermissions } from './permissions';

/** Closing: an apartment is "đã_chốt" once both meters have a reading for the period. */
function rowClosing(row: Pick<TableRow, 'dien' | 'nuoc'>): ClosingStatus {
    return row.dien && row.nuoc ? 'đã_chốt' : 'chưa_chốt';
}

function matchesStatus(row: TableRow, filter: StatusFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'chưa_chốt' || filter === 'đã_chốt') return row.closing === filter;
    return matchesApprovalFilter(row, filter);
}

/**
 * Container of the "Ghi chỉ số" module. Owns all state; child components are
 * presentational and report user intent back through callbacks.
 *
 * Every apartment has one Điện meter and one Nước meter, shown together on a
 * single table row per month. Closing (chốt = a reading exists) and approval
 * (duyệt) are independent: the closer and the approver are stored separately.
 */
export function MeterReadingPage() {
    const rootRef = useRef<HTMLDivElement>(null);
    const [records, setRecords] = useState<MeterRecord[]>(() => meterService.listRecords());
    const [selectedMonth, setSelectedMonth] = useState<MonthKey>(currentMonth);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [buildingFilter, setBuildingFilter] = useState('');
    const [apartmentFilter, setApartmentFilter] = useState('');
    const [modal, setModal] = useState<ModalTarget | null>(null);
    const [detailKey, setDetailKey] = useState<string | null>(null);
    const [photo, setPhoto] = useState<MeterRecord | null>(null);
    const [notice, setNotice] = useState('');

    // Buildings/apartments are managed by other modules; re-read them with the records.
    const [refreshKey, setRefreshKey] = useState(0);
    const buildings = useMemo(() => meterService.listBuildings(), [refreshKey]);
    const apartments = useMemo(() => meterService.listApartments(), [refreshKey]);
    const buildingMap = useMemo(() => new Map(buildings.map(b => [b.id, b])), [buildings]);
    // Re-read with the data: an account-type change elsewhere applies on the next reload.
    const perms = useMemo(() => meterPermissions(), [refreshKey]);
    const apartmentMap = useMemo(() => new Map(apartments.map(a => [a.id, a])), [apartments]);

    const reload = useCallback(() => {
        setRecords(meterService.listRecords());
        setRefreshKey(k => k + 1);
    }, []);

    // Another tab (or the resident app) changed the same dataset.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            const key = e.key || '';
            if (meterService.isOwnStorageKey(e.key) || key.endsWith('_apartments') || key.endsWith('_buildings') || key.endsWith('_contracts') || key.endsWith('_customers')) reload();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [reload]);

    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(''), 3000);
        return () => window.clearTimeout(t);
    }, [notice]);

    // Tòa nhà → Căn hộ: the room picker only offers rooms of the chosen building.
    const activeApartments = useMemo(() => apartments.filter(a => a.active !== false), [apartments]);
    const apartmentOptions = useMemo(
        () => activeApartments.filter(a => !buildingFilter || a.buildingId === buildingFilter),
        [activeApartments, buildingFilter]
    );

    // Drop a room selection that no longer belongs to the building scope (or was removed).
    useEffect(() => {
        if (apartmentFilter && !apartmentOptions.some(a => a.id === apartmentFilter)) setApartmentFilter('');
    }, [apartmentFilter, apartmentOptions]);

    const inScope = useCallback(
        (buildingId: string, apartmentId: string) => (!buildingFilter || buildingId === buildingFilter) && (!apartmentFilter || apartmentId === apartmentFilter),
        [buildingFilter, apartmentFilter]
    );

    const scopedApartments = useMemo(() => activeApartments.filter(a => inScope(a.buildingId, a.id)), [activeApartments, inScope]);

    // Records of the working month, within the building/room scope. The Điện/Nước
    // tabs are a view mode only, so they never filter records here.
    const monthRecords = useMemo(
        () => records.filter(r => r.periodMonth === selectedMonth && inScope(r.buildingId, r.apartmentId)),
        [records, selectedMonth, inScope]
    );

    // One row per apartment: its Điện and Nước readings merged into a single object.
    // Each side is the reading of slot apartmentId + kind + period (latest wins,
    // same rule as meterService.findRecord used by the modal).
    const apartmentRows = useMemo<TableRow[]>(() => {
        const byApartment = new Map<string, Pick<TableRow, 'buildingId' | 'apartmentId' | 'dien' | 'nuoc'>>();
        const latestAt = new Map<string, number>();
        monthRecords.forEach(r => {
            const row = byApartment.get(r.apartmentId) || { buildingId: r.buildingId, apartmentId: r.apartmentId, dien: null, nuoc: null };
            row[r.kind] = meterService.latestOf(row[r.kind], r);
            byApartment.set(r.apartmentId, row);
            latestAt.set(r.apartmentId, Math.max(latestAt.get(r.apartmentId) || 0, r.recordedAt));
        });
        const recorded: TableRow[] = Array.from(byApartment.values())
            .map(row => ({ ...row, key: row.apartmentId, closing: rowClosing(row) }))
            .sort((a, b) => (latestAt.get(b.apartmentId) || 0) - (latestAt.get(a.apartmentId) || 0));
        // Apartments with no reading at all this month.
        const pending: TableRow[] = scopedApartments
            .filter(a => !byApartment.has(a.id))
            .map(a => ({ key: a.id, buildingId: a.buildingId, apartmentId: a.id, dien: null, nuoc: null, closing: 'chưa_chốt' }));
        return recorded.concat(pending);
    }, [monthRecords, scopedApartments]);

    const counts = useMemo<StatusCounts>(() => {
        // Counted per apartment row, so the cards always match the table.
        const count = (f: StatusFilter) => apartmentRows.filter(r => matchesStatus(r, f)).length;
        return {
            chuaChot: count('chưa_chốt'),
            daChot: count('đã_chốt'),
            chuaDuyet: count('chưa_duyệt'),
            daDuyet: count('đã_duyệt'),
            total: apartmentRows.length,
            recorded: apartmentRows.filter(r => r.dien || r.nuoc).length
        };
    }, [apartmentRows]);

    const rows = useMemo<TableRow[]>(() => apartmentRows.filter(r => matchesStatus(r, statusFilter)), [apartmentRows, statusFilter]);

    // "Duyệt tất cả" scope = exactly the rows on screen (month + building + room + status card).
    const approvable = useMemo(() => approvableReadings(rows, selectedMonth), [rows, selectedMonth]);

    // The drawer follows the live row, so approving or editing refreshes it in place.
    const detailRow = useMemo(() => (detailKey ? apartmentRows.find(r => r.key === detailKey) || null : null), [apartmentRows, detailKey]);
    const detailContext = useMemo(() => (detailKey ? meterService.apartmentContext(detailKey) : null), [detailKey, refreshKey]);
    const closeDetail = useCallback(() => setDetailKey(null), []);
    const closeModal = useCallback(() => setModal(null), []);
    const closePhoto = useCallback(() => setPhoto(null), []);

    const handleSubmit = (payload: ApartmentPayload): string | null => {
        const result = meterService.saveApartment(payload);
        reload();
        if (!result.ok) return result.error + (result.saved.length ? ' (Đã lưu ' + result.saved.length + ' công tơ trước đó.)' : '');
        setModal(null);
        setNotice('Đã chốt chỉ số căn ' + (apartmentMap.get(payload.apartmentId)?.name || '') + ' — đang chờ duyệt.');
        return null;
    };

    /** Approve or revoke; only the readings whose state actually changes are written. */
    const handleSetApproval = (list: MeterRecord[], approval: ApprovalStatus, subject: string) => {
        const changing = list.filter(r => r.approvalStatus !== approval);
        if (!changing.length) return;
        if (approval === 'chưa_duyệt' && !window.confirm('Bỏ duyệt chỉ số ' + subject + '? Bản ghi sẽ chuyển về "Chưa duyệt".')) return;
        const result = meterService.setApproval(changing, approval);
        reload();
        setNotice(result.ok ? (approval === 'đã_duyệt' ? 'Đã duyệt chỉ số ' : 'Đã bỏ duyệt chỉ số ') + subject + '.' : result.error || '');
    };

    // Per-meter switch in the table: one reading (apartment + kind + period) at a time.
    const handleToggleMeter = (record: MeterRecord) => {
        const subject = KIND_META[record.kind].label.toLowerCase() + ' căn ' + (apartmentMap.get(record.apartmentId)?.name || '');
        handleSetApproval([record], record.approvalStatus === 'đã_duyệt' ? 'chưa_duyệt' : 'đã_duyệt', subject);
    };

    // Room switch in the "Tất cả" tab: ON = every closed reading of the room is
    // approved. Turning it on approves the pending ones (a meter with no reading
    // yet is skipped); turning it off revokes both.
    const handleToggleRoom = (row: TableRow) => {
        const list = [row.dien, row.nuoc].filter((r): r is MeterRecord => !!r);
        if (!list.length) return;
        const allApproved = list.every(r => r.approvalStatus === 'đã_duyệt');
        handleSetApproval(list, allApproved ? 'chưa_duyệt' : 'đã_duyệt', 'điện & nước căn ' + (apartmentMap.get(row.apartmentId)?.name || ''));
    };

    /** Batch-approves the closed, not-yet-approved readings of the visible list — each reading independently. */
    const handleApproveAll = () => {
        if (!approvable.length) return;
        const scope = [
            monthLabel(selectedMonth),
            buildingFilter ? buildingMap.get(buildingFilter)?.name : 'tất cả tòa nhà',
            apartmentFilter ? 'phòng ' + (apartmentMap.get(apartmentFilter)?.name || '') : 'tất cả phòng'
        ].join(' · ');
        const rooms = new Set(approvable.map(r => r.apartmentId)).size;
        if (!window.confirm('Duyệt ' + approvable.length + ' chỉ số đã chốt của ' + rooms + ' phòng trong danh sách hiện tại (' + scope + ')?\n\nCông tơ chưa chốt (chưa có chỉ số kỳ này) sẽ được bỏ qua.')) return;
        const result = meterService.approveMany(approvable);
        reload();
        setNotice(result.ok
            ? 'Đã duyệt ' + result.saved.length + ' chỉ số' + (result.skipped ? ' (bỏ qua ' + result.skipped + ' đã thay đổi).' : '.')
            : (result.error || '') + (result.saved.length ? ' (Đã duyệt ' + result.saved.length + ' chỉ số trước đó.)' : ''));
    };

    const handleDelete = (row: TableRow) => {
        // Every reading of this room's slots for the month, stale duplicates included,
        // so an older copy cannot resurface after the visible one is deleted.
        const list = monthRecords.filter(r => r.apartmentId === row.apartmentId);
        if (!list.length) return;
        const where = apartmentMap.get(row.apartmentId)?.name || '';
        if (!window.confirm('Xoá bản ghi chỉ số (điện & nước) căn ' + where + ' (' + monthLabel(selectedMonth) + ')?')) return;
        const result = meterService.remove(list);
        reload();
        if (!result.ok) setNotice(result.error || 'Không thể xoá bản ghi.');
    };

    const openFor = (row: TableRow, kind?: MeterKind) => {
        // Focus the requested meter, else the one in view, else the first one still missing a reading.
        const focusKind: MeterKind = kind || (typeFilter !== 'all' ? typeFilter : !row.dien ? 'dien' : !row.nuoc ? 'nuoc' : 'dien');
        setModal({ buildingId: row.buildingId, apartmentId: row.apartmentId, periodMonth: selectedMonth, focusKind });
    };

    const hasSetup = buildings.length > 0 && apartments.length > 0;
    const emptyText = !hasSetup
        ? 'Cần có Tòa nhà và Căn hộ trước khi ghi chỉ số.'
        : statusFilter === 'all' ? 'Chưa có công tơ nào trong phạm vi đang chọn.' : 'Không có dòng nào khớp bộ lọc.';

    const selectClass = 'min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

    return (
        <ContentAreaContext.Provider value={rootRef}>
            <div ref={rootRef} className="mx-auto flex max-w-6xl flex-col gap-5">
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-900">Ghi chỉ số</h1>
                        <p className="text-sm text-slate-500">Chốt = đã nhập chỉ số kỳ này · Duyệt = xác nhận riêng của người duyệt · {monthLabel(selectedMonth)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                            <i className="fas fa-calendar" aria-hidden="true" />
                            <span className="sr-only">Tháng làm việc</span>
                            <input id="mr-month" type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value || currentMonth())} className="bg-transparent outline-none" />
                        </label>
                        <select id="mr-building-filter" aria-label="Lọc theo tòa nhà" value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)} className={selectClass}>
                            <option value="">Tất cả tòa nhà</option>
                            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <select id="mr-apartment-filter" aria-label="Lọc theo căn hộ / phòng" value={apartmentFilter} onChange={e => setApartmentFilter(e.target.value)} disabled={!apartmentOptions.length} className={selectClass}>
                            <option value="">Tất cả phòng</option>
                            {buildingFilter
                                ? apartmentOptions.map(a => <option key={a.id} value={a.id}>{a.name}{a.floor ? ' · ' + a.floor : ''}</option>)
                                : buildings.map(b => {
                                    const list = apartmentOptions.filter(a => a.buildingId === b.id);
                                    return list.length ? (
                                        <optgroup key={b.id} label={b.name}>
                                            {list.map(a => <option key={a.id} value={a.id}>{a.name}{a.floor ? ' · ' + a.floor : ''}</option>)}
                                        </optgroup>
                                    ) : null;
                                })}
                        </select>
                        {perms.create && <button
                            type="button" id="mr-add"
                            disabled={!hasSetup}
                            onClick={() => setModal({ buildingId: buildingFilter || apartmentMap.get(apartmentFilter)?.buildingId || undefined, apartmentId: apartmentFilter || undefined, periodMonth: selectedMonth })}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <i className="fas fa-plus" aria-hidden="true" /> Thêm bản ghi
                        </button>}
                    </div>
                </header>

                <DashboardCards counts={counts} statusFilter={statusFilter} onSelect={setStatusFilter} />

                <RecordTable
                    rows={rows}
                    typeFilter={typeFilter}
                    onTypeChange={setTypeFilter}
                    buildings={buildingMap}
                    apartments={apartmentMap}
                    selectedKey={detailRow ? detailRow.key : null}
                    onOpen={row => setDetailKey(row.key)}
                    onToggleMeter={handleToggleMeter}
                    onToggleRoom={handleToggleRoom}
                    approvableCount={approvable.length}
                    onApproveAll={handleApproveAll}
                    onEdit={row => openFor(row)}
                    onDelete={handleDelete}
                    onRecord={row => openFor(row)}
                    onViewPhoto={setPhoto}
                    emptyText={emptyText}
                    perms={perms}
                />

                {detailRow && (
                    <RecordDrawer
                        row={detailRow}
                        month={selectedMonth}
                        building={buildingMap.get(detailRow.buildingId)}
                        apartment={apartmentMap.get(detailRow.apartmentId)}
                        context={detailContext}
                        onClose={closeDetail}
                        onSetApproval={handleSetApproval}
                        onEdit={openFor}
                        onDelete={handleDelete}
                        onViewPhoto={setPhoto}
                        perms={perms}
                    />
                )}
                {modal && (
                    <AddRecordModal
                        target={modal}
                        selectedMonth={selectedMonth}
                        records={records}
                        buildings={buildings}
                        apartments={apartments}
                        onClose={closeModal}
                        onSubmit={handleSubmit}
                    />
                )}
                {photo && (
                    <PhotoViewer
                        src={photo.photo}
                        caption={KIND_META[photo.kind].label + ' · ' + (apartmentMap.get(photo.apartmentId)?.name || '') + ' · ' + monthLabel(photo.periodMonth)}
                        onClose={closePhoto}
                    />
                )}
                {/* Portaled like the overlays so it is never painted under the sidebar or a drawer. */}
                {createPortal(
                    <div role="status" aria-live="polite" className={cx('fixed bottom-5 left-1/2 z-[1400] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg transition-all', notice ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                        {notice}
                    </div>,
                    document.body
                )}
            </div>
        </ContentAreaContext.Provider>
    );
}
