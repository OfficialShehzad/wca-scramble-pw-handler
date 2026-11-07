// Utility for managing local scramble source folder via File System Access API with fallback to HTML5 directory input

export interface ScrambleFile {
  name: string;
  path: string;
  handle?: any; // FileSystemFileHandle
  file?: File;
}

const DB_NAME = 'wca_scramble_storage';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const KEY_DIR_HANDLE = 'source_dir_handle';

// Open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('IndexedDB not available'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Save Directory Handle to IndexedDB
export async function saveStoredHandle(handle: any): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(handle, KEY_DIR_HANDLE);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not store handle in IndexedDB:', err);
  }
}

// Retrieve Directory Handle from IndexedDB
export async function getStoredHandle(): Promise<any | null> {
  try {
    const db = await openDB();
    return await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(KEY_DIR_HANDLE);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not read handle from IndexedDB:', err);
    return null;
  }
}

// Remove stored Directory Handle
export async function removeStoredHandle(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(KEY_DIR_HANDLE);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not remove handle from IndexedDB:', err);
  }
}

// Check permission for handle
export async function verifyPermission(handle: any, readWrite = false): Promise<boolean> {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  const options = { mode: readWrite ? 'readwrite' : 'read' };
  try {
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
    }
  } catch (err) {
    console.warn('Permission query/request failed:', err);
  }
  return false;
}

// Scan files from DirectoryHandle recursively
export async function scanDirectoryHandle(dirHandle: any, basePath = ''): Promise<ScrambleFile[]> {
  const results: ScrambleFile[] = [];
  try {
    for await (const entry of dirHandle.values()) {
      const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        if (entry.name.toLowerCase().endsWith('.pdf')) {
          results.push({
            name: entry.name,
            path: currentPath,
            handle: entry
          });
        }
      } else if (entry.kind === 'directory') {
        const subFiles = await scanDirectoryHandle(entry, currentPath);
        results.push(...subFiles);
      }
    }
  } catch (err) {
    console.error('Error scanning directory handle:', err);
  }
  return results;
}

// Normalize a filename or query string for fuzzy comparison
export function normalizeName(str: string): string {
  return str
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[\s_\-()[\]]+/g, '')
    .trim();
}

// Match a search name to one of the scramble files
export function matchScrambleFile(files: ScrambleFile[], searchName: string): ScrambleFile | null {
  if (!searchName || !searchName.trim()) return null;

  const raw = searchName.trim();
  const rawWithoutExt = raw.replace(/\.pdf$/i, '').trim();
  const lowerSearch = rawWithoutExt.toLowerCase();
  const normalizedSearch = normalizeName(rawWithoutExt);

  // 1. Exact filename match (e.g. "333.pdf" == "333.pdf" or "333" == "333.pdf")
  let match = files.find(f => f.name === raw || f.name === `${rawWithoutExt}.pdf`);
  if (match) return match;

  // 2. Case-insensitive exact match
  match = files.find(f => {
    const fNameNoExt = f.name.replace(/\.pdf$/i, '').toLowerCase();
    return fNameNoExt === lowerSearch;
  });
  if (match) return match;

  // 3. Normalized match (ignores spaces, underscores, hyphens, parentheses, etc.)
  match = files.find(f => normalizeName(f.name) === normalizedSearch);
  if (match) return match;

  // 4. One contains the other
  if (normalizedSearch.length >= 3) {
    match = files.find(f => {
      const normF = normalizeName(f.name);
      return normF.includes(normalizedSearch) || normalizedSearch.includes(normF);
    });
    if (match) return match;
  }

  // 5. Token match: all words/tokens in searchName appear in file name
  const tokens = lowerSearch.split(/[\s_\-]+/).filter(t => t.length > 0);
  if (tokens.length > 1) {
    match = files.find(f => {
      const lowerF = f.name.toLowerCase();
      return tokens.every(tok => lowerF.includes(tok));
    });
    if (match) return match;
  }

  return null;
}

// Obtain Blob from a ScrambleFile
export async function getScrambleFileBlob(item: ScrambleFile): Promise<Blob> {
  if (item.file) {
    return item.file;
  }
  if (item.handle && typeof item.handle.getFile === 'function') {
    const file = await item.handle.getFile();
    return file;
  }
  throw new Error('Unable to read file: missing file object and handle');
}

// Open Blob in a new tab
export function openBlobInNewTab(blob: Blob): Window | null {
  if (typeof window === 'undefined') return null;
  const pdfBlob = blob.type === 'application/pdf'
    ? blob
    : new Blob([blob], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(pdfBlob);
  const newTab = window.open(blobUrl, '_blank');
  // Revoke object URL after a delay so the new tab has time to load the PDF
  setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, 60000);
  return newTab;
}
