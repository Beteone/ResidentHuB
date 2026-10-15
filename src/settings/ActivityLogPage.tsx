import { useEffect, useState } from 'react';
import { ActivityLog } from './ActivityLog';
import { loadSettings, sampleActivity, storageKey } from './settingsStore';
import type { ActivityEntry } from './types';

// Isolated, read-only view used inside the existing dashboard Settings panel.
export function ActivityLogPage({ actorId, demo }: { actorId: string; demo: boolean }) {
    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [error, setError] = useState('');
    useEffect(() => {
        const refresh = () => {
            try { setEntries(loadSettings(actorId).activity); setError(''); }
            catch (err) { setError((err as Error).message); }
        };
        const onStorage = (event: StorageEvent) => { if (!event.key || event.key === storageKey(actorId)) refresh(); };
        refresh();
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', refresh);
        return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); };
    }, [actorId]);
    return <main className="min-h-screen bg-slate-50 p-2 text-slate-800 sm:p-4">
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">Không thể đọc nhật ký: {error}</p>}
        {!demo && <p className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-500">Nhật ký hiện ghi nhận các lần lưu trong module Cài đặt mới. Lịch sử của các phân hệ khác chưa được kết nối.</p>}
        <ActivityLog entries={[...entries, ...(demo ? sampleActivity : [])]} demo={demo} />
    </main>;
}
