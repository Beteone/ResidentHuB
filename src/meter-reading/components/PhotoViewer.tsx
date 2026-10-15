import { Overlay } from './Overlay';

interface PhotoViewerProps {
    src: string;
    caption: string;
    onClose: () => void;
}

/** Full-size view of a meter photo. */
export function PhotoViewer({ src, caption, onClose }: PhotoViewerProps) {
    return (
        <Overlay placement="center" z="viewer" tone="dark" onClose={onClose}>
            <figure role="dialog" aria-modal="true" aria-label={caption} className="relative max-h-full max-w-3xl">
                <button type="button" onClick={onClose} aria-label="Đóng" className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow">
                    <i className="fas fa-xmark" aria-hidden="true" />
                </button>
                <img src={src} alt={caption} className="max-h-[80vh] rounded-xl bg-white object-contain" />
                <figcaption className="mt-2 text-center text-sm text-white">{caption}</figcaption>
            </figure>
        </Overlay>
    );
}
