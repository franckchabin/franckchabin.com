import { defineConfig } from 'astro/config';

export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://franckchabin.github.io',
  base: '/franckchabin.com',
  // Génère des fichiers HTML statiques purs
  output: 'static',
  build: {
    // Génère des URLs propres : /75000 au lieu de /75000.html
    format: 'directory',
  },
});
