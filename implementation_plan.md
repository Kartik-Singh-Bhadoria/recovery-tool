# Phase 1 Implementation Plan — Signature-Based File Carving Engine

A forensic-grade, read-only signature-based file carver in Python designed to scan raw disk images (`.img`, `.dd`, `.raw`), identify file headers and footers (magic numbers), handle variable lengths/edge cases, and extract files safely with detailed audit logging.

## Core Safety Constraints
- **Strict Read-Only Access:** Source disk image is opened strictly with mode `"rb"`. No write permissions are ever requested on the source image.
- **Isolated Target Directory:** All recovered files and scan reports are directed to a distinct output directory.
- **Audit Logging:** Every scan event, identified signature, offset, byte length, and SHA256 checksum is recorded in both CLI logs and structured reports (`scan_report.json` and `scan_report.csv`).

---

## Architecture & Proposed Changes

```
Recovery_Software/
├── engine/
│   ├── __init__.py
│   ├── signatures.py       # Extensible signature registry (JPEG, PNG, PDF, ZIP) & validators
│   ├── carver.py           # Core streaming engine, chunk sliding buffer, file extractor
│   └── reporter.py         # Audit logger and report generator (JSON/CSV with SHA256)
├── tests/
│   ├── __init__.py
│   ├── generate_test_image.py  # Test image builder with real sample files & ground truth manifest
│   └── test_carver.py          # Automated verification test suite
├── main.py                 # CLI interface with argparse, dry-run, type filtering, alignment options
└── README.md               # Project documentation, digital forensics internals & usage guide
```

---

### Component Details

#### 1. Signature Definitions & Validators (`engine/signatures.py`)
- **Config-driven format definitions:** Uses dataclasses / dictionary-based registry rather than hardcoded if/else chains.
- **Supported Formats in Phase 1:**
  - **JPEG:** Header `\xFF\xD8\xFF`, Footer `\xFF\xD9`, handles EXIF metadata & multiple SOS markers.
  - **PNG:** Header `\x89PNG\r\n\x1a\n` (`\x89\x50\x4E\x47\x0D\x0A\x1A\x0A`), Footer `IEND` chunk (`\x00\x00\x00\x00\x49\x45\x4E\x44\xAE\x42\x60\x82`).
  - **PDF:** Header `%PDF-` (`\x25\x50\x44\x46\x2D`), Footer `%%EOF` (`\x25\x25\x45\x4F\x46`) with allowance for trailing newline/whitespace padding.
  - **ZIP / Office XML:** Header `PK\x03\x04` (`\x50\x4B\x03\x04`), scans for End of Central Directory (EOCD) `PK\x05\x06` (`\x50\x4B\x05\x06`) and parses comment length field to determine exact byte boundary.
- **Fallback & Size Limits:** Max file size caps per format to prevent runaway carving on corrupt media or missing footers.
- **Validation logic:** Quick sanity checks (e.g. verifying PNG IEND CRC or PDF header version) to reject false positives.

#### 2. Streaming Carving Engine (`engine/carver.py`)
- **Sliding Window Buffer:** Scans large multi-gigabyte disk images efficiently in configurable chunks (default 4MB or 8MB) with an overlap buffer matching the max header/footer window so signatures spanning chunk boundaries are never missed.
- **Alignment Modes:** Supports both byte-by-byte scanning (offset step = 1) and sector-aligned scanning (512-byte / 4096-byte boundaries) for real-world speed optimization.
- **Progress Tracking:** Real-time console progress bar with scanned offset, percentage, scan speed (MB/s), and live detection count.
- **Dry-Run Capability:** Scans and outputs the complete recovery report without writing extracted files to disk.

#### 3. Audit Logging & Reporting (`engine/reporter.py`)
- Writes output files as `recovered_<index:04d>.<ext>`.
- Computes SHA256 hashes for all extracted files for chain-of-custody verification.
- Emits `scan_report.json` and `scan_report.csv` containing:
  - File index & output filename
  - Detected file type & MIME
  - Start offset (Decimal & Hex `0x...`)
  - End offset & Carved byte size
  - Extraction status & SHA256 hash

#### 4. Synthetic Test Image Generator (`tests/generate_test_image.py`)
- Creates a synthetic `.img` file (e.g., 20 MB).
- Generates valid sample JPEG, PNG, PDF, and ZIP files.
- Writes these files at specific offsets separated by zeroed sectors and random noise bytes.
- Produces a ground-truth `manifest.json` recording the exact offsets and sizes to benchmark carving accuracy.

#### 5. CLI Interface (`main.py`)
- Command line arguments via `argparse`:
  - `-i, --image`: Path to raw disk image.
  - `-o, --output`: Directory to save recovered files and reports.
  - `-t, --types`: Comma-separated list of types to recover (e.g. `jpeg,png,pdf,zip`). Default: all.
  - `--dry-run`: Only scan and report without saving carved files.
  - `--align`: Sector alignment (`1`, `512`, `4096`). Default: `512` with fallback option `1`.
  - `--chunk-size`: Buffer size in MB (default 4MB).
  - `--verbose`: Detailed debug logging.

---

## Forensics Concepts & Edge Cases Documented in Code
1. **Fragmentation:** Explaining why signature carving fails on non-contiguous clusters and how Phase 2 (FAT32 chain tracking) solves this.
2. **Embedded Sub-files:** Distinguishing embedded thumbnails (e.g. EXIF JPEGs inside larger JPEGs) and nested ZIP entries.
3. **Missing Footers & Runaway Carving:** Handling formats without rigid footers using bounded heuristics.
4. **Sector Slack & Padding:** Accounting for sector-alignment padding at the end of files.

---

## Verification Plan

### Automated Tests
1. **Test Image Generation:** Run `tests/generate_test_image.py` to create `test_disk.img` and ground-truth `expected_manifest.json`.
2. **Carver Execution:** Run `main.py` against `test_disk.img` with both `--dry-run` and normal extraction mode.
3. **Ground Truth Validation (`tests/test_carver.py`):**
   - Verify 100% precision and recall against the manifest (all JPEG, PNG, PDF, ZIP files recovered).
   - Validate integrity of recovered files (valid headers, openable files, matching SHA256 checksums).
4. **Boundary Overlap Testing:** Verify files that cross chunk boundaries (e.g., across 4MB boundaries) are correctly identified and extracted without truncation.

### Manual Verification
- Inspect the generated `scan_report.json` and `scan_report.csv`.
- Open the carved image files, PDF, and ZIP archives directly to confirm zero corruption.
