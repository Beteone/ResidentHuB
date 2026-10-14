import { defineConfig } from 'vite';
export default defineConfig({
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { outDir: 'dist/invoices', emptyOutDir: false, lib: { entry: 'src/invoices/main.tsx', name: 'InvoiceApp', formats: ['iife'], fileName: () => 'invoice.js' } }
});
