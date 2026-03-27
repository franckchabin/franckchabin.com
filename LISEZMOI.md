# Franck Chabin — Portfolio

Site portfolio construit avec Astro. Génère du HTML/CSS/JS statique pur.

---

## Lancer le site en local

1. Ouvre un terminal
2. Va dans le dossier du projet :
   ```
   cd "chemin/vers/NewWebsite franckchabin.com"
   ```
3. Installe les dépendances (une seule fois) :
   ```
   npm install
   ```
4. Lance le serveur de développement :
   ```
   npm run dev
   ```
5. Ouvre ton navigateur sur `http://localhost:4321`

Le site se recharge automatiquement quand tu modifies un fichier.

---

## Déployer sur GitHub Pages (gratuit)

1. Crée un compte GitHub (si pas déjà fait)
2. Crée un nouveau repository (par ex. `portfolio`)
3. Dans le terminal :
   ```
   git init
   git add .
   git commit -m "Premier déploiement"
   git remote add origin https://github.com/TON-USERNAME/portfolio.git
   git push -u origin main
   ```
4. Sur GitHub : Settings → Pages → Source : "GitHub Actions"
5. Crée le fichier `.github/workflows/deploy.yml` (fourni ci-dessous)
6. Push à nouveau — le site sera en ligne sur `https://ton-username.github.io/portfolio`

Pour utiliser ton domaine `franckchabin.com`, ajoute un fichier `public/CNAME` contenant :
```
franckchabin.com
```

---

## Structure des fichiers

```
src/
  pages/         ← Les pages du site (1 fichier = 1 page)
    index.astro  ← Homepage
    about.astro  ← Page À propos
    scan.astro   ← Page Scan (galerie photo)
    75000.astro  ← Page projet (modèle à dupliquer)

  layouts/       ← Les gabarits réutilisables
    Base.astro   ← Layout de base (head, nav, styles)
    Project.astro← Layout pour les pages projet

  components/    ← Les composants réutilisables
    Nav.astro    ← Navigation (desktop + mobile burger)
    ProjectCard.astro  ← Carte projet (pour la grille homepage)
    HoverImage.astro   ← Image qui suit le curseur au survol

  styles/
    global.css   ← Styles globaux (couleurs, typos, reset)

public/          ← Fichiers statiques (copiés tels quels)
  fonts/         ← Polices custom
  images/        ← Toutes les images
    global/      ← Photo de profil, etc.
    projects/    ← Images par projet (un dossier par projet)
    hover/       ← Images pour l'effet hover sur la homepage
    scan/        ← Images de la page Scan
  videos/        ← Vidéos des projets
```

---

## Ajouter un nouveau projet

1. Copie `src/pages/75000.astro` et renomme-le (ex: `nouveau-projet.astro`)
2. Modifie les props en haut : title, description, tags, etc.
3. Remplace les images dans la galerie
4. Crée un dossier `public/images/projects/nouveau-projet/` pour les images
5. Ajoute le projet dans la liste `projects` de `src/pages/index.astro`

---

## Modifier le contenu existant

| Je veux modifier...           | Fichier à ouvrir                    |
|-------------------------------|-------------------------------------|
| Le texte d'accueil            | `src/pages/index.astro`             |
| La navigation                 | `src/components/Nav.astro`          |
| Les couleurs / typos          | `src/styles/global.css`             |
| La page À propos              | `src/pages/about.astro`             |
| Un projet existant            | `src/pages/NOM-DU-PROJET.astro`     |
| Ajouter une image Scan        | `src/pages/scan.astro`              |

---

## Assets à fournir

Les images des projets ne sont pas encore intégrées.
Pour chaque projet, dépose les images dans `public/images/projects/NOM-DU-PROJET/`.
Formats recommandés : WebP (plus léger) ou JPG.

Images nécessaires :
- Cover de chaque projet (pour la grille homepage)
- Images de galerie pour chaque page projet
- Images de la page Scan (dans `public/images/scan/`)
