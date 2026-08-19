import React, { useState } from 'react';
import {
  FileText, Image as ImageIcon, Archive, FileQuestion, CheckCircle2,
  AlertTriangle, Eye, Download, CheckSquare, Square, Filter, Sparkles, HardDrive
} from 'lucide-react';

export default function ResultsScreen({
  report,
  imagePath,
  outputDir,
  onProceedToRecovery,
  onNewScan,
}) {
  const files = report?.recovered_files || [];
  const nested = report?.nested_or_skipped || [];
  const sourceSHA = report?.scan_metadata?.source_image_sha256 || '';

  const [selectedIds, setSelectedIds] = useState(files.map(f => f.file_id));
  const [filterType, setFilterType] = useState('all');
  const [filterConfidence, setFilterConfidence] = useState('all');
  const [previewFile, setPreviewFile] = useState(null);

  // Toggle single file selection
  const handleToggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Bulk select
  const handleSelectAll = () => {
    if (selectedIds.length === files.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(files.map(f => f.file_id));
    }
  };

  const handleSelectByType = (ext) => {
    const matching = files.filter(f => f.extension.toLowerCase() === ext.toLowerCase()).map(f => f.file_id);
    setSelectedIds(prev => Array.from(new Set([...prev, ...matching])));
  };

  // Filtered files
  const filteredFiles = files.filter(f => {
    const matchType = filterType === 'all' || f.extension.toLowerCase() === filterType.toLowerCase();
    const matchConf = filterConfidence === 'all' ||
      (filterConfidence === 'high' && f.status === 'recovered_high_confidence') ||
      (filterConfidence === 'low' && f.status === 'recovered_low_confidence');
    return matchType && matchConf;
  });

  const getFileIcon = (ext) => {
    switch (ext.toLowerCase()) {
      case 'jpg':
      case 'jpeg':
      case 'png':
        return <ImageIcon size={18} color="var(--cyan-primary)" />;
      case 'pdf':
        return <FileText size={18} color="#F472B6" />;
      case 'zip':
        return <Archive size={18} color="#FBBF24" />;
      default:
        return <FileQuestion size={18} color="var(--text-muted)" />;
    }
  };

  const getPreviewUrl = (f) => {
    return `/api/preview/slice?imagePath=${encodeURIComponent(imagePath)}&offset=${f.start_offset_dec}&size=${f.size_bytes}&ext=${f.extension}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 24px' }}>
      {/* Top Banner & Summary */}
      <div className="glass-panel" style={{ padding: '24px 32px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF' }}>
              Scan Analysis Completed
            </h2>
            <span className="badge badge-emerald">Dry-Run Validated</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Found <strong style={{ color: '#FFFFFF' }}>{files.length}</strong> recoverable file(s) across {report?.scan_metadata?.total_bytes_scanned ? (report.scan_metadata.total_bytes_scanned / (1024*1024)).toFixed(1) : 0} MB scanned.
          </p>
          {sourceSHA && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              <span>SOURCE DISK SHA256:</span>
              <span className="mono" style={{ color: 'var(--cyan-primary)', background: 'rgba(15, 23, 42, 0.8)', padding: '2px 8px', borderRadius: '4px' }}>
                {sourceSHA}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href={`/api/preview/download-report?outputDir=${encodeURIComponent(outputDir)}&format=json`}
            download="scan_report.json"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <Download size={14} />
            JSON Report
          </a>
          <a
            href={`/api/preview/download-report?outputDir=${encodeURIComponent(outputDir)}&format=csv`}
            download="scan_report.csv"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
          >
            <Download size={14} />
            CSV Report
          </a>
          <button onClick={onNewScan} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px' }}>
            New Scan
          </button>
        </div>
      </div>

      {/* Filter & Action Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        {/* Left: Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleSelectAll}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            {selectedIds.length === files.length ? <CheckSquare size={14} /> : <Square size={14} />}
            {selectedIds.length === files.length ? 'Deselect All' : 'Select All'}
          </button>

          <div style={{ height: '24px', width: '1px', background: 'var(--border-subtle)' }} />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '6px 12px',
              background: '#1E293B',
              color: 'var(--text-main)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          >
            <option value="all">All Formats</option>
            <option value="jpg">JPEG Images</option>
            <option value="png">PNG Images</option>
            <option value="pdf">PDF Documents</option>
            <option value="zip">ZIP Archives</option>
          </select>

          <select
            value={filterConfidence}
            onChange={(e) => setFilterConfidence(e.target.value)}
            style={{
              padding: '6px 12px',
              background: '#1E293B',
              color: 'var(--text-main)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          >
            <option value="all">All Confidence Levels</option>
            <option value="high">High Confidence (Verified)</option>
            <option value="low">Low Confidence (Checksum Anomaly)</option>
          </select>
        </div>

        {/* Right: Recovery Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--cyan-primary)' }}>{selectedIds.length}</strong> of {files.length} selected
          </span>
          <button
            onClick={() => onProceedToRecovery(selectedIds)}
            disabled={selectedIds.length === 0}
            className="btn btn-success"
            style={{ padding: '10px 24px', fontSize: '0.9rem' }}
          >
            <HardDrive size={16} />
            Recover Selected ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* Detections Data Grid Table */}
      <div className="glass-panel" style={{ overflow: 'hidden', marginBottom: '32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(15, 23, 42, 0.9)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)' }}>
              <th style={{ padding: '14px 16px', width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.length === files.length && files.length > 0}
                  onChange={handleSelectAll}
                  style={{ accentColor: 'var(--cyan-primary)', cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '14px 16px' }}>FILE</th>
              <th style={{ padding: '14px 16px' }}>FORMAT</th>
              <th style={{ padding: '14px 16px' }}>START OFFSET (HEX)</th>
              <th style={{ padding: '14px 16px' }}>SIZE</th>
              <th style={{ padding: '14px 16px' }}>CONFIDENCE & DIAGNOSTICS</th>
              <th style={{ padding: '14px 16px' }}>SHA256 CHECKSUM</th>
              <th style={{ padding: '14px 16px', textAlign: 'right' }}>PREVIEW</th>
            </tr>
          </thead>
          <tbody>
            {filteredFiles.map((file) => {
              const isSelected = selectedIds.includes(file.file_id);
              const isHigh = file.status === 'recovered_high_confidence';

              return (
                <tr
                  key={file.file_id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isSelected ? 'rgba(6, 182, 212, 0.04)' : 'transparent',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(file.file_id)}
                      style={{ accentColor: 'var(--cyan-primary)', cursor: 'pointer' }}
                    />
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {getFileIcon(file.extension)}
                      <span className="mono" style={{ fontWeight: 600, color: '#FFFFFF' }}>
                        {file.filename}
                      </span>
                    </div>
                  </td>

                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                    {file.file_type}
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <span className="mono" style={{ color: 'var(--cyan-primary)', fontSize: '0.8rem' }}>
                      {file.start_offset_hex}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: '6px' }}>
                      ({file.start_offset_dec.toLocaleString()})
                    </span>
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <span className="mono">{file.size_bytes.toLocaleString()} B</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: '6px' }}>
                      ({(file.size_bytes / 1024).toFixed(1)} KB)
                    </span>
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className={`badge ${isHigh ? 'badge-emerald' : 'badge-amber'}`} style={{ width: 'fit-content' }}>
                        {isHigh ? 'VERIFIED' : 'LOW CONFIDENCE'}
                      </span>
                      {file.confidence_notes && (
                        <span style={{ fontSize: '0.72rem', color: isHigh ? 'var(--text-dim)' : '#FBBF24' }}>
                          {file.confidence_notes}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={{ padding: '14px 16px' }}>
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {file.sha256 ? `${file.sha256.substring(0, 10)}...${file.sha256.substring(file.sha256.length - 8)}` : 'N/A'}
                    </span>
                  </td>

                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => setPreviewFile(file)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                      title="Inspect in-memory binary slice without writing to disk"
                    >
                      <Eye size={14} />
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* In-Memory Slice Inspection Modal */}
      {previewFile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '24px'
        }}>
          <div className="glass-panel" style={{ maxWidth: '640px', width: '100%', padding: '28px', background: '#0F172A' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {getFileIcon(previewFile.extension)}
                <h3 className="mono" style={{ fontSize: '1.1rem', color: '#FFFFFF' }}>{previewFile.filename}</h3>
                <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>IN-MEMORY SLICE</span>
              </div>
              <button onClick={() => setPreviewFile(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>
                ✕
              </button>
            </div>

            {/* Preview Body */}
            <div style={{
              minHeight: '200px',
              maxHeight: '340px',
              background: '#080C14',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: '18px'
            }}>
              {['jpg', 'jpeg', 'png'].includes(previewFile.extension.toLowerCase()) ? (
                <img
                  src={getPreviewUrl(previewFile)}
                  alt="Carved Preview"
                  style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : previewFile.extension.toLowerCase() === 'pdf' ? (
                <iframe
                  src={getPreviewUrl(previewFile)}
                  title="PDF Preview"
                  style={{ width: '100%', height: '320px', border: 'none' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  <Archive size={48} color="var(--cyan-primary)" style={{ marginBottom: '12px' }} />
                  <p style={{ fontWeight: 600, color: '#FFFFFF' }}>ZIP / Binary Container</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Container structures can be inspected post-recovery.</p>
                </div>
              )}
            </div>

            {/* Metadata Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              <div>Offset: <span className="mono" style={{ color: '#FFFFFF' }}>{previewFile.start_offset_hex} - {previewFile.end_offset_hex}</span></div>
              <div>Size: <span className="mono" style={{ color: '#FFFFFF' }}>{previewFile.size_bytes.toLocaleString()} bytes</span></div>
              <div style={{ gridColumn: '1 / -1' }}>
                SHA256: <span className="mono" style={{ color: 'var(--cyan-primary)', fontSize: '0.75rem' }}>{previewFile.sha256}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setPreviewFile(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
