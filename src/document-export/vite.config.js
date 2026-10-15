import { defineConfig } from 'vite';
export default defineConfig({define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:'dist/document-export',emptyOutDir:false,lib:{entry:'src/document-export/main.js',name:'RHDocumentExport',formats:['iife'],fileName:()=> 'document-export.js'}}});
