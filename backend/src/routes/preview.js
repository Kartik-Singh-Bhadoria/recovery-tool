/**
 * In-Memory Preview & Report Export Route.
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { sanitizePath, validateImagePath } from '../services/validator.js';

const router = express.Router();

const MIME_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

/**
 * GET /api/preview/slice
 * Streams a byte slice directly from disk image into browser in memory (zero disk writes).
 */
router.get('/slice', (req, res) => {
  try {
    const { imagePath, offset, size, ext } = req.query;

    if (!imagePath || offset === undefined || size === undefined) {
      return res.status(400).send('Missing imagePath, offset, or size');
    }

    const validImg = validateImagePath(imagePath);
    const byteOffset = parseInt(offset, 10);
    const byteLength = parseInt(size, 10);

    if (isNaN(byteOffset) || isNaN(byteLength) || byteOffset < 0 || byteLength <= 0) {
      return res.status(400).send('Invalid offset or size parameter');
    }

    // Safety cap preview size to 15MB
    const safeLength = Math.min(byteLength, 15 * 1024 * 1024);

    const buffer = Buffer.alloc(safeLength);
    const fd = fs.openSync(validImg, 'r'); // STRICT READ-ONLY

    try {
      const bytesRead = fs.readSync(fd, buffer, 0, safeLength, byteOffset);
      const mime = MIME_MAP[(ext || '').toLowerCase()] || 'application/octet-stream';

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', bytesRead);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.end(buffer.subarray(0, bytesRead));
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    return res.status(500).send(`Preview slice error: ${err.message}`);
  }
});

/**
 * GET /api/preview/file
 * Serves an already extracted file from the output directory.
 */
router.get('/file', (req, res) => {
  try {
    const { outputDir, filename } = req.query;

    if (!outputDir || !filename) {
      return res.status(400).send('Missing outputDir or filename');
    }

    const resolvedDir = sanitizePath(outputDir);
    const safeFile = path.basename(filename);
    const targetPath = path.join(resolvedDir, safeFile);

    if (!fs.existsSync(targetPath)) {
      return res.status(404).send('File not found');
    }

    const ext = path.extname(safeFile).toLowerCase().replace('.', '');
    const mime = MIME_MAP[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    return res.sendFile(targetPath);
  } catch (err) {
    return res.status(500).send(`File preview error: ${err.message}`);
  }
});

/**
 * GET /api/preview/download-report
 * Serves scan_report.json or scan_report.csv for audit trail download.
 */
router.get('/download-report', (req, res) => {
  try {
    const { outputDir, format = 'json' } = req.query;

    if (!outputDir) {
      return res.status(400).send('Missing outputDir');
    }

    const resolvedDir = sanitizePath(outputDir);
    const filename = format === 'csv' ? 'scan_report.csv' : 'scan_report.json';
    const targetPath = path.join(resolvedDir, filename);

    if (!fs.existsSync(targetPath)) {
      return res.status(404).send(`${filename} not found in output directory`);
    }

    return res.download(targetPath, filename);
  } catch (err) {
    return res.status(500).send(`Report download error: ${err.message}`);
  }
});

export default router;
