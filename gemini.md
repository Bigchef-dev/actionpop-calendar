Voici la **Constitution Technique** (Spec Kit) de ton API de génération de flux Webcal. Elle est rédigée selon tes contraintes : orientation backend (Node.js/Docker), architecture découplée (générique vs métier), et intégration des modèles de données fournis.

Comme demandé, j'ai isolé la réflexion sur le cache et le rate-limiting dans une section dédiée à la fin, avec les différentes pistes pour que tu puisses trancher.

---

# 📜 Constitution Technique : API Webcal Action Populaire

## 1. Objectif du Projet

Développer une API backend performante et autonome permettant de convertir à la volée les données de l'API REST « Action Populaire » (Événements, Groupes) en flux d'agendas standardisés (iCalendar / RFC 5545). L'API doit être robuste face aux requêtes répétitives des clients d'agenda (Google, Apple) et respecter les limites de l'API source (Rate Limiting).

## 2. Architecture & Stack Technique

* **Environnement d'exécution :** Node.js (TypeScript fortement recommandé pour la robustesse des modèles de données).
* **Framework HTTP :** Fastify ou Express.js (Fastify recommandé pour ses hautes performances sur les flux textuels).
* **Génération ICS :** Utilisation d'une librairie éprouvée comme `ical-generator` pour garantir la conformité stricte au standard RFC 5545 (échappements, retours chariot `\r\n`).
* **Hébergement :** Conteneurisation via **Docker** (fourni par l'infrastructure).

## 3. Découpage Modulaire (Clean Architecture)

Le projet doit être divisé en briques testables indépendamment. Le cœur du système ne doit rien savoir d'Action Populaire, il s'agit d'un moteur de transformation.

1. **Le Cœur (Core / Générique)**
* **ICS Builder :** Brique pure qui prend un objet standardisé (`{ id, titre, debut, fin, lieu }`) et recrache un flux `.ics` valide.
* **Cache Engine :** Brique abstraite gérant la mémorisation des requêtes pour absorber la charge.


2. **La Surcouche Métier (Domain : Action Populaire)**
* **AP Fetcher :** Client HTTP chargé de requêter l'API Action Populaire et de gérer la pagination/les erreurs.
* **Data Mapper :** Transforme les payloads spécifiques d'Action Populaire (Groupes, Événements) en objets standardisés compréhensibles par l'ICS Builder.


3. **L'Interface (API HTTP)**
* **Routeur / Contrôleurs :** Parse les paramètres de l'URL (filtres), appelle le Cœur avec la Surcouche, et retourne la réponse HTTP avec les bons headers (`text/calendar`).



## 4. Modélisation de la Donnée (Data Mapping)

Basé sur les payloads fournis, voici la traduction des champs de l'API Action Populaire vers le standard iCalendar.

### Objet : Événement (`VEVENT`)

* **`UID`** ➔ `event.id` *(ex: "ea22157d-31ed-4043-a886...")*. Garanti unique et immuable pour éviter les doublons.
* **`DTSTART`** ➔ `event.startTime` *(ex: "2026-09-24T17:30:00+02:00")*. À convertir en UTC.
* **`DTEND`** ➔ `event.endTime`. À convertir en UTC.
* **`SUMMARY`** ➔ `event.name` *(ex: "Réunion régulière...")*.
* **`LOCATION`** ➔ `event.location.shortAddress` ou concaténation de `address`.
* **`DESCRIPTION`** ➔ `event.textDescription` + Injection du lien source (`event.routes.details`).
* **`URL`** ➔ `event.routes.details`.
* *Métadonnée métier (Optionnel)* : Préfixer le `SUMMARY` par le type d'événement ou le nom du groupe si filtré par groupe.

### Objet : Calendrier racine (`VCALENDAR`)

* **`X-WR-CALNAME`** ➔ Généré dynamiquement selon les filtres. Ex: *"Événements - Jeunes Insoumis·es Montpellier"*.
* **`X-WR-CALDESC`** ➔ Description générée selon les filtres appliqués.

## 5. Scope et Évolutivité

* **Périmètre V1 (Actuel) :**
* Endpoint pour récupérer les événements d'un **Groupe** spécifique (via `group_id`).
* Endpoint pour récupérer des **Événements** globaux (filtrables par mots-clés ou tags de base si l'API source le permet).


* **Périmètre V2 (Feature lointaine isolée) :**
* Filtres géographiques complexes (Villes, Communautés de communes, Départements, Rayon).
* *Note architecturale :* Ces filtres seront ajoutés comme paramètres optionnels dans les contrôleurs HTTP et passés au *AP Fetcher*, sans modifier le *Core*.



---

## 6. ⚠️ Pistes d'implémentation & Questions Ouvertes

Puisque les clients d'agenda requêtent les flux de manière aveugle et asynchrone (souvent des milliers de requêtes par jour si le lien est très partagé), **on ne peut pas lier 1 requête d'agenda = 1 requête à l'API Action Populaire**. Cela exploserait le Rate Limit (limite de requêtes) de la source.

Voici 3 pistes pour gérer la mise en cache et le rate-limiting. **Laquelle préfères-tu mettre en place ?**

### Piste 1 : Cache en mémoire réactif (TTL) - *Le plus simple*

Lorsqu'un utilisateur demande un flux (ex: le groupe X), on interroge l'API Action Populaire. On stocke le `.ics` généré dans la RAM du serveur Node (via une librairie comme `node-cache` ou `lru-cache`) avec une durée de vie (TTL) de 15 minutes.

* *Avantage :* Très simple à coder, pas de dépendance externe.
* *Inconvénient :* Si l'application Docker redémarre, le cache est vidé. Si la charge est immense, la RAM peut saturer.

### Piste 2 : Cache distribué (Redis) - *Le plus robuste*

Même principe que la piste 1, mais au lieu de stocker dans la mémoire Node, on stocke dans un conteneur Redis séparé.

* *Avantage :* Extrêmement performant, survit aux redémarrages de l'API Node, permet de scaler l'API Node sur plusieurs conteneurs si besoin un jour.
* *Inconvénient :* Ajoute un conteneur (`redis:alpine`) à ton `docker-compose`.

### Piste 3 : Le "Worker" asynchrone (Background Polling) - *Le plus sûr pour l'API source*

Au lieu que les requêtes web déclenchent la génération, ton app Node tourne en fond (cron job interne). Toutes les X minutes, elle aspire gentiment les données d'Action Populaire (en respectant les rate-limits), génère les `.ics` et les sauvegarde sous forme de fichiers statiques ou en base de données. L'API HTTP ne fait que lire ces fichiers pour les servir instantanément.

* *Avantage :* Risque ZÉRO de se faire bloquer par le Rate Limit de l'API source, temps de réponse en millisecondes pour les utilisateurs.
* *Inconvénient :* Logique métier un peu plus lourde (il faut déterminer quels flux mettre à jour en tâche de fond, ce qui est facile si on a peu de groupes, mais complexe si on permet des millions de combinaisons de filtres personnalisés).

**Questions pour toi :**

1. Parmi ces 3 pistes pour le cache, laquelle te semble la plus adaptée à tes capacités de maintenance et au trafic attendu ?
2. Le payload événement ne semble pas contenir de date de mise à jour (`updated_at`). Pour indiquer au client d'agenda qu'un événement a été modifié (afin qu'il se mette à jour), nous devrons générer un hash du contenu de l'événement et incrémenter le paramètre `SEQUENCE` si le hash change. Est-ce que cette approche te convient ?

L'architecture recommandée pour l'échelle nationale (Hybride)

Si tu dois gérer des vues "Toute la France" (ou de très grosses régions), tu ne peux pas te contenter d'interroger l'API Action Populaire au moment où l'utilisateur clique sur le lien. Le temps de récupérer toutes les pages de l'API REST mettrait ton serveur en timeout.

Il te faut une approche Worker + Cache (Mix des pistes 2 et 3) :

    Le Worker (Tâche de fond) : Un script Node.js tourne toutes les X minutes. Il aspire les données de l'API Action Populaire (avec pagination, proprement, sans la spammer).

    Le Stockage (Redis) : Le Worker stocke dans Redis les données brutes "aplaties" (ou pré-génère directement les gros fichiers ICS "Toute la France").

    L'API HTTP (Serveur Webcal) : Quand un client d'agenda demande un flux, ton API Fastify/Express ne va jamais interroger Action Populaire. Elle tape exclusivement dans Redis. Si l'utilisateur demande un filtre spécifique (ex: "Événements dans le 35"), l'API pioche les événements pré-chargés dans Redis, assemble le .ics à la volée, et l'envoie.

Pour la gestion des modifications (Le champ SEQUENCE) :
Puisque l'API source ne fournit pas de updated_at, tu pourras utiliser Redis pour cela. Lors de ton aspiration de fond, tu génères un hash (ex: MD5) du contenu de l'événement. Tu compares ce hash avec celui stocké dans Redis lors du passage précédent. S'il est différent, tu incrémentes le champ SEQUENCE dans Redis.