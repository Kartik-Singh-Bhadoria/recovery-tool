import React from 'react';
import { CheckCircle2, ShieldCheck, Folder, Download, FileText, RefreshCw, ExternalLink } from 'lucide-react';

export default function CompleteScreen({
  recoveryResult,
  imagePath,
  outputDir,
  sourceSHA,
  onNewScan,
}) {
  const count = recoveryResult?.count || 0;
  const files = recoveryResult?.recoveredFiles || [];
  const elapsed = recoveryResult?.elapsedSeconds || 0;

  return (
    <div style={{ maxWidth: '860px', margin: '40px auto', padding: '0 24px' }}>
      {/* Success Banner Card */}
      <div className="glass-panel" style={{ padding: '36px', textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '2px solid var(--emerald-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px'
        }}>
          <CheckCircle2 size={36} color="var(--emerald-success)" />
        </div>

        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>
          Recovery Completed Successfully
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '520px', margin: '0 auto 20px' }}>
          <strong style={{ color: '#FFFFFF' }}>{count} file(s)</strong> have been extracted directly to your isolated target directory in {elapsed}s.
        </p>

        {/* Chain of Custody Anchor */}
        {sourceSHA && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid var(--border-subtle)',
            padding: '8px 16px',
            borderRadius: '20px',
            fontSize: '0.8rem'
          }}>
            <ShieldCheck size={16} color="var(--cyan-primary)" />
            <span style={{ color: 'var(--text-dim)' }}>SOURCE SHA256:</span>
            <span className="mono" style={{ color: 'var(--cyan-primary)', fontWeight: 600 }}>{sourceSHA}</span>
          </div>
        )}
      </div>

      {/* Directory & Audit Trail Panel */}
      <div className="glass-panel" style={{ padding: '28px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Folder size={18} color="var(--cyan-primary)" />
          RECOVERED FILES ON DISK
        </h3>

        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          fontSize: '0.85rem'
        }}>
          <span style={{ color: 'var(--text-dim)', marginRight: '8px' }}>Location:</span>
          <span className="mono" style={{ color: '#FFFFFF' }}>{outputDir}</span>
        </div>

        {/* File List */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {files.map((file, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
              }}
            >
              <span className="mono" style={{ fontSize: '0.85rem', color: '#FFFFFF' }}>{file}</span>
              <a
                href={`/api/preview/file?outputDir=${encodeURIComponent(outputDir)}&filename=${encodeURIComponent(file)}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--cyan-primary)', display: 'flex', alignItems: 'center' }}
                title="View / Download File"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          ))}
        </div>

        {/* Reports Download Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Forensic Chain of Custody Audit Trail:</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <a
              href={`/api/preview/download-report?outputDir=${encodeURIComponent(outputDir)}&format=json`}
              download="scan_report.json"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <Download size={14} />
              scan_report.json
            </a>
            <a
              href={`/api/preview/download-report?outputDir=${encodeURIComponent(outputDir)}&format=csv`}
              download="scan_report.csv"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '6px 12px' }}
            >
              <Download size={14} />
              scan_report.csv
            </a>
          </div>
        </div>
      </div>

      {/* Footer Action */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={onNewScan} className="btn btn-primary" style={{ padding: '12px 28px' }}>
          <RefreshCw size={16} />
          Start New Recovery Session
        </button>
      </div>
    </div>
  );
}
