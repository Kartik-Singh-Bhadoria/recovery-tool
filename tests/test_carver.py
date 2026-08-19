"""
Automated Test Suite for Forensic File Carver (Phase 1).

Tests:
1. Full end-to-end recovery against ground truth manifest (100% precision & recall, matching SHA256).
2. Soft-validation behavior on corrupted files (recovered_low_confidence).
3. Claimed-region tracker handling of embedded sub-headers (nested_or_skipped).
4. Sector alignment recall trade-off (--align 1 vs --align 512).
5. File type filtering (--types).
6. Dry-run mode safety (no files written to disk).
7. Progress checkpoint generation (.progress.json).
"""

import json
import os
import shutil
import unittest

from engine.carver import FileCarver
from engine.signatures import SignatureRegistry
from tests.generate_test_image import build_test_disk_image


class TestFileCarver(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "scratch"))
        os.makedirs(cls.test_dir, exist_ok=True)
        
        cls.image_path = os.path.join(cls.test_dir, "test_disk.img")
        cls.manifest_path = os.path.join(cls.test_dir, "expected_manifest.json")
        
        # Build 10MB test image
        build_test_disk_image(
            image_path=cls.image_path,
            manifest_path=cls.manifest_path,
            disk_size_mb=10,
        )
        
        with open(cls.manifest_path, "r", encoding="utf-8") as f:
            cls.manifest = json.load(f)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.test_dir):
            shutil.rmtree(cls.test_dir, ignore_errors=True)

    def test_01_full_recovery_default_align(self):
        """Tests 100% recall & precision in default byte-by-byte alignment mode."""
        output_dir = os.path.join(self.test_dir, "out_full_recovery")
        registry = SignatureRegistry()
        
        carver = FileCarver(
            source_image_path=self.image_path,
            output_dir=output_dir,
            registry=registry,
            align=1,  # Byte-by-byte default
            dry_run=False,
        )
        recovered = carver.scan()

        # Load scan report
        report_path = os.path.join(output_dir, "scan_report.json")
        self.assertTrue(os.path.exists(report_path), "scan_report.json must be generated")
        
        with open(report_path, "r", encoding="utf-8") as f:
            report = json.load(f)

        # 1. Source image SHA256 chain-of-custody test
        self.assertEqual(
            report["scan_metadata"]["source_image_sha256"],
            self.manifest["disk_image_sha256"],
            "Source disk image SHA256 in report must match expected disk image hash",
        )

        # 2. Check total recovered files count
        expected_files = self.manifest["files"]
        self.assertEqual(
            len(recovered),
            len(expected_files),
            f"Expected {len(expected_files)} files recovered, got {len(recovered)}",
        )

        # 3. Match each expected file in ground truth manifest
        for exp in expected_files:
            matching_carved = [r for r in recovered if r.start_offset == exp["start_offset"]]
            self.assertEqual(
                len(matching_carved), 1,
                f"Ground truth file at offset {exp['start_offset']} ({exp['name']}) must be carved exactly once",
            )
            carved = matching_carved[0]
            self.assertEqual(carved.size_bytes, exp["size_bytes"], f"Size mismatch for {exp['name']}")
            self.assertEqual(carved.sha256, exp["sha256"], f"SHA256 mismatch for {exp['name']}")
            self.assertEqual(carved.status, exp["expected_status"], f"Status mismatch for {exp['name']}")
            self.assertTrue(os.path.exists(carved.output_path), f"Carved file not found at {carved.output_path}")

        # 4. Nested sub-header logging check
        nested_entries = report.get("nested_or_skipped", [])
        self.assertTrue(
            len(nested_entries) >= 1,
            "Nested JPEG sub-header should be captured in nested_or_skipped list",
        )
        self.assertIn("Nested sub-header", nested_entries[0]["reason"])

        # 5. Checkpoint test
        progress_path = os.path.join(output_dir, ".progress.json")
        self.assertTrue(os.path.exists(progress_path), ".progress.json checkpoint file must exist")

    def test_02_dry_run_mode(self):
        """Tests that dry-run mode identifies files and creates reports without writing files."""
        output_dir = os.path.join(self.test_dir, "out_dry_run")
        carver = FileCarver(
            source_image_path=self.image_path,
            output_dir=output_dir,
            align=1,
            dry_run=True,
        )
        recovered = carver.scan()

        self.assertEqual(len(recovered), len(self.manifest["files"]))
        
        # Reports should exist
        self.assertTrue(os.path.exists(os.path.join(output_dir, "scan_report.json")))
        self.assertTrue(os.path.exists(os.path.join(output_dir, "scan_report.csv")))
        
        # No carved media files should exist
        files_in_out = os.listdir(output_dir)
        media_files = [f for f in files_in_out if f.endswith((".jpg", ".png", ".pdf", ".zip"))]
        self.assertEqual(len(media_files), 0, "Dry run must NOT write recovered media files")

    def test_03_sector_align_recall_tradeoff(self):
        """Tests that sector alignment (--align 512) misses unaligned files, demonstrating recall trade-off."""
        output_dir = os.path.join(self.test_dir, "out_align_512")
        carver = FileCarver(
            source_image_path=self.image_path,
            output_dir=output_dir,
            align=512,  # Sector aligned
            dry_run=True,
        )
        recovered = carver.scan()

        # Count unaligned files in manifest
        unaligned_count = sum(1 for f in self.manifest["files"] if (f["start_offset"] % 512) != 0)
        self.assertTrue(unaligned_count > 0, "Manifest has unaligned files")
        
        # Carver with align=512 should recover fewer files than total
        self.assertLess(
            len(recovered),
            len(self.manifest["files"]),
            "Sector-aligned scan should skip unaligned files",
        )

    def test_04_type_filtering(self):
        """Tests filtering by specific file type (e.g., only PDF)."""
        output_dir = os.path.join(self.test_dir, "out_filter_pdf")
        carver = FileCarver(
            source_image_path=self.image_path,
            output_dir=output_dir,
            type_filters=["pdf"],
            align=1,
            dry_run=False,
        )
        recovered = carver.scan()

        expected_pdfs = [f for f in self.manifest["files"] if f["extension"] == "pdf"]
        self.assertEqual(len(recovered), len(expected_pdfs))
        for r in recovered:
            self.assertEqual(r.signature.extension, "pdf")

    def test_05_targeted_recovery_from_report(self):
        """Tests that selective extraction recovers only requested file IDs matching SHA256."""
        # First do a dry-run to produce scan_report.json
        dry_dir = os.path.join(self.test_dir, "out_dry_for_selective")
        carver_dry = FileCarver(
            source_image_path=self.image_path,
            output_dir=dry_dir,
            align=1,
            dry_run=True,
        )
        carver_dry.scan()
        report_path = os.path.join(dry_dir, "scan_report.json")
        self.assertTrue(os.path.exists(report_path))

        # Selectively recover file IDs [1, 4] (JPEG and PDF)
        target_dir = os.path.join(self.test_dir, "out_selective_extracted")
        carver_target = FileCarver(
            source_image_path=self.image_path,
            output_dir=target_dir,
        )
        extracted = carver_target.recover_from_report(report_path=report_path, selected_ids=[1, 4])
        self.assertEqual(len(extracted), 2)
        
        # Verify files were extracted on disk
        self.assertTrue(os.path.exists(os.path.join(target_dir, "recovered_0001.jpg")))
        self.assertTrue(os.path.exists(os.path.join(target_dir, "recovered_0004.pdf")))
        self.assertFalse(os.path.exists(os.path.join(target_dir, "recovered_0002.png")))


if __name__ == "__main__":
    unittest.main()
