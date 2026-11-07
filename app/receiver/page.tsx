'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { setDiscoverable, subscribeToMyMessage, Message, updateLastActive } from '@/lib/firestore';
import { toast } from 'sonner';
import {
  ScrambleFile,
  scanDirectoryHandle,
  matchScrambleFile,
  getScrambleFileBlob,
  openBlobInNewTab,
  saveStoredHandle,
  getStoredHandle,
  removeStoredHandle,
  verifyPermission
} from '@/lib/source-folder';

export default function ReceiverDashboard() {
  const [myName, setMyName] = useState('');
  const [isDiscoverable, setIsDiscoverable] = useState(false);
  const [incomingMessage, setIncomingMessage] = useState<Message | null>(null);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Source Folder State
  const [folderName, setFolderName] = useState('');
  const [files, setFiles] = useState<ScrambleFile[]>([]);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isFolderLoading, setIsFolderLoading] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Initialize and check user
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

  // Restore stored directory handle from IndexedDB
  useEffect(() => {
    const restoreFolder = async () => {
      const savedName = localStorage.getItem('source_folder_name') || '';
      try {
        const storedHandle = await getStoredHandle();
        if (storedHandle) {
          setDirHandle(storedHandle);
          setFolderName(storedHandle.name || savedName);
          const opts = { mode: 'read' };
          if (typeof storedHandle.queryPermission === 'function') {
            const perm = await storedHandle.queryPermission(opts);
            if (perm === 'granted') {
              const scanned = await scanDirectoryHandle(storedHandle);
              setFiles(scanned);
              setNeedsPermission(false);
            } else {
              setNeedsPermission(true);
            }
          }
        } else if (savedName) {
          setFolderName(savedName);
        }
      } catch (err) {
        console.warn('Error restoring folder from storage:', err);
      }
    };
    restoreFolder();
  }, []);

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

  // Select folder via File System Access API
  const handleSelectFolder = async () => {
    setIsFolderLoading(true);
    try {
      if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
        const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
        if (!handle) return;
        const scanned = await scanDirectoryHandle(handle);
        setDirHandle(handle);
        setFolderName(handle.name);
        setFiles(scanned);
        setNeedsPermission(false);
        localStorage.setItem('source_folder_name', handle.name);
        await saveStoredHandle(handle);
        toast.success(`Source folder set: "${handle.name}" (${scanned.length} PDFs loaded)`);
      } else {
        // Fallback for browsers without showDirectoryPicker
        fileInputRef.current?.click();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error selecting folder:', err);
        // Fallback to file input if showDirectoryPicker failed
        fileInputRef.current?.click();
      }
    } finally {
      setIsFolderLoading(false);
    }
  };

  // HTML5 input directory fallback handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const list: ScrambleFile[] = [];
    let detectedFolder = '';

    for (let i = 0; i < selectedFiles.length; i++) {
      const f = selectedFiles[i];
      if (f.name.toLowerCase().endsWith('.pdf')) {
        list.push({
          name: f.name,
          path: f.webkitRelativePath || f.name,
          file: f
        });
      }
      if (!detectedFolder && f.webkitRelativePath) {
        detectedFolder = f.webkitRelativePath.split('/')[0];
      }
    }

    const name = detectedFolder || 'Scrambles Folder';
    setFolderName(name);
    setFiles(list);
    setDirHandle(null);
    setNeedsPermission(false);
    localStorage.setItem('source_folder_name', name);
    toast.success(`Source folder set: "${name}" (${list.length} PDFs loaded)`);
  };

  // Clear selected folder
  const handleClearFolder = async () => {
    setFolderName('');
    setFiles([]);
    setDirHandle(null);
    setNeedsPermission(false);
    localStorage.removeItem('source_folder_name');
    await removeStoredHandle();
    toast.info('Source folder cleared.');
  };

  // Re-authorize stored folder handle
  const handleGrantPermission = async () => {
    if (!dirHandle) {
      handleSelectFolder();
      return;
    }
    try {
      const granted = await verifyPermission(dirHandle, false);
      if (granted) {
        const scanned = await scanDirectoryHandle(dirHandle);
        setFiles(scanned);
        setNeedsPermission(false);
        toast.success(`Reconnected to "${dirHandle.name}" (${scanned.length} PDFs found)`);
      } else {
        toast.error('Permission not granted to access folder.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error re-authorizing folder.');
    }
  };

  // Parse incoming message: split by ':'
  let pdfName = '';
  let content = incomingMessage?.text || '';
  let heading = 'Payload';

  if (incomingMessage?.text && incomingMessage.text.includes(':')) {
    const colonIndex = incomingMessage.text.indexOf(':');
    pdfName = incomingMessage.text.slice(0, colonIndex).trim();
    content = incomingMessage.text.slice(colonIndex + 1).trim();
    heading = pdfName || 'Payload';
  }

  // Check if PDF exists in loaded files
  const matchedFile = pdfName ? matchScrambleFile(files, pdfName) : null;

  // Open PDF in new tab
  const handleOpenPdf = async () => {
    if (!pdfName) {
      toast.error('No scramble PDF name found in message (format must be <pdf_name>:<password>)');
      return;
    }

    if (!folderName) {
      toast.error('Please select the source folder containing scramble PDFs first.');
      handleSelectFolder();
      return;
    }

    if (needsPermission && dirHandle) {
      const granted = await verifyPermission(dirHandle, false);
      if (!granted) {
        toast.error('Permission needed to access source folder. Please click "Re-authorize".');
        return;
      }
      setNeedsPermission(false);
      const scanned = await scanDirectoryHandle(dirHandle);
      setFiles(scanned);
    }

    // Try finding matching file
    let target = matchScrambleFile(files, pdfName);

    // If not found yet and we have a dirHandle, try a live scan in case files were recently added
    if (!target && dirHandle) {
      try {
        const fresh = await scanDirectoryHandle(dirHandle);
        setFiles(fresh);
        target = matchScrambleFile(fresh, pdfName);
      } catch (err) {
        console.warn('Live rescan failed:', err);
      }
    }

    if (!target) {
      toast.error(`Could not find "${pdfName}" (.pdf) in "${folderName}".`);
      return;
    }

    try {
      const blob = await getScrambleFileBlob(target);
      const win = openBlobInNewTab(blob);
      if (!win) {
        toast.error('Pop-up was blocked. Please allow pop-ups for this site to open PDFs.');
      } else {
        toast.success(`Opening ${target.name} in a new tab...`);
      }
    } catch (err) {
      console.error('Failed to open PDF:', err);
      toast.error('Failed to open PDF file.');
    }
  };

  if (!myName) return null;

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

          {/* Source Folder Configuration Card */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-zinc-400"
                >
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                  Source Folder
                </span>
              </div>
              <div className="flex items-center gap-3">
                {folderName && (
                  <button
                    type="button"
                    onClick={handleClearFolder}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={needsPermission ? handleGrantPermission : handleSelectFolder}
                  disabled={isFolderLoading}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isFolderLoading
                    ? 'Scanning...'
                    : folderName
                    ? needsPermission
                      ? 'Re-authorize'
                      : 'Change'
                    : 'Select Folder'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
              <div className="truncate text-zinc-300 font-mono">
                {folderName ? (
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold">{folderName}</span>
                    {needsPermission ? (
                      <span className="text-amber-400 text-[11px] font-sans">
                        (Permission needed — click Re-authorize)
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-[11px] font-sans">
                        ({files.length} {files.length === 1 ? 'PDF' : 'PDFs'} indexed)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-500 italic font-sans">
                    No source folder selected. Select the local directory containing scramble PDFs.
                  </span>
                )}
              </div>
            </div>

            {/* Hidden directory input fallback */}
            <input
              ref={fileInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is standard in browsers but not TS HTMLInputElement type
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Message Area */}
          <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col min-h-[300px]">
            {!incomingMessage ? (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-zinc-600 text-sm">Waiting for incoming transmission...</span>
              </div>
            ) : (
              <div className="flex-1 flex flex-col relative group">
                <div className="text-xs text-zinc-400 mb-6 uppercase tracking-wider border-b border-zinc-800 pb-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{heading}</span>
                    {pdfName && matchedFile && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.5 rounded normal-case font-mono">
                        PDF Ready
                      </span>
                    )}
                    {pdfName && !matchedFile && folderName && !needsPermission && (
                      <span className="text-[10px] text-amber-500/80 bg-amber-950/40 border border-amber-900/60 px-1.5 py-0.5 rounded normal-case font-mono">
                        PDF Not Found
                      </span>
                    )}
                  </div>
                  <span className="text-zinc-600 normal-case">From: {incomingMessage.senderId}</span>
                </div>
                
                <div className="flex-1 flex items-center justify-between">
                  <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight break-words">
                    {content}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {/* Open PDF in New Tab Button */}
                    <button
                      onClick={handleOpenPdf}
                      className={`p-3 cursor-pointer transition-colors ${
                        matchedFile
                          ? 'text-white hover:text-emerald-400'
                          : 'text-zinc-500 hover:text-white'
                      }`}
                      title={pdfName ? `Open "${pdfName}" in new tab` : 'Open PDF in new tab'}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      </svg>
                    </button>

                    {/* Copy Password Button */}
                    <button 
                      onClick={() => handleCopy(content)}
                      className="p-3 text-zinc-500 hover:text-white cursor-pointer transition-colors"
                      title="Copy Payload"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                      </svg>
                    </button>
                  </div>
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
                className="flex-1 p-3 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleLogout}
                className="flex-1 p-3 text-black bg-white hover:bg-zinc-200 transition-colors text-sm font-bold cursor-pointer"
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
