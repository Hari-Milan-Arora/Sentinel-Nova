# Sentinel Nova: real dataset and task lead-time model

Audit and training date: 2026-10-19

## Dataset and attribution

- Local file: `Jira task dataset.xlsx` in the repository root; 278,494 bytes.
- Workbook: one sheet, `100data`; 1,193 rows and 7 columns.
- Observed schema: `Summary` (text), `Status` (text), `Priority` (text), `Created` (Excel datetime), `Resolved` (Excel datetime), `Labels` (text with 2 missing values), `Description` (text).
- Exact full-row duplicates: 0. `Summary` has 1,192 distinct values under the original string representation; six eligible rows belong to repeated titles after whitespace trimming and case folding and are excluded because there is no stable task ID for grouping.
- Source attribution: Natasha Nigar and Shahid Islam, *Jira Task Dataset for Agile Project Analysis and Completion Date Prediction*, [Mendeley Data v4](https://data.mendeley.com/datasets/249h53865h/4), DOI `10.17632/249h53865h.4`. The versioned source record states CC BY 4.0. The workbook was supplied locally by the user; its SHA-256 is `7dba698472a37055a25899613b3aad88c2906a987bf7a0fd82295140b20e0867`. That checksum identifies this local file; no upstream checksum was available to prove byte-for-byte correspondence with the Mendeley download.
- The workbook itself is ignored by Git (`Jira task dataset.xlsx`). Generated joblib/model files are also ignored under `ml/models/`. This document preserves attribution and the observed schema.

The workbook has 1,193 `Done` records. No summary, creation, or resolution timestamps were missing; all timestamps parsed; there were no nonpositive target durations, exact duplicate rows, or non-completed statuses. There are no unresolved or cancelled rows in this file, so censoring and cancelled-task behavior cannot be learned. Two `Labels` values are missing; labels are not model features. The timezone-naive Excel datetimes are treated as-is, with no timezone conversion.

## Target and exclusions

The trained target is:

```text
task_completion_lead_time = (Resolved - Created).total_seconds() / 86400
```

It measures **elapsed calendar days**, not active effort, estimated duration, focused work, or hours required. Target values across the full valid set range from 0.000694 days to 3,367.934 days; median 472.264 days; 90th percentile 1,089.706 days.

Eligibility requires a nonblank Summary, a completed status in the explicit allowlist (`Done`, `Closed`, `Resolved`, `Complete`, `Completed`), parseable Created and Resolved timestamps, and positive finite elapsed days. Exact full-row duplicates would be removed (none found). The six rows in repeated normalized Summary groups are then excluded to prevent the same title from crossing a split when the dataset has no stable task identifier. This leaves **1,187 usable records**. No labels were fabricated and no rows were created.

## Features and leakage controls

Only `Summary` (the task title text) is used at inference. Status and Resolved are post-outcome fields. Created is used only for target construction and chronological splitting. Priority, Labels, and Description are omitted because this workbook does not provide point-in-time history to establish that their observed values were available unchanged before resolution. No stable task identifier is present. These exclusions reduce available signal but avoid relying on uncertain temporal provenance.

The fitted preprocessing/model pipeline is one scikit-learn artifact: lowercase Unicode-normalized TF-IDF word unigrams and bigrams (training-fitted vocabulary, `min_df=2`, `max_features=20,000`) followed by Ridge regression on `log1p(lead_time_days)`, with predictions transformed back by `expm1` and bounded below at zero. Candidate alpha values were 0.1, 1, 10, and 100; validation MAE selected alpha 100. The random seed is 20261019; this pipeline's estimators are deterministic for the selected configuration.

## Split and held-out evaluation

Rows are sorted by Created timestamp and normalized Summary, then partitioned 70/15/15 chronologically **before any text vectorizer is fit**:

| Partition | Rows | Created timestamp range |
|---|---:|---|
| Train | 830 | 2013-12-16 to 2022-03-14 |
| Validation | 178 | 2022-03-15 to 2024-11-19 |
| Test | 179 | 2024-11-19 to 2025-02-21 |

Alpha selection uses only train and validation. The final model is fit on train plus validation (1,008 rows) and evaluated once on the later 179-row test set. Baseline predicts the train-plus-validation median on that same test set.

| Test model | MAE (days) | RMSE (days) | Median absolute error (days) | R² | N |
|---|---:|---:|---:|---:|---:|
| Train-plus-validation median baseline | 620.980 | 621.109 | 621.168 | -2413.171 | 179 |
| TF-IDF + Ridge, alpha=100 | 281.799 | 282.299 | 282.523 | -497.712 | 179 |

The model's MAE is lower than this baseline on this one chronological slice. Both R² values are strongly negative. The result is not evidence of a generally reliable estimate: the sample is small, completed-task-only, likely temporally/domain selected, target times are highly skewed, and the model has only title text. Do not use the estimate as a task work-duration or deadline guarantee. No uncertainty interval or calibration is provided. It has not been evaluated against user tasks or tested for production utility.

## Artifact, inference, and reproduction

- Model version: `task-lead-time-v1`.
- Ignored artifact: `ml/models/task-lead-time-v1.joblib`; SHA-256 `07f40a75f553aa76f4907a546e92674811c0ff691f9a5ab9d45e59ecc21f401c`.
- Ignored-model directory also contains a JSON manifest with dataset checksum, target, feature schema, split, package versions, timestamp, selected alpha, metrics, limitations, and artifact checksum.
- Tracked evaluation report: `ml/reports/task-lead-time-v1.json`.
- Runtime loader verifies model version, target, units, feature schema, and artifact checksum before deserialization. A long-lived JSON-lines Python worker loads the artifact once; Node does not launch one process per request. It accepts 1–100 task titles (maximum 2,000 characters each), has bounded startup/request timeouts, and returns sanitized unavailable statuses for missing or invalid artifacts.
- Runtime configuration: `SENTINEL_NOVA_PYTHON` selects the Python executable (`PYTHON` is the secondary override); `SENTINEL_NOVA_ML_WORKER` and `SENTINEL_NOVA_ML_ARTIFACT_DIR` optionally override worker and artifact paths. The server host must have the pinned Python packages installed and the trained artifact deployed at the artifact path. If these are absent, prediction status is unavailable.
- The existing `PrioritizerAgent` considers only tasks explicitly tagged `software-engineering`, `software engineering`, or `jira`. Runtime predictions are now **disabled by default** because the chronological diagnostics show severe distribution shift. Setting `SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL=true` explicitly opts into the experimental advisory path for controlled evaluation; it does not change deterministic ranking or proposals, and all proposed actions still require confirmation. Other tasks receive `not_applicable`; disabled/unavailable model output is never replaced by a heuristic.
- The current PrioritizerAgent integration test asserts the default `unavailable` response, empty predictions, unchanged deterministic ranking, and confirmation-required proposals. It does not run artifact inference or enable the experimental model.

Reproduce with Python 3.10 and the pinned dependencies in `ml/requirements.txt`:

```powershell
python -m pip install -r ml/requirements.txt
python -m ml.training.train
python -m ml.evaluation.evaluate
npm run test:ml
npm run test:ml:integration
```

The integration command exercises only the default-disabled runtime path. It does not set the experimental flag or load the artifact. Do not enable the model for ordinary user-facing operation.

Training writes the artifact and manifest under `ml/models/`, and the measured training report under `ml/reports/`. The current default-disabled Prioritizer integration test needs neither the workbook nor artifact and makes no provider calls. Offline artifact inference remains covered by the Python model tests when the artifact is present.

## Other prediction capabilities and limitations

This model predicts only elapsed lead time for explicitly declared software/Jira tasks. Task completion probability, active task duration, deadline risk, workload/capacity pressure, and focus-window suitability remain existing deterministic heuristics or unavailable outputs; this model does not replace or validate them. The separate Gryzzly candidate was not used because this implementation did not verify active-work-time semantics suitable for a distinct target. No private Sentinel Nova user data was uploaded.

Source licence attribution is based on the public Mendeley v4 record. Local file lineage is user-provided and was not cryptographically matched to the source record. Model results are research/diagnostic evidence only and are not calibrated or production-ready.

## Multi-dataset candidate audit (2026-10-19)

### Local discovery and source matching

The repository-root scan found one user-supplied dataset file: `Jira task dataset.xlsx`. Its observed Mendeley v4 schema and source attribution are documented above. It is **not** the Kaggle Apache Jira Issues dataset: its seven columns, 1,193-row workbook, and Mendeley source do not match the Kaggle dataset's different title and source. Root `data/*.json` files are app stores/runtime records and were not inspected or used as training data. No Kaggle source data was downloaded in this audit.

| Candidate source | Publicly verified metadata | Actual data audit | Decision |
|---|---|---|---|
| [Apache JIRA Issues: Changelog, Comments, Links](https://www.kaggle.com/datasets/tedlozzo/apaches-jira-issues) | Kaggle's public dataset metadata reports Apache 2.0, update date 2025-03-16, and total size 8,780,321,027 bytes (about 8.78 GB). Public file inventory: `changelog.csv` 2,734,204,692 bytes; `comments.csv` 4,035,969,476 bytes; `issuelinks.csv` 103,441,591 bytes; `issues.csv` 1,906,705,268 bytes. Description says cleaned Apache JIRA issues including changelog, comments, and links. | File names and sizes were available, but file-level schema, row counts, target fields, missingness, duplicates, and quality statistics were not. No 8.78 GB download was attempted. | Not trained. Need selected-file schema and safe data audit before choosing a target. Public license reported Apache 2.0; verify any included file-level notices before redistributing processed data. |
| [Kaggle Time Prediction competition data](https://www.kaggle.com/c/timeprediction/data) | Public page describes `train.csv`, `test.csv`, `test_task.csv`, `train_task.csv`, and sample submission; explorer reports 17 columns and 381.76 kB total. Described fields include `track_id`, `StartHour`, `Start_Time`, and `tat_in_days`, described as “Days to complete Task.” Kaggle lists license as “Subject to Competition Rules.” | The unauthenticated file listing/download did not provide source file bytes. Actual schema, field units beyond the page's days description, relationship between task tables, target distribution, missingness, duplicates, and row counts remain unverified. “Days to complete” does not establish active-work time. | Not downloaded or trained. Competition-specific rules/access conditions must be reviewed before reuse; target semantics and table joins need source-file validation. If later validated, keep this as a separate elapsed task-turnaround model. |
| [Student Productivity Prediction Challenge](https://www.kaggle.com/competitions/student-performance-prediction-machine-learning-challenge/data) | Public page states 3 CSV files (`train.csv`, `test.csv`, `sample_submission.csv`), 1.69 MB total, and CC BY 4.0. It names continuous `productivity_score` as the train target and describes age, gender, daily study/sleep/phone/social-media/YouTube/gaming hours, breaks/day, caffeine, exercise, assignments, attendance, stress, focus, and final grade. The page explorer reports 39 columns, while the description enumerates 17 features plus target/id conventions; exact headers need file-level confirmation. | No actual CSV bytes were available without authenticated competition file access. Row counts, exact feature names, target construction/provenance/range/distribution, missingness, duplicates, and data quality are unverified. The dataset population is students, not Sentinel Nova's general task/project users. | No model trained. CC BY 4.0 is reported by the page, but the target's construction and feature/target timing must be checked in actual files before modeling. Do not transfer `productivity_score` to task completion probability, deadline risk, or Nova focus suitability. |

The candidate metadata above is not a substitute for inspecting source data. In particular, the Kaggle competition endpoints did not return dataset file contents in the unauthenticated audit. No credentials were read, no competition rules were accepted, and no raw Kaggle files or synthetic substitutes were created. Statistics marked unverified are intentionally not inferred from source-page descriptions.

## Feature mapping to Nova concepts

This is an explicit semantic mapping, not an assertion that fields with similar names are interchangeable.

| Source field or concept | Mapping classification | Nova counterpart / allowed use | Exclusion or limitation |
|---|---|---|---|
| Mendeley Jira `Summary` | Direct text mapping | `Task.title` → the lead-time model's `Summary` input for explicitly declared Jira/software work. | Only title text is used; historical title edits cannot be ruled out. |
| Mendeley Jira `Created`, `Resolved` | Derived training label only | Formula: `(Resolved - Created) / 86400` → elapsed calendar days. | Never an inference feature; not active effort, estimated work duration, or focus minutes. |
| Mendeley Jira `Priority` | Present but not safely active-mapped | Nova has `Task.priority`; future use requires validated value mapping and point-in-time provenance. | Excluded from current trained model; dataset priority names and Nova priority semantics may differ. |
| Mendeley Jira `Status` | Post-outcome / unavailable at prediction | No model input mapping. | All local rows are `Done`; it would leak outcome. |
| Mendeley Jira `Labels`, `Description` | Present but not safely active-mapped | No current inference mapping. | Mutable historical state is not available; not used as model features. |
| Jira task type / issue type | Unavailable in local Mendeley workbook | No verified Nova `Task` field mapping. | Do not infer type from title for a supposedly verified feature. |
| Due date / deadline outcome | Unavailable | Existing Nova deadline logic remains based on trusted task due dates and deterministic rules. | Neither the local workbook nor current candidate metadata verifies a due-date-delay label. |
| Estimated effort / active time / breaks | Unavailable in local Jira workbook | No trained effort-duration prediction. | Lead time cannot be mapped to active duration. |
| Time Prediction `tat_in_days` | Candidate derived/observed target; unverified source data | Potential separate task turnaround target measured in days, if actual table definitions, joins, censoring, and labels validate. | Must not be merged with Jira rows or labeled active work. |
| Student `study_hours_per_day`, `sleep_hours`, `breaks_per_day`, `focus_score` | Described by source page; unverified files and population | Possible student-domain features only. | Not equivalent to per-task effort, Nova sleep schedule, focus-window suitability, or focus capacity; no current Nova inference mapping. |
| Student `productivity_score` | Described continuous target; provenance/range unverified | Potential separate student productivity-score regression only after auditing actual target definition and leakage. | Not task completion probability, deadline risk, task priority, or Nova confidence. Student-domain model must remain separate and likely non-transferable. |

Only the first dataset's Summary→Task title inference mapping is active. The existing Jira lead-time pipeline is separate from all three Kaggle candidates. Other values above are schema candidates, not implemented predictions.

## Separate pipeline status

- **Mendeley Jira workbook:** a reproducible lead-time pipeline and trained artifact already exist as described above. It remains its own source/model version.
- **Kaggle Apache Jira:** no downloaded files or verified target; no pipeline trained.
- **Kaggle Time Prediction:** no downloaded files or verified competition reuse terms/table joins; no pipeline trained.
- **Student Productivity:** target name is described publicly, but actual target construction, range, distribution, and feature timing are not verified; no pipeline trained.

Do not merge these sources. If files become available under verified access/licence conditions, place each unchanged source under a separate ignored subdirectory (for example `ml/data/raw/apache_jira/`, `ml/data/raw/timeprediction/`, and `ml/data/raw/student_productivity/`), record source checksums, and audit each schema/target before training. The source-specific feature contracts and fitted preprocessors must remain separate.

## Saved model reliability diagnosis (2026-10-19)

Run `python -m ml.evaluation.diagnose_task_lead_time` to checksum-check the workbook against the saved manifest, recreate chronological partitions, evaluate the saved final artifact on test, and write `ml/reports/task-lead-time-v1-diagnostics.json`. The selected alpha is read from the artifact manifest; no test tuning occurs. The train model is a diagnostic refit on train only; validation metrics are model-selection metrics because validation selected alpha. Test baselines use train plus validation, matching the final artifact's fitting rows.

| Split | N | Model MAE / RMSE / R² (days) | Median baseline MAE / RMSE / R² | Mean baseline MAE / RMSE / R² |
|---|---:|---|---|---|
| Train (in-sample) | 830 | 339.732 / 398.412 / -0.275 | 290.789 / 356.310 / -0.020 | 293.626 / 352.810 / 0.000 |
| Validation (alpha selected here) | 178 | 402.477 / 427.589 / -7.978 | 645.409 / 660.997 / -20.455 | 595.588 / 612.446 / -17.419 |
| Test (held out) | 179 | 281.799 / 282.299 / -497.712 | 620.980 / 621.109 / -2413.171 | 591.553 / 591.688 / -2189.879 |

The low test R² reflects squared error relative to the small variance within this test slice: test target standard deviation is 12.641 days (SST 28,603.6), while model SSE is 14,264,954. Mean prediction is 296.943 days versus actual mean 15.145; mean residual is +281.799 days. All 179 predictions are between 256.954 and 326.935 days, while all test targets are at most 58.965 days. For the adequately sized 0–30-day test subgroup (N=162), MAE is 284.368 days. The 30–365-day subgroup has N=17 and is suppressed under the minimum-N=20 reporting rule.

There is strong chronological target drift. Train target median/mean/max are 761.692/711.871/3,367.934 days; validation median/mean/max are 26.747/116.283/359.504; test median/mean/max are 14.957/15.145/58.965. Nine train records exceed the training p99 threshold (1,151.485 days), versus none in validation or test. Created-date ranges are 2013-12-16–2022-03-14, 2022-03-15–2024-11-19, and 2024-11-19–2025-02-21. Test-year MAE stays near 280 days (2024 N=90; 2025 N=89). This indicates a regime/domain change, not only a few extreme training labels. Summary text lengths are modestly different (train/test median 48/39 characters and 7.5/6 tokens), but do not explain the target shift. The model is compressed around its learned range and fails to adapt to recent short lead times.

The workbook contains only completed `Done` rows, no stable task identifier, no summary revision history, and timezone-naive timestamps. The target is conditional on this selected population. `Summary` is used as the pre-outcome feature by field intent, but title edits after creation cannot be ruled out. Repeated normalized titles were removed; identifiers, Created, Resolved, Status, and mutable metadata without point-in-time provenance are not features. Median and mean baselines also fail under the shift, so their higher MAE does not make this model useful. Ordinary runtime prediction is disabled. For controlled technical reproduction only, set `SENTINEL_NOVA_ENABLE_EXPERIMENTAL_LEAD_TIME_MODEL=true`; output remains advisory and must not be treated as work duration or a deadline signal.

## Student Productivity Kaggle candidate: access handoff

No authenticated Kaggle access was available in this environment: Kaggle CLI was absent, no `KAGGLE_*` environment variables were present, and standard user Kaggle credential-file locations were absent. The public competition Data and Rules pages did not expose readable rule text or file contents to this session; unauthenticated file listing returned HTTP 401. No rules or terms were accepted and no files were downloaded. Although the public competition listing has described a `productivity_score` target and CC BY 4.0, actual schema, target construction, and terms remain unverified. No second model was trained.

User action required: sign in to Kaggle in a browser; open the competition's **Rules** page and review the rules/terms yourself. Accept only if you choose to. Then open **Data**, download the available competition files, and place the unchanged files in `ml/data/raw/student_productivity/`. Tell us the exact filenames or make them available in this workspace. We can then inspect schemas and semantics before deciding whether training is justified. If Kaggle displays no acceptance gate, files can still be audited first; do not treat a page description as a verified target definition.

## Opt-in Nova task outcome capture (2026-10-19)

Audit finding: the canonical server task store is `data/tasks.json` partitioned by authenticated user ID. `ServerTask` persists `createdAt`, `updatedAt`, status, priority, optional local `dueDate`/`dueTime`, `estimatedMinutes`, and `completedAt`. `estimatedMinutes` defaults to 30 in `createTask`, so the stored value alone does not prove that the user supplied an estimate. Task status changes to `completed` stamp `completedAt`; this is Nova's observed state transition, not independent verification of active work. Reopening clears the task's completion timestamp. No actual effort/work timer is stored. Goals have `targetDate` and status but no dedicated completion timestamp; `updatedAt` is mutable and cannot safely label goal completion time. Projects similarly lack a completion timestamp. Day 7 decision telemetry records recommendation/workflow outcomes, not task-completion labels and prediction-time task features.

A separate minimal record schema was added in `server/mlOutcomeStore.ts` and is stored at `data/task_ml_outcomes.json` using the repository's existing ignored local JSON storage pattern. This is not a new database or external service. A record contains:

```text
schemaVersion: 1
recordId: task-outcome:<taskId>:v1
userId, taskId
predictionTime (task createdAt)
capturedAt (snapshot persistence time)
features:
  createdAt, priority, plannedDueDate, plannedDueTime, timezone,
  taskCategory, estimatedMinutes
  each field = { value: value-or-null, source, observed }
completion: null | {
  eventId, completedAt, completionSource: system_observed,
  elapsedCalendarMinutes, deadlineMet: boolean-or-null,
  deadlineLabelSource: derived-or-unknown
}
```

The schema is strict and rejects additional fields, so title, description, tags, and post-outcome values cannot be added unnoticed. `taskCategory` is currently unavailable in `Task`, and is recorded as null/unobserved. `estimatedMinutes` is captured only if explicitly supplied; the default 30 is never recorded as a user estimate. The authenticated task-creation API marks explicitly supplied fields `user_entered`; internal/tool-created values default to `unknown`. Nova's `createdAt`, timezone read from the planning profile, and completion transition are identified as `system_observed`. Imported and derived provenance are reserved schema values but no import path currently supplies them. Missing values remain null with `observed=false` and `source=unknown`; explicit user-entered null values remain distinguishable.

Collection is **off by default**. The Settings page has a consent checkbox backed by authenticated `GET/PUT /api/profile/ml-outcome-collection`; consent is persisted in the existing per-user planning profile. Only tasks created after opt-in receive a snapshot. Existing tasks, seeded examples, and tasks created already completed are never backfilled. A completion label is recorded only if Nova has an earlier opt-in snapshot for that task. Duplicate snapshots and completion transitions are idempotent. Task deletion removes its record. Turning consent off is saved first to stop future capture and then purges that user's accumulated records; if purging fails, collection remains disabled and the API reports the deletion failure. The normal planning-profile save path cannot turn collection on or off.

Deadline-met labels are derived only when the original planned due date and a valid stored IANA timezone exist. The due date is interpreted in that timezone; a missing due time means end-of-local-day. Otherwise `deadlineMet` is null/unknown, never false by default. `elapsedCalendarMinutes` is elapsed wall-clock time from creation to Nova's completion transition; it is not focused work or active effort. Completion status can be user-marked and may be reopened, so the label has reporting/behavioral limitations. At present the store preserves the first completion event and ignores later completion events for that same task; reopened/recompleted cycles are not represented as separate supervised examples.

The store is scoped by authenticated user ID and the API never accepts a target user ID from the client. The local JSON file follows existing `data/*.json` Git-ignore behavior and is not sent to a provider. It is not encrypted at rest, matching the limitation of the existing local JSON stores; deployments that need stronger protection should add storage encryption/access controls before enabling collection. The feature is currently only for future offline evaluation: it does not feed current rankings, the experimental lead-time model, Gemini, or execution workflows.

### Storage, deletion, and deployment constraints (2026-10-19)

The outcome file is `${SENTINEL_NOVA_DATA_DIR || process.cwd() + '/data'}/task_ml_outcomes.json`; consent remains in the corresponding `planning_profiles.json`. Both are covered by `.gitignore` (including explicit entries for these files), and no outcome snapshot or task payload is logged. Writes use a unique same-directory temporary file followed by rename; Windows replacement retries a bounded number of times for transient sharing violations. On POSIX systems the data directory is set to mode `0700` and these files to `0600`. The HTTP tests verify those mode bits on POSIX and that completed writes leave no temp files. The files are **not encrypted at rest**.

Windows ACLs were inspected and restricted for this checkout's exact runtime directory `F:\OneDrive\Desktop\Grill Training\AI projects\Major Project\AEaas\Sentinel-Nova\data` and its seven existing JSON files. The directory is owned by `DESKTOP-77VI1QH\harim` (the account running this application/tests). `icacls` now shows only that account with Modify, and `BUILTIN\Administrators` plus `NT AUTHORITY\SYSTEM` with Full Control; broad `BUILTIN\Users` and `NT AUTHORITY\Authenticated Users` grants were removed. The directory's inheritable ACL protects future store files. This verification applies only to this local checkout and does not certify another user's deployment ACL. Verify that deployment's actual data path, service identity, and effective ACL before enabling outcome collection there.

The JSON stores (including task/profile stores) hold process-local caches. Atomic rename prevents readers from seeing a partially written replacement, but it does not provide transactions or cross-process locking. Concurrent server processes or instances can have stale caches and overwrite each other's updates. The application is **not safe to run multiple instances/workers against one data directory**; startup now prints an explicit deployment warning. Storage is suitable only for a single server process on one local filesystem, running as a dedicated OS account with restricted filesystem access and protected backups. Do not enable collection for a shared/multi-instance deployment until storage is moved to a transactional, access-controlled system with per-user authorization and tested deletion semantics. Stronger at-rest protection also requires an explicit key-management/rotation and backup-recovery design; the current code makes no encryption claim.

Retention is implemented for the existing lifecycle: task deletion removes that task's outcome record; disabling consent first persists the disabled state and then clears that user's outcome records. Completion records retain only the first completion per task. Reopen/recomplete cycles are not supported as separate training examples; subsequent completion transitions do not change the original record. There is currently no account deletion endpoint or account deletion hook, so no automatic account-wide purge exists. When account deletion is implemented, the deletion workflow must disable collection, call `taskOutcomeStore.clearForUser(userId)`, verify purge success, and only then remove the profile/account; failure to purge must block final deletion or enter a documented retry queue. Until then, operator-managed cleanup is required for account removal. Since task deletion is best-effort with respect to optional telemetry, an outcome-store cleanup failure does not block deleting the task; operators must account for that retention limitation.

The HTTP integration test launches the actual Express server and existing `requireAuth` middleware in a child process whose working directory is a fresh OS temporary directory. Signed test-only sessions exercise the middleware; API failures are checked for data/path leakage. The test covers missing authentication, default-deny and per-user consent, pre-consent tasks completed after opt-in, snapshots only after opt-in, explicit vs default estimates, immutable prediction-time fields, task deletion, completion idempotency across reopen, opt-out purge, and invalid consent bodies. Store tests cover timestamp validation, timezone-based deadline boundaries, record isolation, schema rejection, file mode, and temporary-file cleanup. These checks do not establish multi-process safety, encryption, Windows ACL correctness, or account-deletion behavior.

All TypeScript ML, prediction, LLM, workflow, UX, and Day 7 test scripts now run through `server/agents/tests/runIsolated.ts`. It creates a unique OS-temp directory, sets `SENTINEL_NOVA_DATA_DIR`, spawns the test, and removes only that generated directory after child exit. All server JSON stores use the shared `server/dataDirectory.ts` root. The Python ML suite was audited: it uses temporary directories for generated diagnostic/model fixtures and reads checked-in/ignored model evaluation inputs without writing application JSON stores. A regression test asserts the temp path is outside repository `data/`, writes a marker there, and relies on the runner's checked cleanup. During an earlier pre-isolation run, existing ignored JSON stores were updated; their unknown earlier contents were not restored. Before this final isolated run, hashes of every current `data/` file were captured, and after all tests the file set and all hashes were unchanged. No data content was printed.

Verification after this hardening: `npm run test:ml:outcomes:http`, `npm run test:ml:outcomes`, `npm run test:ml:integration`, `npm run test:ml` (16 Python tests), `npm run test:prediction`, `npm run test:llm`, `npm test` (Day 7: 128 passed; Day 6: 69 passed; UX: 79 passed; workflow: 60 passed), `npm run lint`, and `npm run build` all passed. Vite reports the existing client JavaScript chunk at approximately 919 kB, above its 500 kB warning threshold. The outcome HTTP/store tests and lint were rerun after the final consent persistence adjustment and passed. `git diff --check` passed; runtime outcome/profile JSON names are ignored by Git. No live LLM, external database, model training, or multi-process test was part of this verification.

### Future data sufficiency and evaluation plan

No model was trained from these new records. Training should begin only after opt-in, prospective records exist and a dataset audit verifies timestamps, provenance, missingness, repeat/reopen behavior, and user-level distribution. Do not pool users or export records to another service without a separate explicit consent and privacy review.

- **Completion-time prediction:** target elapsed calendar time from captured creation to first Nova-observed completion. It is not active effort. Compare training-set median and mean baselines with a simple regression on the same chronological held-out users/time window; report MAE, RMSE, median absolute error and R², plus target ranges and drift. Do not use completion timestamp/status, updated fields, or later task edits as input.
- **Deadline-risk classification:** only use tasks with a deadline and timezone captured at prediction time and a completed/valid binary deadline outcome. Report class counts, prevalence, precision/recall, PR-AUC, calibration only if sample size supports it, and a majority/prevalence baseline. Keep missing deadline labels out of the classifier rather than treating them as missed.
- **Personalized prioritization:** a task completion label alone is not a preference label. Any personalization requires consented, timestamped decision snapshots linked to task outcomes and explicit feedback; acceptance/rejection is behavior, not proof that a ranking was good. Evaluate per-user only when that user has enough independent examples; do not silently pool tenants.

An exploratory evaluation gate should require at least 100 valid completed opt-in records in chronological order, with enough earlier records for training and separate later validation/test partitions (for example 70/15/15 as a starting split). This is only a floor for running a pilot, not evidence of adequate statistical power or model quality. Require larger samples where outcomes are imbalanced, tasks repeat, users differ, or subgroup analysis is requested. Prefer multiple prospective time windows, uncertainty intervals, subgroup minimums, and baseline comparisons. Keep predictions disabled unless held-out evidence demonstrates stable improvement and a separate product/privacy review approves use.

### Verification for opt-in outcome capture (2026-10-19)

Passed after the changes: `npm run test:ml:outcomes`; `npm run test:ml:integration` (disabled path; no artifact inference or experimental flag); `npm run test:ml` (16 passed); `npm run test:prediction`; `npm run test:llm`; `npm test` (configured Day 6/7, UX and workflow suites); `npm run lint`; and `npm run build`. The build retains the existing Vite warning for a client bundle larger than 500 kB. No model was trained and no Kaggle data or credentials were accessed.

## Final integration and user-facing capability status (2026-10-19)

The persisted goal store is now the single source for goal context in both the dashboard prediction summary and Nova chat. The prior hard-coded example goals have been removed. The authenticated `/api/chat` path has an HTTP integration check with Gemini explicitly unavailable: a natural-language prioritization request succeeds through the existing orchestrator using deterministic behavior and does not return a fabricated confidence score. Chat UI failures now render as failed responses in the conversation.

The only dataset-trained model remains `task-lead-time-v1`, using the Mendeley Jira workbook. It is an experimental software-issue elapsed-calendar-lead-time regressor and is disabled by default because of severe chronological shift and very negative held-out R². No time-spent, productivity-score, deadline-risk, or Nova completion-probability model is trained. Other relevant runtime estimates remain deterministic heuristics or scheduling calculations; they must not be presented as trained ML.

The Resume page now identifies its ATS/hiring/course metrics as illustrative heuristics and disables disconnected resume-analysis/editing actions. Career projections identify the demo inputs and values as heuristic-only. Digital Twin controls are labelled local-only and do not claim to update the planner. Opportunity search is disabled when no external posting source is configured; manually added opportunities remain session-only with heuristic matching. These pages are prototypes, not integrated persistent user workflows.

The application entry now lazy-loads route page modules. In the latest production build the main JS entry is 230.06 kB and the largest separate chart chunk is 383.11 kB; no individual chunk triggers Vite's 500 kB warning. This is code splitting only, not dependency reduction.

Latest command verification: `npm run test:isolation`, `npm run test:ml:outcomes:http` (including authenticated no-key chat request), `npm run test:ml:outcomes`, `npm run test:ml:integration`, `npm run test:ml` (16 passed), `npm run test:prediction`, `npm run test:llm`, `npm test` (Day 7 128, Day 6 69, UX 79, workflow 60), `python -m unittest discover -s ml/tests` (16 passed), `npm run lint`, `npm run build`, and `git diff --check` passed. The first lint attempt caught a leftover resume callback after disabling the mock operation; it was removed before the successful final lint/build. No live Gemini call, Kaggle download, or new training run occurred.
