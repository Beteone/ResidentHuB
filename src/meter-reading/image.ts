// Meter photos are stored inline (data URL) in localStorage, which has a small
// quota (~5 MB per site), so phone photos are downscaled before saving.
const MAX_SIDE = 1280;
const QUALITY = 0.8;

export function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('Vui lòng chọn file ảnh.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Ảnh không hợp lệ.'));
            img.onload = () => {
                const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(String(reader.result)); return; }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', QUALITY));
            };
            img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}
