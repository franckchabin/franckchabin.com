#!/bin/bash
# Lance le Dashboard franckchabin comme une vraie app de bureau (Electron).
# Garde cette fenêtre ouverte tant que tu utilises l'app.
# Nécessite Node.js (https://nodejs.org).

cd "$(dirname "$0")/FranckElectron"

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js n'est pas installé. Installe la LTS depuis https://nodejs.org puis relance."
  read -p "Entrée pour fermer."
  exit 1
fi

# Le moteur Electron est bien installé si node_modules/electron/path.txt existe.
engine_ok() { [ -f node_modules/electron/path.txt ]; }

if [ ! -d node_modules ]; then
  echo "Installation des dépendances…"
  npm install || { echo "Install npm échouée."; read -p "Entrée pour fermer."; exit 1; }
fi

if ! engine_ok; then
  echo "Réparation du moteur Electron (téléchargement ~100 Mo, une seule fois)…"
  rm -rf node_modules/electron
  rm -rf "$HOME/Library/Caches/electron" "$HOME/Library/Caches/@electron" 2>/dev/null
  npm install electron@^31.7.7 --save-dev --foreground-scripts
  [ -f node_modules/electron/install.js ] && node node_modules/electron/install.js
fi

if ! engine_ok; then
  echo "──────────────────────────────────────────────"
  echo " Le moteur Electron n'a pas pu être téléchargé."
  echo " Vérifie ta connexion et copie-moi les messages ci-dessus."
  echo "──────────────────────────────────────────────"
  read -p "Entrée pour fermer."
  exit 1
fi

echo "──────────────────────────────────────────────"
echo " Lancement du Dashboard — garde cette fenêtre ouverte."
echo "──────────────────────────────────────────────"
echo ""

./node_modules/.bin/electron . 2>&1

echo ""
echo " Le Dashboard s'est fermé. S'il y a une erreur ci-dessus, copie-la-moi."
read -p "Appuie sur Entrée pour fermer."
