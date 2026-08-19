"""
File Signature Registry and Format Validators for Forensic Carving.

This module provides declarative signature specifications and soft-validation routines
for supported file formats: JPEG, PNG, PDF, and ZIP (including modern Office XML formats).

FORENSIC INTERNAL NOTES & EDGE CASES:
------------------------------------
1. Magic Numbers vs True File Structure:
   A magic number at a sector boundary only indicates the *potential* start of a file.
   Non-file raw binary, unallocated slack space, or random data can accidentally match
   magic bytes (false positives). Format validators minimize false positives.

2. Embedded Sub-Files (e.g., EXIF JPEG Thumbnails):
   Many digital camera JPEGs embed a low-resolution thumbnail JPEG inside the APP1/EXIF
   metadata segment. A naive carver would see the thumbnail's \xFF\xD8\xFF header and
   either terminate the outer image early or carve a duplicate truncated file.
   The claimed-region tracker prevents sub-headers from interrupting outer file extraction.

3. Incremental Updates & Trailing Data (PDF):
   PDF files allow incremental updates where changes are appended after the initial
   %%EOF marker with a new xref table and a second %%EOF. File carving scans forward
   up to max_size to locate valid trailers, tolerating trailing whitespace/newlines.

4. End of Central Directory (ZIP):
   ZIP files (and .docx, .xlsx, .jar, .apk) store their master index at the end of the
   archive in the End of Central Directory (EOCD) record (magic: PK\x05\x06).
   The EOCD record specifies a variable-length archive comment (0-65535 bytes).
   The true end of a ZIP file is calculated as:
       EOCD_offset + 22 + comment_length
"""

import struct
import zlib
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Tuple


@dataclass
class ValidationResult:
    """Represents the outcome of a soft validation check."""
    is_valid: bool
    status: str  # e.g., "recovered_high_confidence", "recovered_low_confidence", "rejected"
    notes: str = ""


@dataclass
class FileSignature:
    """Declarative specification for a file format signature."""
    name: str
    extension: str
    headers: List[bytes]
    footers: List[bytes] = field(default_factory=list)
    max_size: int = 50 * 1024 * 1024  # Default 50 MB cap to prevent runaway carving
    min_size: int = 16                 # Minimum viable size for this format
    end_finder: Optional[Callable[[bytes, int], Optional[int]]] = None
    validator: Optional[Callable[[bytes], ValidationResult]] = None
    description: str = ""


# ============================================================================
# Format-Specific End Finders and Soft Validators
# ============================================================================

def find_jpeg_end(buffer: bytes, start_pos: int = 0) -> Optional[int]:
    """
    Finds the end of a JPEG file by locating the \xFF\xD9 (EOI) marker.
    
    FORENSIC INTERNAL LOGIC:
    In JPEG streams, entropy-coded scan data begins after the Start of Scan (SOS, \xFF\xDA)
    marker. The scan data uses byte stuffing (\xFF\x00) for literal 0xFF bytes.
    The first unescaped \xFF\xD9 following the SOS marker (or after min_size bytes) marks
    the true End of Image (EOI).
    """
    eoi = b"\xFF\xD9"
    # Find SOS marker if present
    sos_idx = buffer.find(b"\xFF\xDA", start_pos)
    search_start = (sos_idx + 2) if sos_idx != -1 else (start_pos + 32)
    
    idx = buffer.find(eoi, search_start)
    if idx != -1:
        return idx + 2
    
    # Fallback search from start_pos
    idx = buffer.find(eoi, start_pos + 16)
    if idx != -1:
        return idx + 2
        
    return None


def validate_jpeg(data: bytes) -> ValidationResult:
    """Soft-validates a carved JPEG file."""
    if len(data) < 4:
        return ValidationResult(False, "rejected", "File too small to be JPEG")
    
    if not (data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF):
        return ValidationResult(False, "rejected", "Missing JPEG SOI marker (FF D8 FF)")
    
    if not data.endswith(b"\xFF\xD9"):
        return ValidationResult(
            True,
            "recovered_low_confidence",
            "Missing JPEG EOI footer (FF D9); carved up to size cap or next header",
        )
    
    return ValidationResult(True, "recovered_high_confidence", "Valid JPEG SOI and EOI markers")


