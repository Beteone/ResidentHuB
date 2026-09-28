import { useEffect } from 'react';

interface PhotoViewerProps {
    src: string;
    caption: string;
    onClose: () => void;
}

/** Full-size view of a meter photo. */
export function PhotoViewer({ src, caption, onClose }: PhotoViewerProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div role="dialog" aria-modal="true" aria-label={caption} className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/80 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <figure className="relative max-h-full max-w-3xl">
                <button type="button" onClick={onClose} aria-label="Đóng" className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow">
                    <i className="fas fa-xmark" aria-hidden="true" />
                </button>
                <img src={src} alt={caption} className="max-h-[80vh] rounded-xl bg-white object-contain" />
                <figcaption className="mt-2 text-center text-sm text-white">{caption}</figcaption>
            </figure>
        </div>
    );
}
