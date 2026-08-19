/**
 * Security & Path Traversal Validator for Forensic Backend.
 */

import path from 'path';
import fs from 'fs';

export function sanitizePath(inputPath, allowCreation = false) {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  // Normalize and resolve absolute path
  const resolved = path.resolve(inputPath);

  // Guard against null bytes injection
  if (inputPath.indexOf('\0') !== -1) {
    throw new Error('Null byte injection detected');
  }

  return resolved;
}

export function validateImagePath(imagePath) {
  const resolved = sanitizePath(imagePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Source disk image file not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    throw new Error(`Target is a directory, not a disk image file: ${resolved}`);
  }

  return resolved;
}

export function validateOutputDir(outputDir, imagePath) {
  const resolvedOut = sanitizePath(outputDir, true);
  const resolvedImg = sanitizePath(imagePath);

  if (resolvedOut === resolvedImg || resolvedImg.startsWith(resolvedOut + path.sep)) {
    throw new Error('Safety Constraint Violation: Output directory cannot contain or match source disk image!');
  }

  return resolvedOut;
}
