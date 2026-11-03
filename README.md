# ToolShare

## Material reference uniqueness rollout

### Implemented API behavior

The material API derives `referenceKey` on the server from the material reference after trimming whitespace and converting it to lowercase. Clients cannot provide or update `referenceKey` directly. The service checks for an existing normalized key and returns a conflict when one is found.

### Pending database deployment

The `Materiel` schema declares a unique index on `referenceKey`, but `autoIndex: false` disables automatic index creation. The actual MongoDB index has not yet been verified, so the schema declaration does not establish that the index exists in any deployed database.

Before backfilling existing materials, run the read-only reference audit and review its findings. Resolve missing, null, blank, or non-string references and duplicate normalized references manually. Missing or inconsistent `referenceKey` values are repairable only when their stored reference is valid and unique after normalization. Rerun the complete audit after backfill and require zero findings before explicitly creating and verifying the unique `referenceKey` index in the target database.

Until this rollout is complete, service-level duplicate checks are not race-safe: concurrent requests can pass the check before either write completes. The checks can also miss legacy material documents that do not yet have a `referenceKey`. Do not rely on the API check alone to guarantee uniqueness in a shared database.

### Controlled rollout commands

The rollout tool never loads `.env`; provide `MONGO_URI` in the process environment. Dry-run is read-only:

```sh
npm run material-reference:dry-run
```

Before either database-changing command, pause material writes and verify the target database with the database owner. The confirmation must exactly match the database name in `MONGO_URI`:

```sh
npm run material-reference:backfill -- --confirm-db=<database-name>
npm run material-reference:create-index -- --confirm-db=<database-name>
```

Backfill refuses to write if any reference is missing, blank, non-string, or duplicated after trimming and lowercasing. Resolve those records manually under an approved data plan; this tool never renames or deletes materials. Missing or inconsistent `referenceKey` values are repairable only when their stored reference is valid and unique. Backfill updates only `referenceKey`, with filters guarding the audited `_id`, original `reference`, and prior key state. It then runs the full audit again and reports failure if any finding remains.

Run the index command only after backfill reports a clean full audit. It independently audits again, refuses all findings, preserves other indexes, explicitly creates the global `{ referenceKey: 1 }` unique index, and verifies the physical index definition and `unique: true`. A partial/non-unique existing `referenceKey` index blocks automatic replacement and requires manual review. A successful command is the only indication that this deployment step was verified; the schema declaration alone is not.

These commands are database operations. Their confirmation protects against an accidental URI/database mismatch, but does not determine whether a database is safe or authorized to change. Do not run them against production until the owner approves the maintenance window, audit findings are resolved, and writes are paused through index verification. If backfill partially fails, stop, note the reported count of acknowledged/confirmed guarded updates (which may be lower than the number actually applied if an acknowledgement was lost), run the read-only audit again, and review remaining findings before retrying. The tool does not roll back key updates or drop indexes automatically; original `reference` values and all material documents are preserved.

The integration test uses a random temporary collection in the local `toolshare_test` database and refuses other hosts or database names. It creates and drops only that test-created collection. Set `MONGO_TEST_URI` and `MONGO_TEST_DATABASE_CONFIRMATION=toolshare_test` to authorize the test database writes; without `MONGO_TEST_URI` the test is skipped.
