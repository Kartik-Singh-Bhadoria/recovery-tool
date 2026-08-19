/**
 * Forensic Recovery Engine Web Server Entrypoint.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import scanRouter from './routes/scan.js';
import recoverRouter from './routes/recover.js';
import previewRouter from './routes/preview.js';
import { logSubprocessEvent } from './services/pythonRunner.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS setup for local React dev server
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
}));

app.use(express.json());

// Routes
app.use('/api/scan', scanRouter);
app.use('/api/recover', recoverRouter);
app.use('/api/preview', previewRouter);

// Health check & environment info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    forensicsEngine: 'RecoverySoftware Phase 1 + 3',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` FORENSIC RECOVERY ENGINE BACKEND (Express)`);
  console.log(` Server running on http://localhost:${PORT}`);
  console.log(` Strict Read-Only Subprocess Bridge Active`);
  console.log(`======================================================\n`);
  logSubprocessEvent(`Backend server started on port ${PORT}`);
});
