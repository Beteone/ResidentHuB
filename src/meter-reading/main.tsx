import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MeterReadingPage } from './MeterReadingPage';

// Entry of dist/meter-reading.js. The static dashboard calls
// window.MeterReadingApp.mount(tabElement) each time the "Ghi chỉ số" tab opens.
let root: Root | null = null;
let host: HTMLElement | null = null;

export function mount(el: HTMLElement): void {
    if (root && host === el) {
        // Re-opening the tab: remount so data from other modules is re-read.
        root.unmount();
        root = null;
    }
    if (root) unmount();
    host = el;
    root = createRoot(el);
    root.render(
        <StrictMode>
            <MeterReadingPage />
        </StrictMode>
    );
}

export function unmount(): void {
    root?.unmount();
    root = null;
    host = null;
}
