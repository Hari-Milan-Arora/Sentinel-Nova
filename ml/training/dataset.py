"""Auditable dataset discovery, target construction, and chronological splitting."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import hashlib

import numpy as np
import pandas as pd


REQUIRED_COLUMNS = ("Summary", "Status", "Priority", "Created", "Resolved")
COMPLETED_STATUSES = {"done", "closed", "resolved", "complete", "completed"}
CANCELLED_STATUSES = {"cancelled", "canceled", "invalid", "won't do", "wont do"}
TARGET_NAME = "task_completion_lead_time"
TARGET_UNITS = "elapsed_calendar_days"


@dataclass
class PreparedDataset:
    rows: pd.DataFrame
    audit: dict[str, Any]
    source_path: Path
    source_sha256: str
    sheet_name: str


def discover_dataset(repository_root: Path) -> list[Path]:
    """Find supported dataset files directly in the repository root."""
    supported = {".xlsx", ".xls", ".csv", ".json", ".parquet", ".zip", ".gz"}
    repository_metadata = {"metadata.json", "package.json", "package-lock.json"}
    return sorted(
        (path for path in repository_root.iterdir()
         if path.is_file() and path.suffix.lower() in supported and path.name.casefold() not in repository_metadata),
        key=lambda path: path.name.casefold(),
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_dataset(path: Path) -> PreparedDataset:
    """Validate the observed workbook and construct elapsed lead-time targets.

    Rows sharing a Summary are excluded because the workbook has no stable task
    identifier with which to distinguish duplicate issues or keep them together
    in a chronological split. No other row is silently deduplicated.
    """
    path = path.resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Dataset not found: {path.name}")
    if path.suffix.lower() not in {".xlsx", ".xls"}:
        raise ValueError("The inspected root dataset is expected to be an Excel workbook.")

    workbook = pd.ExcelFile(path)
    if not workbook.sheet_names:
        raise ValueError("Dataset workbook has no worksheets.")
    sheet_name = workbook.sheet_names[0]
    frame = pd.read_excel(workbook, sheet_name=sheet_name)
    missing_columns = sorted(set(REQUIRED_COLUMNS) - set(frame.columns.astype(str)))
    if missing_columns:
        raise ValueError("Dataset schema is missing required columns: " + ", ".join(missing_columns))

    source_row_count = int(len(frame))
    duplicate_full_rows = int(frame.duplicated().sum())

    # Keep source rows intact in the audit; remove exact repeated records only.
    frame = frame.drop_duplicates(keep="first").copy()
    summary = frame["Summary"].astype("string").str.strip()
    status = frame["Status"].astype("string").str.strip().str.casefold()
    created = pd.to_datetime(frame["Created"], errors="coerce")
    resolved = pd.to_datetime(frame["Resolved"], errors="coerce")

    summary_missing = summary.isna() | summary.eq("")
    created_missing = frame["Created"].isna()
    resolved_missing = frame["Resolved"].isna()
    created_parse_failed = ~created_missing & created.isna()
    resolved_parse_failed = ~resolved_missing & resolved.isna()
    completed = status.isin(COMPLETED_STATUSES)
    cancelled = status.isin(CANCELLED_STATUSES)
    lead_days = (resolved - created).dt.total_seconds() / 86400.0
    invalid_order = created.notna() & resolved.notna() & (lead_days <= 0)

    base_eligible = (
        completed
        & ~summary_missing
        & created.notna()
        & resolved.notna()
        & np.isfinite(lead_days)
        & (lead_days > 0)
    )
    candidate = frame.loc[base_eligible].copy()
    candidate["_created_at"] = created.loc[base_eligible]
    candidate["_resolved_at"] = resolved.loc[base_eligible]
    candidate["_lead_time_days"] = lead_days.loc[base_eligible].astype(float)
    candidate["_summary_key"] = summary.loc[base_eligible].str.casefold()

    repeated_summary = candidate["_summary_key"].duplicated(keep=False)
    duplicate_summary_rows_excluded = int(repeated_summary.sum())
    candidate = candidate.loc[~repeated_summary].copy()
    if candidate.empty:
        raise ValueError("No eligible unique-title resolved tasks remain after validation.")

    audit = {
        "source_rows": source_row_count,
        "duplicate_full_rows_removed": duplicate_full_rows,
        "rows_with_missing_or_blank_summary": int(summary_missing.sum()),
        "rows_with_missing_created_timestamp": int(created_missing.sum()),
        "rows_with_created_timestamp_parse_failure": int(created_parse_failed.sum()),
        "rows_with_missing_resolved_timestamp": int(resolved_missing.sum()),
        "rows_with_resolved_timestamp_parse_failure": int(resolved_parse_failed.sum()),
        "rows_not_in_completed_status": int((~completed).sum()),
        "rows_with_cancelled_or_invalid_status": int(cancelled.sum()),
        "rows_with_nonpositive_lead_time": int(invalid_order.sum()),
        "eligible_completed_rows_before_duplicate_title_filter": int(base_eligible.sum()),
        "duplicate_title_rows_excluded": duplicate_summary_rows_excluded,
        "usable_rows": int(len(candidate)),
        "unresolved_or_not_completed_rows": int((~completed).sum()),
        "target_summary_days": {
            "min": float(candidate["_lead_time_days"].min()),
            "median": float(candidate["_lead_time_days"].median()),
            "p90": float(candidate["_lead_time_days"].quantile(0.90)),
            "p95": float(candidate["_lead_time_days"].quantile(0.95)),
            "p99": float(candidate["_lead_time_days"].quantile(0.99)),
            "max": float(candidate["_lead_time_days"].max()),
        },
    }

    # Model features are deliberately narrower than the workbook schema.
    # Summary is the issue title available to Nova; all other workbook columns,
    # including mutable Priority/Labels/Description and post-outcome Status and
    # Resolved, are excluded from fitting.
    candidate["Summary"] = summary.loc[candidate.index].astype(str)
    return PreparedDataset(
        rows=candidate.sort_values(["_created_at", "_summary_key"], kind="mergesort").reset_index(drop=True),
        audit=audit,
        source_path=path,
        source_sha256=sha256_file(path),
        sheet_name=str(sheet_name),
    )


def chronological_split(rows: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Chronological 70/15/15 split; duplicate titles were removed beforehand."""
    if len(rows) < 30:
        raise ValueError("At least 30 eligible records are required for chronological evaluation.")
    ordered = rows.sort_values(["_created_at", "_summary_key"], kind="mergesort").reset_index(drop=True)
    train_end = int(len(ordered) * 0.70)
    validation_end = int(len(ordered) * 0.85)
    if train_end < 1 or validation_end <= train_end or validation_end >= len(ordered):
        raise ValueError("Dataset is too small for non-empty train, validation, and test partitions.")
    train = ordered.iloc[:train_end].copy()
    validation = ordered.iloc[train_end:validation_end].copy()
    test = ordered.iloc[validation_end:].copy()
    return train, validation, test
