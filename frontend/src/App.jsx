import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import ScanningScreen from './components/ScanningScreen.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import CompleteScreen from './components/CompleteScreen.jsx';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('setup'); // setup | scanning | results | complete
  const [scanId, setScanId] = useState(null);
  const [imagePath, setImagePath] = useState('test_disk.img');
  const [outputDir, setOutputDir] = useState('./recovered_output');
  
  const [scanProgress, setScanProgress] = useState({ percent: 0, speedMBps: 0, offsetHex: '0x00000000', scannedMB: 0 });
  const [detections, setDetections] = useState([]);
  const [report, setReport] = useState(null);
  
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedIdsToRecover, setSelectedIdsToRecover] = useState([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [errorToast, setErrorToast] = useState(null);

  const eventSourceRef = useRef(null);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // 1. Start Dry-Run Scan
  const handleStartScan = async (config) => {
    setErrorToast(null);
    setImagePath(config.imagePath);
    setOutputDir(config.outputDir);
    setDetections([]);
    setScanProgress({ percent: 0, speedMBps: 0, offsetHex: '0x00000000', scannedMB: 0 });
    setReport(null);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initialize scan');

      setScanId(data.scanId);
      setCurrentScreen('scanning');
      subscribeToSSE(data.scanId);
    } catch (err) {
      setErrorToast(err.message);
    }
  };

  // 2. Subscribe to Server-Sent Events
  const subscribeToSSE = (id) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sse = new EventSource(`/api/scan/progress/${id}`);
    eventSourceRef.current = sse;

    sse.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setScanProgress(data);
    });

    sse.addEventListener('detection', (e) => {
      const det = JSON.parse(e.data);
      setDetections(prev => [...prev, det]);
    });

    sse.addEventListener('checkpoint', (e) => {
      const cp = JSON.parse(e.data);
      setScanProgress(prev => ({
        ...prev,
        percent: cp.percent_complete || prev.percent,
        speedMBps: cp.scan_speed_mbps || prev.speedMBps,
      }));
    });

    sse.addEventListener('complete', (e) => {
      const res = JSON.parse(e.data);
      setReport(res.report);
      sse.close();
      setCurrentScreen('results');
    });

    sse.addEventListener('failed', (e) => {
      setErrorToast('Scan execution encountered an error.');
      sse.close();
      setCurrentScreen('setup');
    });

    sse.addEventListener('cancelled', () => {
      sse.close();
      setCurrentScreen('setup');
    });

    sse.onerror = (err) => {
      console.warn('SSE stream error or connection closed:', err);
    };
  };

  // 3. Cancel Scan
  const handleCancelScan = async () => {
    if (!scanId) return;
    try {
      await fetch(`/api/scan/cancel/${scanId}`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    if (eventSourceRef.current) eventSourceRef.current.close();
    setCurrentScreen('setup');
  };

  // 4. Open Recovery Confirmation
  const handleProceedToRecovery = (selectedIds) => {
    setSelectedIdsToRecover(selectedIds);
    setIsConfirmOpen(true);
  };

  // 5. Execute Recovery
  const handleConfirmRecovery = async () => {
    setIsRecovering(true);
    setErrorToast(null);

    try {
      const res = await fetch('/api/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePath,
          outputDir,
          selectedIds: selectedIdsToRecover,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract selected files');

      setRecoveryResult(data);
      setIsConfirmOpen(false);
      setCurrentScreen('complete');
    } catch (err) {
      setErrorToast(err.message);
    } finally {
      setIsRecovering(false);
    }
  };

  // 6. Reset
  const handleNewScan = () => {
    setCurrentScreen('setup');
    setScanId(null);
    setReport(null);
    setRecoveryResult(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header
        status={currentScreen}
        isDryRun={currentScreen === 'setup' || currentScreen === 'scanning' || currentScreen === 'results'}
      />

      {/* Error Banner Toast */}
      {errorToast && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.9)',
          color: '#FFFFFF',
          padding: '12px 24px',
          textAlign: 'center',
          fontWeight: 600,
          fontSize: '0.9rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span>⚠️ {errorToast}</span>
          <button onClick={() => setErrorToast(null)} style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer', fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}

      {/* Screen Render */}
      <main style={{ flex: 1, paddingBottom: '60px' }}>
        {currentScreen === 'setup' && (
          <SetupScreen onStartScan={handleStartScan} isLoading={false} />
        )}

        {currentScreen === 'scanning' && (
          <ScanningScreen
            progress={scanProgress}
            detections={detections}
            onCancelScan={handleCancelScan}
          />
        )}

        {currentScreen === 'results' && (
          <ResultsScreen
            report={report}
            imagePath={imagePath}
            outputDir={outputDir}
            onProceedToRecovery={handleProceedToRecovery}
            onNewScan={handleNewScan}
          />
        )}

        {currentScreen === 'complete' && (
          <CompleteScreen
            recoveryResult={recoveryResult}
            imagePath={imagePath}
            outputDir={outputDir}
            sourceSHA={report?.scan_metadata?.source_image_sha256}
            onNewScan={handleNewScan}
          />
        )}
      </main>

      {/* Explicit Write Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmRecovery}
        selectedCount={selectedIdsToRecover.length}
        outputDir={outputDir}
        imagePath={imagePath}
        isRecovering={isRecovering}
      />
    </div>
  );
}
