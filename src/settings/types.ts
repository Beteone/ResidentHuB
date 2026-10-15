export type SettingsRole = 'manager' | 'chief_accountant' | 'staff';
export type SettingsTab = 'notifications' | 'financial' | 'activity';
export interface SettingsActor { id: string; name: string; role: SettingsRole }
export interface NotificationRule {
    id: string; group: string; title: string; description: string;
    email: boolean; app: boolean; template: string; variables: string[];
}
export interface FinancialConfig {
    bank: string; accountNumber: string; accountHolder: string; branch: string;
    transfer: boolean; cash: boolean; pos: boolean;
}
export type ActivityModule = 'Cài đặt' | 'Cư dân' | 'Hợp đồng' | 'Hóa đơn' | 'Yêu cầu hỗ trợ';
export type ActivityAction = 'Thêm mới' | 'Cập nhật' | 'Xóa';
export interface ActivityEntry {
    id: string; at: string; actorName: string; actorRole: string;
    module: ActivityModule; action: ActivityAction; detail: string;
}
export interface SettingsData { notifications: NotificationRule[]; financial: FinancialConfig; activity: ActivityEntry[] }
