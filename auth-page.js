// Execute page scripts in their original global scope after central identity loads.
// Local mode also uses this queue; no synthetic load events or eval.
(function (global) {
    global.RHPageReady = function (event, callback) {
        if (document.readyState === 'complete' || (event === 'DOMContentLoaded' && document.readyState !== 'loading')) callback();
        else (event === 'load' ? global : document).addEventListener(event, callback, { once: true });
    };
    async function run() {
        if (global.RH && global.RH.ready) await global.RH.ready;
        if (global.RH && global.RH.central && !global.RH.getSession()) {
            global.location.replace('index.html?authRequired=1'); return;
        }
        // Central business data must be loaded before any page code reads it.
        // No fallback to browser-local data: a failure stops the page.
        if (global.RHCentralData && global.RHCentralData.enabled) {
            try { await global.RHCentralData.ready; }
            catch (_) {
                document.body.textContent = 'Không tải được dữ liệu từ máy chủ ResidentHub. Kiểm tra kết nối mạng rồi tải lại trang; nếu vẫn lỗi, tài khoản có thể chưa được cấp quyền truy cập dữ liệu.';
                return;
            }
        }
        if (global.RH && global.RH.central) global.addEventListener('residenthub:identity-changed', function () {
            var session = global.RH.getSession();
            if (!session) { global.location.replace('index.html?authRequired=1'); return; }
            global.RH_SESSION = session;
        });
        for (var node of document.querySelectorAll('script[type="text/rh-page"]')) {
            var script = document.createElement('script');
            if (node.dataset.src) {
                script.src = node.dataset.src;
                await new Promise(function (resolve, reject) { script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
            } else { script.textContent = node.textContent; document.head.appendChild(script); }
            if (global.RH && global.RH.central && global.RH_SESSION === null) return;
        }
    }
    run().catch(function () {
        document.body.textContent = 'Không tải được trang. Vui lòng tải lại hoặc đăng nhập lại.';
    });
})(window);
