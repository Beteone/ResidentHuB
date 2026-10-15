import { useState } from 'react';
import type { ActivityEntry, SettingsActor, SettingsData, SettingsRole, SettingsTab } from './types';
import { defaultSettings, loadSettings, roleLabels, sampleActivity, saveSection } from './settingsStore';
import { Icon, fieldClass } from './components';
import { NotificationSettings } from './NotificationSettings';
import { FinancialSettings } from './FinancialSettings';
import { ActivityLog } from './ActivityLog';

const tabs = [
    { id: 'notifications', title: 'Cài đặt thông báo', description: 'Kênh gửi & mẫu nội dung', icon: 'bell' },
    { id: 'financial', title: 'Tài khoản tài chính', description: 'Ngân hàng & thanh toán', icon: 'bank' },
    { id: 'activity', title: 'Nhật ký hoạt động', description: 'Lịch sử thao tác', icon: 'history' }
] as const;
export function SettingsLayout({ actor, demo = false, activityEntries = [] }: { actor: SettingsActor; demo?: boolean; activityEntries?: ActivityEntry[] }) {
    const [tab, setTab] = useState<SettingsTab>('notifications');
    const [role, setRole] = useState<SettingsRole>(actor.role);
    const [loadError, setLoadError] = useState('');
    const [data, setData] = useState<SettingsData>(() => {
        try { return loadSettings(actor.id); } catch (err) { setLoadError((err as Error).message); return defaultSettings(); }
    });
    const currentActor = { ...actor, role: demo ? role : actor.role };
    function ensureLoaded() { if (loadError) throw new Error('Không thể lưu khi dữ liệu hiện tại chưa đọc được.'); }
    return <main className="min-h-screen bg-slate-50 text-slate-800"><div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">ResidentHub / Quản trị</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">Cài đặt</h1><p className="mt-2 text-sm text-slate-500">Quản lý thông báo, tài chính và lịch sử hoạt động của tòa nhà.</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"><p className="font-semibold text-slate-800">{actor.name}</p>{demo ? <label className="mt-2 block text-xs text-slate-500">Vai trò mô phỏng<select aria-label="Vai trò mô phỏng" className={`${fieldClass} mt-1 !py-2`} value={role} onChange={e => setRole(e.target.value as SettingsRole)}>{Object.entries(roleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label> : <p className="mt-1 text-xs text-slate-500">{roleLabels[actor.role]}</p>}</div></header>
        {demo && <p className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">Bản xem thử độc lập · Cấu hình lưu trong trình duyệt. Chưa kết nối gửi thông báo hoặc xử lý thanh toán.</p>}
        {loadError && <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">Không thể đọc Cài đặt: {loadError} Không có dữ liệu nào bị ghi đè. Hãy kiểm tra bộ nhớ trình duyệt rồi tải lại trang.</p>}
        <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"><nav aria-label="Menu Cài đặt" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6"><p className="hidden px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">Thiết lập hệ thống</p><div className="flex gap-2 overflow-x-auto lg:flex-col">{tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? 'page' : undefined} aria-controls={`settings-${item.id}`} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left transition lg:w-full ${tab === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}><Icon name={item.icon} /><span><span className="block whitespace-nowrap text-sm font-semibold">{item.title}</span><span className="mt-1 hidden text-xs opacity-75 lg:block">{item.description}</span></span></button>)}</div></nav>
            <div className="min-w-0"><section id="settings-notifications" aria-label="Cài đặt thông báo" hidden={tab !== 'notifications'}><NotificationSettings initial={data.notifications} onSave={rules => { ensureLoaded(); setData(saveSection(currentActor, 'notifications', rules)); }} /></section><section id="settings-financial" aria-label="Tài khoản tài chính" hidden={tab !== 'financial'}><FinancialSettings initial={data.financial} role={currentActor.role} onSave={value => { ensureLoaded(); setData(saveSection(currentActor, 'financial', value)); }} /></section><section id="settings-activity" aria-label="Nhật ký hoạt động" hidden={tab !== 'activity'}><ActivityLog demo={demo} entries={[...data.activity, ...(demo ? sampleActivity : activityEntries)]} /></section></div>
        </div><footer className="mt-10 text-center text-xs text-slate-400">ResidentHub · Cài đặt hệ thống</footer>
    </div></main>;
}
