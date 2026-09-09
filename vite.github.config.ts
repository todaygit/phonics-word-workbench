import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'github',
  base: '/phonics-word-workbench/',
  publicDir: '../public',
  css: { postcss: { plugins: [tailwindcss()] } },
  define: {
    'process.env.NEXT_PUBLIC_GITHUB_PAGES': JSON.stringify('true'),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  plugins: [react()],
  build: {
    outDir: '../out',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('word-bank-v19.json')) return 'word-bank';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('@base-ui')) return 'ui';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
});
