import { defineConfig } from 'vite';

// Vite configuration for the Phaser game client
export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
