'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeToReceivers, sendMessage, User, updateLastActive, subscribeToUserLists, updateUserLists, TextList, ListItem } from '@/lib/firestore';
import { toast } from 'sonner';

export default function SenderDashboard() {
  const [myName, setMyName] = useState('');
  const [receivers, setReceivers] = useState<User[]>([]);

  // Lists State
  const [lists, setLists] = useState<TextList[]>([]);
  const [newText, setNewText] = useState('');
  
  // List Renaming State
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');

  // Modals
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [radarTarget, setRadarTarget] = useState<User | null>(null);
  const [radarMessage, setRadarMessage] = useState('');

  const [sendItemTarget, setSendItemTarget] = useState<{ listId: string, item: ListItem } | null>(null);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const router = useRouter();

  useEffect(() => {
    try {
      const storedName = localStorage.getItem('name');
      const storedRole = localStorage.getItem('role');
      if (!storedName || storedRole !== 'sender') {
        router.push('/');
        return;
      }
      setMyName(storedName);

      // Subscribe to lists
      const unsubscribeLists = subscribeToUserLists(storedName, (fetchedLists) => {
        setLists(fetchedLists);
      });

      const activeInterval = setInterval(() => updateLastActive(storedName), 60000);
      const unsubscribeReceivers = subscribeToReceivers((data) => {
        setReceivers(data);
      });

      return () => {
        clearInterval(activeInterval);
        unsubscribeLists();
        unsubscribeReceivers();
      };
    } catch (e) {
      console.error(e);
    }
  }, [router]);

  // We no longer sync to localStorage automatically in a useEffect to avoid recursive loops
  // Instead, we explicitly call updateUserLists when modifying lists.

  const handleCreateList = () => {
    if (!newText.trim()) return;
    const lines = newText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    const newList: TextList = {
      id: Date.now().toString(),
      title: lines[0].substring(0, 30) + (lines[0].length > 30 ? '...' : ''),
      isCollapsed: false,
      items: lines.map((line, i) => ({
        id: `${Date.now()}-${i}`,
        text: line,
        checked: false
      }))
    };

    const newLists = [newList, ...lists];
    setLists(newLists);
    updateUserLists(myName, newLists);
    setNewText('');
  };

  const toggleListCollapse = (id: string) => {
    const newLists = lists.map(l => l.id === id ? { ...l, isCollapsed: !l.isCollapsed } : l);
    setLists(newLists);
    updateUserLists(myName, newLists);
  };

  const toggleItemCheck = (listId: string, itemId: string, checkedStatus: boolean = true) => {
    const newLists = lists.map(l => {
      if (l.id !== listId) return l;
      return {
        ...l,
        items: l.items.map(i => i.id === itemId ? { ...i, checked: checkedStatus } : i)
      };
    });
    setLists(newLists);
    updateUserLists(myName, newLists);
  };

  const deleteList = (id: string) => {
    const newLists = lists.filter(l => l.id !== id);
    setLists(newLists);
    updateUserLists(myName, newLists);
  };

  const startRename = (id: string, currentTitle: string) => {
    setEditingListId(id);
    setEditTitleText(currentTitle);
  };

  const saveRename = (id: string) => {
    if (!editTitleText.trim()) {
      setEditingListId(null);
      return;
    }
    const newLists = lists.map(l => l.id === id ? { ...l, title: editTitleText.trim() } : l);
    setLists(newLists);
    updateUserLists(myName, newLists);
    setEditingListId(null);
  };

  const handleSend = async (receiverName: string, text: string, listId?: string, itemId?: string) => {
    try {
      await sendMessage(receiverName, myName, text);
      toast.success(`Sent to ${receiverName}`);
      
      if (listId && itemId) {
        toggleItemCheck(listId, itemId, true);
      }

      setSendItemTarget(null);
      setRadarTarget(null);
      setRadarMessage('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send message.');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (!myName) return null;

  return (
    <div className="min-h-screen bg-black text-zinc-100 relative pb-24">
      {/* Top Bar */}
      <div className="w-full border-b border-zinc-800 bg-black flex justify-between items-center p-4 sticky top-0 z-10">
        <h1 className="text-sm font-bold text-white">{myName}</h1>
        <button
          onClick={() => setIsLogoutModalOpen(true)}
          className="text-xs font-semibold text-zinc-500 hover:text-white cursor-pointer transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-8 mt-4">
        {/* List Creator */}
        <div className="bg-zinc-900 border border-zinc-800 p-2 flex flex-col focus-within:border-zinc-500 transition-colors">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Paste text here to create a list... (each line becomes an item)"
            className="w-full bg-transparent p-2 outline-none text-sm resize-none text-white placeholder:text-zinc-600"
            rows={Math.min(Math.max(newText.split('\n').length, 3), 20)}
          />
          <div className="flex justify-end p-2 border-t border-zinc-800/50 mt-2">
            <button
              onClick={handleCreateList}
              disabled={!newText.trim()}
              className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-zinc-200 transition-colors"
            >
              Create List
            </button>
          </div>
        </div>

        {/* Lists Display */}
        <div className="flex flex-col gap-4">
          {lists.map(list => (
            <div key={list.id} className="border border-zinc-800 bg-black overflow-hidden group">
              <div
                className="p-4 flex justify-between items-center cursor-pointer hover:bg-zinc-900/30 select-none"
                onClick={() => {
                  if (editingListId !== list.id) {
                    toggleListCollapse(list.id);
                  }
                }}
              >
                {editingListId === list.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={editTitleText}
                    onChange={(e) => setEditTitleText(e.target.value)}
                    onBlur={() => saveRename(list.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(list.id);
                      if (e.key === 'Escape') setEditingListId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-transparent border-b border-zinc-500 text-white outline-none text-sm font-semibold flex-1 mr-4 pb-1"
                  />
                ) : (
                  <h3 className="font-semibold text-sm text-white truncate flex-1 pr-4">{list.title}</h3>
                )}
                
                <div className="flex gap-4 items-center">
                  {editingListId !== list.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startRename(list.id, list.title); }}
                      className="text-zinc-600 hover:text-white transition-colors"
                      title="Rename list"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteList(list.id); }}
                    className="text-zinc-600 hover:text-red-500 transition-colors"
                    title="Delete list"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                  </button>
                  <span className="text-zinc-500 text-xs w-12 text-right">{list.isCollapsed ? 'Expand' : 'Collapse'}</span>
                </div>
              </div>

              {!list.isCollapsed && (
                <div className="border-t border-zinc-800 bg-zinc-950/50">
                  {list.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-900/50 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                        <div className={`w-4 h-4 flex-shrink-0 border flex items-center justify-center transition-colors ${item.checked ? 'bg-green-500 border-green-500' : 'bg-transparent border-zinc-600'}`}>
                          {item.checked && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm truncate ${item.checked ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                          {item.text}
                        </span>
                      </div>
                      <button
                        onClick={() => setSendItemTarget({ listId: list.id, item })}
                        className="p-2 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                        title="Send this item"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Radar FAB */}
      <button
        onClick={() => setIsRadarOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-zinc-900 border-2 border-green-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-zinc-800 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all z-40 group"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
        {receivers.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-green-500 text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
            {receivers.length}
          </span>
        )}
      </button>

      {/* Item Send Modal */}
      {sendItemTarget && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-sm flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-sm font-bold text-white">Send Payload</h2>
              <button onClick={() => setSendItemTarget(null)} className="text-zinc-500 hover:text-white">Close</button>
            </div>
            <div className="p-4 text-sm text-zinc-400 bg-zinc-900 border-b border-zinc-800 truncate">
              {sendItemTarget.item.text}
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {receivers.length === 0 ? (
                <div className="p-4 text-center text-zinc-600 text-xs uppercase">No active receivers</div>
              ) : (
                receivers.map(r => (
                  <button
                    key={r.name}
                    onClick={() => handleSend(r.name, sendItemTarget.item.text, sendItemTarget.listId, sendItemTarget.item.id)}
                    className="w-full text-left p-3 hover:bg-zinc-900 transition-colors flex items-center gap-2 text-sm text-white"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    {r.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Radar Modal */}
      {isRadarOpen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
          <div className="p-4 flex justify-between items-center z-10">
            <h2 className="text-green-500 font-mono text-sm tracking-widest uppercase flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Tactical Radar
            </h2>
            <button onClick={() => setIsRadarOpen(false)} className="text-green-500/50 hover:text-green-500 font-mono text-xs uppercase tracking-widest cursor-pointer">
              Abort
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 relative">
            <div className="w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] radar-container relative">
              <div className="radar-grid" />
              <div className="radar-sweep" />

              {/* Center self */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_white]" />

              {/* Receiver Blips */}
              {receivers.map((r, i) => {
                // Generate deterministic-looking random positions based on index so they don't jump around wildly every render if possible, but simple random is fine for a radar
                const angle = (i * 137.5) * (Math.PI / 180);
                const distance = 25 + (i * 15 % 50); // 25% to 75% from center
                const top = 50 + Math.sin(angle) * distance;
                const left = 50 + Math.cos(angle) * distance;

                return (
                  <button
                    key={r.name}
                    onClick={() => setRadarTarget(r)}
                    className="absolute radar-blip flex flex-col items-center group cursor-crosshair"
                    style={{ top: `${top}%`, left: `${left}%`, transform: 'translate(-50%, -50%)' }}
                  >
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    <span className="text-green-500 font-mono text-[10px] mt-1 opacity-50 group-hover:opacity-100 tracking-wider">
                      {r.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quick Send Modal over Radar */}
          {radarTarget && (
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/90 border-t border-green-900/50 backdrop-blur-sm z-20">
              <div className="max-w-xl mx-auto flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-green-500 font-mono text-xs uppercase">Target Lock: {radarTarget.name}</span>
                  <button onClick={() => setRadarTarget(null)} className="text-green-900 hover:text-green-500 text-xs">CANCEL</button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={radarMessage}
                    onChange={(e) => setRadarMessage(e.target.value)}
                    placeholder="Enter payload..."
                    className="flex-1 bg-green-950/20 border border-green-900/50 p-3 text-green-500 font-mono text-sm outline-none placeholder:text-green-900 focus:border-green-500"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSend(radarTarget.name, radarMessage)}
                    disabled={!radarMessage.trim()}
                    className="px-6 bg-green-500 text-black font-bold uppercase tracking-wider text-xs hover:bg-green-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Fire
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
