# ToolShare – Cahier de Recette & Plan de Tests (TOOL-63)

## 1. Contexte & Référentiel du Projet

- **Projet :** ToolShare – Plateforme de gestion des prêts et réservations d'outillage industriel multi-magasins (Safi, Maroc).
- **Stack :** Node.js (v18+ / v22), Express 4.21, MongoDB 7.0 / Mongoose 8.x, Docker Compose, Swagger OpenAPI 3.0.
- **Architecture :** Couches strictes Routes → Contrôleurs → Services → Dépôts (Repositories) → Modèles Mongoose.
- **Cadre d'évaluation :** Conformité stricte aux exigences du backlog Jira (`toolshare_backlog_jira.csv`).

---

## 2. Matrice de Traçabilité Jira – Périmètre Complet Aymane (24 Tâches)

| Jira ID | Type | Intitulé / Règle Métier | Statut | Fichier(s) de Test & Preuves |
|---|---|---|---|---|
| **TOOL-2** | Story | Configuration de l environnement Docker & Docker Compose | **Terminé** | `Dockerfile`, `compose.yaml`, `.env.example`, `README.md` |
| **TOOL-3** | Subtask | Dockerfile backend & docker-compose.yml avec mongo et volumes nommés | **Terminé** | `Dockerfile`, `compose.yaml` |
| **TOOL-4** | Subtask | Variables d'environnement (.env.example) et validation volumes | **Terminé** | `.env.example`, `compose.yaml` |
| **TOOL-16** | Story | Authentification JWT & Gestion du Profil | **Terminé** | `tests/routes/authRoutes.test.js`, `tests/middlewares/authMiddleware.test.js` |
| **TOOL-17** | Subtask | Route `POST /api/auth/login` avec génération du JWT | **Terminé** | `tests/routes/authRoutes.test.js` |
| **TOOL-18** | Subtask | Middleware de vérification JWT (`authMiddleware`) | **Terminé** | `tests/middlewares/authMiddleware.test.js` |
| **TOOL-23** | Subtask | Désactivation logique des comptes utilisateurs sans perte d'historique | **Terminé** | `tests/routes/userRoutes.test.js`, `tests/integration/userDeactivationHistory.integration.test.js` |
| **TOOL-24** | Epic | EPIC 3 : Gestion des Magasins & Inventaire Matériel | **Terminé** | Routes, contrôleurs et dépôts magasins & matériels |
| **TOOL-29** | Story | Inventaire et Matériels du Magasin (TOOL-95) | **Terminé** | `tests/routes/materielRoutes.test.js`, `tests/repositories/materielRepository.test.js` |
| **TOOL-30** | Subtask | Middleware périmètre magasin (`storeScopeMiddleware`, TOOL-96) | **Terminé** | `tests/routes/materielRoutes.test.js` |
| **TOOL-31** | Subtask | CRUD matériels + unicité globale de la référence physique (TOOL-97) | **Terminé** | `tests/utils/materialReferenceAudit.test.js`, `tests/utils/materialReferenceRollout.test.js`, `tests/integration/materialReferenceIndexRollout.integration.test.js` |
| **TOOL-38** | Story | Protection contre les réservations simultanées | **Terminé** | `tests/integration/reservationConcurrency.integration.test.js` |
| **TOOL-39** | Subtask | Verrouillage atomique / transactions de session MongoDB | **Terminé** | `src/utils/atomicLock.js`, `tests/utils/atomicLock.test.js` |
| **TOOL-40** | Subtask | Test de concurrence avec requêtes parallèles (`201` vs `409`) | **Terminé** | `tests/integration/reservationConcurrency.integration.test.js` |
| **TOOL-45** | Epic | EPIC 5 : Cycle de Vie des Emprunts, Retours & Retards | **Terminé** | Routes & services handover, return, overdue |
| **TOOL-46** | Story | Enregistrement de la remise physique du matériel | **Terminé** | `tests/routes/reservationRoutes.test.js` |
| **TOOL-47** | Subtask | Route `POST /api/reservations/:id/handover` | **Terminé** | `tests/routes/reservationRoutes.test.js` |
| **TOOL-48** | Subtask | Enregistrement de la date réelle de sortie (`dateReelleSortie`) | **Terminé** | `tests/routes/reservationRoutes.test.js` |
| **TOOL-52** | Story | Suivi des emprunts en retard et historique | **Terminé** | `tests/routes/borrowingRoutes.test.js` |
| **TOOL-53** | Subtask | Route `GET /api/borrowings/overdue` | **Terminé** | `tests/routes/borrowingRoutes.test.js` |
| **TOOL-56** | Story | Tests unitaires des règles métier et permissions | **Terminé** | `tests/services/reservationEngine.test.js`, `tests/services/reservationStatusTransitions.test.js` |
| **TOOL-57** | Subtask | Tests unitaires du moteur de réservation (durées, conflits, créneaux) | **Terminé** | `tests/services/reservationEngine.test.js` |
| **TOOL-58** | Subtask | Tests unitaires des transitions de statut (`CONFIRMEE` → `EN_COURS` → `TERMINEE` / `ANNULEE`) | **Terminé** | `tests/services/reservationStatusTransitions.test.js` |
| **TOOL-63** | Subtask | Cahier de recette, cohérence Jira et finalisation documentaire | **Terminé** | `docs/TEST_PLAN_AND_RECETTE.md`, `README.md`, `toolshare_backlog_jira.csv` |

