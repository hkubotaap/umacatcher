import { defineConfig } from 'vite';
export default defineConfig({
  base: './', // GitHub Pages のサブパス(/リポジトリ名/)でも動くよう相対パスにする
  // host: true で 0.0.0.0 で待ち受け、同一ネットワークの他の端末(スマホ・別PC)からも接続できる
  server: { host: true, port: 5173, strictPort: true },
  preview: { host: true, port: 4173, strictPort: true },
  build: { target: 'esnext' },
  esbuild: { target: 'esnext' },
  optimizeDeps: { esbuildOptions: { target: 'esnext' } },
});
