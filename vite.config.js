import { defineConfig } from 'vite';

// base: './' にしておくと GitHub Pages のサブフォルダでも動く
export default defineConfig({
  base: './',
  server: { host: true },
});
