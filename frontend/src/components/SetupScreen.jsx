import React, { useState } from 'react';
import { Play, HardDrive, FolderOutput, FileCheck, Layers, AlertTriangle, Shield, CheckSquare } from 'lucide-react';

const SUPPORTED_TYPES = [
  { id: 'jpeg', name: 'JPEG Image', ext: '.jpg / .jpeg', magic: 'FF D8 FF', color: '#38BDF8' },
  { id: 'png', name: 'PNG Image', ext: '.png', magic: '89 50 4E 47', color: '#34D399' },
  { id: 'pdf', name: 'PDF Document', ext: '.pdf', magic: '%PDF- (25 50 44)', color: '#F472B6' },
  { id: 'zip', name: 'ZIP / Office XML', ext: '.zip / .docx / .xlsx', magic: 'PK\x03\x04', color: '#FBBF24' },
];

export default function SetupScreen({ onStartScan, isLoading }) {
  const [imagePath, setImagePath] = useState('test_disk.img');
  const [outputDir, setOutputDir] = useState('./recovered_output');
  const [selectedTypes, setSelectedTypes] = useState(['jpeg', 'png', 'pdf', 'zip']);
  const [alignMode, setAlignMode] = useState(1); // 1 = byte-by-byte (default), 512 = sector-aligned

  const handleTypeToggle = (typeId) => {
    setSelectedTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  const handleSelectAllTypes = () => {
    if (selectedTypes.length === SUPPORTED_TYPES.length) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes(SUPPORTED_TYPES.map(t => t.id));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!imagePath.trim()) return;
    if (selectedTypes.length === 0) return;

    onStartScan({
      imagePath: imagePath.trim(),
      outputDir: outputDir.trim(),
      types: selectedTypes,
      align: alignMode,
    });
  };

  return (
    <div style={{ maxWidth: '960px', margin: '40px auto', padding: '0 24px' }}>
      {/* Intro Banner */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px' }}>
          Forensic Disk Image Analysis
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '640px', margin: '0 auto' }}>
          Configure a non-destructive dry-run scan. The carver will identify magic numbers, calculate boundaries, and generate a pre-recovery audit report.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* 1. Target & Output Configuration Card */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <HardDrive size={20} color="var(--cyan-primary)" />
            Target Media & Audit Isolation
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Source Image */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                SOURCE DISK IMAGE PATH (.img / .dd / .raw)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={imagePath}
                  onChange={(e) => setImagePath(e.target.value)}
                  placeholder="e.g. test_disk.img or /path/to/evidence.dd"
                  className="mono"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                  required
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
                Strict read-only handle. Tested against synthetic test images and raw forensic images.
              </span>
            </div>

            {/* Output Directory */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
                OUTPUT RECOVERY DIRECTORY
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="e.g. ./recovered_output"
                  className="mono"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                  required
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px', display: 'block' }}>
                Audit reports (scan_report.json / csv) and recovered files will be written here.
              </span>
            </div>
          </div>
        </div>

        {/* 2. File Signatures Selection Card */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileCheck size={20} color="var(--emerald-success)" />
              Signature Filters
            </h3>
            <button
              type="button"
              onClick={handleSelectAllTypes}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--cyan-primary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {selectedTypes.length === SUPPORTED_TYPES.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            {SUPPORTED_TYPES.map(type => {
              const isChecked = selectedTypes.includes(type.id);
              return (
                <div
                  key={type.id}
                  onClick={() => handleTypeToggle(type.id)}
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: isChecked ? 'rgba(6, 182, 212, 0.08)' : 'rgba(30, 41, 59, 0.4)',
                    border: `1px solid ${isChecked ? 'rgba(6, 182, 212, 0.4)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#FFFFFF' }}>{type.name}</span>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ accentColor: 'var(--cyan-primary)', width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                  </div>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{type.ext}</span>
                  <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Header: {type.magic}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Scan Alignment & Recall Trade-off Card */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Layers size={20} color="var(--amber-warning)" />
            Scan Stride & Recall Trade-off
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {/* Byte-by-byte (Default) */}
            <div
              onClick={() => setAlignMode(1)}
              style={{
                padding: '16px',
                borderRadius: '10px',
                background: alignMode === 1 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                border: `1px solid ${alignMode === 1 ? 'rgba(16, 185, 129, 0.5)' : 'var(--border-subtle)'}`,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 700, color: '#34D399' }}>Byte-by-Byte Scanning (--align 1)</span>
                <span className="badge badge-emerald" style={{ fontSize: '0.65rem' }}>RECOMMENDED</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                100% Forensic Recall. Guarantees recovery of unaligned files in slack space, corrupted clusters, and embedded sub-streams.
              </p>
            </div>

            {/* Sector-aligned */}
            <div
              onClick={() => setAlignMode(512)}
              style={{
                padding: '16px',
                borderRadius: '10px',
                background: alignMode === 512 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                border: `1px solid ${alignMode === 512 ? 'rgba(245, 158, 11, 0.5)' : 'var(--border-subtle)'}`,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 700, color: '#FBBF24' }}>Sector-Aligned (--align 512)</span>
                <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>SPEED OPT-IN</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Fast scan over clean sector boundaries. <strong>NOTICE:</strong> Trades recall for speed. Unaligned/slack files will be missed.
              </p>
            </div>
          </div>
        </div>

        {/* Submit Action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <Shield size={16} color="var(--emerald-success)" />
            <span>Dry-run mode active. Zero disk writes will occur until you confirm recovered files.</span>
          </div>

          <button
            type="submit"
            disabled={isLoading || selectedTypes.length === 0 || !imagePath.trim()}
            className="btn btn-primary"
            style={{ padding: '14px 32px', fontSize: '1rem' }}
          >
            <Play size={18} />
            Start Non-Destructive Scan
          </button>
        </div>
      </form>
    </div>
  );
}
