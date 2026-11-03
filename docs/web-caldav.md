Non, le format `.ics` (iCalendar) n'a pas été conçu pour fonctionner en temps réel. Son comportement dépend de la façon dont tu l'utilises :

**Le fichier `.ics` importé manuellement**
C'est un simple export figé au moment du téléchargement (un instantané). Une fois le fichier importé dans ton application (Google Agenda, Outlook, Apple Calendar), il n'existe plus aucun lien avec la source. Les modifications, ajouts ou suppressions futurs ne seront jamais répercutés.

**L'abonnement via une URL (flux `webcal://` ou lien `.ics` en ligne)**
Ton application d'agenda interroge le serveur distant à intervalles réguliers pour récupérer la dernière version du fichier. Cependant :

- **Le délai dépend du service** : Apple Calendar ou Thunderbird permettent de régler la fréquence de relève (par exemple toutes les cinq minutes), mais Google Agenda ne rafraîchit les flux externes que toutes les huit à 24 heures, sans possibilité de forcer la mise à jour manuellement.
- **C'est en lecture seule (unidirectionnel)** : les modifications faites à la source descendent vers ton calendrier, mais tu ne peux rien éditer localement pour le renvoyer vers la source.

Pour obtenir une synchronisation instantanée et dans les deux sens, il faut passer par un protocole dédié comme **CalDAV**, ou par les synchronisations natives de comptes (Google, Microsoft Exchange / 365).

## Persistance

Non, le format `.ics` (Un flux `webcal://` n'est rien d'autre qu'une simple requête HTTP `GET` qui renvoie du texte brut au standard RFC 5545 (`text/calendar`).

Le préfixe `webcal://` n'est pas un protocole réseau spécifique : c'est un schéma d'URL conçu pour indiquer au système d'exploitation ou au navigateur d'ouvrir l'URL directement dans le client d'agenda par défaut (en remplaçant en arrière-plan `webcal://` par `https://`).

---

### 1. La réponse HTTP minimale

Pour que les clients (Apple Calendar, Google Agenda, Outlook) acceptent et interprètent correctement ton flux, ton serveur doit renvoyer les en-têtes suivants :

```http
Content-Type: text/calendar; charset=utf-8
Content-Disposition: inline; filename="calendar.ics"
Cache-Control: no-cache, no-store, max-age=0, must-revalidate

```

Le corps de la réponse doit être une chaîne au format iCalendar valide :

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//MonService//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Mon Calendrier Synchro
BEGIN:VEVENT
UID:evt-12345@monservice.com
DTSTAMP:20260924T093000Z
DTSTART:20260925T140000Z
DTEND:20260925T150000Z
SUMMARY:Réunion de cadrage
DESCRIPTION:Lien visio disponible dans le ticket.
END:VEVENT
END:VCALENDAR

```

---

### 2. Comment l'implémenter selon ta source

#### Cas A : Génération dynamique depuis une API

Si tes événements proviennent d'une base de données ou d'une API tierce, le plus propre est d'exposer un endpoint HTTP (ex. `/calendars/{token}.ics`) qui interroge ta source et sérialise la donnée à la volée.

Inutile d'écrire le sérialiseur à la main (le formattage des retours à la ligne `\r\n` et l'échappement des caractères sont stricts). Utilise une bibliothèque éprouvée :

- **Node.js / TypeScript** : `ical-generator`
- **Python** : `icalendar` ou `ics.py`
- **PHP** : `spatie/icalendar-generator`
- **Go** : `[github.com/arran4/golang-ical](https://github.com/arran4/golang-ical)`

#### Cas B : Proxy ou fusion de fichiers `.ics` existants

Si tu as déjà plusieurs fichiers `.ics` que tu souhaites agréger en un flux unique :

1. Télécharge ou lis les fichiers `.ics`.
2. Parse les blocs `BEGIN:VEVENT ... END:VEVENT`.
3. Réunis tous ces blocs à l'intérieur d'un conteneur racine unique `BEGIN:VCALENDAR ... END:VCALENDAR`.
4. Sers le résultat via ton endpoint.

Une fonction serverless (Cloudflare Worker, AWS Lambda, Vercel Edge Function) est idéale pour ce cas d'usage : elle récupère les `.ics`, les fusionne en mémoire et renvoie le flux en quelques millisecondes sans nécessiter de serveur dédié.

---

### 3. Les pièges techniques à anticiper

- **Persistance de l'UID (critique)** : Un événement **doit** conserver le même identifiant (`UID`) à chaque appel de l'URL. Si l'UID change à chaque génération, l'agenda de l'utilisateur va dupliquer les événements au lieu de les mettre à jour.
- **Mise à jour et champ `SEQUENCE**` : Si un événement change (horaire, titre), incrémente la valeur entière du champ `SEQUENCE` (0, 1, 2…). Cela signale explicitement au client qu'il s'agit d'une mise à jour de l'événement existant.
- **Gestion des dates et fuseaux horaires** : Privilégie l'UTC en suffixant tes dates par `Z` (`20260924T140000Z`). Cela t'évite de devoir générer les blocs complexes `VTIMEZONE` avec gestion du changement d'heure été/hiver.
- **Authentification** : Les clients d'agenda tiers ne supportent généralement ni cookies, ni en-têtes d'autorisation, ni OAuth lors de la relève automatique. La convention consiste à passer un jeton opaque dans l'URL (ex. `[https://api.tondomaine.com/feed/u8f93a12.ics](https://api.tondomaine.com/feed/u8f93a12.ics)`).
- **Mise en cache côté Google Agenda** : Même si tu définis `Cache-Control: no-cache`, les serveurs de Google n'interrogent les flux distants qu'à leur propre rythme (généralement toutes les 8 à 24 heures).

# Objectifs finaux

- Avoir un flux webcal intégrable à des calendriers depuis l'api action pop
- Pouvoir avoir des filtres : définis dans métier
- Pouvoir générer des liens, selon les filtres ou personnalisés.

## Métier

- Filtrer selon GA, département, circo, ville, type de GA, rayon...
- Ajouter des métadonnées sur la source de l'événement, etc...
- Modèle action populaire est la source d'information

## Interface web

- Reprendre l'interface web Faire mieux Rennes
