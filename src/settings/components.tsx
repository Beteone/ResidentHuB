import type { ReactNode } from 'react';

// Heroicons outline paths, rendered locally without an extra runtime dependency.
const paths = {
    bell: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
    bank: 'M3 21h18M3 10h18M5 10v11m5-11v11m4-11v11m5-11v11M2 10l10-7 10 7M12 7h.01',
    history: 'M12 8v4l3 3M3 12a9 9 0 1 0 2.64-6.36M3 3v5h5',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l.6 3 2.4 1 2.5-1 3 5-2 2v2l2 2-3 5-2.5-1-2.4 1-.6 3H9l-.6-3-2.4-1-2.5 1-3-5 2-2v-2l-2-2 3-5 2.5 1 2.4-1L9 3',
    mail: 'M3 6h18v12H3V6m0 0 9 7 9-7',
    app: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2m3 15h2',
    save: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    search: 'm21 21-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4m-4 9 3 3 5-5',
    chevron: 'm6 9 6 6 6-6'
};
export function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof paths; className?: string }) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}><path d={paths[name]} /></svg>;
}
export const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
export const saveClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50';
export function SectionHeading({ title, description }: { title: string; description: string }) {
    return <header className="mb-6"><h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></header>;
}
export function Card({ children }: { children: ReactNode }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">{children}</div>; }
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
    return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} /></button>;
}
