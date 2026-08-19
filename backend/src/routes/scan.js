/**
 * Scan Route & Server-Sent Events (SSE) Progress Emitter.
 */

import express from 'express';
import { PythonTaskRunner } from '../services/pythonRunner.js';
import { validateImagePath, validateOutputDir } from '../services/validator.js';

const router = express.Router();
const activeScans = new Map(); // scanId -> { runner, clients: Set<res>, lastData: {} }

router.post('/', (req, res) => {
  try {
    const { imagePath, outputDir, types, align = 1, chunkSize = 4 } = req.body;

    if (!imagePath) {
      return res.status(400).json({ error: 'Missing source imagePath' });
    }

    const validImg = validateImagePath(imagePath);
    const validOut = validateOutputDir(outputDir || './recovered_output', validImg);

    const scanId = 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const args = ['-i', validImg, '-o', validOut, '--dry-run'];
    if (types && types.length > 0) {
      args.push('-t', Array.isArray(types) ? types.join(',') : types);
    }
    if (align) {
      args.push('--align', String(align));
    }
    if (chunkSize) {
      args.push('--chunk-size', String(chunkSize));
    }

    const runner = new PythonTaskRunner(scanId, args, validOut);
    const scanSession = {
      scanId,
      imagePath: validImg,
      outputDir: validOut,
      runner,
      clients: new Set(),
      status: 'starting',
      detections: [],
      progress: { percent: 0, speedMBps: 0, detections: 0, offsetHex: '0x00000000' },
      report: null,
    };

    activeScans.set(scanId, scanSession);

    // Wire up events
    runner.on('progress', (data) => {
      scanSession.status = 'scanning';
      scanSession.progress = data;
      broadcastSSE(scanSession, 'progress', data);
    });

    runner.on('detection', (det) => {
      scanSession.detections.push(det);
      broadcastSSE(scanSession, 'detection', det);
    });

    runner.on('checkpoint', (cp) => {
      broadcastSSE(scanSession, 'checkpoint', cp);
    });

    runner.on('complete', (result) => {
      scanSession.status = 'completed';
      scanSession.report = result.report;
      broadcastSSE(scanSession, 'complete', result);
    });

    runner.on('failed', (err) => {
      scanSession.status = 'failed';
      broadcastSSE(scanSession, 'failed', err);
    });

    runner.on('error', (err) => {
      scanSession.status = 'error';
      broadcastSSE(scanSession, 'error', { message: err.message });
    });

    runner.start();

    return res.json({
      success: true,
      scanId,
      imagePath: validImg,
      outputDir: validOut,
      status: 'running',
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/progress/:scanId', (req, res) => {
  const { scanId } = req.params;
  const session = activeScans.get(scanId);

  if (!session) {
    return res.status(404).json({ error: 'Scan session not found or expired' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state snapshot immediately
  res.write(`event: init\ndata: ${JSON.stringify({
    scanId: session.scanId,
    status: session.status,
    progress: session.progress,
    detections: session.detections,
    report: session.report,
  })}\n\n`);

  session.clients.add(res);

  req.on('close', () => {
    session.clients.delete(res);
  });
});

router.post('/cancel/:scanId', (req, res) => {
  const { scanId } = req.params;
  const session = activeScans.get(scanId);

  if (!session) {
    return res.status(404).json({ error: 'Scan session not found' });
  }

  session.runner.cancel();
  session.status = 'cancelled';
  broadcastSSE(session, 'cancelled', { message: 'Scan cancelled by user' });

  return res.json({ success: true, message: 'Scan cancellation requested' });
});

function broadcastSSE(session, eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of session.clients) {
    try {
      client.write(payload);
    } catch (err) {
      session.clients.delete(client);
    }
  }
}

export default router;
