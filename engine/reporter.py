"""
Audit Reporter, Checkpoint Tracker, and Chain of Custody Hasher.

This module provides:
1. Streaming SHA256 computation for whole source disk images and carved files.
2. Lightweight checkpoint management (.progress.json) for scan progress tracking.
3. Comprehensive forensic reporting in both JSON and CSV formats.
"""

import csv
import hashlib
import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


logger = logging.getLogger("RecoverySoftware.Reporter")


def compute_file_sha256(filepath: str, chunk_size: int = 1024 * 1024) -> str:
    """
    Computes SHA256 checksum of a file by streaming in fixed chunks.
    Guarantees strict read-only access and constant memory footprint.
    """
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


@dataclass
class ProgressCheckpoint:
    """Represents a lightweight snapshot of ongoing scan progress."""
    current_offset: int
    total_bytes: int
    percent_complete: float
    detections_count: int
    recovered_count: int
    elapsed_seconds: float
    scan_speed_mbps: float
    timestamp_utc: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def save_to_file(self, output_dir: str, filename: str = ".progress.json"):
        """Atomically saves checkpoint to JSON in the output directory."""
        os.makedirs(output_dir, exist_ok=True)
        checkpoint_path = os.path.join(output_dir, filename)
        temp_path = checkpoint_path + ".tmp"
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(asdict(self), f, indent=2)
            # Atomic replace
            if os.path.exists(checkpoint_path):
                os.replace(temp_path, checkpoint_path)
            else:
                os.rename(temp_path, checkpoint_path)
        except Exception as exc:
            logger.warning(f"Failed to write progress checkpoint: {exc}")


@dataclass
class CarvedRecord:
    """Detailed metadata for a single carved file."""
    file_id: int
    filename: str
    file_type: str
    extension: str
    start_offset_dec: int
    start_offset_hex: str
    end_offset_dec: int
    end_offset_hex: str
    size_bytes: int
    status: str
    confidence_notes: str
    sha256: str


@dataclass
class NestedMatchRecord:
    """Records sub-header detections found inside already-claimed byte ranges."""
    file_type: str
    start_offset_dec: int
    start_offset_hex: str
    parent_range_hex: str
    reason: str


class ScanReporter:
    """
    Forensic audit logger and structured report generator.
    Produces scan_report.json and scan_report.csv adhering to forensic integrity standards.
    """

    def __init__(self, source_image_path: str, output_dir: str, dry_run: bool = False):
        self.source_image_path = os.path.abspath(source_image_path)
        self.output_dir = os.path.abspath(output_dir)
        self.dry_run = dry_run
        
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.source_image_size: int = 0
        self.source_image_sha256: str = ""
        
        self.recovered_records: List[CarvedRecord] = []
        self.nested_or_skipped: List[NestedMatchRecord] = []
        self.total_bytes_scanned: int = 0

    def start_scan(self):
        """Initializes the scan session and computes source image hash."""
        self.start_time = datetime.now(timezone.utc)
        self.source_image_size = os.path.getsize(self.source_image_path)
        
        logger.info(f"Computing source image SHA256: {self.source_image_path}")
        self.source_image_sha256 = compute_file_sha256(self.source_image_path)
        logger.info(f"Source SHA256: {self.source_image_sha256}")

    def add_recovered(
        self,
        file_id: int,
        filename: str,
        file_type: str,
        extension: str,
        start_offset: int,
        end_offset: int,
        size_bytes: int,
        status: str,
        confidence_notes: str,
        sha256_hash: str,
    ):
        """Registers a recovered or dry-run carved file."""
        record = CarvedRecord(
            file_id=file_id,
            filename=filename,
            file_type=file_type,
            extension=extension,
            start_offset_dec=start_offset,
            start_offset_hex=f"0x{start_offset:08X}",
            end_offset_dec=end_offset,
            end_offset_hex=f"0x{end_offset:08X}",
            size_bytes=size_bytes,
            status=status,
            confidence_notes=confidence_notes,
            sha256=sha256_hash,
        )
        self.recovered_records.append(record)

    def add_nested_or_skipped(
        self,
        file_type: str,
        start_offset: int,
        parent_start: int,
        parent_end: int,
        reason: str,
    ):
        """Registers a skipped or nested signature detection."""
        record = NestedMatchRecord(
            file_type=file_type,
            start_offset_dec=start_offset,
            start_offset_hex=f"0x{start_offset:08X}",
            parent_range_hex=f"[0x{parent_start:08X} - 0x{parent_end:08X}]",
            reason=reason,
        )
        self.nested_or_skipped.append(record)

    def finalize_scan(self, total_bytes_scanned: int):
        """Marks scan completion and exports all reports."""
        self.end_time = datetime.now(timezone.utc)
        self.total_bytes_scanned = total_bytes_scanned
        
        os.makedirs(self.output_dir, exist_ok=True)
        self._export_json()
        self._export_csv()

    def _export_json(self):
        """Generates comprehensive scan_report.json."""
        elapsed = (self.end_time - self.start_time).total_seconds() if self.end_time and self.start_time else 0.0
        
        report_data = {
            "forensic_tool": "RecoverySoftware File Carver",
            "version": "1.0.0 (Phase 1)",
            "dry_run": self.dry_run,
            "scan_metadata": {
                "source_image_path": self.source_image_path,
                "source_image_size_bytes": self.source_image_size,
                "source_image_sha256": self.source_image_sha256,
                "scan_start_utc": self.start_time.isoformat() if self.start_time else None,
                "scan_end_utc": self.end_time.isoformat() if self.end_time else None,
                "elapsed_seconds": round(elapsed, 2),
                "total_bytes_scanned": self.total_bytes_scanned,
                "scan_throughput_mbps": round((self.total_bytes_scanned / (1024 * 1024)) / max(elapsed, 0.001), 2),
            },
            "summary": {
                "total_recovered_files": len(self.recovered_records),
                "high_confidence_count": sum(1 for r in self.recovered_records if r.status == "recovered_high_confidence"),
                "low_confidence_count": sum(1 for r in self.recovered_records if r.status == "recovered_low_confidence"),
                "nested_or_skipped_count": len(self.nested_or_skipped),
            },
            "recovered_files": [asdict(r) for r in self.recovered_records],
            "nested_or_skipped": [asdict(r) for r in self.nested_or_skipped],
        }
        
        report_path = os.path.join(self.output_dir, "scan_report.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)
        logger.info(f"Saved audit report: {report_path}")

    def _export_csv(self):
        """Generates scan_report.csv for spreadsheet review."""
        report_path = os.path.join(self.output_dir, "scan_report.csv")
        with open(report_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "File_ID",
                "Filename",
                "File_Type",
                "Extension",
                "Start_Offset_Dec",
                "Start_Offset_Hex",
                "End_Offset_Dec",
                "End_Offset_Hex",
                "Size_Bytes",
                "Status",
                "Confidence_Notes",
                "SHA256",
            ])
            for r in self.recovered_records:
                writer.writerow([
                    r.file_id,
                    r.filename,
                    r.file_type,
                    r.extension,
                    r.start_offset_dec,
                    r.start_offset_hex,
                    r.end_offset_dec,
                    r.end_offset_hex,
                    r.size_bytes,
                    r.status,
                    r.confidence_notes,
                    r.sha256,
                ])
        logger.info(f"Saved CSV audit log: {report_path}")
