# Agenda de Campagne — Faire Mieux Rennes

Application web mono-fichier affichant l'agenda militant de la campagne **Faire Mieux Rennes 2026**, synchronisé en temps réel avec des calendriers Nextcloud via CalDAV.

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

| Statut | Affichage dans le calendrier | Affichage dans la modale |
|---|---|---|
| `CONFIRMED` *(défaut)* | Normal | Aucun badge |
| `TENTATIVE` | **Hachuré** (bandes diagonales) + badge « Provisoire » | Badge jaune ⚠️ |
| `CANCELLED` | Titre **barré** + atténué + badge « Annulé » | Badge rouge ✗ |

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

| Élément | Détail |
|---|---|
| **Structure** | Application mono-fichier `index.html` |
| **Calendrier** | [FullCalendar 6.1.10](https://fullcalendar.io/) (CDN) |
| **Parsing ICS** | [ical.js 1.5.0](https://github.com/nicowillis/ical.js) (CDN), utilisé directement via `ICAL.parse()` pour accéder aux propriétés non exposées par le plugin FC (dont `STATUS`) |
| **Météo** | [Open-Meteo API](https://open-meteo.com/) (sans clé, gratuit) |
| **Proxy CORS** | [corsproxy.io](https://corsproxy.io/) — clé `1aae6667` — pour contourner les restrictions CORS des flux Nextcloud |
| **Styles** | [Tailwind CSS](https://tailwindcss.com/) via CDN + CSS inline pour les surcharges FullCalendar |
| **Hébergement calendriers** | Nextcloud — `cloud.lfirennes.fun` — calendriers publics |

### Flux de données

```
Nextcloud (CalDAV) → corsproxy.io → fetch() → ICAL.parse() → FullCalendar.addEvent()
                                                    ↓
                                          STATUS extrait et transmis
                                          en extendedProps + classNames
```

---

## Déploiement

Aucune dépendance locale. Il suffit d'ouvrir `index.html` dans un navigateur ou de le déposer sur n'importe quel hébergeur statique (GitHub Pages, Netlify, etc.).

Pour ajouter ou modifier un agenda, éditer le tableau `myAgendas` en tête de script :

```js
const myAgendas = [
    { name: "🌟 Grands événements", id: "ID_NEXTCLOUD", color: "#D50000" },
    // ...
];
```

---

## Crédits

GT Outils numériques Rennes 2026 — Mathéo, Lily, Amadou