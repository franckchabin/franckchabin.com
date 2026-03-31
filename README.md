# franckchabin.com

Portfolio — Astro 5, site statique, GitHub Pages.

## Utilisation

```bash
npm install       # 1 seule fois (ou après déplacement du dossier)
npm run app       # ouvre le dashboard dans le navigateur
```

Le dashboard (http://localhost:3333) permet de :
- Lancer / arrêter le serveur de dev local
- Builder le site
- Commit + push Git
- Reconfigurer le remote Git

## Commandes directes

```bash
npm run dev       # serveur local → http://localhost:4321
npm run build     # build → dist/
npm run preview   # prévisualiser le build
```

## Déploiement

Push sur `main` → GitHub Actions déploie automatiquement sur GitHub Pages.

## Portabilité

Le dossier est déplaçable librement. Après déplacement :
1. `npm install`
2. `npm run app`
3. Reconfigurer le remote Git si nécessaire (bouton dans le dashboard)
