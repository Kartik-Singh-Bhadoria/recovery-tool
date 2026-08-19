/**
 * Targeted Recovery Route (Direct Byte Stream Extraction).
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { PythonTaskRunner } from '../services/pythonRunner.js';
import { validateImagePath, validateOutputDir } from '../services/validator.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { imagePath, outputDir, selectedIds, reportPath } = req.body;

    if (!imagePath) {
      return res.status(400).json({ error: 'Missing source imagePath' });
    }

    const validImg = validateImagePath(imagePath);
    const validOut = validateOutputDir(outputDir || './recovered_output', validImg);

    // Locate scan_report.json
    let resolvedReport = reportPath ? path.resolve(reportPath) : path.join(validOut, 'scan_report.json');
    if (!fs.existsSync(resolvedReport)) {
      // Look inside parent or default
      resolvedReport = path.join(validOut, 'scan_report.json');
      if (!fs.existsSync(resolvedReport)) {
        return res.status(400).json({
          error: `Audit scan report not found at: ${resolvedReport}. Please run a scan first.`,
        });
      }
    }

    const recoveryTaskId = 'rec_' + Date.now();
    const args = ['-i', validImg, '-o', validOut, '--report', resolvedReport];

    if (selectedIds && selectedIds.length > 0) {
      const idsStr = Array.isArray(selectedIds) ? selectedIds.join(',') : selectedIds;
      args.push('--recover-ids', idsStr);
    }

    const runner = new PythonTaskRunner(recoveryTaskId, args, validOut);

    runner.on('complete', (result) => {
      // Read directory to confirm files written
      try {
        const files = fs.readdirSync(validOut);
        const recoveredMedia = files.filter(f => !f.startsWith('.') && !f.endsWith('.json') && !f.endsWith('.csv') && !f.endsWith('.log'));
        
        return res.json({
          success: true,
          message: `Successfully recovered ${recoveredMedia.length} file(s)`,
          count: recoveredMedia.length,
          recoveredFiles: recoveredMedia,
          outputDir: validOut,
          elapsedSeconds: result.elapsedSeconds,
        });
      } catch (err) {
        return res.status(500).json({ error: `Recovery succeeded but failed to list output: ${err.message}` });
      }
    });

    runner.on('failed', (err) => {
      return res.status(500).json({ error: `Recovery execution failed with code ${err.code}` });
    });

    runner.on('error', (err) => {
      return res.status(500).json({ error: `Subprocess error: ${err.message}` });
    });

    runner.start();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
