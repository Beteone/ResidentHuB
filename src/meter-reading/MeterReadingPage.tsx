import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MeterKind, MeterPayload, MeterRecord, ModalTarget, MonthKey, StatusFilter, TableRow, TypeFilter } from './types';
import { KIND_META } from './types';
import { meterService } from './meterService';
import { cx, currentMonth, monthLabel } from './format';
import { DashboardCards, type StatusCounts } from './components/DashboardCards';
import { RecordTable } from './components/RecordTable';
import { AddRecordModal } from './components/AddRecordModal';
import { PhotoViewer } from './components/PhotoViewer';

const ALL_KINDS: MeterKind[] = ['dien', 'nuoc'];

/**
 * Container of the "Ghi chỉ số" module. Owns all state; child components are
 * presentational and report user intent back through callbacks.
 *
 * Every apartment has one Điện meter and one Nước meter. For the selected
 * month each meter is: "chưa_chốt" (no record) → "chưa_duyệt" (recorded) →
 * "đã_chốt" (approved by a manager).
 */
export function MeterReadingPage() {
    const [records, setRecords] = useState<MeterRecord[]>(() => meterService.listRecords());
    const [selectedMonth, setSelectedMonth] = useState<MonthKey>(currentMonth);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [buildingFilter, setBuildingFilter] = useState('');
    const [modal, setModal] = useState<ModalTarget | null>(null);
    const [photo, setPhoto] = useState<MeterRecord | null>(null);
    const [notice, setNotice] = useState('');

    // Buildings/apartments are managed by other modules; re-read them with the records.
    const [refreshKey, setRefreshKey] = useState(0);
    const buildings = useMemo(() => meterService.listBuildings(), [refreshKey]);
    const apartments = useMemo(() => meterService.listApartments(), [refreshKey]);
    const buildingMap = useMemo(() => new Map(buildings.map(b => [b.id, b])), [buildings]);
    const apartmentMap = useMemo(() => new Map(apartments.map(a => [a.id, a])), [apartments]);

    const reload = useCallback(() => {
        setRecords(meterService.listRecords());
        setRefreshKey(k => k + 1);
    }, []);

    // Another tab (or the resident app) changed the same dataset.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => { if (meterService.isOwnStorageKey(e.key) || (e.key || '').endsWith('_apartments') || (e.key || '').endsWith('_buildings')) reload(); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [reload]);

    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(''), 3000);
        return () => window.clearTimeout(t);
    }, [notice]);

    const kindsInScope = useMemo<MeterKind[]>(() => (typeFilter === 'all' ? ALL_KINDS : [typeFilter]), [typeFilter]);
    const scopedApartments = useMemo(
        () => apartments.filter(a => a.active !== false && (!buildingFilter || a.buildingId === buildingFilter)),
        [apartments, buildingFilter]
    );

    // Records of the working month, within the building + type scope.
    const monthRecords = useMemo(
        () => records.filter(r => r.periodMonth === selectedMonth && kindsInScope.includes(r.kind) && (!buildingFilter || r.buildingId === buildingFilter)),
        [records, selectedMonth, kindsInScope, buildingFilter]
    );

    // Meters with no record yet this month.
    const pendingRows = useMemo<TableRow[]>(() => {
        const recorded = new Set(monthRecords.map(r => r.apartmentId + '|' + r.kind));
        const rows: TableRow[] = [];
        scopedApartments.forEach(a => kindsInScope.forEach(kind => {
            if (!recorded.has(a.id + '|' + kind)) rows.push({ key: 'todo-' + a.id + '-' + kind, status: 'chưa_chốt', record: null, kind, buildingId: a.buildingId, apartmentId: a.id });
        }));
        return rows;
    }, [monthRecords, scopedApartments, kindsInScope]);

    const counts = useMemo<StatusCounts>(() => {
        const daChot = monthRecords.filter(r => r.status === 'đã_chốt').length;
        const chuaDuyet = monthRecords.filter(r => r.status === 'chưa_duyệt').length;
        // "Chưa chốt" = meters of the building(s) minus those that already have a
        // record this month (counted per meter, so it always matches the table rows).
        const chuaChot = pendingRows.length;
        return { daChot, chuaDuyet, chuaChot, total: daChot + chuaDuyet + chuaChot };
    }, [monthRecords, pendingRows]);

    const rows = useMemo<TableRow[]>(() => {
        const recordRows: TableRow[] = monthRecords
            .slice()
            .sort((a, b) => b.recordedAt - a.recordedAt)
            .map(r => ({ key: r.id, status: r.status, record: r, kind: r.kind, buildingId: r.buildingId, apartmentId: r.apartmentId }));
        if (statusFilter === 'chưa_chốt') return pendingRows;
        if (statusFilter === 'all') return recordRows.concat(pendingRows);
        return recordRows.filter(r => r.status === statusFilter);
    }, [monthRecords, pendingRows, statusFilter]);

    const handleSubmit = (payloads: MeterPayload[]): string | null => {
        const result = meterService.savePayloads(payloads);
        reload();
        if (!result.ok) return result.error + (result.saved.length ? ' (Đã lưu ' + result.saved.length + ' công tơ trước đó.)' : '');
        setModal(null);
        setNotice('Đã lưu ' + payloads.length + ' bản ghi — đang chờ duyệt.');
        return null;
    };

    // Shield button: Chưa duyệt → Đã chốt, or Đã chốt → back to Chưa duyệt.
    const handleToggleApprove = (record: MeterRecord) => {
        const what = KIND_META[record.kind].label.toLowerCase() + ' căn ' + (apartmentMap.get(record.apartmentId)?.name || '');
        const approving = record.status === 'chưa_duyệt';
        if (!approving && !window.confirm('Bỏ duyệt chỉ số ' + what + '? Bản ghi sẽ chuyển về "Chưa duyệt".')) return;
        const result = meterService.setStatus(record.id, approving ? 'đã_chốt' : 'chưa_duyệt');
        reload();
        setNotice(result.ok ? (approving ? 'Đã duyệt chỉ số ' : 'Đã bỏ duyệt chỉ số ') + what + '.' : result.error || '');
    };

    const handleDelete = (record: MeterRecord) => {
        const where = apartmentMap.get(record.apartmentId)?.name || '';
        if (!window.confirm('Xoá bản ghi ' + KIND_META[record.kind].label.toLowerCase() + ' căn ' + where + ' (' + monthLabel(record.periodMonth) + ')?')) return;
        const result = meterService.remove(record.id);
        reload();
        if (!result.ok) setNotice(result.error || 'Không thể xoá bản ghi.');
    };

    const openFor = (row: TableRow) => setModal({ buildingId: row.buildingId, apartmentId: row.apartmentId, periodMonth: selectedMonth, focusKind: row.kind });
    const hasSetup = buildings.length > 0 && apartments.length > 0;
    const emptyText = !hasSetup
        ? 'Cần có Tòa nhà và Căn hộ trước khi ghi chỉ số.'
        : statusFilter === 'all' ? 'Chưa có công tơ nào trong phạm vi đang chọn.' : 'Không có dòng nào khớp bộ lọc.';

    return (
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">Ghi chỉ số</h1>
                    <p className="text-sm text-slate-500">Quy trình: Chưa chốt → Chưa duyệt → Đã chốt · {monthLabel(selectedMonth)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                        <i className="fas fa-calendar" aria-hidden="true" />
                        <span className="sr-only">Tháng làm việc</span>
                        <input id="mr-month" type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value || currentMonth())} className="bg-transparent outline-none" />
                    </label>
                    <select id="mr-building-filter" aria-label="Lọc theo tòa nhà" value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <option value="">Tất cả tòa nhà</option>
                        {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button
                        type="button" id="mr-add"
                        disabled={!hasSetup}
                        onClick={() => setModal({ buildingId: buildingFilter || undefined, periodMonth: selectedMonth })}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <i className="fas fa-plus" aria-hidden="true" /> Thêm bản ghi
                    </button>
                </div>
            </header>

            <DashboardCards counts={counts} statusFilter={statusFilter} onSelect={setStatusFilter} />

            <RecordTable
                rows={rows}
                typeFilter={typeFilter}
                onTypeChange={setTypeFilter}
                buildings={buildingMap}
                apartments={apartmentMap}
                onToggleApprove={handleToggleApprove}
                onEdit={openFor}
                onDelete={handleDelete}
                onRecord={openFor}
                onViewPhoto={setPhoto}
                emptyText={emptyText}
            />

            {modal && (
                <AddRecordModal
                    target={modal}
                    selectedMonth={selectedMonth}
                    records={records}
                    buildings={buildings}
                    apartments={apartments}
                    onClose={() => setModal(null)}
                    onSubmit={handleSubmit}
                />
            )}
            {photo && (
                <PhotoViewer
                    src={photo.photo}
                    caption={KIND_META[photo.kind].label + ' · ' + (apartmentMap.get(photo.apartmentId)?.name || '') + ' · ' + monthLabel(photo.periodMonth)}
                    onClose={() => setPhoto(null)}
                />
            )}
            <div role="status" aria-live="polite" className={cx('fixed bottom-5 left-1/2 z-[450] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg transition-all', notice ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                {notice}
            </div>
        </div>
    );
}
