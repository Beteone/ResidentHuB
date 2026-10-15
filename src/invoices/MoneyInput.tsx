import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

const format = (raw: string) => { const parts = raw.replace(/\./g, '').split(','); return parts[0].replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (parts.length > 1 ? ',' + parts[1].replace(/\D/g, '') : ''); };
const numeric = (text: string) => Number(text.replace(/\./g, '').replace(',', '.'));
const initial = (value: number) => format(String(value).replace('.', ','));
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: number; onValue: (value: number) => void };
export function MoneyInput({ value, onValue, ...props }: Props) {
    const [text, setText] = useState(() => initial(value));
    const input = useRef<HTMLInputElement>(null);
    const caret = useRef<number | null>(null);
    useEffect(() => { if (numeric(text) !== value) setText(initial(value)); }, [value, text]);
    useEffect(() => { if (caret.current != null) { input.current?.setSelectionRange(caret.current, caret.current); caret.current = null; } }, [text]);
    return <input {...props} ref={input} type="text" inputMode="decimal" value={text} onChange={event => {
        const raw = event.target.value, digitsBefore = raw.slice(0, event.target.selectionStart ?? 0).replace(/\./g, '').length;
        const next = format(raw); let pos = 0, digits = 0;
        while (pos < next.length && digits < digitsBefore) { if (next[pos] !== '.') digits++; pos++; }
        caret.current = pos; setText(next); onValue(numeric(next));
    }} />;
}
