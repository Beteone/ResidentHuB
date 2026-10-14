export type InvoiceStatus = 'nhap' | 'phat_hanh' | 'da_thu_du' | 'huy';
export interface Usage { soLuong: number; donGia: number; thanhTien: number }
export interface Invoice {
    id: string; roomId: string; buildingId: string; roomName: string; buildingName: string;
    residentName: string; period: string;
    chiTietThu: { tienPhong: number; phiDichVu: number; dien: Usage; nuoc: Usage };
    tongTien: number; daThanhToan: number; conNo: number; hanThanhToan: string; status: InvoiceStatus;
    missingReadings: string[];
}
export interface Room { id: string; buildingId: string; name: string; buildingName: string; residentName: string; rent: number }
export const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
export const periodLabel = (value: string) => value.split('-').reverse().join('/');
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function overdue(invoice: Invoice, date = today()) { return invoice.status === 'phat_hanh' && invoice.conNo > 0 && invoice.hanThanhToan < date; }
export function calculate(invoice: Invoice): Invoice {
    const c = invoice.chiTietThu;
    const values = [c.tienPhong, c.phiDichVu, c.dien.soLuong, c.dien.donGia, c.nuoc.soLuong, c.nuoc.donGia, invoice.daThanhToan];
    if (values.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Số tiền và số lượng phải là số không âm.');
    const dien = { ...c.dien, thanhTien: Math.round(c.dien.soLuong * c.dien.donGia) };
    const nuoc = { ...c.nuoc, thanhTien: Math.round(c.nuoc.soLuong * c.nuoc.donGia) };
    const tongTien = Math.round(c.tienPhong + c.phiDichVu + dien.thanhTien + nuoc.thanhTien);
    if (invoice.daThanhToan > tongTien) throw new Error('Số tiền đã trả vượt tổng hóa đơn.');
    return { ...invoice, chiTietThu: { ...c, dien, nuoc }, tongTien, conNo: tongTien - invoice.daThanhToan };
}
export function issue(invoice: Invoice) {
    if (invoice.status !== 'nhap') throw new Error('Chỉ được phát hành hóa đơn nháp.');
    if (invoice.missingReadings.length) throw new Error('Thiếu chỉ số: ' + invoice.missingReadings.join(', '));
    const next = calculate(invoice);
    if (next.tongTien <= 0) throw new Error('Tổng hóa đơn phải lớn hơn 0.');
    return { ...next, status: 'phat_hanh' as const };
}
export function collect(invoice: Invoice, amount: number) {
    if (invoice.status !== 'phat_hanh') throw new Error('Chỉ thu tiền hóa đơn đã phát hành.');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > invoice.conNo) throw new Error('Số tiền thu phải lớn hơn 0 và không vượt số còn nợ.');
    const next = calculate({ ...invoice, daThanhToan: invoice.daThanhToan + amount });
    return { ...next, status: next.conNo === 0 ? 'da_thu_du' as const : 'phat_hanh' as const };
}
export function cancel(invoice: Invoice) {
    if (invoice.status !== 'phat_hanh') throw new Error('Chỉ hủy hóa đơn đã phát hành.');
    if (invoice.daThanhToan > 0) throw new Error('Hóa đơn đã thu một phần cần hoàn tiền trước khi hủy.');
    return { ...invoice, status: 'huy' as const };
}
