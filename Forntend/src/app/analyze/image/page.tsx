'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, ShieldAlert, UploadCloud, AlertTriangle, CheckCircle, Crosshair } from 'lucide-react';
import api from '@/lib/api';
import { useScanStore } from '@/store/useScanStore';

interface ImageAnalyzeResponse {
  verdict: string;
  confidence: number;
  summary: string;
  signals: string[];
  metadata: any;
}

export default function ImageAnalysisPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImageAnalyzeResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setScanning, setThreatLevel, isScanning } = useScanStore();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setResult(null);
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setScanning(true, 'image');
    setResult(null);
    setThreatLevel('unknown');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post<ImageAnalyzeResponse>('/analyze-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(data);
      if (data.verdict.toLowerCase().includes('fake') || data.verdict.toLowerCase().includes('manipulated')) {
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
          <ImageIcon size={28} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-wider text-glow uppercase">Visual Payload Analysis</h2>
          <p className="text-muted-foreground text-sm">Deepfake detection, artifact extraction, and image manipulation forensics.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Upload Terminal */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px] cursor-pointer hover:bg-white/5 transition-all relative overflow-hidden group" onClick={() => !isScanning && fileInputRef.current?.click()}>
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
            
            {previewUrl ? (
              <div className="absolute inset-0 p-2">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover rounded-lg opacity-50 grayscale group-hover:grayscale-0 transition-all" />
                <div className="absolute inset-0 border-2 border-primary/50 m-2 rounded-lg pointer-events-none" />
                {isScanning && (
                  <motion.div
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="absolute left-2 right-2 h-1 bg-primary shadow-[0_0_15px_#3b82f6] z-10"
                  />
                )}
              </div>
            ) : (
              <div className="text-center text-primary flex flex-col items-center">
                <UploadCloud size={48} className="mb-4" />
                <p className="font-bold tracking-widest uppercase">Upload Visual Intel</p>
                <p className="text-sm text-muted-foreground mt-2 font-mono">JPG, PNG, WEBP (Max 10MB)</p>
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
                <Crosshair size={20} />
              </motion.div>
            ) : (
              <ShieldAlert size={20} />
            )}
            {isScanning ? 'Extracting Metadata...' : 'Run Forensic Scan'}
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
                  <ImageIcon size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="uppercase tracking-widest text-sm">Awaiting Image Payload</p>
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
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
                  <Crosshair size={80} className="mb-8 opacity-80" />
                </motion.div>
                <h3 className="text-2xl font-bold tracking-widest text-glow uppercase mb-2">Isolating Artifacts</h3>
                <p className="font-mono text-sm opacity-80">Running Error Level Analysis (ELA)...</p>
              </motion.div>
            )}

            {result && !isScanning && (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute inset-0 glass-panel rounded-xl overflow-y-auto custom-scrollbar p-6 space-y-6 flex flex-col"
              >
                <div className="flex justify-between items-center border-b border-primary/20 pb-4">
                  <div className="flex items-center gap-4">
                    {result.verdict.toLowerCase().includes('fake') ? (
                      <AlertTriangle className="text-destructive w-10 h-10" />
                    ) : (
                      <CheckCircle className="text-green-500 w-10 h-10" />
                    )}
                    <div>
                      <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Image Authenticity</h3>
                      <h2 className={`text-3xl font-bold uppercase ${result.verdict.toLowerCase().includes('fake') ? 'text-destructive text-glow' : 'text-green-500 text-glow'}`}>
                        {result.verdict}
                      </h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-widest mb-1">AI Confidence</h3>
                    <div className="text-3xl font-bold font-mono text-primary">{result.confidence}%</div>
                  </div>
                </div>

                <div className="p-4 bg-black/40 border border-primary/20 rounded-lg">
                  <h4 className="text-primary uppercase tracking-wider text-sm mb-2 font-semibold">Forensic Summary</h4>
                  <p className="text-sm leading-relaxed">{result.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-6 flex-1">
                  <div className="p-4 bg-black/40 border border-primary/20 rounded-lg">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Detected Signals</h4>
                    <ul className="space-y-2">
                      {result.signals.length > 0 ? result.signals.map((s, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className={`${result.verdict.toLowerCase().includes('fake') ? 'text-destructive' : 'text-primary'} mt-0.5`}>▹</span>
                          <span>{s}</span>
                        </li>
                      )) : (
                        <span className="text-muted-foreground text-sm">No anomalous signals detected.</span>
                      )}
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-black/40 border border-primary/20 rounded-lg overflow-hidden flex flex-col">
                    <h4 className="text-primary uppercase tracking-wider text-sm mb-3 font-semibold">Extracted Metadata</h4>
                    <pre className="text-xs font-mono text-muted-foreground overflow-y-auto custom-scrollbar flex-1">
                      {JSON.stringify(result.metadata, null, 2)}
                    </pre>
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
