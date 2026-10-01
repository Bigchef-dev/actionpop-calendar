# Feature Specification: Enrichissement géographique et filtrage des événements

**Feature Branch**: `002-geographic-enrichment`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "Je souhaite maintenant ajouter des éléments géographiques : modéliser l'espace administratif français, enrichir les événements avec les niveaux géographiques pertinents, permettre un double filtrage, valider le type d'événement et prendre en compte les contraintes d'exploitation et de licence de la solution de stockage."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter des événements enrichis géographiquement (Priority: P1)

En tant qu'utilisateur du calendrier, je veux qu'un événement récupéré soit associé à sa position et aux territoires administratifs correspondants afin de pouvoir comprendre où il se déroule et l'exploiter dans des recherches géographiques.

**Why this priority**: Sans enrichissement fiable, les filtres territoriaux ne peuvent pas produire de résultats compréhensibles ni cohérents.

**Independent Test**: À partir d'un événement valide avec des coordonnées ou un code territorial exploitable, vérifier que le calendrier expose l'événement avec sa localisation et les niveaux géographiques déterminés, sans modifier son identité ni ses dates.

**Acceptance Scenarios**:

1. **Given** un événement valide avec une localisation et une position géographique connues, **When** il est ingéré, **Then** il est associé à une commune et aux niveaux administratifs disponibles au-dessus de cette commune.
2. **Given** un événement valide dont la position est connue mais dont certains niveaux administratifs ne s'appliquent pas, **When** il est ingéré, **Then** les niveaux applicables sont conservés et les niveaux non applicables restent absents sans rejeter l'événement.
3. **Given** un événement dont la localisation ne permet pas un enrichissement fiable, **When** il est ingéré, **Then** l'événement reste disponible avec ses données de localisation brutes et un état d'enrichissement incomplet est identifiable.

### User Story 2 - Filtrer les événements par plusieurs critères géographiques (Priority: P1)

En tant qu'utilisateur du calendrier, je veux combiner plusieurs critères géographiques, par exemple une circonscription et une commune, afin d'obtenir uniquement les événements qui satisfont tous les critères sélectionnés.

**Why this priority**: Le besoin principal est de répondre à des recherches croisées telles que « événements de type tractage dans la circonscription 1 du Rhône et dans Lyon ».

**Independent Test**: Charger un jeu d'événements contenant plusieurs communes, départements et circonscriptions, appliquer deux filtres simultanément et vérifier que seuls les événements satisfaisant l'intersection sont retournés.

**Acceptance Scenarios**:

1. **Given** des événements appartenant à plusieurs communes et circonscriptions, **When** l'utilisateur filtre par une circonscription et une commune, **Then** seuls les événements appartenant aux deux périmètres sont retournés.
2. **Given** un filtre géographique sans résultat, **When** la recherche est exécutée, **Then** la réponse est vide et ne contient pas d'événements d'un périmètre voisin.
3. **Given** plusieurs filtres géographiques facultatifs, **When** un seul filtre est fourni, **Then** seuls les critères fournis sont appliqués et les résultats restent complets pour ce critère.

### User Story 3 - Valider et diagnostiquer les données géographiques entrantes (Priority: P2)

En tant qu'opérateur, je veux que les données géographiques et le type d'événement soient validés avant leur publication afin d'éviter de rendre interrogeables des événements incohérents et de pouvoir diagnostiquer les rejets.

**Why this priority**: La qualité des filtres dépend de données d'entrée strictement contrôlées et de diagnostics exploitables.

**Independent Test**: Soumettre des payloads valides, incomplets, mal formés et hors limites, puis vérifier les décisions de validation, la conservation des champs autorisés et les erreurs produites.

**Acceptance Scenarios**:

