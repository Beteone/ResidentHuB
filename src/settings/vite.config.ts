import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src/settings',
    base: './',
    build: { outDir: '../../dist/settings', emptyOutDir: false },
    server: { host: '127.0.0.1' }
});
