# Agenda de Campagne — Faire Mieux Rennes

Application web (Vue 3 + Vite) affichant l'agenda militant de la campagne **Faire Mieux Rennes 2026**, synchronisé en temps réel avec des calendriers Nextcloud via CalDAV.

Ce paquet vit dans `apps/web` du monorepo `actionpop-calendar` et se déploie sur GitHub Pages.

> Pour comprendre les limites du format `.ics` face à CalDAV, voir [docs/web-caldav.md](../../docs/web-caldav.md).

---

## Fonctionnalités

### Calendrier

- Affichage **jour / semaine / mois / liste** (vue hebdomadaire par défaut sur desktop, journalière sur mobile)
- Navigation entre les semaines, retour rapide à "Aujourd'hui"
- Mise en évidence du jour courant
- Plage horaire affichée : 7h–22h

### Agendas multiples avec filtres

- 8 agendas catégorisés (Grands événements, Manifestations, Marchés/Tractage, Porte-à-portes, Collages, Réunions internes, Écoles, Actions jeunes)
- Chaque agenda a sa propre couleur
- Filtres cliquables pour afficher/masquer chaque catégorie à la volée

### Météo intégrée

- Données horaires récupérées depuis **Open-Meteo** pour Rennes (lat/lon fixés)
- Icône météo affichée directement dans le bloc de l'événement (code WMO → emoji)
- Affichage des précipitations (en mm) si > 0
- Affichage de la vitesse du vent si > 20 km/h

### Statut des événements (CalDAV / iCalendar RFC 5545)

La propriété `STATUS` du standard iCalendar est prise en charge :

| Statut                 | Affichage dans le calendrier                           | Affichage dans la modale |
| ---------------------- | ------------------------------------------------------ | ------------------------ |
| `CONFIRMED` _(défaut)_ | Normal                                                 | Aucun badge              |
| `TENTATIVE`            | **Hachuré** (bandes diagonales) + badge « Provisoire » | Badge jaune ⚠️           |
| `CANCELLED`            | Titre **barré** + atténué + badge « Annulé »           | Badge rouge ✗            |

### Modale de détail

Clic sur un événement ouvre une modale avec :

- Titre, heure et date formatée en français
- Lieu avec lien **Google Maps** direct
- Description complète
- Boutons d'ajout : **Google Agenda** et **Apple / Outlook** (téléchargement `.ics`)
- Badge de statut si l'événement est provisoire ou annulé

### Abonnement aux agendas

Section dédiée en bas de page pour s'abonner à chaque agenda :

- **Google Agenda** (lien `addbyurl`)
- **iPhone / Mac** (lien `webcal://`)
- **Copier le lien** pour Outlook ou tout autre client CalDAV

---

## Architecture technique

| Élément                     | Détail                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Structure**               | Application Vue 3 découpée par domaine : `src/features/calendar`, `src/features/poll`, `src/shared`                                                                            |
| **Calendrier**              | [FullCalendar 6](https://fullcalendar.io/) via `@fullcalendar/vue3` (dépendance npm)                                                                                           |
| **Parsing ICS**             | [ical.js](https://github.com/nicowillis/ical.js) (dépendance npm), utilisé directement via `parse()` pour accéder aux propriétés non exposées par le plugin FC (dont `STATUS`) |
| **Météo**                   | [Open-Meteo API](https://open-meteo.com/) (sans clé, gratuit)                                                                                                                  |
| **Proxy CORS**              | [corsproxy.io](https://corsproxy.io/) — clé `1aae6667` — pour contourner les restrictions CORS des flux Nextcloud                                                              |
| **Styles**                  | [Tailwind CSS 4](https://tailwindcss.com/) via PostCSS + CSS inline pour les surcharges FullCalendar                                                                           |
| **Hébergement calendriers** | Nextcloud — `cloud.lfirennes.fun` — calendriers publics                                                                                                                        |

### Flux de données

```
Nextcloud (CalDAV) → corsproxy.io → fetch() → ICAL.parse() → FullCalendar.addEvent()
                                                    ↓
                                          STATUS extrait et transmis
                                          en extendedProps + classNames
```

---

## Développement

Depuis la racine du monorepo :

```bash
pnpm install
pnpm --filter @actionpop/web dev       # serveur de développement Vite
pnpm --filter @actionpop/web typecheck # vue-tsc --noEmit
pnpm --filter @actionpop/web build     # build de production dans apps/web/dist
pnpm --filter @actionpop/web preview   # prévisualisation du build
```

Le build est servi sous `base: '/agenda-rennes/'` (`vite.config.ts`), qui correspond à
l'URL publiée actuelle sur GitHub Pages.

## Configuration

Le seul réglage d'exécution est l'URL du backend de sondage, un service Node externe
(non fourni par ce dépôt) :

```bash
cp .env.example .env.local
# VITE_POLL_BACKEND_URL=https://poll.lfirennes.fun
```

Sans valeur, l'application retombe sur `https://poll.lfirennes.fun`.

Pour ajouter ou modifier un agenda, éditer le tableau `AGENDAS` dans `src/config.ts` :

```ts
export const AGENDAS: AgendaConfig[] = [
  { name: '🌟 Grands événements', id: 'ID_NEXTCLOUD', color: '#D50000' },
  // ...
];
```

## Déploiement

Le workflow `.github/workflows/pages.yml` construit `apps/web` et publie `apps/web/dist`
sur GitHub Pages à chaque modification du front. Le workflow `web.yml` vérifie le typage
et le build sur chaque pull request concernée.

Aucun service à héberger : l'application est entièrement statique et interroge les flux
Nextcloud et Open-Meteo depuis le navigateur.

---

## Crédits

GT Outils numériques Rennes 2026 — Mathéo, Lily, Amadou
