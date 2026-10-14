import { useEffect, useRef, useState, type ReactNode } from 'react';
import { calculate, money, periodLabel, type Invoice, type Room } from './domain';
import { fetchDraft } from './invoiceService';

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        ref.current?.querySelector<HTMLElement>('button, input, select')?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Tab') {
                const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
                if (!nodes?.length) return;
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
    }, [onClose]);
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="invoice-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-6 flex items-center justify-between"><h2 id="invoice-dialog-title" className="text-xl font-semibold">{title}</h2><button type="button" aria-label="Đóng" className="rounded-lg px-3 py-2 hover:bg-slate-100" onClick={onClose}>✕</button></div>{children}</div></div>;
}
const input = 'mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50';
export function InvoiceModal({ invoice, rooms, preview, onClose, onSave }: { invoice: Invoice; rooms: Room[]; preview: boolean; onClose: () => void; onSave: (row: Invoice) => void }) {
    const [value, setValue] = useState(invoice);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const request = useRef(0);
    const editable = !preview && invoice.status === 'nhap';
    useEffect(() => () => { request.current++; }, []);
    async function choose(roomId: string, period: string) {
        const room = rooms.find(r => r.id === roomId);
        if (!room || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;
        const token = ++request.current;
        setLoading(true); setError('');
        setValue(v => ({ ...v, roomId, period }));
        try { const next = await fetchDraft(room, period); if (request.current === token) setValue({ ...next, id: invoice.id }); }
        catch (e) { if (request.current === token) setError((e as Error).message); }
        finally { if (request.current === token) setLoading(false); }
    }
    function amount(field: 'tienPhong' | 'phiDichVu', n: number) { setValue(v => calculate({ ...v, chiTietThu: { ...v.chiTietThu, [field]: n } })); }
    function usage(kind: 'dien' | 'nuoc', field: 'soLuong' | 'donGia', n: number) { setValue(v => calculate({ ...v, chiTietThu: { ...v.chiTietThu, [kind]: { ...v.chiTietThu[kind], [field]: n } } })); }
    return <Dialog title={preview ? 'Xem trước hóa đơn' : invoice.id ? 'Sửa hóa đơn nháp' : 'Tạo hóa đơn'} onClose={onClose}><form onSubmit={e => { e.preventDefault(); try { onSave(calculate(value)); } catch (err) { setError((err as Error).message); } }}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-500">Phòng<select required disabled={!editable} className={input} value={value.roomId} onChange={e => void choose(e.target.value, value.period)}>{rooms.map(room => <option key={room.id} value={room.id}>{room.buildingName} / {room.name}</option>)}</select></label><label className="text-sm text-slate-500">Kỳ thu<input required type="month" disabled={!editable} className={input} value={value.period} onChange={e => void choose(value.roomId, e.target.value)} /></label></div>
        <p className="my-4 text-sm text-slate-500">Khách thuê: <strong className="text-slate-800">{value.residentName}</strong> · {periodLabel(value.period)}</p>
        {loading && <p role="status" className="mb-4 text-sm text-indigo-600">Đang lấy chỉ số điện/nước…</p>}
        {!!value.missingReadings.length && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Chưa có chỉ số {value.missingReadings.join(', ')} cho kỳ này. Có thể lưu nháp; cần đủ chỉ số trước khi phát hành.</p>}
        <fieldset disabled={!editable || loading} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{(['tienPhong', 'phiDichVu'] as const).map(field => <label key={field} className="text-sm text-slate-500">{field === 'tienPhong' ? 'Tiền phòng (đ)' : 'Phí dịch vụ (đ)'}<input className={input} required type="number" min="0" step="1" value={value.chiTietThu[field]} onChange={e => amount(field, Math.max(0, Number(e.target.value)))} /></label>)}</div>
        {(['dien', 'nuoc'] as const).map(kind => <div key={kind} className="rounded-xl bg-slate-50 p-4"><div className="mb-3 flex justify-between text-sm font-semibold"><span>{kind === 'dien' ? 'Điện · kWh' : 'Nước · m³'}</span><span>{money(value.chiTietThu[kind].thanhTien)}</span></div><div className="grid grid-cols-2 gap-4">{(['soLuong', 'donGia'] as const).map(field => <label key={field} className="text-xs text-slate-500">{field === 'soLuong' ? 'Tiêu thụ' : 'Đơn giá (đ)'}<input required className={input} type="number" min="0" step={field === 'soLuong' ? '0.01' : '1'} value={value.chiTietThu[kind][field]} onChange={e => usage(kind, field, Math.max(0, Number(e.target.value)))} /></label>)}</div></div>)}
        <label className="block text-sm text-slate-500">Hạn thanh toán<input className={input} required type="date" value={value.hanThanhToan} onChange={e => setValue(v => ({ ...v, hanThanhToan: e.target.value }))} /></label></fieldset>
        <div className="my-5 flex justify-between rounded-xl bg-indigo-50 p-4 font-semibold text-indigo-700"><span>Tổng phải thu</span><span>{money(value.tongTien)}</span></div>{preview && <div className="mb-5 flex justify-between text-sm"><span>Đã trả: {money(value.daThanhToan)}</span><strong>Còn nợ: {money(value.conNo)}</strong></div>}{error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" className="rounded-xl border px-5 py-3 text-sm" onClick={onClose}>Đóng</button>{editable && <button disabled={loading} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">Lưu nháp</button>}</div>
    </form></Dialog>;
}
