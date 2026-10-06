import { defineConfig } from 'vite';

// Builds the React "Ghi chỉ số" module into one self-contained IIFE script
// (dist/meter-reading.js) that the static dashboard.html loads with a plain
// <script> tag. It exposes window.MeterReadingApp.mount(el) / .unmount().
// Tailwind classes are compiled at runtime by the Tailwind CDN already
// loaded in dashboard.html, so no CSS is emitted here.
export default defineConfig({
    esbuild: { jsx: 'automatic' },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        lib: {
            entry: 'src/meter-reading/main.tsx',
            name: 'MeterReadingApp',
            formats: ['iife'],
            fileName: () => 'meter-reading.js'
        }
    }
});
