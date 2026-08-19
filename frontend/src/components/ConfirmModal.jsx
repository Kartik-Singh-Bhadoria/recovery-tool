import React from 'react';
import { HardDrive, AlertTriangle, ShieldCheck, FolderCheck, X } from 'lucide-react';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
  outputDir,
  imagePath,
  isRecovering,
}) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 110,
      padding: '24px'
    }}>
      <div className="glass-panel" style={{ maxWidth: '540px', width: '100%', padding: '32px', background: '#0F172A', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--emerald-success)'
            }}>
              <HardDrive size={20} color="var(--emerald-success)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF' }}>Confirm Disk Extraction</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Explicit Write Permission Required</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isRecovering} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Informational Box */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.9)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '18px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)' }}>FILES TO EXTRACT</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--cyan-primary)' }}>
              {selectedCount} Selected File(s)
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)' }}>DESTINATION RECOVERY DIRECTORY</span>
            <div className="mono" style={{ fontSize: '0.85rem', color: '#FFFFFF', wordBreak: 'break-all' }}>
              {outputDir}
            </div>
          </div>
        </div>

        {/* Safety Guarantees Notice */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '14px', marginBottom: '24px' }}>
          <ShieldCheck size={20} color="var(--emerald-success)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            <strong style={{ color: '#FFFFFF' }}>Forensic Safety Guarantee:</strong> The source disk image (<span className="mono" style={{ color: 'var(--cyan-primary)' }}>{imagePath}</span>) remains in strictly read-only mode (<code className="mono">rb</code>). Files will only be written into the isolated output directory.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} disabled={isRecovering} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isRecovering} className="btn btn-success" style={{ padding: '10px 24px' }}>
            {isRecovering ? 'Extracting Files...' : `Confirm & Recover ${selectedCount} File(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
