# CLI d'exploitation du worker

Deux commandes de maintenance, exécutées avec l'environnement du worker
(`REDIS_URL`, `DATABASE_URL`, `UPSTREAM_BASE_URL`, configuration YAML) :

```bash
pnpm worker:cli map:run
pnpm worker:cli reset --target groups
```

En développement, `pnpm worker:cli:dev` reconstruit `packages/core` puis exécute
`tsx src/cli.ts`. En production, `pnpm worker:cli` construit les deux paquets et lance
`node apps/worker/dist/cli.js`. Le CLI est aussi disponible dans l'image worker :
`node /app/apps/worker/dist/cli.js …`.

## `map:run` — relancer la carte

Exécute **une** découverte carte de façon synchrone, sans passer par BullMQ et sans exiger
un worker démarré :

1. lit la liste publique de la carte et enregistre les observations (`recordListing`) ;
2. sélectionne les événements à rafraîchir (`selectGapCandidates`), crée les scopes
   événement manquants et marque les demandes ;
3. écrit le ledger sous l'identité canonique `scope carte + période`, la même que le
   dispatcher périodique utilise pour dédupliquer une période déjà traitée.

La commande ignore volontairement `INGESTION_MAP_DISCOVERY_ENABLED` et le statut de
planification du scope : l'action explicite s'exécute, mais ne réactive ni ne désactive
la découverte périodique. Elle réutilise `processMapDiscovery` et les dépendances
d'ingestion du worker.

```bash
pnpm worker:cli map:run
pnpm worker:cli map:run --json
```

Sortie lisible : statut (`succeeded`, `failed` ou `unknown`), identifiant du job et période.
Code de sortie `1` si le statut est `failed`.

## `reset` — forcer un refresh complet

Remet à zéro l'état « visité » pour les cibles choisies. Un groupe ou un événement est
« visité » lorsque son scope est `active` et que son ledger du couple scope + période
existe : le dispatcher le considère alors comme déjà traité pour la période.

```bash
pnpm worker:cli reset --target groups
pnpm worker:cli reset --target groups,events --yes
pnpm worker:cli reset --target map --yes --json
```

| Option        | Effet                                                        |
| ------------- | ------------------------------------------------------------ |
| `--target`    | cibles séparées par des virgules : `groups`, `events`, `map` |
| `--yes`, `-y` | applique le reset (sinon **dry-run**)                        |
| `--dry-run`   | explicite le comportement par défaut                         |
| `--json`      | sortie JSON exploitable par un script                        |

### Effet par cible

| Cible    | Effet                                                                                         |
| -------- | --------------------------------------------------------------------------------------------- |
| `groups` | scopes groupe `active` → `pending`, ledger de la période supprimé, jobs retirés               |
| `events` | scopes événement `active` → `pending`, ledger de la période supprimé, jobs retirés            |
| `map`    | jobs/ledger carte de la période, scope carte réactivé, **toutes** les demandes carte oubliées |

`map` remet toujours à `NULL` `last_requested_at`, `last_outcome` et `next_reconcile_at`
des `map_event_observation` : le prochain passage réévalue la fraîcheur et redemande les
événements. La liste observée elle-même est conservée.

### Ce qui est préservé

- Les scopes `stopped_inactive`, `stopped_unknown`, `stopped_disabled` et `retired` :
  ce sont des états volontaires, jamais réinitialisés par `groups`/`events`.
- Les jobs BullMQ `active` : ils ne sont jamais supprimés ; le reset peut être relancé
  une fois qu'ils ont terminé.
- Les événements, snapshots et liens d'attribution : aucun effacement métier. Le pipeline
  reste idempotent (hash de contenu, révision), donc rejouer une ingestion ne duplique rien.

### Dry-run et application

Sans `--yes`, la commande n'écrit rien et affiche le plan :

```
Reset dry-run (add --yes to apply) — period 20261029T100000Z
  targets:            groups, events
  scopes -> pending:  412
  ledger rows:        87
  queued jobs:        12 (active, kept: 1)
  removed jobs:       0
```

Avec `--yes`, les compteurs `removed jobs` et `failed removals` sont ajoutés. Un échec de
retrait de job (verrou concurrent) donne un code de sortie `1` sans annuler le reste du
reset.

### Sortie JSON

`--json` imprime l'objet `ResetSummary` sur **stdout** : `periodToken`, `periodStartUtc`,
`targets`, `applied`, `scopesToPending`, `ledgerRows`, `queuedJobs`, `activeJobs`,
`observations`, `removedJobs`, `failedRemovals`. `map:run --json` imprime `jobId`,
`periodToken`, `status` et éventuellement `error`. Les journaux structurés du worker sont
écrits sur stderr, donc `… --json 2>/dev/null` reste du JSON pur.

## Précautions

- La redécouverte est volontairement progressive : les scopes repassent `pending` et la
  promotion existante les réactive par lots (`INGESTION_MAX_NEW_GROUPS_PER_CYCLE`), pour
  ne pas saturer l'API amont. Pendant cette fenêtre, un groupe `pending` n'apparaît plus
  dans la liste publique : à réserver aux opérations de maintenance.
- Le scan de la file parcourt les jobs conservés (`waiting`, `delayed`, `completed`,
  `failed`) afin de retrouver aussi les jobs d'un ancien volume de données. Sur une file
  très volumineuse, préférer une fenêtre de maintenance.
- `reset --target map` ne supprime pas les scopes événement : utilisez
  `--target map,events` pour redemander aussi les détails des événements en cours.

## Codes de sortie

| Code | Signification                                 |
| ---- | --------------------------------------------- |
| `0`  | succès (y compris dry-run)                    |
| `1`  | échec d'exécution ou retrait de job incomplet |
| `2`  | erreur d'usage (commande, cible ou option)    |

Voir [worker.md](worker.md) pour l'orchestration périodique et
[dispatcher.mmd](dispatcher.mmd) pour le scheduling.
