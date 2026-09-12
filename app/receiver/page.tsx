'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setDiscoverable, subscribeToMyMessage, Message, updateLastActive } from '@/lib/firestore';
import { toast } from 'sonner';

export default function ReceiverDashboard() {
  const [myName, setMyName] = useState('');
  const [isDiscoverable, setIsDiscoverable] = useState(false);
  const [incomingMessage, setIncomingMessage] = useState<Message | null>(null);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try {
      const storedName = localStorage.getItem('name');
      const storedRole = localStorage.getItem('role');
      if (!storedName || storedRole !== 'receiver') {
        router.push('/');
        return;
      }
      setMyName(storedName);

      setDiscoverable(storedName, false);
      const activeInterval = setInterval(() => updateLastActive(storedName), 60000);
      const unsubscribe = subscribeToMyMessage(storedName, (msg) => {
        if (msg) {
          setIncomingMessage(msg);
          toast.info(`New message from ${msg.senderId}`);
        }
      });

      return () => {
        clearInterval(activeInterval);
        unsubscribe();
        setDiscoverable(storedName, false);
      };
    } catch (e) {
      console.error(e);
    }
  }, [router]);

  const toggleDiscoverability = async () => {
    const newVal = !isDiscoverable;
    setIsDiscoverable(newVal);
    await setDiscoverable(myName, newVal);
    toast.success(newVal ? 'You are now discoverable.' : 'You are now offline.');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const handleLogout = () => {
    if (myName) setDiscoverable(myName, false);
    localStorage.clear();
    router.push('/');
  };

  if (!myName) return null;

  // Parse the incoming message
  let heading = "Payload";
  let content = incomingMessage?.text || "";

  if (incomingMessage?.text?.includes(': ')) {
    const parts = incomingMessage.text.split(': ');
    heading = parts[0];
    content = parts.slice(1).join(': ');
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      {/* Top Bar */}
      <div className="w-full border-b border-zinc-800 bg-black flex justify-between items-center p-4">
        <h1 className="text-sm font-bold text-white">{myName}</h1>
        <button
          onClick={() => setIsLogoutModalOpen(true)}
          className="text-xs font-semibold text-zinc-500 hover:text-white cursor-pointer transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-2xl flex flex-col gap-6">

          {/* Discoverable Button */}
          <button
            onClick={toggleDiscoverability}
            className={`w-full py-4 text-sm font-bold uppercase tracking-wider cursor-pointer transition-colors border ${
              isDiscoverable
                ? 'bg-white text-black border-white'
                : 'bg-black text-zinc-400 border-zinc-700 hover:text-white hover:border-zinc-500'
            }`}
          >
            {isDiscoverable ? 'Discoverable (Active)' : 'Set as Discoverable'}
          </button>

          {/* Message Area */}
          <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col min-h-[300px]">
            {!incomingMessage ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-600 text-sm">Waiting for incoming transmission...</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col relative group">
                <div className="text-xs text-zinc-400 mb-6 uppercase tracking-wider border-b border-zinc-800 pb-2 flex justify-between items-center">
                  <span>{heading}</span>
                  <span className="text-zinc-600 normal-case">From: {incomingMessage.senderId}</span>
                </div>
                
                <div className="flex-1 flex items-center justify-between">
                  <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight break-words">
                    {content}
                  </div>
                  <button 
                    onClick={() => handleCopy(content)}
                    className="p-3 text-zinc-500 hover:text-white cursor-pointer transition-colors"
                    title="Copy Payload"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Logout Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-sm flex flex-col">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="text-sm font-bold text-white">Confirm Logout</h2>
            </div>
            <div className="p-6 text-sm text-zinc-400">
              Are you sure you want to disconnect?
            </div>
            <div className="flex border-t border-zinc-800">
              <button 
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 p-3 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors text-sm font-semibold"
              >
                Cancel
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 p-3 text-black bg-white hover:bg-zinc-200 transition-colors text-sm font-bold"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
