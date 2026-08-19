# Forensic File Recovery Tool (Forensic Carving Engine)

A real-world, high-performance forensic file carver written in Python. Designed for digital forensics investigations, incident response, and data recovery from raw disk images (`.img`, `.dd`, `.raw`).

Built with strict read-only safety guarantees, constant-memory chunked streaming, format soft-validation, and chain-of-custody audit reporting.

---

## Architecture (Phase 1)

```
Recovery_Software/
├── engine/
│   ├── __init__.py
│   ├── signatures.py       # Extensible signature registry (JPEG, PNG, PDF, ZIP) & soft-validators
│   ├── carver.py           # Streaming carver, claimed-region tracker, chunked extractor
│   └── reporter.py         # Source SHA256 chain-of-custody, audit logs (JSON/CSV), .progress.json
├── tests/
│   ├── __init__.py
│   ├── generate_test_image.py  # Synthetic test disk image + ground truth manifest generator
│   └── test_carver.py          # Automated verification test suite
├── main.py                 # CLI interface with argparse, dry-run, and alignment controls
└── README.md               # Project documentation & forensics internals
```

---

## Core Safety Constraints & Forensic Principles

1. **Strict Read-Only Access (`"rb"` Mode):**
   The carver **never** requests write or modify permissions on the source image/drive.
2. **Chain of Custody Anchoring (`source_image_sha256`):**
   Before scanning commences, a streaming SHA256 hash of the entire source disk image is calculated and recorded in the audit report.
3. **Claimed-Region Tracking (Outer Match Wins):**
   Prevents sub-headers (such as EXIF JPEG thumbnails embedded inside digital camera photos) from corrupting extraction or triggering duplicate carved files. Sub-headers are recorded in `nested_or_skipped` in the report.
4. **Chunked Direct-to-Disk Streaming:**
   File extraction streams directly from the source image file handle to the output directory in fixed 64KB chunks while calculating SHA256 hashes on the fly. Large files never cause memory spikes.
5. **Soft-Validation (Low-Confidence Recovery):**
   Corrupted checksums (e.g. damaged PNG IEND CRC) are flagged with `status: "recovered_low_confidence"` and carved anyway, preserving recoverable partial data.
6. **Resumability Checkpoints (`.progress.json`):**
   Periodically snapshots byte offsets and detections to enable future resumable scans.

---

## The Sector Alignment Trade-off (`--align 1` vs `--align 512`)

* **Default: `--align 1` (Byte-by-Byte Scanning):**
  Guarantees **100% recall**. Deleted files residing in slack space, unallocated sectors, or corrupted partition tables rarely align to 512-byte sector boundaries.
* **Opt-In: `--align 512` / `--align 4096` (Sector Alignment):**
  Skips non-sector-aligned offsets. This dramatically accelerates scan speed on massive disk images, but trades recall for speed and **will miss unaligned files**.

---

## Supported File Formats

| Format | Header Signature | Footer / End Detection | Max Size Cap | Validation |
| :--- | :--- | :--- | :--- | :--- |
| **JPEG** | `FF D8 FF` (SOI) | `FF D9` (EOI) | 30 MB | SOI/EOI structural check |
| **PNG** | `89 50 4E 47 0D 0A 1A 0A` | `IEND` Chunk (`00 00 00 00 49 45 4E 44 AE 42 60 82`) | 40 MB | IEND CRC32 check |
| **PDF** | `25 50 44 46 2D` (`%PDF-`) | `25 25 45 4F 46` (`%%EOF`) | 100 MB | Trailer boundary check |
| **ZIP / Office** | `50 4B 03 04` (`PK\x03\x04`) | `50 4B 05 06` (EOCD Record + Comment Length) | 150 MB | EOCD structure check |

---

## Usage Guide

### 1. Generate Synthetic Test Disk Image
```bash
python tests/generate_test_image.py
```
This generates `test_disk.img` (10 MB) embedded with real sample JPEG, PNG, PDF, and ZIP files at aligned and unaligned offsets, alongside `expected_manifest.json`.

### 2. Run Automated Verification Test Suite
```bash
python -m unittest tests/test_carver.py -v
```

### 3. Run the File Carver CLI
```bash
# Standard carving with full byte-by-byte recall
python main.py -i test_disk.img -o ./recovered_output

# Dry-run mode (scan and generate reports without writing files)
python main.py -i test_disk.img -o ./recovered_output --dry-run

# Filter specific file types
python main.py -i test_disk.img -o ./recovered_output -t jpeg,png

# Sector-aligned speed mode (faster, trades recall)
python main.py -i test_disk.img -o ./recovered_output --align 512

# List all registered file signatures
python main.py --list-signatures
```

---

## Forensic Deep Dive: File Carving vs Filesystem Recovery

### Why Pure Carving Has Limitations
- **Contiguity Assumption:** Pure signature carving assumes file clusters are laid out sequentially on disk. If a file is **fragmented** (stored in non-contiguous clusters across the platter/NAND), carving captures interleaved foreign data, resulting in corrupted files.
- **Lost Metadata:** Pure carving recovers file content but cannot recover original filenames, directory paths, modification timestamps, or permissions.

### How Deletion Differs in Filesystems (Phase 2 Preview)

| Feature | FAT32 Deletion | NTFS Deletion |
| :--- | :--- | :--- |
| **Directory Record** | First character of 8.3 filename replaced with `0xE5` (`\xE5`). Directory entry still retains file size, starting cluster, and timestamps. | File record marked inactive in Master File Table (`$MFT`). Flag changed from `0x01` (In-Use) to `0x00` (Deleted). |
| **Cluster Chain Tracking** | FAT entries for the file's clusters are zeroed out (marked free). Starting cluster is retained in directory entry. If unfragmented, full file can be recovered with original name! | Data runs (non-resident cluster allocation map) inside the `$MFT` `$DATA` attribute often remain completely intact until overwritten! |
| **Filenames & Paths** | Long File Name (LFN) directory entries preceding the main entry are also marked `0xE5`. | Stored in `$FILE_NAME` attribute inside the `$MFT` record, including parent directory `$MFT` record reference. |
