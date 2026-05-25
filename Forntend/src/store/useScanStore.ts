import { create } from 'zustand';

type ScanType = 'text' | 'url' | 'image' | 'audio' | 'idle';
type ThreatLevel = 'safe' | 'warning' | 'critical' | 'unknown';

interface ScanState {
  isScanning: boolean;
  scanType: ScanType;
  threatLevel: ThreatLevel;
  scanProgress: number; // 0 to 100
  setScanning: (isScanning: boolean, type?: ScanType) => void;
  setThreatLevel: (level: ThreatLevel) => void;
  setScanProgress: (progress: number) => void;
}

export const useScanStore = create<ScanState>((set) => ({
  isScanning: false,
  scanType: 'idle',
  threatLevel: 'unknown',
  scanProgress: 0,
  setScanning: (isScanning, type) => 
    set((state) => ({ 
      isScanning, 
      scanType: type || state.scanType,
      scanProgress: isScanning ? 10 : 0 
    })),
  setThreatLevel: (level) => set({ threatLevel: level }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
}));
