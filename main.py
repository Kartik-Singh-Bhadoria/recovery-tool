#!/usr/bin/env python3
"""
Recovery Software - Forensic File Carver CLI (Phase 1)

A real-world signature-based file recovery tool designed to extract deleted files
from raw disk images (.img, .dd, .raw) with strict read-only safety guarantees.
"""

import argparse
import logging
import os
import sys
from engine.signatures import SignatureRegistry
from engine.carver import FileCarver

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("RecoverySoftware.CLI")


BANNER = r"""
======================================================================
  ____                                      ____         __ _ 
 |  _ \ ___  ___ _____   _____ _ __ _   _  / ___|  ___  / _| |_
 | |_) / _ \/ __/ _ \ \ / / _ \ '__| | | | \___ \ / _ \| |_| __|
 |  _ <  __/ (_| (_) \ V /  __/ |  | |_| |  ___) | (_) |  _| |_ 
 |_| \_\___|\___\___/ \_/ \___|_|   \__, | |____/ \___/|_|  \__|
                                    |___/  (Phase 1: File Carver)
======================================================================
 [SAFETY NOTICE]: Source disk images are ALWAYS opened strictly in
                  read-only mode ('rb'). No writes to source media.
======================================================================
"""


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Forensic File Recovery Tool — Signature-Based File Carver",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
ALIGNMENT & RECALL NOTICE:
  --align 1 (default) performs a byte-by-byte scan. It ensures maximum recall,
  finding files located inside slack space, embedded streams, or corrupted partitions.
  
  --align 512 or --align 4096 scans only on sector/cluster boundaries.
  This significantly accelerates scanning on clean images, but trades recall
  and WILL miss unaligned or fragmented files.
        """,
    )

    parser.add_argument(
        "-i", "--image",
        type=str,
        help="Path to the source disk image (.img, .dd, .raw, binary file)",
    )
    parser.add_argument(
        "-o", "--output",
        type=str,
        default="recovered_output",
        help="Directory to save recovered files, logs, and audit reports (default: ./recovered_output)",
    )
    parser.add_argument(
        "-t", "--types",
        type=str,
        default=None,
        help="Comma-separated list of file types to carve (e.g. 'jpeg,png,pdf,zip'). Default: all",
    )
    parser.add_argument(
        "--align",
        type=int,
        default=1,
        help="Scanning stride in bytes (default: 1 for byte-by-byte. Use 512 or 4096 for sector alignment)",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=4,
        help="Sliding buffer chunk size in MB (default: 4 MB)",
    )
    parser.add_argument(
        "--checkpoint-interval",
        type=int,
        default=10,
        help="Progress checkpoint (.progress.json) flush interval in MB (default: 10 MB)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Perform scan, identify signatures, and generate audit reports without writing carved files",
    )
    parser.add_argument(
        "--recover-ids",
        type=str,
        default=None,
        help="Comma-separated list of file IDs to selectively extract (e.g. '1,3,5') from a prior scan report",
    )
    parser.add_argument(
        "--report",
        type=str,
        default=None,
        help="Path to an existing scan_report.json to use for targeted recovery with --recover-ids",
    )
    parser.add_argument(
        "--list-signatures",
        action="store_true",
        help="List all registered file signatures and exit",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable detailed debug logging",
    )

    return parser.parse_args()


def main():
    print(BANNER)
    args = parse_arguments()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    registry = SignatureRegistry()

    if args.list_signatures:
        print("Registered File Signatures:\n" + "-" * 60)
        for sig in registry.get_all():
            headers_hex = " ".join([h.hex().upper() for h in sig.headers])
            footers_hex = " ".join([f.hex().upper() for f in sig.footers]) if sig.footers else "(dynamic / size cap)"
            print(f" • {sig.name} (.{sig.extension})")
            print(f"    Headers: {headers_hex}")
            print(f"    Footers: {footers_hex}")
            print(f"    Max Cap: {sig.max_size / (1024*1024):.1f} MB | {sig.description}\n")
        return 0

    if not args.image:
        logger.error("Missing required argument: -i / --image. Use --help for usage instructions.")
        return 1

    # Safety checks
    if not os.path.exists(args.image):
        logger.error(f"Source disk image file not found: {args.image}")
        return 1

    source_path = os.path.abspath(args.image)
    output_dir = os.path.abspath(args.output)

    if source_path == output_dir or source_path.startswith(output_dir + os.sep):
        logger.critical(
            "SAFETY VIOLATION PREVENTED: Output directory cannot be the same as or contain the source image!"
        )
        return 1

    type_filters = [t.strip() for t in args.types.split(",")] if args.types else None

    # Instantiate carver
    carver = FileCarver(
        source_image_path=source_path,
        output_dir=output_dir,
        registry=registry,
        type_filters=type_filters,
        align=args.align,
        chunk_size_mb=args.chunk_size,
        checkpoint_interval_mb=args.checkpoint_interval,
        dry_run=args.dry_run,
    )

    # Check for targeted recovery from report
    if args.recover_ids or args.report:
        report_file = args.report or os.path.join(output_dir, "scan_report.json")
        selected_ids = [int(i.strip()) for i in args.recover_ids.split(",") if i.strip().isdigit()] if args.recover_ids else None
        
        try:
            extracted = carver.recover_from_report(report_path=report_file, selected_ids=selected_ids)
            print("\n" + "=" * 60)
            print("TARGETED RECOVERY SUMMARY")
            print("=" * 60)
            print(f"Total Files Extracted:  {len(extracted)}")
            print(f"Output Directory:       {output_dir}")
            print("=" * 60)
            return 0
        except Exception as exc:
            logger.exception(f"Fatal error during targeted recovery: {exc}")
            return 1

    try:
        recovered = carver.scan()
        print("\n" + "=" * 60)
        print("SCAN SUMMARY")
        print("=" * 60)
        print(f"Total Files Identified: {len(recovered)}")
        print(f"Output Directory:       {output_dir}")
        print(f"Reports Generated:      scan_report.json, scan_report.csv")
        print(f"Progress Checkpoint:    .progress.json")
        print("=" * 60)
        return 0
    except KeyboardInterrupt:
        logger.warning("\nScan interrupted by user. Progress saved in checkpoint.")
        return 130
    except Exception as exc:
        logger.exception(f"Fatal error during carving: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
