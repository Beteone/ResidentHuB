import { useState } from 'react';
import type { MeterInputState, MeterKind } from '../types';
import { KIND_META } from '../types';
import { cx, formatNumber } from '../format';
import { compressImage } from '../image';

interface MeterBlockProps {
    kind: MeterKind;
    value: MeterInputState;
    error?: string;
    autoFocus?: boolean;
    onChange: (patch: Partial<MeterInputState>) => void;
}

const THEME: Record<MeterKind, { box: string; icon: string }> = {
    dien: { box: 'border-amber-200 bg-amber-50/50', icon: 'text-amber-500' },
    nuoc: { box: 'border-sky-200 bg-sky-50/50', icon: 'text-sky-500' }
};

const inputClass = (readOnly: boolean) => cx(
    'w-full rounded-lg border px-3 py-2 text-sm outline-none transition',
    readOnly ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
);

/** Inputs for one meter (Điện or Nước): previous, current, consumption, photo. */
export function MeterBlock({ kind, value, error, autoFocus, onChange }: MeterBlockProps) {
    const meta = KIND_META[kind];
    const [photoError, setPhotoError] = useState('');
    const consumption = value.chiSoKyNay === '' ? null : Number(value.chiSoKyNay) - (Number(value.chiSoTruoc) || 0);
    // Read-only once a previous period exists. An apartment's very first reading
    // has nothing to read it from, so its opening index is typed once.
    const prevReadOnly = value.hasPrevious;
    const idBase = 'mr-' + kind;

    const pickPhoto = async (file: File | undefined) => {
        if (!file) return;
        setPhotoError('');
        try {
            onChange({ anh: await compressImage(file) });
        } catch (e) {
            setPhotoError(e instanceof Error ? e.message : 'Không đọc được ảnh.');
        }
    };

    return (
        <section className={cx('flex flex-col gap-3 rounded-2xl border p-4', THEME[kind].box)} data-meter-kind={kind}>
            <h3 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-slate-900">
                <i className={cx('fas', meta.icon, THEME[kind].icon)} aria-hidden="true" />
                {meta.title} <span className="font-semibold text-slate-400">({meta.unit})</span>
                {value.recordId && <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">Đã có bản ghi kỳ này</span>}
            </h3>

            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                    <label htmlFor={idBase + '-prev'} className="text-xs font-semibold text-slate-600">Chỉ số trước</label>
                    <input
                        id={idBase + '-prev'}
                        data-field="chiSoTruoc"
                        type="number" min={0} step="any"
                        readOnly={prevReadOnly}
                        tabIndex={prevReadOnly ? -1 : 0}
                        value={value.chiSoTruoc}
                        onChange={e => onChange({ chiSoTruoc: e.target.value })}
                        className={inputClass(prevReadOnly)}
                    />
                    <span className="text-[11px] text-slate-400">{prevReadOnly ? 'Lấy từ kỳ trước' : 'Chưa có kỳ trước — nhập chỉ số ban đầu'}</span>
                </div>
                <div className="flex flex-col gap-1">
                    <label htmlFor={idBase + '-latest'} className="text-xs font-semibold text-slate-600">Chỉ số kỳ này</label>
                    <input
                        id={idBase + '-latest'}
                        data-field="chiSoKyNay"
                        type="number" min={0} step="any" inputMode="decimal"
                        autoFocus={autoFocus}
                        placeholder="Nhập chỉ số"
                        value={value.chiSoKyNay}
                        onChange={e => onChange({ chiSoKyNay: e.target.value })}
                        className={inputClass(false)}
                    />
                </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-slate-600">Tiêu thụ</span>
                <output data-out="tieuThu" className={cx('text-base font-extrabold', consumption != null && consumption < 0 ? 'text-red-500' : 'text-blue-600')}>
                    {consumption == null ? '—' : formatNumber(consumption) + ' ' + meta.unit}
                </output>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-slate-600">Ảnh chỉ số</span>
                <div className="flex items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-blue-400 hover:text-blue-600">
                        <i className="fas fa-camera" aria-hidden="true" /> {value.anh ? 'Đổi ảnh' : 'Tải ảnh'}
                        <input type="file" accept="image/*" capture="environment" className="hidden" data-field="anh" onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {value.anh && (
                        <>
                            <img src={value.anh} alt={'Ảnh chỉ số ' + meta.title} className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
                            <button type="button" onClick={() => onChange({ anh: '' })} className="text-xs font-medium text-red-500 hover:underline">Xoá</button>
                        </>
                    )}
                </div>
                {photoError && <span className="text-xs text-red-500">{photoError}</span>}
            </div>

            {error && <p data-out="error" className="text-xs font-medium text-red-500">{error}</p>}
        </section>
    );
}
