/**
 * Subprocess Bridge & Audit Logger for Python Forensic Engine.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

// Repo root directory (where main.py resides)
const REPO_ROOT = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), '../../..'));
const LOGS_DIR = path.join(REPO_ROOT, 'backend', 'logs');

// Ensure backend logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const SUBPROCESS_LOG = path.join(LOGS_DIR, 'subprocess.log');

export function logSubprocessEvent(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(SUBPROCESS_LOG, entry, 'utf8');
  } catch (err) {
    console.error('Failed to write to subprocess log:', err);
  }
}

export class PythonTaskRunner extends EventEmitter {
  constructor(taskId, args, outputDir) {
    super();
    this.taskId = taskId;
    this.args = args;
    this.outputDir = outputDir;
    this.child = null;
    this.checkpointTimer = null;
    this.lastCheckpoint = null;
    this.startTime = null;
    this.status = 'idle'; // idle | running | completed | failed | cancelled
  }

  start() {
    this.status = 'running';
    this.startTime = Date.now();

    const cmdStr = `py main.py ${this.args.join(' ')}`;
    logSubprocessEvent(`[SPAWN] TaskId: ${this.taskId} | Command: ${cmdStr}`);
    console.log(`[SPAWN] ${cmdStr}`);

    try {
      this.child = spawn('py', ['main.py', ...this.args], {
        cwd: REPO_ROOT,
        windowsHide: true,
      });
    } catch (err) {
      this.status = 'failed';
      logSubprocessEvent(`[ERROR] TaskId: ${this.taskId} | Spawn failed: ${err.message}`);
      this.emit('error', err);
      return;
    }

    logSubprocessEvent(`[STARTED] TaskId: ${this.taskId} | PID: ${this.child.pid}`);

    // Buffer to handle partial chunks
    let stdoutBuffer = '';

    this.child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      stdoutBuffer += text;
      this._parseStdout(text);
    });

    this.child.stderr.on('data', (chunk) => {
      const errText = chunk.toString('utf8');
      console.error(`[PYTHON STDERR]: ${errText}`);
      this.emit('stderr', errText);
    });

    // Checkpoint fallback reader (every 250ms)
    this.checkpointTimer = setInterval(() => {
      this._pollCheckpointFile();
    }, 250);

    this.child.on('close', (code) => {
      if (this.checkpointTimer) clearInterval(this.checkpointTimer);
      
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
      logSubprocessEvent(`[EXIT] TaskId: ${this.taskId} | ExitCode: ${code} | Elapsed: ${elapsed}s`);

      if (code === 0) {
        this.status = 'completed';
        const report = this._loadScanReport();
        this.emit('complete', { report, elapsedSeconds: elapsed });
      } else {
        this.status = 'failed';
        this.emit('failed', { code, elapsedSeconds: elapsed });
      }
    });

    this.child.on('error', (err) => {
      if (this.checkpointTimer) clearInterval(this.checkpointTimer);
      this.status = 'failed';
      logSubprocessEvent(`[PROCESS ERROR] TaskId: ${this.taskId} | ${err.message}`);
      this.emit('error', err);
    });
  }

  cancel() {
    if (this.child && !this.child.killed) {
      this.status = 'cancelled';
      if (this.checkpointTimer) clearInterval(this.checkpointTimer);
      this.child.kill('SIGTERM');
      logSubprocessEvent(`[CANCEL] TaskId: ${this.taskId} killed by user`);
    }
  }

  _parseStdout(text) {
    // 1. Check for Progress line:
    // e.g. "Scanning:  45.2% | Offset: 0x00400000 (   4.0 MB) | Speed:   1.3 MB/s | Detections:   5"
    const progressRegex = /Scanning:\s*([\d\.]+)%\s*\|\s*Offset:\s*(0x[0-9A-Fa-f]+)\s*\(\s*([\d\.]+)\s*MB\)\s*\|\s*Speed:\s*([\d\.]+)\s*MB\/s\s*\|\s*Detections:\s*(\d+)/g;
    let match;
    while ((match = progressRegex.exec(text)) !== null) {
      const data = {
        percent: parseFloat(match[1]),
        offsetHex: match[2],
        scannedMB: parseFloat(match[3]),
        speedMBps: parseFloat(match[4]),
        detections: parseInt(match[5], 10),
      };
      this.emit('progress', data);
    }

    // 2. Check for File Found line:
    // e.g. " [FOUND #0001] JPEG Image at 0x00000539 - 0x000005CE (149 bytes) [recovered_high_confidence]"
    const foundRegex = /\[FOUND\s*#(\d+)\]\s*(.+?)\s+at\s+(0x[0-9A-Fa-f]+)\s*-\s*(0x[0-9A-Fa-f]+)\s*\((\d+)\s+bytes\)\s*\[([^\]]+)\]/g;
    while ((match = foundRegex.exec(text)) !== null) {
      const detection = {
        fileId: parseInt(match[1], 10),
        fileType: match[2].trim(),
        startOffsetHex: match[3],
        endOffsetHex: match[4],
        sizeBytes: parseInt(match[5], 10),
        status: match[6].trim(),
      };
      this.emit('detection', detection);
    }
  }

  _pollCheckpointFile() {
    if (!this.outputDir) return;
    const progressPath = path.join(this.outputDir, '.progress.json');
    if (fs.existsSync(progressPath)) {
      try {
        const raw = fs.readFileSync(progressPath, 'utf8');
        const cp = JSON.parse(raw);
        // Only emit if changed
        if (!this.lastCheckpoint || this.lastCheckpoint.current_offset !== cp.current_offset) {
          this.lastCheckpoint = cp;
          this.emit('checkpoint', cp);
        }
      } catch (e) {
        // Ignore momentary partial writes
      }
    }
  }

  _loadScanReport() {
    if (!this.outputDir) return null;
    const reportPath = path.join(this.outputDir, 'scan_report.json');
    if (fs.existsSync(reportPath)) {
      try {
        const raw = fs.readFileSync(reportPath, 'utf8');
        return JSON.parse(raw);
      } catch (err) {
        console.error('Failed to parse scan_report.json:', err);
      }
    }
    return null;
  }
}
