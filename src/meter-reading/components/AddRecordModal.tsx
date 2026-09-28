import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Apartment, Building, MeterInputState, MeterKind, MeterPayload, MeterRecord, ModalTarget, MonthKey } from '../types';
import { meterService } from '../meterService';
import { today } from '../format';
import { MeterBlock } from './MeterBlock';

interface AddRecordModalProps {
    target: ModalTarget;
    selectedMonth: MonthKey;
    records: MeterRecord[];
    buildings: Building[];
    apartments: Apartment[];
    onClose: () => void;
    onSubmit: (payloads: MeterPayload[]) => string | null; // returns an error message, or null on success
}

interface CommonFields {
    periodMonth: MonthKey;
    closingDate: string;
    buildingId: string;
    apartmentId: string;
}

const KINDS: MeterKind[] = ['dien', 'nuoc'];

function loadMeter(records: MeterRecord[], c: CommonFields, kind: MeterKind): MeterInputState {
    const prev = c.apartmentId ? meterService.previousReading(records, c.apartmentId, kind, c.periodMonth) : null;
    const current = c.apartmentId ? meterService.findRecord(records, c.apartmentId, kind, c.periodMonth) : null;
    return {
        recordId: current ? current.id : null,
        meterCode: (current || prev)?.meterCode || '',
        hasPrevious: !!prev,
        chiSoTruoc: String(prev ? prev.latestIndex : current ? current.previousIndex : 0),
        chiSoKyNay: current ? String(current.latestIndex) : '',
        anh: current ? current.photo : ''
    };
}

/**
 * Packs the form into one payload per meter that has a "Chỉ số kỳ này".
 * Blank meters produce nothing; an existing record whose values did not change
 * is skipped too, so an already approved reading is not sent back for review.
 */
export function buildPayloads(common: CommonFields, meters: Record<MeterKind, MeterInputState>, records: MeterRecord[]) {
    const payloads: MeterPayload[] = [];
    const errors: Partial<Record<MeterKind, string>> = {};
    for (const kind of KINDS) {
        const s = meters[kind];
        if (s.chiSoKyNay.trim() === '') continue;
        const truoc = Number(s.chiSoTruoc) || 0;
        const kyNay = Number(s.chiSoKyNay);
        if (!Number.isFinite(kyNay) || kyNay < 0) { errors[kind] = 'Chỉ số kỳ này không hợp lệ.'; continue; }
        if (kyNay < truoc) { errors[kind] = 'Chỉ số kỳ này không được nhỏ hơn chỉ số trước (' + truoc + ').'; continue; }
        const existing = s.recordId ? records.find(r => r.id === s.recordId) : undefined;
        if (existing && existing.latestIndex === kyNay && existing.previousIndex === truoc && existing.photo === s.anh && existing.closingDate === common.closingDate) continue;
        payloads.push({
            loai: kind,
            recordId: s.recordId,
            buildingId: common.buildingId,
            apartmentId: common.apartmentId,
            thangChot: common.periodMonth,
            ngayChot: common.closingDate,
            maCongTo: s.meterCode,
            chiSoTruoc: truoc,
            chiSoKyNay: kyNay,
            tieuThu: kyNay - truoc,
            anh: s.anh,
            status: 'chưa_duyệt' // new or edited readings always go back to the manager for approval
        });
    }
    return { payloads, errors };
}

