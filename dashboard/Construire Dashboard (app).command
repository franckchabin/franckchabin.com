#!/bin/bash
# Construit la vraie app Dashboard (franckchabin.app) via electron-builder,
# puis la copie à la racine du projet pour un accès facile :
#   /Users/franckchabin/Developer/franckchabin.com/franckchabin.app
# À LANCER UNE FOIS (le 1er build télécharge des binaires → Wi-Fi conseillé).
# Nécessite Node.js (https://nodejs.org).

cd "$(dirname "$0")/shell"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Installe la LTS depuis https://nodejs.org puis relance."
  read -p "Entrée pour fermer."
  exit 1
fi

echo "1/3 — Installation des dépendances de build (electron-builder)…"
if ! npm install; then
  echo "Échec de l'installation (réseau ?)."
  read -p "Entrée pour fermer."
  exit 1
fi

echo "2/3 — Construction de l'app…"
if ! npm run dist; then
  echo "Échec du build. Copie-moi les messages ci-dessus."
  read -p "Entrée pour fermer."
  exit 1
fi

echo "3/3 — Copie de l'app à la racine du projet…"
APP="dist/mac-arm64/franckchabin.app"
DEST="../.."   # dashboard/shell → racine franckchabin.com
if [ -d "$APP" ]; then
  rm -rf "$DEST/franckchabin.app"
  cp -R "$APP" "$DEST/"
fi

echo ""
echo "──────────────────────────────────────────────"
echo " Terminé ! Ton app : franckchabin.com/franckchabin.app"
echo " Glisse-la dans Applications (ou double-clique-la directement)."
echo " Au 1er lancement, elle te demandera de pointer le dossier"
echo " franckchabin.com (celui qui contient app.mjs)."
echo "──────────────────────────────────────────────"
open "$DEST" 2>/dev/null || true
read -p "Entrée pour fermer."