1. **Given** un événement avec un type autorisé, des dates valides et des coordonnées dans les limites géographiques, **When** il est validé, **Then** il est accepté.
2. **Given** un événement avec des coordonnées hors limites ou une valeur de type invalide, **When** il est validé, **Then** il est rejeté avec une erreur indiquant le champ concerné.
3. **Given** un événement sans données géographiques suffisantes, **When** il est validé, **Then** il n'est pas rejeté uniquement pour cette absence et son absence d'enrichissement est traçable.

### Edge Cases

- Une commune peut appartenir à une métropole ou à un EPCI, tandis qu'une circonscription peut couvrir plusieurs communes ; les relations ne doivent pas être réduites à une relation univoque incorrecte.
- Paris, Lyon et Marseille peuvent nécessiter un arrondissement en plus de la commune ; l'arrondissement ne doit pas remplacer la commune.
- Les coordonnées reçues dans l'ordre longitude puis latitude doivent être distinguées de l'ordre latitude puis longitude.
- Des coordonnées nulles, absentes, non finies ou hors bornes ne doivent pas produire un enrichissement silencieusement faux.
- Un code postal peut contenir des zéros initiaux et ne doit pas être converti en nombre.
- Deux localisations portant le même nom doivent rester distinguables par leur identifiant territorial.
- Une mise à jour de la localisation ne doit pas changer l'identifiant stable de l'événement.
- Une recherche combinée ne doit pas transformer un `ET` en `OU` lorsqu'un critère ne correspond à aucun événement.
- La liste des types d'événement doit rester extensible sans accepter des valeurs arbitraires non documentées.
- Les données territoriales indisponibles ou obsolètes doivent empêcher l'enrichissement concerné, mais pas supprimer les données brutes valides de l'événement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système MUST représenter une localisation d'événement avec une position optionnelle et les identifiants et libellés territoriaux disponibles.
- **FR-002**: Le système MUST distinguer au minimum la commune, l'EPCI, le département, la région et la circonscription lorsque ces informations sont déterminables.
- **FR-003**: Le système MUST représenter l'arrondissement séparément de la commune lorsqu'il s'applique.
- **FR-004**: Le système MUST conserver les coordonnées dans un ordre documenté longitude puis latitude et vérifier les bornes de chaque valeur.
- **FR-005**: Le système MUST conserver les codes territoriaux et codes postaux comme des chaînes afin de préserver les zéros initiaux.
- **FR-006**: Le système MUST enrichir un événement à partir de ses coordonnées ou de ses identifiants de localisation disponibles, sans changer son identifiant stable, ses dates ou son type.
- **FR-007**: Le système MUST conserver les données de localisation brutes lorsqu'un enrichissement administratif est impossible ou partiel.
- **FR-008**: Le système MUST valider le type d'événement contre un ensemble de valeurs autorisées et rejeter les valeurs inconnues avec un diagnostic exploitable.
- **FR-009**: Le système MUST permettre de filtrer les événements par commune, arrondissement, EPCI, département, région, circonscription et type d'événement lorsque ces critères sont disponibles.
- **FR-010**: Le système MUST combiner plusieurs filtres avec une sémantique d'intersection : un événement doit satisfaire tous les critères fournis.
- **FR-011**: Le système MUST retourner zéro résultat lorsqu'aucun événement ne satisfait l'ensemble des critères, sans élargissement implicite du périmètre.
- **FR-012**: Le système MUST rendre identifiable la différence entre une donnée géographique absente, invalide, non applicable et non enrichie faute de référentiel.
- **FR-013**: Le système MUST publier les événements enrichis de manière atomique afin qu'un lecteur ne voie pas un événement avec seulement une partie de ses métadonnées géographiques.
- **FR-014**: Le système MUST permettre la mise à jour du référentiel géographique sans réécrire l'identité stable des événements.
- **FR-015**: Le système MUST documenter la provenance, la date de mise à jour, la version et la licence du référentiel géographique utilisé.
- **FR-016**: Le système MUST permettre de télécharger et d'intégrer une nouvelle version du référentiel géographique depuis les jeux de données sélectionnés sur `data.gouv.fr`, sans modifier les identifiants stables des événements déjà publiés.
- **FR-017**: Le système MUST valider la structure, les identifiants, les relations territoriales et la couverture minimale d'un nouveau dataset avant de le rendre actif.
- **FR-018**: Le système MUST conserver la version précédente du référentiel jusqu'à ce que la nouvelle version soit validée et publiée.
- **FR-019**: Le système MUST signaler les événements dont l'enrichissement change après une mise à jour du référentiel et permettre leur retraitement.
- **FR-020**: Le système MUST documenter les conditions de distribution et d'exploitation de la solution de recherche et de stockage retenue avant son usage en production.
- **FR-021**: Le système MUST isoler la logique d'enrichissement, de validation et de recherche des adaptateurs d'entrée et de stockage afin que chaque règle soit testable indépendamment.