export function AddRecordModal({ target, selectedMonth, records, buildings, apartments, onClose, onSubmit }: AddRecordModalProps) {
    const firstBuildingId = target.buildingId || buildings[0]?.id || '';
    const [common, setCommon] = useState<CommonFields>(() => ({
        periodMonth: target.periodMonth || selectedMonth,
        closingDate: today(),
        buildingId: firstBuildingId,
        apartmentId: target.apartmentId || ''
    }));
    const buildingApartments = useMemo(() => apartments.filter(a => a.buildingId === common.buildingId), [apartments, common.buildingId]);
    const [meters, setMeters] = useState<Record<MeterKind, MeterInputState>>(() => ({ dien: loadMeter(records, common, 'dien'), nuoc: loadMeter(records, common, 'nuoc') }));
    const [errors, setErrors] = useState<Partial<Record<MeterKind, string>>>({});
    const [formError, setFormError] = useState('');
    const editing = !!(meters.dien.recordId || meters.nuoc.recordId);

    // Re-read both meters whenever the apartment or the period changes.
    useEffect(() => {
        setMeters({ dien: loadMeter(records, common, 'dien'), nuoc: loadMeter(records, common, 'nuoc') });
        setErrors({});
        // records intentionally excluded: typing must not be reset by unrelated store updates
    }, [common.apartmentId, common.periodMonth]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const updateCommon = (patch: Partial<CommonFields>) => { setFormError(''); setCommon(c => ({ ...c, ...patch })); };
    const updateMeter = (kind: MeterKind, patch: Partial<MeterInputState>) => {
        setFormError('');
        setErrors(e => ({ ...e, [kind]: undefined }));
        setMeters(m => ({ ...m, [kind]: { ...m[kind], ...patch } }));
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!common.periodMonth || !common.closingDate || !common.buildingId || !common.apartmentId) {
            setFormError('Vui lòng chọn tháng, ngày chốt, tòa nhà và căn hộ.');
            return;
        }
        const built = buildPayloads(common, meters, records);
        setErrors(built.errors);
        if (Object.keys(built.errors).length) { setFormError('Vui lòng kiểm tra lại chỉ số.'); return; }
        if (!built.payloads.length) {
            setFormError(editing ? 'Không có thay đổi nào để lưu.' : 'Nhập "Chỉ số kỳ này" cho ít nhất một công tơ (Điện hoặc Nước).');
            return;
        }
        const error = onSubmit(built.payloads);
        if (error) setFormError(error);
    };

    const field = 'flex flex-col gap-1 text-xs font-semibold text-slate-600';
    const control = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

    return (
        <div className="fixed inset-0 z-[500] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <form
                role="dialog" aria-modal="true" aria-labelledby="mr-modal-title"
                onSubmit={submit} noValidate
                className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            >
                <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <h2 id="mr-modal-title" className="text-lg font-bold text-slate-900">{editing ? 'Sửa bản ghi chỉ số' : 'Thêm bản ghi chỉ số'}</h2>
                    <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
                        <i className="fas fa-xmark" aria-hidden="true" />
                    </button>
                </header>

                <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
                    <section className="flex flex-col gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Thông tin chung</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <label className={field}>Tháng *
                                <input id="mr-period" type="month" required value={common.periodMonth} onChange={e => updateCommon({ periodMonth: e.target.value })} className={control} />
                            </label>
                            <label className={field}>Ngày chốt *
                                <input id="mr-closing" type="date" required value={common.closingDate} onChange={e => updateCommon({ closingDate: e.target.value })} className={control} />
                            </label>
                            <label className={field}>Tòa nhà *
                                <select id="mr-building" required value={common.buildingId} onChange={e => updateCommon({ buildingId: e.target.value, apartmentId: '' })} className={control}>
                                    <option value="">Chọn tòa nhà</option>
                                    {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </label>
                            <label className={field}>Căn hộ *
                                <select id="mr-apartment" required value={common.apartmentId} onChange={e => updateCommon({ apartmentId: e.target.value })} className={control} disabled={!common.buildingId}>
                                    <option value="">Chọn căn hộ</option>
                                    {buildingApartments.map(a => <option key={a.id} value={a.id}>{a.name}{a.floor ? ' · ' + a.floor : ''}</option>)}
                                </select>
                            </label>
                        </div>
                    </section>

                    <section className="flex flex-col gap-3">
                        <div className="flex items-baseline justify-between gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Chỉ số</h3>
                            <span className="text-[11px] text-slate-400">Có thể chỉ nhập Điện, chỉ nhập Nước, hoặc cả hai</span>
                        </div>
                        {common.apartmentId ? (
                            <div id="mr-meters" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {KINDS.map(kind => (
                                    <MeterBlock key={kind} kind={kind} value={meters[kind]} error={errors[kind]} autoFocus={target.focusKind === kind} onChange={patch => updateMeter(kind, patch)} />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                                <i className="fas fa-gauge-high mb-2 block text-2xl text-slate-300" aria-hidden="true" />
                                Chọn tòa nhà và căn hộ để nhập chỉ số.
                            </div>
                        )}
                    </section>

                    {formError && <p id="mr-error" role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
                </div>

                <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                    <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Huỷ</button>
                    <button type="submit" id="mr-submit" disabled={!common.apartmentId} className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 px-5 py-2 text-sm font-semibold text-white shadow hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">
                        Lưu chỉ số
                    </button>
                </footer>
            </form>
        </div>
    );
}
