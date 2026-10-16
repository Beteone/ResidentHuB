import type { ActivityEntry, FinancialConfig, NotificationRule, SettingsActor, SettingsData, SettingsRole } from './types';

export const roleLabels: Record<SettingsRole, string> = { manager: 'Quản lý', chief_accountant: 'Kế toán trưởng', staff: 'Nhân viên' };
export const canEditFinancial = (role: SettingsRole) => role === 'manager' || role === 'chief_accountant';
export const storageKey = (actorId: string) => `residenthub_settings_v1_${encodeURIComponent(actorId)}`;
export const bankOptions = ['Vietcombank', 'BIDV', 'VietinBank', 'Agribank', 'Techcombank', 'MB Bank', 'ACB', 'VPBank', 'Sacombank', 'TPBank', 'Ngân hàng khác'];
export function defaultSettings(): SettingsData {
    return {
        notifications: [
            { id: 'invoice-issued', group: 'Hóa đơn', title: 'Hóa đơn mới được phát hành', description: 'Thông báo kỳ thu và số tiền cần thanh toán.', email: true, app: true, template: 'Xin chào {Ten_Khach_Hang}, hóa đơn tháng {Thang_Thu} của phòng {So_Phong} có tổng tiền {Tong_Tien}. Vui lòng thanh toán trước {Han_Thanh_Toan}.', variables: ['Ten_Khach_Hang', 'Thang_Thu', 'So_Phong', 'Tong_Tien', 'Han_Thanh_Toan'] },
            { id: 'invoice-reminder', group: 'Hóa đơn', title: 'Nhắc hạn thanh toán', description: 'Nhắc cư dân về hóa đơn sắp đến hạn.', email: false, app: true, template: 'Xin chào {Ten_Khach_Hang}, hóa đơn tháng {Thang_Thu} sẽ đến hạn vào {Han_Thanh_Toan}.', variables: ['Ten_Khach_Hang', 'Thang_Thu', 'Han_Thanh_Toan'] },
            { id: 'contract-expiring', group: 'Hợp đồng', title: 'Hợp đồng sắp hết hạn', description: 'Giúp cư dân chủ động chuẩn bị gia hạn.', email: true, app: true, template: 'Hợp đồng {Ma_Hop_Dong} của {Ten_Khach_Hang} tại phòng {So_Phong} sẽ hết hạn ngày {Ngay_Het_Han}.', variables: ['Ten_Khach_Hang', 'Ma_Hop_Dong', 'So_Phong', 'Ngay_Het_Han'] },
            { id: 'support-updated', group: 'Yêu cầu hỗ trợ', title: 'Cập nhật yêu cầu hỗ trợ', description: 'Thông báo khi yêu cầu có trạng thái mới.', email: false, app: true, template: 'Xin chào {Ten_Khach_Hang}, yêu cầu {Ma_Yeu_Cau} đã được cập nhật: {Trang_Thai}.', variables: ['Ten_Khach_Hang', 'Ma_Yeu_Cau', 'Trang_Thai'] }
        ],
        financial: { bank: '', accountNumber: '', accountHolder: '', branch: '', transfer: true, cash: true, pos: false },
        activity: []
    };
}
export function loadSettings(actorId: string): SettingsData {
    const saved = localStorage.getItem(storageKey(actorId));
    if (!saved) return defaultSettings();
    const data: unknown = JSON.parse(saved);
    if (!data || typeof data !== 'object') throw new Error('Dữ liệu Cài đặt không hợp lệ.');
    const row = data as Partial<SettingsData>;
    const defaults = defaultSettings();
    if (!Array.isArray(row.notifications) || !Array.isArray(row.activity) || !row.financial || typeof row.financial !== 'object') throw new Error('Dữ liệu Cài đặt không hợp lệ.');
    const notifications = defaults.notifications.map(rule => {
        const value = row.notifications!.find(item => item?.id === rule.id);
        if (!value || typeof value.template !== 'string' || typeof value.email !== 'boolean' || typeof value.app !== 'boolean') throw new Error('Mẫu thông báo không hợp lệ.');
        return { ...rule, template: value.template, email: value.email, app: value.app };
    });
    const financial = row.financial;
    if (['bank', 'accountNumber', 'accountHolder', 'branch'].some(key => typeof financial[key as keyof FinancialConfig] !== 'string') || ['transfer', 'cash', 'pos'].some(key => typeof financial[key as keyof FinancialConfig] !== 'boolean')) throw new Error('Cấu hình tài chính không hợp lệ.');
    if (row.activity.some(item => !item || typeof item.id !== 'string' || !Number.isFinite(Date.parse(item.at)) || typeof item.actorName !== 'string' || typeof item.actorRole !== 'string' || typeof item.detail !== 'string' || !['Cài đặt', 'Cư dân', 'Hợp đồng', 'Hóa đơn', 'Yêu cầu hỗ trợ'].includes(item.module) || !['Thêm mới', 'Cập nhật', 'Xóa'].includes(item.action))) throw new Error('Nhật ký không hợp lệ.');
    return { notifications, financial: { ...financial }, activity: row.activity };
}
export function validateFinancial(value: FinancialConfig): string {
    if (value.transfer && (!bankOptions.includes(value.bank) || !/^\d{4,34}$/.test(value.accountNumber) || !value.accountHolder.trim())) return 'Vui lòng chọn ngân hàng, nhập số tài khoản từ 4–34 chữ số và tên chủ tài khoản.';
    if (![value.transfer, value.cash, value.pos].some(Boolean)) return 'Cần bật ít nhất một phương thức thanh toán.';
    return '';
}
export function saveSection(actor: SettingsActor, section: 'notifications', value: NotificationRule[]): SettingsData;
export function saveSection(actor: SettingsActor, section: 'financial', value: FinancialConfig): SettingsData;
export function saveSection(actor: SettingsActor, section: 'notifications' | 'financial', value: NotificationRule[] | FinancialConfig): SettingsData {
    if (section === 'financial') {
        if (!canEditFinancial(actor.role)) throw new Error('Bạn không có quyền thay đổi cấu hình tài chính.');
        const error = validateFinancial(value as FinancialConfig);
        if (error) throw new Error(error);
    } else if ((value as NotificationRule[]).some(rule => !rule.template.trim())) throw new Error('Mẫu nội dung không được để trống.');
    // Read fresh data so saving one section does not overwrite another section.
    const current = loadSettings(actor.id);
    const entry: ActivityEntry = { id: crypto.randomUUID(), at: new Date().toISOString(), actorName: actor.name, actorRole: roleLabels[actor.role], module: 'Cài đặt', action: 'Cập nhật', detail: section === 'financial' ? 'Đã lưu cấu hình tài chính và phương thức thanh toán.' : 'Đã lưu kênh gửi và mẫu nội dung thông báo.' };
    const next = { ...current, [section]: value, activity: [entry, ...current.activity] } as SettingsData;
    localStorage.setItem(storageKey(actor.id), JSON.stringify(next));
    return next;
}
export function bangkokDate(iso: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
    const part = (name: string) => parts.find(p => p.type === name)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}
