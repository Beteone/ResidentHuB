import { defineConfig } from 'vite';

export default defineConfig({
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: false,
        lib: {
            entry: 'src/excel-tools.js',
            name: 'ResidentHubExcel',
            formats: ['iife'],
            fileName: () => 'excel-tools.js'
        }
    }
});