*(Note : La sous-tâche TOOL-32 / TOOL-98 concernant `PATCH /api/materials/:id/status` est également complétée et validée par `tests/routes/materielRoutes.test.js` et documentée dans `src/docs/swagger.json`).*

---

## 3. Détail des Campagnes de Recette

### A. Moteur de Réservation & Conflits Horaires (TOOL-57)
- **Validation des durées :** Rejet des durées nulles, négatives, non numériques (`400 Bad Request`).
- **Validation des dates :** Rejet des dates de début antérieures à l'instant présent (`400 Bad Request`).
- **Calcul automatique :** `dateFin = dateDebut + (dureeHeures * 3600 * 1000)`.
- **Chevauchement d'intervalles :** Détection formelle des chevauchements stricts (`start < existingEnd && end > existingStart`).
- **Créneaux contigus acceptés :**
  - Fin du créneau demandé = Début du créneau existant (`accepté sans conflit`).
  - Début du créneau demandé = Fin du créneau existant (`accepté sans conflit`).

### B. Concurrence, Atomicité & Nettoyage Mémoire (TOOL-38, TOOL-39, TOOL-40)
- **Mécanisme :** Verrou asynchrone par ressource (`KeyedMutex` sur `materielId`) complété par des transactions MongoDB de session avec rollback automatique en cas de conflit.
- **Gestion de la mémoire :** Nettoyage automatique des clés complétées dans `KeyedMutex.chains` afin de prévenir toute fuite mémoire sur serveur longue durée.
- **Résultat du test de concurrence parallèle :**
  - Deux requêtes HTTP simultanées (`Promise.all`) sur le même outil et le même créneau.
  - Résultat exact : Une requête reçoit **201 Created**, la seconde reçoit **409 Conflict**.
  - Une seule réservation créée en base de données.

### C. Cycle de Vie, Remise, Retour & Retards (TOOL-46, 47, 48, 52, 53, 58)
- **Remise (`POST /api/reservations/:id/handover`) :**
  - Accessible uniquement aux Admins et Gestionnaires du magasin concerné.
  - La réservation passe de `CONFIRMEE` à `EN_COURS` avec `dateReelleSortie = new Date()`.
  - Rejet si la réservation n'est pas confirmée ou si le matériel est déjà sorti.
- **Retour (`POST /api/reservations/:id/return`) :**
  - Passe la réservation à `TERMINEE` avec `dateReelleDeReteur = new Date()` et `etatRetour`.
  - Si `etatRetour === 'ENDOMMAGE'` : le matériel est immédiatement basculé à `INDISPONIBLE`.
  - Si `etatRetour === 'BON_ETAT'` : le matériel repasse à `DISPONIBLE`, tout en préservant le statut `INDISPONIBLE` si le gestionnaire avait manuellement placé l'équipement en maintenance.
- **Retards (`GET /api/borrowings/overdue` et alias `/api/reservations/overdue`) :**
  - Filtre les réservations `EN_COURS` dont `dateFin < now`.
  - Cloisonnement strict : le Gestionnaire ne voit que les retards de son propre magasin.
  - Enrichissement automatique de la réponse avec `enRetard: true`, `retardMinutes`, `retardHeures`.

### D. Documentation OpenAPI / Swagger (TOOL-60, TOOL-61, TOOL-63)
- Tous les endpoints de l'API (21 chemins REST) sont intégralement décrits dans `src/docs/swagger.json`, incluant :
  - Installation, Authentification JWT, Profil, Utilisateurs RBAC, Magasins, Réservations, Matériels (CRUD, activation, statut), Emprunts et retards.

---

## 4. Bilan Global d'Exécution des Tests

```bash
npm test
```

- **Suites de test :** 20
- **Total des tests :** 208
- **Tests passés (Pass) :** 206
- **Tests échoués (Fail) :** 0
- **Tests ignorés (Skipped) :** 2 (intégration DB nécessitant une instance Mongo locale avec `MONGO_TEST_URI`)
- **Durée totale d'exécution :** ~7.2 secondes
