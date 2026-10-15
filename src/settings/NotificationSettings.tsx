import { useRef, useState } from 'react';
import type { NotificationRule } from './types';
import { Card, Icon, SectionHeading, Toggle, fieldClass, saveClass } from './components';

export function NotificationSettings({ initial, onSave }: { initial: NotificationRule[]; onSave: (rules: NotificationRule[]) => void }) {
    const [rules, setRules] = useState(initial);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const textareas = useRef<Record<string, HTMLTextAreaElement | null>>({});
    function patch(id: string, value: Partial<NotificationRule>) { setRules(rows => rows.map(row => row.id === id ? { ...row, ...value } : row)); setMessage(''); setError(''); }
    function insert(rule: NotificationRule, variable: string) {
        const input = textareas.current[rule.id];
        const start = input?.selectionStart ?? rule.template.length, end = input?.selectionEnd ?? start;
        const tag = `{${variable}}`;
        patch(rule.id, { template: rule.template.slice(0, start) + tag + rule.template.slice(end) });
        requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + tag.length, start + tag.length); });
    }
    return <form onSubmit={e => { e.preventDefault(); try { onSave(rules); setMessage('Đã lưu thay đổi thông báo.'); setError(''); } catch (err) { setError((err as Error).message); setMessage(''); } }}>
        <SectionHeading title="Cài đặt thông báo" description="Chọn kênh gửi và cá nhân hóa mẫu nội dung cho từng sự kiện." />
        <div className="space-y-4">{[...new Set(rules.map(rule => rule.group))].map((group, index) => <Card key={group}><details open={index === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-base font-semibold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><span className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2 text-blue-600"><Icon name="bell" /></span>{group}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{rules.filter(rule => rule.group === group).length}</span></span><Icon name="chevron" /></summary>
            <div className="mt-5 space-y-6">{rules.filter(rule => rule.group === group).map(rule => <section key={rule.id} className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900">{rule.title}</h3><p className="mt-1 text-sm text-slate-500">{rule.description}</p>
                <div className="my-4 flex flex-wrap gap-3">{(['email', 'app'] as const).map(channel => <div key={channel} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><span className="text-slate-400"><Icon name={channel === 'email' ? 'mail' : 'app'} /></span><span className="text-sm text-slate-700">{channel === 'email' ? 'Email' : 'Thông báo App'}</span><Toggle checked={rule[channel]} onChange={checked => patch(rule.id, { [channel]: checked })} label={`${rule.title}: ${channel === 'email' ? 'Email' : 'Thông báo App'}`} /></div>)}</div>
                <label htmlFor={`template-${rule.id}`} className="mb-2 block text-sm font-medium text-slate-700">Mẫu nội dung</label>
                <textarea id={`template-${rule.id}`} ref={element => { textareas.current[rule.id] = element; }} rows={4} className={`${fieldClass} resize-y leading-6`} value={rule.template} onChange={e => patch(rule.id, { template: e.target.value })} aria-describedby={`variables-${rule.id}`} />
                <p id={`variables-${rule.id}`} className="mb-2 mt-3 text-xs text-slate-500">Nhấn biến để chèn tại vị trí con trỏ:</p><div className="flex flex-wrap gap-2">{rule.variables.map(variable => <button key={variable} type="button" onClick={() => insert(rule, variable)} className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 font-mono text-xs text-blue-700 transition hover:bg-blue-100">{`{${variable}}`}</button>)}</div>
            </section>)}</div></details></Card>)}</div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-4">{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button className={saveClass}><Icon name="save" />Lưu thay đổi</button></div>
    </form>;
}
