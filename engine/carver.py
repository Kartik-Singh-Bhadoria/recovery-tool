"""
Core Streaming File Carving Engine.

This module implements:
1. Strict read-only stream scanning on raw disk images.
2. Byte-by-byte (default) vs sector-aligned scanning with recall-trade-off tracking.
3. Claimed-region tracker to prevent duplicate/corrupted extraction of nested sub-files.
4. Chunked direct-to-disk streaming extraction for constant memory usage.
5. Real-time console progress and periodic .progress.json checkpointing.
"""

import hashlib
import logging
import os
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from .reporter import ProgressCheckpoint, ScanReporter
from .signatures import FileSignature, SignatureRegistry, ValidationResult

logger = logging.getLogger("RecoverySoftware.Carver")


class ClaimedRegionTracker:
    """
    Tracks byte intervals [start, end) that have already been claimed by a carved file.
    
    FORENSIC PRINCIPLE:
    Prevents sub-headers (like EXIF JPEG thumbnails inside a parent JPEG, or compressed
    streams resembling magic numbers) from creating duplicate carved files or corrupting
    outer file boundaries.
    """

    def __init__(self):
        # List of tuples: [(start_offset, end_offset), ...]
        self._regions: List[Tuple[int, int]] = []

    def is_claimed(self, offset: int) -> Optional[Tuple[int, int]]:
        """
        Returns the (start, end) interval if the given offset falls inside an already
        claimed region, or None if the byte is unclaimed.
        """
        for start, end in self._regions:
            if start <= offset < end:
                return (start, end)
        return None

    def claim(self, start: int, end: int):
        """Claims a byte range [start, end) and merges overlapping/adjacent intervals."""
        if start >= end:
            return
        
        new_regions = []
        cur_start, cur_end = start, end
        
        for r_start, r_end in self._regions:
            if cur_end < r_start:
                # Disjoint before
                new_regions.append((r_start, r_end))
            elif cur_start > r_end:
                # Disjoint after
                new_regions.append((r_start, r_end))
            else:
                # Overlapping, expand
                cur_start = min(cur_start, r_start)
                cur_end = max(cur_end, r_end)
                
        new_regions.append((cur_start, cur_end))
        new_regions.sort(key=lambda x: x[0])
        self._regions = new_regions

    def get_all_regions(self) -> List[Tuple[int, int]]:
        return list(self._regions)


@dataclass
class CarvedFile:
    """Metadata representing an identified and extracted file."""
    file_id: int
    signature: FileSignature
    start_offset: int
    end_offset: int
    size_bytes: int
    status: str
    confidence_notes: str
    sha256: str
    output_path: str


