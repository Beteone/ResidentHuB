import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: false,
        lib: {
            entry: 'src/financial-report/export.ts',
            name: 'RHFinancialExport',
            formats: ['iife'],
            fileName: () => 'financial-report-export.js'
        }
    }
});
