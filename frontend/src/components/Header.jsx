import React from 'react';
import { ShieldCheck, HardDrive, Cpu, AlertCircle } from 'lucide-react';

export default function Header({ status = 'idle', isDryRun = true }) {
  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(8, 12, 20, 0.85)',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '16px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }}>
      {/* Brand Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 16px rgba(6, 182, 212, 0.35)',
        }}>
          <ShieldCheck size={24} color="#FFFFFF" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
              AEGIS <span style={{ color: 'var(--cyan-primary)' }}>RECOVERY</span>
            </h1>
            <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>Forensics v1.0</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Digital Forensics & Binary Signature File Carver
          </p>
        </div>
      </div>

      {/* Forensic Safety & Status Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className="badge badge-emerald" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={14} />
          <span>STRICT READ-ONLY (rb)</span>
        </div>

        {isDryRun && (
          <div className="badge badge-amber" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle size={14} />
            <span>DRY-RUN / ZERO DISK WRITES</span>
          </div>
        )}

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: status === 'scanning' ? '#06B6D4' : (status === 'complete' ? '#10B981' : '#64748B'),
            boxShadow: status === 'scanning' ? '0 0 10px #06B6D4' : 'none'
          }} />
          <span className="mono" style={{ textTransform: 'uppercase', fontWeight: 600 }}>
            {status}
          </span>
        </div>
      </div>
    </header>
  );
}
