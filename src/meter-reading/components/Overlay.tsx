import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../format';

/**
 * The module's root element. Overlays measure it to center themselves on the
 * content area (right of the dashboard sidebar) instead of the whole viewport.
 */
export const ContentAreaContext = createContext<RefObject<HTMLElement | null> | null>(null);

interface Inset { left: number; right: number }

const GUTTER = 16;

/** Horizontal inset of the content area inside the viewport, kept in sync on resize. */
function useContentInset(): Inset {
    const areaRef = useContext(ContentAreaContext);
    const [inset, setInset] = useState<Inset>({ left: GUTTER, right: GUTTER });
    useLayoutEffect(() => {
        const measure = () => {
            const el = areaRef?.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            // Only honour the offset while there is room for a usable dialog.
            const left = Math.max(GUTTER, Math.round(rect.left));
            const right = Math.max(GUTTER, Math.round(vw - rect.right));
            setInset(vw - left - right >= 480 ? { left, right } : { left: GUTTER, right: GUTTER });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [areaRef]);
    return inset;
}

// Open overlays, innermost last: Escape closes only the top one (e.g. the
// edit modal opened from the detail drawer), and page scroll stays locked
// while any is open.
const stack: object[] = [];

function useOverlayStack(onClose: () => void): void {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const token = {};
        stack.push(token);
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && stack[stack.length - 1] === token) closeRef.current(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            stack.splice(stack.indexOf(token), 1);
            if (!stack.length) document.body.style.overflow = '';
        };
    }, []);
}

interface OverlayProps {
    /** "center": dialog centered on the content area. "right": full-height side panel. */
    placement: 'center' | 'right';
    /** Stacking order among this module's overlays (above the dashboard sidebar, z-index 100). */
    z?: 'modal' | 'viewer';
    tone?: 'dim' | 'dark';
    onClose: () => void;
    children: ReactNode;
}

/**
 * Backdrop + portal to <body>. The tab this module mounts into is its own
 * stacking context below the sidebar, so any overlay rendered inside it is
 * painted under the sidebar whatever its z-index — hence the portal.
 */
export function Overlay({ placement, z = 'modal', tone = 'dim', onClose, children }: OverlayProps) {
    const inset = useContentInset();
    useOverlayStack(onClose);

    return createPortal(
        <div
            className={cx(
                'fixed inset-0 flex',
                z === 'viewer' ? 'z-[1300]' : 'z-[1200]',
                tone === 'dark' ? 'bg-slate-900/80' : 'bg-slate-900/50',
                placement === 'center' ? 'items-center justify-center py-4' : 'justify-end'
            )}
            style={placement === 'center' ? { paddingLeft: inset.left, paddingRight: inset.right } : undefined}
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            {children}
        </div>,
        document.body
    );
}
