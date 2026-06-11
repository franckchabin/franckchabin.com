/*
  =============================================
  CONFIG GLOBALE — chemins du site
  =============================================
  Pour changer de domaine, modifie seulement BASE :
  - GitHub Pages  → '/franckchabin.com/'
  - franckchabin.com → '/'
*/
export const BASE = '/';

/*
  =============================================
  ANALYTICS — GoatCounter (sans cookie, RGBD-friendly)
  =============================================
  1. Crée un compte gratuit sur https://www.goatcounter.com (choisis un "code", ex: "franckchabin").
  2. Mets ce code ci-dessous (juste le sous-domaine, pas l'URL complète).
  3. Dans les réglages GoatCounter, active "Allow adding visitor counts on your website"
     si tu veux que le dashboard affiche le nombre de visiteurs.
  Laisse vide ('') pour désactiver. Le script ne se charge qu'en production (jamais en local).
*/
export const GOATCOUNTER = 'franckchabin';