export function filterActivity(rows: ActivityEntry[], search: string, from: string, to: string, module: string) {
    const term = search.trim().toLocaleLowerCase('vi');
    return rows.filter(row => {
        const day = bangkokDate(row.at);
        return (!term || row.actorName.toLocaleLowerCase('vi').includes(term)) && (!from || day >= from) && (!to || day <= to) && (!module || row.module === module);
    }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
export const sampleActivity: ActivityEntry[] = [
    { id: 'sample-1', at: '2026-10-14T08:30:00Z', actorName: 'Nguyễn Minh Anh', actorRole: 'Quản lý', module: 'Hóa đơn', action: 'Cập nhật', detail: 'Đã cập nhật trạng thái hóa đơn phòng 501.' },
    { id: 'sample-2', at: '2026-10-14T07:15:00Z', actorName: 'Trần Thu Hà', actorRole: 'Kế toán trưởng', module: 'Hợp đồng', action: 'Thêm mới', detail: 'Đã thêm hợp đồng thuê phòng 302.' },
    { id: 'sample-3', at: '2026-10-13T09:45:00Z', actorName: 'Lê Hoàng Nam', actorRole: 'Nhân viên', module: 'Cư dân', action: 'Cập nhật', detail: 'Đã cập nhật số điện thoại cư dân phòng 205.' },
    { id: 'sample-4', at: '2026-10-12T02:10:00Z', actorName: 'Nguyễn Minh Anh', actorRole: 'Quản lý', module: 'Yêu cầu hỗ trợ', action: 'Xóa', detail: 'Đã xóa yêu cầu hỗ trợ trùng lặp.' }
];
