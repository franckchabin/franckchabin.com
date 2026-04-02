import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://franckchabin.com',
  base: '/',
  integrations: [sitemap()],
  // Génère des fichiers HTML statiques purs
  output: 'static',
  build: {
    // Génère des URLs propres : /75000 au lieu de /75000.html
    format: 'directory',
  },
});
