'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Lock, Mail, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { setToken } = useAuthStore();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/auth/register', { email, password, name });
      setToken(data.access_token);
      
      const userRes = await api.get('/auth/me');
      useAuthStore.getState().setUser(userRes.data);
      
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel w-full max-w-md p-8 rounded-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
        
        <div className="flex flex-col items-center mb-8">
          <motion.div 
            animate={{ rotate: -360 }} 
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="mb-4 text-primary"
          >
            <ShieldAlert size={48} />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-widest text-glow uppercase">Request Access</h1>
          <p className="text-muted-foreground text-sm mt-2">New Operator Registration</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/20 border border-destructive/50 text-destructive-foreground text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Operator Name" 
              className="w-full bg-black/50 border border-primary/30 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Operator ID (Email)" 
              className="w-full bg-black/50 border border-primary/30 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 text-muted-foreground w-5 h-5" />
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Security Clearance Code" 
              className="w-full bg-black/50 border border-primary/30 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <button 
            disabled={loading}
            type="submit" 
            className="w-full bg-primary/20 hover:bg-primary/40 border border-primary text-primary font-bold py-3 rounded-lg uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Submit Request'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <Link href="/login" className="text-muted-foreground hover:text-primary text-sm transition-colors">
            Return to Login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
