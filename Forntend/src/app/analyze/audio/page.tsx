'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, ShieldAlert, UploadCloud, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import api from '@/lib/api';
import { useScanStore } from '@/store/useScanStore';

interface AudioAnalyzeResponse {
  verdict: string;
  confidence: number;
  summary: string;
  signals: string[];
  metadata: any;
}

export default function AudioAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AudioAnalyzeResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setScanning, setThreatLevel, isScanning } = useScanStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setScanning(true, 'audio');
    setResult(null);
    setThreatLevel('unknown');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post<AudioAnalyzeResponse>('/analyze-audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(data);
      if (data.verdict.toLowerCase().includes('fake') || data.verdict.toLowerCase().includes('cloned')) {
        setThreatLevel('critical');
      } else if (data.confidence < 70) {
        setThreatLevel('warning');
      } else {
        setThreatLevel('safe');
      }
    } catch (err) {
      console.error(err);
      setThreatLevel('warning');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <header className="flex items-center gap-4 border-b border-primary/20 pb-4">
        <div className="p-3 bg-primary/10 rounded-lg text-primary">
          <Mic size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Voice Cloning & Audio Forensics</h2>
          <p className="text-muted-foreground text-sm">Analyze audio waveforms to detect AI voice cloning and synthetic speech patterns.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Upload Terminal */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px] cursor-pointer hover:bg-white/5 transition-all relative overflow-hidden group" onClick={() => !isScanning && fileInputRef.current?.click()}>
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" />
            
            {file ? (
              <div className="text-center text-primary flex flex-col items-center">
                <Activity size={48} className="mb-4 text-glow" />
                <p className="font-bold tracking-widest uppercase truncate w-full px-4">{file.name}</p>
                <p className="text-sm text-muted-foreground mt-2 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            ) : (
              <div className="text-center text-primary flex flex-col items-center">
                <UploadCloud size={48} className="mb-4" />
                <p className="font-bold tracking-widest uppercase">Intercept Audio Data</p>
                <p className="text-sm text-muted-foreground mt-2 font-mono">MP3, WAV (Max 25MB)</p>
              </div>
            )}
          </div>
          
          <button
            disabled={isScanning || !file}
            onClick={handleAnalyze}
            className="w-full bg-primary/20 hover:bg-primary/40 border border-primary text-primary font-bold py-4 rounded-lg uppercase tracking-wider transition-all disabled:opacity-50 flex justify-center items-center gap-3"
          >
            {isScanning ? (
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                <Activity size={20} />
              </motion.div>
            ) : (
              <ShieldAlert size={20} />
            )}
            {isScanning ? 'Processing Frequencies...' : 'Analyze Spectrum'}
          </button>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-8 relative h-full min-h-[500px]">
          <AnimatePresence mode="wait">
            {!result && !isScanning && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center border border-dashed border-primary/20 rounded-xl"
              >
                <div className="text-center text-muted-foreground">
                  <Mic size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="uppercase tracking-widest text-sm">Awaiting Audio Frequencies</p>
                </div>
              </motion.div>
            )}

            {isScanning && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="absolute inset-0 glass-panel rounded-xl flex flex-col items-center justify-center p-8 text-primary overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50 animate-pulse" />
                
                <div className="flex gap-1 mb-10 items-end h-24">
                  {[...Array(30)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [10, Math.random() * 80 + 20, 10] }}
                      transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.05 }}
                      className="w-2 bg-primary/80 rounded-t-sm shadow-[0_0_8px_#3b82f6]"
                    />
                  ))}
                </div>

                <h3 className="text-2xl font-bold tracking-widest text-glow uppercase mb-2">Isolating Vocal Frequencies</h3>
                <div className="font-mono text-sm opacity-80 space-y-2 text-center mt-4 h-16">
                  <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0 }}>&gt; Extracting waveform signatures...</motion.div>
                  <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}>&gt; Searching for deepfake artifacts...</motion.div>
                  <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1.2 }}>&gt; Analyzing spectral consistency...</motion.div>
                </div>
              </motion.div>
            )}

            {result && !isScanning && (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-0 glass-panel rounded-xl overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6"
              >
                <div className="flex justify-between items-center bg-gradient-to-r from-transparent to-black/40 p-6 rounded-lg border border-primary/10">
                  <div className="flex items-center gap-4">
                    {result.verdict.toLowerCase().includes('fake') ? (
                      <AlertTriangle className="text-destructive w-12 h-12" />
                    ) : (
                      <CheckCircle className="text-green-500 w-12 h-12" />
                    )}
                    <div>
                      <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Audio Authenticity</h3>
                      <h2 className={`text-4xl font-bold uppercase tracking-wider ${result.verdict.toLowerCase().includes('fake') ? 'text-destructive text-glow' : 'text-green-500 text-glow'}`}>
                        {result.verdict}
                      </h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-widest mb-1">AI Confidence</h3>
                    <div className="text-5xl font-bold font-mono text-primary text-glow">{result.confidence}%</div>
                  </div>
                </div>

                <div className="p-5 bg-black/40 border border-primary/20 rounded-lg">
                  <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Forensic Summary</h4>
                  <p className="text-sm leading-relaxed text-gray-200">{result.summary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-0">
                  <div className="p-5 bg-black/40 border border-primary/20 rounded-lg flex flex-col">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-4 font-semibold">Detected Anomalies & Signals</h4>
                    <ul className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2">
                      {result.signals && result.signals.length > 0 ? result.signals.map((s, i) => (
                        <li key={i} className={`text-sm flex items-start gap-3 p-3 rounded-lg border ${result.verdict.toLowerCase().includes('fake') ? 'bg-destructive/10 border-destructive/20 text-destructive/90' : 'bg-primary/5 border-primary/10 text-gray-300'}`}>
                          <span className="mt-0.5">▹</span>
                          <span>{s}</span>
                        </li>
                      )) : (
                        <div className="text-green-400 text-sm p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                          No anomalous signals detected in frequency spectrum.
                        </div>
                      )}
                    </ul>
                  </div>
                  
                  <div className="p-5 bg-black/40 border border-primary/20 rounded-lg flex flex-col">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-4 font-semibold">Extracted Spectral Metadata</h4>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
                      {result.metadata ? Object.entries(result.metadata).map(([key, value]) => (
                         <div key={key} className="flex justify-between items-center p-3 bg-black/60 rounded border border-white/5">
                           <span className="text-xs uppercase text-muted-foreground font-mono">{key.replace(/_/g, ' ')}</span>
                           <span className="text-sm font-bold text-white text-right max-w-[50%] truncate" title={String(value)}>
                             {typeof value === 'boolean' ? (value ? 'DETECTED' : 'CLEAN') : String(value)}
                           </span>
                         </div>
                       )) : (
                         <span className="text-muted-foreground text-sm font-mono">No metadata extracted.</span>
                       )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
