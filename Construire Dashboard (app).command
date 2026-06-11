#!/bin/bash
# Construit la vraie app Dashboard (franckchabin.app) via electron-builder.
# À LANCER UNE FOIS (le 1er build télécharge des binaires → Wi-Fi conseillé).
# Résultat : FranckElectron/dist/mac-arm64/franckchabin.app
# Nécessite Node.js (https://nodejs.org).

cd "$(dirname "$0")/FranckElectron"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Installe la LTS depuis https://nodejs.org puis relance."
  read -p "Entrée pour fermer."
  exit 1
fi

echo "1/2 — Installation des dépendances de build (electron-builder)…"
if ! npm install; then
  echo "Échec de l'installation (réseau ?)."
  read -p "Entrée pour fermer."
  exit 1
fi

echo "2/2 — Construction de l'app…"
if ! npm run dist; then
  echo "Échec du build. Copie-moi les messages ci-dessus."
  read -p "Entrée pour fermer."
  exit 1
fi

echo ""
echo "──────────────────────────────────────────────"
echo " Terminé ! Ton app : FranckElectron/dist/mac-arm64/franckchabin.app"
echo " Glisse-la dans Applications, puis ouvre-la normalement."
echo " Au 1er lancement, elle te demandera de pointer le dossier"
echo " franckchabin.com (celui qui contient app.mjs)."
echo "──────────────────────────────────────────────"
open "dist/mac-arm64" 2>/dev/null || open dist 2>/dev/null || true
read -p "Entrée pour fermer."
