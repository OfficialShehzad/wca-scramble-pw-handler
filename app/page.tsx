'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registerUser, getUser, Role } from '@/lib/firestore';
import { toast } from 'sonner';

export default function Home() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const storedName = localStorage.getItem('name');
      const storedRole = localStorage.getItem('role');
      if (storedName && storedRole) {
        router.push(`/${storedRole}`);
      }
    } catch (e) {
      console.error('LocalStorage error:', e);
    }
  }, [router]);

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error('Please enter a name to proceed.');

    setLoading(true);
    try {
      const sanitizedName = name.trim().replace(/\s+/g, '-').toLowerCase();
      console.log('login clicked for: ', sanitizedName)

      if (authMode === 'register') {
        if (!role) {
          setLoading(false);
          return toast.error('Please select a role.');
        }
        await registerUser(sanitizedName, role);
        localStorage.setItem('name', sanitizedName);
        localStorage.setItem('role', role);
        router.push(`/${role}`);
      } else {
        // Login mode
        const user = await getUser(sanitizedName);
        if (!user) {
          toast.error('User not found. Please register first.');
          setLoading(false);
          return;
        }
        localStorage.setItem('name', sanitizedName);
        localStorage.setItem('role', user.role);
        router.push(`/${user.role}`);
      }
    } catch (error: any) {
      console.error(error);
      if (error.message === 'User already exists') {
        toast.error('This name is already taken.');
      } else {
        toast.error('An error occurred. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 text-zinc-100">
      <div className="w-full max-w-sm flex flex-col gap-8">

        {/* Toggle Login/Register */}
        <div className="flex border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setAuthMode('login')}
            onTouchEnd={(e) => { e.preventDefault(); setAuthMode('login'); }}
            className={`flex-1 py-3 text-sm font-semibold tracking-wider uppercase transition-colors cursor-pointer ${authMode === 'login' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setAuthMode('register')}
            onTouchEnd={(e) => { e.preventDefault(); setAuthMode('register'); }}
            className={`flex-1 py-3 text-sm font-semibold tracking-wider uppercase transition-colors cursor-pointer ${authMode === 'register' ? 'text-white border-b-2 border-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            Register
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-sm text-zinc-400">
            {authMode === 'login' ? 'Enter your identifier to continue.' : 'Choose an identifier and your role.'}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-none p-3 text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500 transition-colors"
              placeholder="e.g. John Doe"
              spellCheck="false"
            />
          </div>

          {authMode === 'register' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Role</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setRole('sender')}
                  className={`flex-1 p-3 border cursor-pointer transition-colors text-sm font-medium ${role === 'sender'
                    ? 'bg-white border-white text-black'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 sm:hover:border-zinc-600'
                    }`}
                >
                  Sender
                </button>
                <button
                  type="button"
                  onClick={() => setRole('receiver')}
                  className={`flex-1 p-3 border cursor-pointer transition-colors text-sm font-medium ${role === 'receiver'
                    ? 'bg-white border-white text-black'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 sm:hover:border-zinc-600'
                    }`}
                >
                  Receiver
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              alert('Please enter a name');
              return toast.error('Please enter a name to proceed.');
            }
            if (authMode === 'register' && !role) {
              alert('Please select a role');
              return toast.error('Please select a role.');
            }
            handleSubmit();
          }}
          disabled={loading}
          className="w-full bg-white text-black p-3 font-semibold text-sm sm:hover:bg-zinc-200 active:bg-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {loading ? 'Connecting...' : 'Continue'}
        </button>

      </div>
    </div>
  );
}
