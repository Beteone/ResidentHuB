import { MoneyInput } from './MoneyInput';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cancel, collect, issue, money, periodLabel, today, type Invoice } from './domain';
import { can, draft, load, rooms, save, visible } from './invoiceService';
import { InvoiceTable, type Action } from './InvoiceTable';
import { Dialog, InvoiceModal } from './InvoiceModal';

export function InvoicePage() {
    const [rows, setRows] = useState<Invoice[]>([]);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const [search, setSearch] = useState('');
    const [room, setRoom] = useState('');
    const [period, setPeriod] = useState('');
    const [modal, setModal] = useState<{ action: Action | 'create'; row: Invoice } | null>(null);
    const [payment, setPayment] = useState('');
    const [notice, setNotice] = useState('');
    const roomOptions = rooms();
    const close = useCallback(() => setModal(null), []);
    useEffect(() => {
        const refresh = () => { try { setRows(load()); setReady(true); setError(''); } catch (e) { setReady(false); setError('Không thể đọc dữ liệu: ' + (e as Error).message); } };
        refresh();
        window.addEventListener('storage', refresh);
        return () => window.removeEventListener('storage', refresh);
    }, []);
    useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4000); return () => window.clearTimeout(timer); }, [notice]);
    const filtered = useMemo(() => visible(rows).filter(i => (!room || i.roomId === room) && (!period || i.period === period) && `${i.residentName} ${i.roomName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))), [rows, room, period, search]);
    const totals = filtered.filter(i => i.status !== 'huy').reduce((s, i) => [s[0] + i.tongTien, s[1] + i.daThanhToan, s[2] + i.conNo], [0, 0, 0]);
    function commit(next: Invoice, permission: string) {
        if (!ready) throw new Error('Dữ liệu chưa sẵn sàng.');
        if (!can(permission) || (window.RHP && !window.RHP.inScope(next.buildingId))) throw new Error('Bạn không có quyền thực hiện thao tác này.');
        const latest = load();
        const previous = latest.find(i => i.id === next.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(rows.find(i => i.id === next.id))) throw new Error('Hóa đơn đã thay đổi ở tab khác. Hãy tải lại trang.');
        if (permission === 'update' && previous?.status !== 'nhap') throw new Error('Chỉ sửa hóa đơn nháp.');
        if (next.status !== 'huy' && latest.some(i => i.id !== next.id && i.roomId === next.roomId && i.period === next.period && i.status !== 'huy')) throw new Error('Phòng đã có hóa đơn trong kỳ này.');
        const updated = previous ? latest.map(i => i.id === next.id ? next : i) : [...latest, { ...next, id: `HD-${crypto.randomUUID()}` }];
        save(updated); setRows(updated); close(); setError(''); setNotice('Đã lưu hóa đơn thành công.');
    }
    function action(kind: Action, row: Invoice) { setError(''); setPayment(String(row.conNo)); setModal({ action: kind, row }); }
    if (!can('view')) return <p className="p-8 text-slate-500">Bạn không có quyền xem hóa đơn.</p>;
    const control = 'rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500';
    return <main className="mx-auto max-w-[1600px] p-5 text-slate-800 md:p-8"><div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">ResidentHub / Tài chính</p><h1 className="text-3xl font-semibold tracking-tight">Quản lý Hóa đơn</h1><p className="mt-2 text-sm text-slate-500">Theo dõi kỳ thu, thanh toán và công nợ của từng căn hộ.</p></div>{can('create') && <button disabled={!ready || !roomOptions.length} onClick={() => setModal({ action: 'create', row: draft(roomOptions.find(r => r.id === room) || roomOptions[0], period || today().slice(0, 7)) })} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">+ Tạo hóa đơn</button>}</div>
        {error && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</p>}{notice && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">{['Tổng dự thu', 'Đã thu', 'Còn nợ'].map((label, i) => <div key={label} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between text-sm text-slate-500"><span>{label}</span><i aria-hidden="true" className={`fas fa-${['file-invoice-dollar', 'check-circle', 'clock'][i]} ${['text-indigo-400', 'text-emerald-400', 'text-red-400'][i]}`} /></div><p className={`mt-4 text-2xl font-semibold ${['text-slate-800', 'text-emerald-600', 'text-red-600'][i]}`}>{money(totals[i])}</p><p className="mt-2 text-xs text-slate-400">Theo bộ lọc · không gồm hóa đơn hủy</p></div>)}</div>
        <div className="mb-5 flex flex-wrap gap-3"><label className="min-w-52 flex-1"><span className="sr-only">Tìm tên khách hoặc phòng</span><input className={`${control} w-full`} placeholder="Tìm tên khách, số phòng…" value={search} onChange={e => setSearch(e.target.value)} /></label><label><span className="sr-only">Chọn căn hộ</span><select className={control} value={room} onChange={e => setRoom(e.target.value)}><option value="">Tất cả căn hộ</option>{roomOptions.map(r => <option key={r.id} value={r.id}>{r.buildingName} / {r.name}</option>)}</select></label><label><span className="sr-only">Kỳ thu</span><select className={control} value={period} onChange={e => setPeriod(e.target.value)}><option value="">Tất cả kỳ thu</option>{[...new Set([...visible(rows).map(i => i.period), today().slice(0, 7)])].sort().reverse().map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}</select></label></div>
        <div className="mb-3 text-sm text-slate-400">{filtered.length} hóa đơn</div><InvoiceTable invoices={filtered} onAction={action} />
        {modal && ['create', 'edit', 'preview'].includes(modal.action) && <InvoiceModal key={`${modal.action}-${modal.row.id}`} invoice={modal.row} rooms={roomOptions} preview={modal.action === 'preview'} onClose={close} onSave={row => commit(row, modal.action === 'create' ? 'create' : 'update')} />}
        {modal && ['issue', 'cancel', 'collect'].includes(modal.action) && <Dialog title={modal.action === 'collect' ? 'Thu tiền hóa đơn' : modal.action === 'issue' ? 'Phát hành hóa đơn' : 'Hủy hóa đơn'} onClose={close}><form onSubmit={e => { e.preventDefault(); try { if (modal.action === 'collect') commit(collect(modal.row, Number(payment)), 'collect'); else if (modal.action === 'issue') { const fresh = draft(roomOptions.find(r => r.id === modal.row.roomId)!, modal.row.period); commit(issue({ ...modal.row, missingReadings: fresh.missingReadings }), 'issue'); } else commit(cancel(modal.row), 'delete'); } catch (err) { setError((err as Error).message); } }}><p className="mb-4 text-sm text-slate-500">Phòng {modal.row.roomName} · {periodLabel(modal.row.period)} · {modal.row.residentName}</p>{modal.action === 'collect' ? <label className="block text-sm">Còn nợ: {money(modal.row.conNo)}<MoneyInput autoFocus required className={`${control} my-4 w-full`} value={Number(payment)} onValue={n => setPayment(String(n))} /></label> : <p className="mb-6 text-sm">{modal.action === 'issue' ? 'Sau khi phát hành, hóa đơn sẽ được khóa chỉnh sửa.' : 'Hóa đơn sẽ được đánh dấu đã hủy và loại khỏi thống kê.'}</p>}{error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={close} className={control}>Đóng</button><button className={`rounded-xl px-5 py-3 text-sm text-white ${modal.action === 'cancel' ? 'bg-red-600' : 'bg-indigo-600'}`}>Xác nhận</button></div></form></Dialog>}
    </main>;
}
