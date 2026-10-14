import { calculate, type Invoice, type Room } from './domain';

// Read-only adapter: never calls create/update/remove on shared RHD stores.
type Row = Record<string, unknown>;
const raw = (entity: string): Row[] => window.RHD ? (window.RHD as unknown as { list(name: string): Row[] }).list(entity) : [];
const num = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) && value != null ? Number(value) : fallback;
const readingTime = (row: Row) => num(row.recordedAt, Date.parse(String(row.recordedAt || '')) || num(row.createdAt));
const policy = (service: Row) => {
    const api = window.RHD as unknown as { utilityPolicy?: (s: Row) => { meterType: string | null; metered: boolean } };
    const label = String(service.name || '').toLowerCase();
    const meterType = ['water', 'electricity'].includes(String(service.feeType)) ? String(service.feeType) :
        /^(tiền\s+)?nước\b|m³|m3/i.test(label) ? 'water' : /^(tiền\s+)?điện\b|kwh/i.test(label) ? 'electricity' : null;
    const packageFee = service.calcMethod === 'fixed' && (service.billingMode === 'flat' || service.flatRate === true || /trọn gói|tron goi/i.test(label));
    return api?.utilityPolicy?.(service) || { meterType, metered: service.calcMethod === 'meter' || (!!meterType && !packageFee) };
};
export const can = (action: string) => !window.RHP || window.RHP.can('invoices.' + action);
const inScope = (id: string) => !window.RHP || window.RHP.inScope(id);
const mockRooms: Room[] = ['501', '502', '503', '601', '602'].map((name, i) => ({ id: 'mock-' + name, buildingId: 'mock-building', buildingName: 'ResidentHub · Tòa A', name, residentName: ['Nguyễn Minh Anh', 'Trần Hoàng Nam', 'Lê Thu Hà', 'Phạm Quốc Bảo', 'Vũ Ngọc Linh'][i], rent: 2000000 + i * 200000 }));
export function rooms(): Room[] {
    if (!window.RHD) return mockRooms;
    const buildings = raw('buildings'), customers = raw('customers');
    return raw('apartments').filter(a => a.active !== false && inScope(String(a.buildingId))).map(a => {
        const contract = window.RHD.activeContractFor?.(String(a.id)) as Row | undefined;
        return { id: String(a.id), buildingId: String(a.buildingId), name: String(a.name), buildingName: String(buildings.find(b => b.id === a.buildingId)?.name || ''), residentName: String(customers.find(c => c.id === contract?.customerId)?.fullName || 'Chưa có khách thuê'), rent: num(contract?.rentPrice, num(a.rentPrice)) };
    });
}
export function draft(room: Room, period: string): Invoice {
    const missingReadings: string[] = [];
    const contract = raw('contracts').filter(c => c.apartmentId === room.id && String(c.startDate || '') <= period + '-31' && (!c.endDate || String(c.endDate) >= period + '-01') && !['ended', 'terminated', 'closed'].includes(String(c.status))).sort((a, b) => num(b.createdAt) - num(a.createdAt))[0];
    const building = raw('buildings').find(b => b.id === room.buildingId);
    const selected = ((building?.services || []) as Row[]).filter(s => ((contract?.serviceIds || []) as string[]).includes(String(s.id)));
    const priceOf = (s: Row) => num((contract?.serviceOverrides as Row | undefined)?.[String(s.id)], num(s.unitPrice));
    const usage = (kind: string, price: number) => {
        const service = selected.find(s => policy(s).meterType === kind && policy(s).metered);
        if (window.RHD && !service) return { soLuong: 0, donGia: 0, thanhTien: 0 };
        if (service) price = priceOf(service);
        const records = raw('meters').filter(m => m.apartmentId === room.id && (m.readingPeriod || m.periodMonth) === period && m.meterType === kind).sort((a, b) => readingTime(b) - readingTime(a));
        const engine = (window as unknown as { RHB?: { approvedReading(apartmentId: string, meterType: string, period: string): { reading: Row | null; state: string } } }).RHB;
        const found = engine?.approvedReading(room.id, kind, period);
        const reading = found ? found.reading : records[0];
        const closed = reading && reading.latestIndex !== '' && reading.latestIndex != null && reading.previousIndex !== '' && reading.previousIndex != null && Number.isFinite(Number(reading.latestIndex)) && Number.isFinite(Number(reading.previousIndex)) && Number(reading.latestIndex) >= Number(reading.previousIndex);
        const approved = found ? found.state === 'approved' : reading && (reading.approvalStatus ? reading.approvalStatus === 'đã_duyệt' : reading.status === 'đã_chốt');
        if (window.RHD && (!closed || !approved)) missingReadings.push(`${kind === 'water' ? 'Nước' : 'Điện'} kỳ ${period.split('-').reverse().join('/')} (${closed ? 'chưa duyệt' : 'chưa có chỉ số'})`);
        const soLuong = window.RHD ? (closed && approved ? Number(reading.latestIndex) - Number(reading.previousIndex) : 0) : (kind === 'water' ? 5 : 20);
        return { soLuong, donGia: price, thanhTien: soLuong * price };
    };
    const [year, month] = period.split('-').map(Number);
    const due = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-05`;
    if (window.RHD && !contract) missingReadings.push('Hợp đồng có hiệu lực trong kỳ');
    const fixed = window.RHD ? selected.filter(s => !policy(s).metered && s.feeType !== 'rent' && s.feeType !== 'deposit').reduce((sum, s) => sum + priceOf(s), 0) : 150000;
    return calculate({ id: '', roomId: room.id, buildingId: room.buildingId, roomName: room.name, buildingName: room.buildingName, residentName: room.residentName, period, chiTietThu: { tienPhong: window.RHD ? num(contract?.rentPrice) : room.rent, phiDichVu: fixed, dien: usage('electricity', 3500), nuoc: usage('water', 25000) }, tongTien: 0, daThanhToan: 0, conNo: 0, hanThanhToan: due, status: 'nhap', missingReadings });
}
export function fetchDraft(room: Room, period: string): Promise<Invoice> { return new Promise(resolve => window.setTimeout(() => resolve(draft(room, period)), 180)); }
function key() {
    const session = window.RH?.getSession?.() || window.RH_SESSION;
    return `residenthub_invoice_module_v1_${window.RHD?.mode() || 'mock'}_${session?.id || 'standalone'}`;
}
export function load(): Invoice[] {
    const saved = localStorage.getItem(key());
    if (saved) {
        const rows: Invoice[] = JSON.parse(saved);
        if (!Array.isArray(rows)) throw new Error('Dữ liệu hóa đơn không hợp lệ.');
        return rows.map(calculate);
    }
    if (window.RHD) return [];
    return mockRooms.map((room, i) => {
        const row = draft(room, '2026-09');
        row.id = `HD-202609-${String(i + 1).padStart(3, '0')}`;
        row.status = (['nhap', 'phat_hanh', 'da_thu_du', 'phat_hanh', 'huy'] as const)[i];
        row.daThanhToan = i === 2 ? row.tongTien : i === 1 ? 1000000 : 0;
        return calculate(row);
    });
}
export function save(rows: Invoice[]) { localStorage.setItem(key(), JSON.stringify(rows)); }
export function visible(rows: Invoice[]) { return rows.filter(i => inScope(i.buildingId)); }