class FileCarver:
    """
    Forensic-grade, streaming signature-based file carver.
    
    SAFETY CONSTRAINTS:
    - Never opens source files with write permissions ('rb' only).
    - Writes all outputs to isolated target directory.
    - Streams byte transfers directly in fixed blocks to maintain low memory profile.
    """

    def __init__(
        self,
        source_image_path: str,
        output_dir: str,
        registry: Optional[SignatureRegistry] = None,
        type_filters: Optional[List[str]] = None,
        align: int = 1,
        chunk_size_mb: int = 4,
        checkpoint_interval_mb: int = 10,
        dry_run: bool = False,
    ):
        self.source_image_path = os.path.abspath(source_image_path)
        self.output_dir = os.path.abspath(output_dir)
        self.registry = registry or SignatureRegistry()
        self.signatures = self.registry.get_by_types(type_filters)
        
        # ALIGNMENT TRADE-OFF NOTE:
        # Default is align=1 (byte-by-byte). Setting align=512 or 4096 speeds up scanning
        # on clean sector boundaries, but WILL miss unaligned files in slack space or raw streams.
        self.align = max(1, align)
        if self.align > 1:
            logger.warning(
                f"Sector alignment active (--align {self.align}). "
                "NOTICE: This optimizes speed but trades recall. Unaligned or slack-space files may be missed."
            )
            
        self.chunk_size = chunk_size_mb * 1024 * 1024
        self.checkpoint_interval = checkpoint_interval_mb * 1024 * 1024
        self.dry_run = dry_run
        
        self.claimed_tracker = ClaimedRegionTracker()
        self.reporter = ScanReporter(self.source_image_path, self.output_dir, dry_run=self.dry_run)
        self.recovered_files: List[CarvedFile] = []
        self._next_file_id = 1

    def scan(self) -> List[CarvedFile]:
        """
        Executes the file carving scan against the source disk image.
        """
        if not os.path.exists(self.source_image_path):
            raise FileNotFoundError(f"Source disk image not found: {self.source_image_path}")

        total_image_size = os.path.getsize(self.source_image_path)
        if total_image_size == 0:
            logger.warning("Source disk image is 0 bytes.")
            return []

        # Start reporter and compute chain-of-custody image hash
        self.reporter.start_scan()
        
        start_time = time.time()
        last_checkpoint_offset = 0
        
        # Determine maximum header size among active signatures to size sliding buffer overlap
        max_header_len = max(len(h) for sig in self.signatures for h in sig.headers)
        overlap_size = max(65536, max_header_len * 4)  # 64KB overlap window
        
        logger.info(
            f"Starting scan on '{self.source_image_path}' ({total_image_size / (1024*1024):.2f} MB)\n"
            f"Active signatures: {[s.name for s in self.signatures]}\n"
            f"Scan Stride: {self.align} byte(s) | Chunk Size: {self.chunk_size / (1024*1024):.1f} MB | Dry Run: {self.dry_run}"
        )

        # Open source disk image strictly in binary read-only mode
        with open(self.source_image_path, "rb") as disk_file:
            current_scan_offset = 0
            
            while current_scan_offset < total_image_size:
                # Seek to current scan offset
                disk_file.seek(current_scan_offset)
                read_amount = min(self.chunk_size + overlap_size, total_image_size - current_scan_offset)
                buffer = disk_file.read(read_amount)
                
                if not buffer:
                    break

                # Scan buffer for headers
                buf_len = len(buffer)
                search_limit = buf_len if (current_scan_offset + buf_len >= total_image_size) else (buf_len - overlap_size)
                
                buf_pos = 0
                while buf_pos < search_limit:
                    global_offset = current_scan_offset + buf_pos
                    
                    # Alignment check
                    if self.align > 1 and (global_offset % self.align) != 0:
                        buf_pos += 1
                        continue

                    # Check for signature header matches
                    matched_sig, matched_hdr = self._match_header_at(buffer, buf_pos)
                    
                    if matched_sig is not None:
                        # Check if this offset is inside an already claimed region
                        claimed_parent = self.claimed_tracker.is_claimed(global_offset)
                        if claimed_parent is not None:
                            parent_start, parent_end = claimed_parent
                            # Log nested/skipped detection
                            self.reporter.add_nested_or_skipped(
                                file_type=matched_sig.name,
                                start_offset=global_offset,
                                parent_start=parent_start,
                                parent_end=parent_end,
                                reason="Nested sub-header within claimed region (outer match wins)",
                            )
                            # TODO (Phase 1.x / 2): Future enhancement for format-aware nested parsing (e.g. extracting embedded EXIF thumbnails)
                            buf_pos += max(1, self.align)
                            continue

                        # Resolve end of file and extract
                        carved = self._carve_at_offset(disk_file, global_offset, matched_sig, total_image_size)
                        if carved is not None:
                            self.recovered_files.append(carved)
                    
                    buf_pos += max(1, self.align)

                # Advance chunk
                current_scan_offset += search_limit
                
                # Checkpoint & Progress update
                elapsed = time.time() - start_time
                self._update_progress(current_scan_offset, total_image_size, elapsed)
                
                if (current_scan_offset - last_checkpoint_offset) >= self.checkpoint_interval:
                    self._save_checkpoint(current_scan_offset, total_image_size, elapsed)
                    last_checkpoint_offset = current_scan_offset

        # Finalize
        elapsed = time.time() - start_time
        self._update_progress(total_image_size, total_image_size, elapsed, final=True)
        self._save_checkpoint(total_image_size, total_image_size, elapsed)
        self.reporter.finalize_scan(total_image_size)
        
        logger.info(f"\nScan completed in {elapsed:.2f}s. Recovered {len(self.recovered_files)} files.")
        return self.recovered_files

    def _match_header_at(self, buffer: bytes, pos: int) -> Tuple[Optional[FileSignature], Optional[bytes]]:
        """Checks if any active signature header begins at buffer[pos]."""
        for sig in self.signatures:
            for hdr in sig.headers:
                hdr_len = len(hdr)
                if pos + hdr_len <= len(buffer) and buffer[pos : pos + hdr_len] == hdr:
                    return (sig, hdr)
        return (None, None)

    def _carve_at_offset(
        self,
        disk_file,
        start_offset: int,
        sig: FileSignature,
        total_image_size: int,
    ) -> Optional[CarvedFile]:
        """
        Determines the boundary of a matching file, soft-validates structure,
        and streams extraction directly from disk to output file.
        """
        # Step 1: Read a bounded lookahead buffer from source file to locate footer
        lookahead_len = min(sig.max_size, total_image_size - start_offset)
        disk_file.seek(start_offset)
        lookahead_buf = disk_file.read(lookahead_len)
        
        if len(lookahead_buf) < sig.min_size:
            return None

        # Step 2: Determine file length using format end finder or fallback
        file_len = None
        if sig.end_finder is not None:
            rel_end = sig.end_finder(lookahead_buf, 0)
            if rel_end is not None and rel_end >= sig.min_size:
                file_len = rel_end
        
        # Fallback if no footer found or end finder returned None
        if file_len is None:
            file_len = lookahead_len
            
        end_offset = start_offset + file_len
        
        # Step 3: Soft Validation
        sample_for_validation = lookahead_buf[:file_len]
        val_result = ValidationResult(True, "recovered_high_confidence", "Format structure verified")
        if sig.validator is not None:
            val_result = sig.validator(sample_for_validation)
            
        if not val_result.is_valid:
            # Hard rejection (e.g. totally corrupt header)
            return None

        # Step 4: Claim region to prevent internal re-carving
        self.claimed_tracker.claim(start_offset, end_offset)

        # Step 5: Streamed Extraction to destination file (in 64KB blocks)
        file_id = self._next_file_id
        self._next_file_id += 1
        
        filename = f"recovered_{file_id:04d}.{sig.extension}"
        dest_path = os.path.join(self.output_dir, filename)
        
        sha256_hash = self._stream_extract(
            disk_file=disk_file,
            start_offset=start_offset,
            length=file_len,
            dest_path=dest_path if not self.dry_run else None,
        )

        carved = CarvedFile(
            file_id=file_id,
            signature=sig,
            start_offset=start_offset,
            end_offset=end_offset,
            size_bytes=file_len,
            status=val_result.status if not self.dry_run else "dry_run",
            confidence_notes=val_result.notes,
            sha256=sha256_hash,
            output_path=dest_path if not self.dry_run else "(dry run)",
        )

        self.reporter.add_recovered(
            file_id=file_id,
            filename=filename,
            file_type=sig.name,
            extension=sig.extension,
            start_offset=start_offset,
            end_offset=end_offset,
            size_bytes=file_len,
            status=carved.status,
            confidence_notes=carved.confidence_notes,
            sha256_hash=sha256_hash,
        )

        logger.info(
            f" [FOUND #{file_id:04d}] {sig.name} at 0x{start_offset:08X} - 0x{end_offset:08X} "
            f"({file_len:,} bytes) [{carved.status}]"
        )
        return carved

    def _stream_extract(
        self,
        disk_file,
        start_offset: int,
        length: int,
        dest_path: Optional[str],
        block_size: int = 64 * 1024,
    ) -> str:
        """
        Streams bytes directly from disk_file to dest_path in fixed chunks,
        computing SHA256 simultaneously without loading whole file into memory.
        """
        hasher = hashlib.sha256()
        disk_file.seek(start_offset)
        remaining = length

        out_file = None
        if dest_path:
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            out_file = open(dest_path, "wb")

        try:
            while remaining > 0:
                to_read = min(block_size, remaining)
                chunk = disk_file.read(to_read)
                if not chunk:
                    break
                hasher.update(chunk)
                if out_file:
                    out_file.write(chunk)
                remaining -= len(chunk)
        finally:
            if out_file:
                out_file.close()

        return hasher.hexdigest()

    def recover_from_report(
        self,
        report_path: str,
        selected_ids: Optional[List[int]] = None,
    ) -> List[CarvedFile]:
        """
        Performs targeted, instant extraction of selected files from an existing scan report.
        Seeks directly to known start offsets, reads exact byte counts, and verifies hashes.
        Zero redundant re-scanning of the source drive.
        """
        import json
        if not os.path.exists(report_path):
            raise FileNotFoundError(f"Scan report not found: {report_path}")
        
        with open(report_path, "r", encoding="utf-8") as f:
            report_data = json.load(f)

        records = report_data.get("recovered_files", [])
        if selected_ids:
            target_ids = set(selected_ids)
            records = [r for r in records if r["file_id"] in target_ids]

        if not records:
            logger.warning("No files matched the selected IDs for recovery.")
            return []

        os.makedirs(self.output_dir, exist_ok=True)
        results = []

        logger.info(f"Initiating targeted recovery of {len(records)} file(s) from '{self.source_image_path}'...")
        
        with open(self.source_image_path, "rb") as disk_file:
            for rec in records:
                file_id = rec["file_id"]
                filename = rec["filename"]
                dest_path = os.path.join(self.output_dir, filename)
                start_offset = rec["start_offset_dec"]
                length = rec["size_bytes"]
                expected_sha = rec.get("sha256", "")
                
                # Stream extraction directly to target file
                actual_sha = self._stream_extract(
                    disk_file=disk_file,
                    start_offset=start_offset,
                    length=length,
                    dest_path=dest_path,
                )

                if expected_sha and actual_sha.lower() != expected_sha.lower():
                    logger.warning(
                        f" [HASH MISMATCH #{file_id:04d}] Expected {expected_sha[:8]}..., extracted {actual_sha[:8]}..."
                    )
                else:
                    logger.info(
                        f" [EXTRACTED #{file_id:04d}] {filename} ({length:,} bytes) -> {dest_path}"
                    )

                carved = CarvedFile(
                    file_id=file_id,
                    signature=FileSignature(
                        name=rec["file_type"],
                        extension=rec["extension"],
                        headers=[],
                    ),
                    start_offset=start_offset,
                    end_offset=rec["end_offset_dec"],
                    size_bytes=length,
                    status=rec["status"],
                    confidence_notes=rec.get("confidence_notes", ""),
                    sha256=actual_sha,
                    output_path=dest_path,
                )
                results.append(carved)

        logger.info(f"Targeted recovery complete: {len(results)} file(s) written to {self.output_dir}.")
        return results

    def _update_progress(self, current_offset: int, total_size: int, elapsed: float, final: bool = False):
        """Displays formatted real-time scan progress in terminal."""
        pct = (current_offset / max(1, total_size)) * 100
        mb_scanned = current_offset / (1024 * 1024)
        mbps = mb_scanned / max(0.001, elapsed)
        detections = len(self.recovered_files)
        
        progress_str = (
            f"\rScanning: {pct:5.1f}% | Offset: 0x{current_offset:08X} ({mb_scanned:6.1f} MB) | "
            f"Speed: {mbps:5.1f} MB/s | Detections: {detections:3d}"
        )
        sys.stdout.write(progress_str)
        if final:
            sys.stdout.write("\n")
        sys.stdout.flush()

    def _save_checkpoint(self, current_offset: int, total_size: int, elapsed: float):
        """Flushes a lightweight progress snapshot to .progress.json in output directory."""
        pct = (current_offset / max(1, total_size)) * 100
        mb_scanned = current_offset / (1024 * 1024)
        mbps = mb_scanned / max(0.001, elapsed)
        
        checkpoint = ProgressCheckpoint(
            current_offset=current_offset,
            total_bytes=total_size,
            percent_complete=round(pct, 2),
            detections_count=len(self.recovered_files),
            recovered_count=len(self.recovered_files) if not self.dry_run else 0,
            elapsed_seconds=round(elapsed, 2),
            scan_speed_mbps=round(mbps, 2),
        )
        checkpoint.save_to_file(self.output_dir)