### Key Entities

- **Localisation**: Position et adresse brutes d'un événement, avec coordonnées optionnelles et identifiant stable.
- **Commune**: Territoire communal identifié par un code et un nom, éventuellement associé à un code postal.
- **Arrondissement**: Découpage administratif applicable à certaines communes, identifié séparément.
- **EPCI**: Intercommunalité à laquelle une commune peut être rattachée.
- **Département**: Territoire administratif regroupant des communes et identifié par un code et un nom.
- **Région**: Territoire administratif regroupant des départements.
- **Circonscription**: Périmètre électoral ou politique pouvant couvrir plusieurs communes ou une partie d'une commune.
- **Événement**: Activité publiée avec un type, des dates, une localisation brute et des métadonnées géographiques enrichies.
- **Référentiel géographique**: Dataset local versionné, issu de jeux sélectionnés sur `data.gouv.fr`, contenant les limites, identifiants et relations territoriales utilisées pour l'enrichissement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Au moins 99 % des événements comportant des coordonnées valides et couverts par le référentiel sont enrichis avec une commune et les niveaux administratifs applicables.
- **SC-002**: 100 % des événements rejetés pour une donnée géographique invalide ou un type inconnu produisent un diagnostic indiquant le champ et la cause.
- **SC-003**: 100 % des recherches combinant deux critères géographiques retournent uniquement des événements satisfaisant simultanément les deux critères sur le jeu de test de référence.
- **SC-004**: Au moins 95 % des recherches géographiques usuelles retournent un résultat en moins d'une seconde sur le volume de référence du projet.
- **SC-005**: 100 % des événements restent retrouvables par leur identifiant stable après une mise à jour du référentiel ou de leurs métadonnées géographiques.
- **SC-006**: Les opérateurs peuvent identifier la proportion d'événements non enrichis et distinguer les causes absence, invalidité, non-applicabilité et référentiel indisponible.

## Assumptions

- La première version traite uniquement les événements comme objets recherchables ; les groupes ne sont pas enrichis géographiquement dans cette fonctionnalité.
- Le référentiel géographique est mis à jour depuis des jeux de données publiés sur `data.gouv.fr`, après validation locale et publication atomique de la nouvelle version.
- Les relations administratives sont évaluées pour une version donnée du référentiel ; elles ne prétendent pas reconstruire l'histoire territoriale passée.
- Une localisation sans coordonnées peut être enrichie à partir d'un identifiant territorial fiable, mais un simple libellé de ville ne suffit pas à choisir silencieusement entre homonymes.
- Les données territoriales et les données d'événement restent soumises à leurs propres licences ; la décision de distribution doit être vérifiée pour chaque source.
- La première version conserve les champs bruts reçus en plus des champs enrichis afin de permettre un retraitement sans nouvel appel à la source d'événements.

## Décisions de cadrage

- **Source géographique**: référentiel local versionné, mis à jour à partir des jeux de données retenus sur `data.gouv.fr`. Les métadonnées de provenance, version, date de publication et licence sont conservées avec chaque version.
- **Périmètre de la première version**: événements uniquement. Les relations géographiques des groupes restent hors périmètre.