def find_png_end(buffer: bytes, start_pos: int = 0) -> Optional[int]:
    """
    Finds the end of a PNG file by locating the 12-byte IEND chunk:
    - Length: 0x00000000 (4 bytes)
    - Chunk Type: 'IEND' (4 bytes)
    - CRC32: 0xAE426082 (4 bytes)
    """
    # Standard complete 12-byte IEND chunk
    full_iend = b"\x00\x00\x00\x00IEND\xAE\x42\x60\x82"
    idx = buffer.find(full_iend, start_pos)
    if idx != -1:
        return idx + len(full_iend)
    
    # Fallback: search for just 'IEND' and take 4 bytes after for CRC
    iend_tag = b"IEND"
    idx = buffer.find(iend_tag, start_pos)
    if idx != -1 and len(buffer) >= idx + 8:
        return idx + 8  # 4 bytes 'IEND' + 4 bytes CRC
    
    return None


def validate_png(data: bytes) -> ValidationResult:
    """Soft-validates a carved PNG file, verifying signature and IEND CRC."""
    png_header = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(png_header):
        return ValidationResult(False, "rejected", "Invalid PNG magic signature")
    
    if len(data) < 8 + 12:  # Header + at least IHDR or IEND
        return ValidationResult(False, "rejected", "PNG buffer too short")
    
    # Check for IEND chunk at end
    if b"IEND" not in data[-16:]:
        return ValidationResult(
            True,
            "recovered_low_confidence",
            "PNG IEND chunk not found at expected boundary; carved up to size cap",
        )
    
    # Verify CRC of IEND chunk if full 12-byte chunk is present
    try:
        iend_pos = data.rfind(b"IEND")
        if iend_pos >= 4 and len(data) >= iend_pos + 8:
            expected_crc = struct.unpack(">I", data[iend_pos + 4 : iend_pos + 8])[0]
            calculated_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
            if expected_crc != calculated_crc:
                return ValidationResult(
                    True,
                    "recovered_low_confidence",
                    f"IEND CRC mismatch (expected {hex(calculated_crc)}, found {hex(expected_crc)})",
                )
    except Exception as exc:
        return ValidationResult(
            True,
            "recovered_low_confidence",
            f"PNG chunk parsing anomaly: {str(exc)}",
        )
    
    return ValidationResult(True, "recovered_high_confidence", "Valid PNG header and verified IEND chunk")


def find_pdf_end(buffer: bytes, start_pos: int = 0) -> Optional[int]:
    """
    Finds the end of a PDF file by locating the %%EOF marker.
    PDF files standardly terminate with %%EOF followed by an optional CR/LF newline.
    """
    eof_marker = b"%%EOF"
    idx = buffer.find(eof_marker, start_pos)
    if idx == -1:
        return None
        
    end = idx + len(eof_marker)
    # Consume optional trailing CR / LF newline (up to 4 bytes max, ignoring drive nulls)
    consumed = 0
    while end < len(buffer) and buffer[end:end+1] in (b"\r", b"\n") and consumed < 4:
        end += 1
        consumed += 1
        
    return end


def validate_pdf(data: bytes) -> ValidationResult:
    """Soft-validates a carved PDF document."""
    if not data.startswith(b"%PDF-"):
        return ValidationResult(False, "rejected", "Missing %PDF- header")
    
    # Check for version token like %PDF-1.4 or %PDF-2.0
    if len(data) >= 8:
        version_bytes = data[5:8]
        try:
            version_str = version_bytes.decode("latin1")
            # Verify format like '1.4', '1.7', '2.0'
            if not (len(version_str) == 3 and version_str[0].isdigit() and version_str[1] == "."):
                return ValidationResult(
                    True,
                    "recovered_low_confidence",
                    f"Unusual PDF version string '{version_str}'",
                )
        except Exception:
            pass
    
    if b"%%EOF" not in data[-1024:]:
        return ValidationResult(
            True,
            "recovered_low_confidence",
            "%%EOF marker missing in trailer region; carved up to size cap",
        )
    
    return ValidationResult(True, "recovered_high_confidence", "Valid PDF header and %%EOF trailer")


