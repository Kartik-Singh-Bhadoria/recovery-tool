import React from 'react';
import { Activity, Gauge, Disc, FileSearch, XCircle, ShieldAlert, Cpu } from 'lucide-react';

export default function ScanningScreen({ progress, detections = [], onCancelScan }) {
  const percent = progress?.percent || 0;
  const speed = progress?.speedMBps || 0;
  const offsetHex = progress?.offsetHex || '0x00000000';
  const scannedMB = progress?.scannedMB || 0;

  return (
    <div style={{ maxWidth: '960px', margin: '40px auto', padding: '0 24px' }}>
      {/* Active Scan Header */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
        {/* Glow backdrop */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          left: '-10%',
          width: '300px',
          height: '300px',
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="animate-pulse-radar" style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '2px solid var(--cyan-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Activity size={22} color="var(--cyan-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FFFFFF' }}>
                Carving Stream Active
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Scanning binary stream for magic headers and structural footers
              </p>
            </div>
          </div>

          <button
            onClick={onCancelScan}
            className="btn btn-secondary"
            style={{ color: 'var(--rose-danger)', borderColor: 'rgba(244, 63, 94, 0.3)' }}
          >
            <XCircle size={16} />
            Abort Scan
          </button>
        </div>

        {/* Progress Bar Container */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              BINARY SCAN PROGRESS
            </span>
            <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--cyan-primary)' }}>
              {percent.toFixed(1)}%
            </span>
          </div>

          <div style={{
            height: '12px',
            width: '100%',
            background: 'rgba(30, 41, 59, 0.8)',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--border-subtle)',
            position: 'relative'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, percent))}%`,
              background: 'linear-gradient(90deg, #06B6D4 0%, #3B82F6 50%, #10B981 100%)',
              boxShadow: '0 0 16px rgba(6, 182, 212, 0.6)',
              transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
        </div>

        {/* Real-time Telemetry Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {/* Metric 1: Current Offset */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>
              <Disc size={14} color="var(--cyan-primary)" />
              CURRENT OFFSET (HEX)
            </div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF' }}>
              {offsetHex}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{scannedMB.toFixed(1)} MB Scanned</span>
          </div>

          {/* Metric 2: Throughput */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>
              <Gauge size={14} color="var(--emerald-success)" />
              THROUGHPUT SPEED
            </div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34D399' }}>
              {speed.toFixed(1)} <span style={{ fontSize: '0.85rem' }}>MB/s</span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Constant memory stream</span>
          </div>

          {/* Metric 3: Detections */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            padding: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>
              <FileSearch size={14} color="var(--amber-warning)" />
              IDENTIFIED FILES
            </div>
            <div className="mono" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FBBF24' }}>
              {detections.length}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ready for selective recovery</span>
          </div>
        </div>
      </div>

      {/* Live Detections Log Stream */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={16} color="var(--cyan-primary)" />
          LIVE DISK SIGNATURE FEED
        </h3>

        {detections.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Searching sector blocks... First signature detection will appear here in real time.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
            {detections.slice().reverse().map((det, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(30, 41, 59, 0.4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--cyan-primary)', fontWeight: 700 }}>
                    #{String(det.fileId).padStart(4, '0')}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#FFFFFF' }}>
                    {det.fileType}
                  </span>
                  <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    [{det.startOffsetHex} - {det.endOffsetHex}]
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {det.sizeBytes.toLocaleString()} bytes
                  </span>
                  <span className={`badge ${det.status === 'recovered_high_confidence' ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '0.65rem' }}>
                    {det.status === 'recovered_high_confidence' ? 'VERIFIED' : 'LOW CONFIDENCE'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
