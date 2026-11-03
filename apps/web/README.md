# Agenda des actions — Action Populaire

Application web statique (Vue 3 + Vite) qui permet de trouver les actions d'un lieu ou d'un groupe
d'action, de les filtrer, puis d'emporter un lien de calendrier personnel. Elle lit
`actionpop-calendar` : plus de Nextcloud, plus de proxy CORS tiers.

Ce paquet vit dans `apps/web` du monorepo `actionpop-calendar` et se déploie sur GitHub Pages.

---

## Parcours

1. **Chercher** — une barre de recherche centrale résout une ville, un département, un groupe
   d'action ou une intercommunalité en un **sujet de calendrier** (`GET /search/subjects`).
2. **Lire** — les actions du sujet viennent du flux publié par l'API (`GET /calendar.ics`), filtrées
   par type d'action dans le navigateur.
3. **Emporter** — le panneau d'abonnement produit un lien personnel (abonnement, `webcal`, copie,
   Outlook) qui couvre le sujet, avec ou sans le filtre affiché.

Aucun compte, aucune géolocalisation, aucune donnée personnelle conservée : seule la dernière
recherche est mémorisée localement, et l'adresse prime toujours sur cette mémoire.

Les intercommunalités sont proposées sous le libellé « Intercommunalité » et couvrent les
communautés de communes, communautés d'agglomération, communautés urbaines et métropoles.
Leur lien de calendrier conserve l'identifiant EPCI (`epci=...`) ainsi que les filtres choisis.
Si les rattachements administratifs sont momentanément indisponibles, l'application affiche un
état de récupération et ne remplace pas le territoire par un autre sujet.

## Configuration

| Variable                | Défaut (dev)                 | Rôle                                                             |
| ----------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `VITE_API_BASE_URL`     | `http://127.0.0.1:3000`      | Origine de l'API ActionPop Calendar                              |
| `VITE_POLL_BACKEND_URL` | `https://poll.lfirennes.fun` | Sondage en standby, non routé                                    |
| `VITE_REVIEW_PROPOSALS` | non défini                   | Expose les variantes d'interface en revue (jamais en production) |

L'origine publiée doit figurer dans `API_CORS_ORIGINS` côté API, sinon la recherche est bloquée par
le navigateur.

## Commandes

Depuis la racine du dépôt, une seule commande lance l'API et le site ensemble :

```bash
pnpm dev            # API sur :3000 + site sur http://127.0.0.1:5173/agenda-rennes/
```

| Command                            | Starts                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`                         | dépendances Docker, migrations, build de `@actionpop/core`, puis API **et** site |
| `pnpm dev:web`                     | le site seul, quand l'API tourne déjà ailleurs                                   |
| `pnpm --filter @actionpop/web dev` | équivalent direct, sans préparation préalable                                    |

```bash
pnpm --filter @actionpop/web dev        # http://127.0.0.1:5173/agenda-rennes/
pnpm --filter @actionpop/web test       # règles métier (Vitest)
pnpm --filter @actionpop/web typecheck  # vue-tsc
pnpm --filter @actionpop/web build      # dist/ + base /agenda-rennes/
pnpm test:e2e                           # acceptance navigateur (Playwright), depuis la racine
```

Le build est servi sous `base: '/agenda-rennes/'` (`vite.config.ts`). Le workflow `web.yml`
vérifie tests, typage et build sur chaque pull request ; `pages.yml` publie `dist/`.

## Architecture

```text
src/
├── App.vue                    # aiguillage découverte / calendrier, résolution du sujet
├── config.ts                  # environnement typé, cadence du placeholder
├── shared/
│   ├── api/client.ts          # recherche, flux, résolution d'un sujet
│   ├── components/            # AppShell, AppHeader, StateMessage, CopyButton
│   └── composables/useUrlState.ts   # état d'adresse (sujet, types, vue, événement)
└── features/
    ├── discovery/             # thème A — recherche, placeholder animé, propositions d'interface
    ├── calendar/              # thèmes B & C — lecture du flux, filtres, détail d'événement
    ├── subscription/          # thème B — construction et présentation du lien
    └── poll/                  # sondage en standby (code conservé, non routé)
```

Les règles métier (analyse du flux, filtrage par type, libellés des propriétés publiées, fenêtre
météo, construction du lien, état d'adresse) vivent dans des modules purs sous `utils/` et sont
couvertes par `tests/`. Les composants restent purement visuels.

## Détail d'un événement

- Type d'action avec emoji et libellé lisibles (repli neutre pour un type inconnu).
- Date, heure, lieu, lien carte, météo attendue quand l'événement est dans l'horizon de prévision.
- Section « Informations publiées » repliable, alimentée par les propriétés `X-ACTIONPOP-*`
  réellement présentes ; un champ absent ne laisse aucun vide.
- Statut explicite en texte (confirmé, provisoire, annulé).
- Actions : ajout à l'agenda, téléchargement `.ics`, et lien sortant vers la page Action Populaire
  où se trouve le contact de la personne responsable.

## Nettoyage

- Le script d'autocomplétion Tampermonkey est archivé dans
  [`docs/archive/`](../../docs/archive/) et n'est plus servi.
- L'ancienne configuration mono-lieu (liste d'agendas, coordonnées fixes, base Nextcloud) a disparu
  du chemin public ; le module de sondage la conserve pour son propre usage tant qu'il est en
  standby.
