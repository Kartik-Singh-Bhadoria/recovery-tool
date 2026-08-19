"""
Synthetic Disk Image Generator for File Recovery Testing.

Generates a realistic raw disk image ('test_disk.img') populated with:
1. Real, valid JPEG, PNG, PDF, and ZIP files.
2. Files placed at both sector-aligned and unaligned offsets (to test --align 1 vs --align 512).
3. Files with embedded sub-signatures (to test claimed-region tracker).
4. Files with intentional CRC corruption (to test soft-reject / low-confidence recovery).
5. Zeroed sectors and random pseudorandom padding simulating unallocated slack space.
6. A ground-truth 'expected_manifest.json' mapping exact offsets, sizes, and hashes.
"""

import hashlib
import io
import json
import os
import struct
import zipfile
import zlib


def create_sample_png() -> bytes:
    """Generates a valid 1x1 pixel PNG image."""
    header = b"\x89PNG\r\n\x1a\n"
    
    # IHDR Chunk: 1x1, 8-bit RGB, no compression/filter/interlace
    ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    ihdr_crc = struct.pack(">I", zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF)
    ihdr_chunk = struct.pack(">I", len(ihdr_data)) + b"IHDR" + ihdr_data + ihdr_crc
    
    # IDAT Chunk: Raw scanline: filter byte 0 + RGB(255, 0, 0)
    raw_scanline = b"\x00\xFF\x00\x00"
    compressed = zlib.compress(raw_scanline)
    idat_crc = struct.pack(">I", zlib.crc32(b"IDAT" + compressed) & 0xFFFFFFFF)
    idat_chunk = struct.pack(">I", len(compressed)) + b"IDAT" + compressed + idat_crc
    
    # IEND Chunk
    iend_crc = struct.pack(">I", zlib.crc32(b"IEND") & 0xFFFFFFFF)
    iend_chunk = struct.pack(">I", 0) + b"IEND" + iend_crc
    
    return header + ihdr_chunk + idat_chunk + iend_chunk


def create_low_confidence_png() -> bytes:
    """Generates a PNG with an intentionally corrupted IEND CRC to test soft validation."""
    valid_png = create_sample_png()
    # Modify last byte of IEND CRC
    corrupt = valid_png[:-1] + b"\x00"
    return corrupt


def create_sample_jpeg(embed_fake_subheader: bool = False) -> bytes:
    """
    Generates a valid minimal JPEG image (1x1 red pixel).
    Optionally embeds an APP1 comment containing a secondary JPEG header
    to test claimed-region nested detection handling.
    """
    # Standard minimal JPEG binary stream
    soi = b"\xFF\xD8"
    
    # APP0 JFIF segment
    app0 = b"\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    
    # Optional APP1 comment segment with sub-header
    app1 = b""
    if embed_fake_subheader:
        # Comment contains nested JPEG header: \xFF\xD8\xFF\xE0 (simulating thumbnail)
        comment_body = b"Embedded EXIF Thumbnail Header: \xFF\xD8\xFF\xE0 Fake Thumbnail Segment"
        comment_len = len(comment_body) + 2
        app1 = b"\xFF\xFE" + struct.pack(">H", comment_len) + comment_body

    # DQT (Quantization table)
    dqt = b"\xFF\xDB\x00\x43\x00" + (b"\x10" * 64)
    
    # SOF0 (Start of Frame: Baseline DCT, 1x1 px, 1 component)
    sof0 = b"\xFF\xC0\x00\x0B\x08\x00\x01\x00\x01\x01\x01\x11\x00"
    
    # DHT (Huffman Table)
    dht = (
        b"\xFF\xC4\x00\x1F\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00"
        b"\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B"
    )
    
    # SOS (Start of Scan)
    sos = b"\xFF\xDA\x00\x08\x01\x01\x00\x00\x3F\x00"
    
    # Compressed scan data (1 MCU)
    scan_data = b"\x7F\x00"
    
    # EOI
    eoi = b"\xFF\xD9"
    
    return soi + app0 + app1 + dqt + sof0 + dht + sos + scan_data + eoi


def create_sample_pdf() -> bytes:
    """Generates a valid, minimal single-page PDF document."""
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 700 Td (Forensic Recovery Test PDF) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000206 00000 n \n"
        b"trailer\n<< /Size 5 /Root 1 0 R >>\n"
        b"startxref\n300\n"
        b"%%EOF\n"
    )
    return pdf_content