def find_zip_end(buffer: bytes, start_pos: int = 0) -> Optional[int]:
    """
    Finds the end of a ZIP file (or Office .docx/.xlsx/.pptx) by locating the
    End of Central Directory (EOCD) record:
        Signature: PK\\x05\\x06 (4 bytes)
        Disk entries & CD offsets (16 bytes)
        Comment Length: 2 bytes (uint16, little-endian)
        Archive Comment: <Comment Length> bytes
        
    Total ZIP end = EOCD_start + 22 + comment_length
    """
    eocd_sig = b"PK\x05\x06"
    idx = buffer.find(eocd_sig, start_pos)
    if idx == -1:
        return None
        
    if len(buffer) >= idx + 22:
        # Parse comment length at offset 20 (uint16 little endian)
        comment_len = struct.unpack("<H", buffer[idx + 20 : idx + 22])[0]
        candidate_end = idx + 22 + comment_len
        if candidate_end <= len(buffer):
            return candidate_end
        return idx + 22
        
    return idx + len(eocd_sig)


def validate_zip(data: bytes) -> ValidationResult:
    """Soft-validates a carved ZIP archive or Office XML document."""
    if not data.startswith(b"PK\x03\x04"):
        return ValidationResult(False, "rejected", "Missing PK\\x03\\x04 local file header signature")
    
    if len(data) < 22:
        return ValidationResult(False, "rejected", "Buffer too short for valid ZIP")
    
    if b"PK\x05\x06" not in data:
        return ValidationResult(
            True,
            "recovered_low_confidence",
            "EOCD signature (PK\\x05\\x06) not found; archive may be truncated or fragmented",
        )
    
    return ValidationResult(True, "recovered_high_confidence", "Valid ZIP local header and EOCD record")


# ============================================================================
# Signature Registry
# ============================================================================

class SignatureRegistry:
    """
    Central registry holding all supported file format definitions.
    Enables adding new formats dynamically without changing carver logic.
    """

    def __init__(self):
        self._signatures: List[FileSignature] = []
        self._register_default_signatures()

    def _register_default_signatures(self):
        # JPEG / JPG
        self.register(
            FileSignature(
                name="JPEG Image",
                extension="jpg",
                headers=[b"\xFF\xD8\xFF"],
                footers=[b"\xFF\xD9"],
                max_size=30 * 1024 * 1024,  # 30 MB
                min_size=64,
                end_finder=find_jpeg_end,
                validator=validate_jpeg,
                description="Joint Photographic Experts Group image",
            )
        )

        # PNG
        self.register(
            FileSignature(
                name="PNG Image",
                extension="png",
                headers=[b"\x89PNG\r\n\x1a\n"],
                footers=[b"\x00\x00\x00\x00IEND\xAE\x42\x60\x82", b"IEND"],
                max_size=40 * 1024 * 1024,  # 40 MB
                min_size=24,
                end_finder=find_png_end,
                validator=validate_png,
                description="Portable Network Graphics image",
            )
        )

        # PDF
        self.register(
            FileSignature(
                name="PDF Document",
                extension="pdf",
                headers=[b"%PDF-"],
                footers=[b"%%EOF"],
                max_size=100 * 1024 * 1024,  # 100 MB
                min_size=32,
                end_finder=find_pdf_end,
                validator=validate_pdf,
                description="Adobe Portable Document Format",
            )
        )

        # ZIP / Office XML
        self.register(
            FileSignature(
                name="ZIP Archive / Office XML",
                extension="zip",
                headers=[b"PK\x03\x04"],
                footers=[b"PK\x05\x06"],
                max_size=150 * 1024 * 1024,  # 150 MB
                min_size=22,
                end_finder=find_zip_end,
                validator=validate_zip,
                description="ZIP Archive / MS Office (DOCX, XLSX, PPTX) container",
            )
        )

    def register(self, sig: FileSignature):
        """Registers a new file signature."""
        self._signatures.append(sig)

    def get_all(self) -> List[FileSignature]:
        """Returns all registered signatures."""
        return list(self._signatures)

    def get_by_types(self, type_filters: Optional[List[str]]) -> List[FileSignature]:
        """
        Filters signatures by file extension or name (case-insensitive).
        If type_filters is None or empty, returns all signatures.
        """
        if not type_filters:
            return self.get_all()
        
        normalized = {t.strip().lower().lstrip(".") for t in type_filters}
        matched = []
        for sig in self._signatures:
            if sig.extension.lower() in normalized or sig.name.lower() in normalized:
                matched.append(sig)
        return matched
