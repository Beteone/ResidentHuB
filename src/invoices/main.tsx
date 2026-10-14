import { createRoot, type Root } from 'react-dom/client';
import { InvoicePage } from './InvoicePage';
let root: Root | null = null;
export function mount(element: HTMLElement) { unmount(); root = createRoot(element); root.render(<InvoicePage />); }
export function unmount() { root?.unmount(); root = null; }