def create_sample_zip() -> bytes:
    """Generates a valid ZIP archive containing text files and an archive comment."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("evidence.txt", "Forensic carving test artifact: ZIP container payload.")
        zf.writestr("subfolder/data.csv", "id,name,value\n1,alpha,100\n2,beta,200\n")
        zf.comment = b"Forensic Disk Image Test Archive"
    return buf.getvalue()


def build_test_disk_image(
    image_path: str = "test_disk.img",
    manifest_path: str = "expected_manifest.json",
    disk_size_mb: int = 10,
):
    """
    Builds the test disk image with sample files embedded at carefully chosen offsets.
    """
    total_bytes = disk_size_mb * 1024 * 1024
    image_bytes = bytearray(b"\x00" * total_bytes)
    
    # Fill background with some pseudorandom noise / slack patterns to simulate a used drive
    for i in range(0, total_bytes, 4096):
        # Every other block has pattern data
        if (i // 4096) % 3 == 0:
            pattern = (f"SLACK_SPACE_BLOCK_{i:08X}_DEADBEEF\n".encode("utf-8") * 64)[:4096]
            image_bytes[i : i + len(pattern)] = pattern

    # Define test payloads
    jpeg_clean = create_sample_jpeg(embed_fake_subheader=False)
    jpeg_nested = create_sample_jpeg(embed_fake_subheader=True)
    png_clean = create_sample_png()
    png_corrupt_crc = create_low_confidence_png()
    pdf_clean = create_sample_pdf()
    zip_clean = create_sample_zip()

    # Placement specifications:
    # We test sector-aligned (multiple of 512) and intentionally unaligned offsets
    placements = [
        {
            "name": "sample_jpeg_unaligned",
            "type": "JPEG Image",
            "extension": "jpg",
            "data": jpeg_clean,
            "offset": 1337,  # Unaligned byte offset (tests --align 1 recall)
            "expected_status": "recovered_high_confidence",
        },
        {
            "name": "sample_png_aligned",
            "type": "PNG Image",
            "extension": "png",
            "data": png_clean,
            "offset": 512 * 20,  # 10240 (Sector aligned)
            "expected_status": "recovered_high_confidence",
        },
        {
            "name": "sample_jpeg_with_nested_header",
            "type": "JPEG Image",
            "extension": "jpg",
            "data": jpeg_nested,
            "offset": 512 * 100 + 7,  # 51207 (Unaligned)
            "expected_status": "recovered_high_confidence",
            "has_nested_match": True,
        },
        {
            "name": "sample_pdf_unaligned",
            "type": "PDF Document",
            "extension": "pdf",
            "data": pdf_clean,
            "offset": 1024 * 1024 + 313,  # ~1 MB + 313 bytes
            "expected_status": "recovered_high_confidence",
        },
        {
            "name": "sample_png_corrupt_crc",
            "type": "PNG Image",
            "extension": "png",
            "data": png_corrupt_crc,
            "offset": 2 * 1024 * 1024 + 512,  # ~2 MB (Sector aligned)
            "expected_status": "recovered_low_confidence",
        },
        {
            "name": "sample_zip_aligned",
            "type": "ZIP Archive / Office XML",
            "extension": "zip",
            "data": zip_clean,
            "offset": 4 * 1024 * 1024,  # Exactly at 4 MB
            "expected_status": "recovered_high_confidence",
        },
    ]

    manifest_entries = []

    for item in placements:
        offset = item["offset"]
        data = item["data"]
        size = len(data)
        sha256 = hashlib.sha256(data).hexdigest()
        
        # Write into disk image buffer
        image_bytes[offset : offset + size] = data
        
        manifest_entries.append({
            "name": item["name"],
            "file_type": item["type"],
            "extension": item["extension"],
            "start_offset": offset,
            "start_offset_hex": f"0x{offset:08X}",
            "end_offset": offset + size,
            "end_offset_hex": f"0x{offset + size:08X}",
            "size_bytes": size,
            "sha256": sha256,
            "expected_status": item["expected_status"],
            "has_nested_match": item.get("has_nested_match", False),
        })

    # Write disk image to file
    with open(image_path, "wb") as f:
        f.write(image_bytes)

    source_image_sha256 = hashlib.sha256(image_bytes).hexdigest()

    # Write manifest
    manifest_data = {
        "image_path": os.path.abspath(image_path),
        "disk_size_bytes": total_bytes,
        "disk_image_sha256": source_image_sha256,
        "total_files": len(manifest_entries),
        "files": manifest_entries,
    }

    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    print(f"Generated test disk image: '{image_path}' ({disk_size_mb} MB)")
    print(f"Disk Image SHA256: {source_image_sha256}")
    print(f"Expected ground truth manifest saved: '{manifest_path}' with {len(manifest_entries)} test files.")


if __name__ == "__main__":
    build_test_disk_image()
