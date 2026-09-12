import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  updateDoc 
} from 'firebase/firestore';

export type Role = 'sender' | 'receiver';

export interface ListItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface TextList {
  id: string;
  title: string;
  items: ListItem[];
  isCollapsed: boolean;
}

export interface User {
  name: string;
  role: Role;
  isDiscoverable: boolean;
  lastActive: any;
  lists?: TextList[];
}

export interface Message {
  senderId: string;
  text: string;
  timestamp: any;
}

export const getUser = async (name: string): Promise<User | null> => {
  const userRef = doc(db, 'users', name);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    return snap.data() as User;
  }
  return null;
};

// Register a new user in the 'users' collection
export const registerUser = async (name: string, role: Role) => {
  const existingUser = await getUser(name);
  if (existingUser) {
    throw new Error('User already exists');
  }

  const userRef = doc(db, 'users', name);
  await setDoc(userRef, {
    name,
    role,
    isDiscoverable: false,
    lastActive: serverTimestamp()
  });
  return name;
};

// Update discoverability for a receiver
export const setDiscoverable = async (name: string, isDiscoverable: boolean) => {
  const userRef = doc(db, 'users', name);
  await setDoc(userRef, {
    isDiscoverable,
    lastActive: serverTimestamp()
  }, { merge: true });
};

// Keep user active
export const updateLastActive = async (name: string) => {
  const userRef = doc(db, 'users', name);
  await setDoc(userRef, {
    lastActive: serverTimestamp()
  }, { merge: true });
};

// Subscribe to discoverable receivers (for the sender)
export const subscribeToReceivers = (callback: (receivers: User[]) => void) => {
  const q = query(
    collection(db, 'users'), 
    where('role', '==', 'receiver'),
    where('isDiscoverable', '==', true)
  );
  
  return onSnapshot(q, (snapshot) => {
    const receivers: User[] = [];
    snapshot.forEach((doc) => {
      receivers.push(doc.data() as User);
    });
    callback(receivers);
  });
};

// Send a message (overwrites the previous message for that receiver)
export const sendMessage = async (receiverName: string, senderName: string, text: string) => {
  const msgRef = doc(db, 'messages', receiverName);
  await setDoc(msgRef, {
    senderId: senderName,
    text,
    timestamp: serverTimestamp()
  });
};

// Subscribe to messages (for the receiver)
export const subscribeToMyMessage = (myName: string, callback: (msg: Message | null) => void) => {
  const msgRef = doc(db, 'messages', myName);
  return onSnapshot(msgRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data() as Message);
    } else {
      callback(null);
    }
  });
};

// Subscribe to user's lists (for the sender)
export const subscribeToUserLists = (myName: string, callback: (lists: TextList[]) => void) => {
  const userRef = doc(db, 'users', myName);
  return onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data() as User;
      callback(data.lists || []);
    } else {
      callback([]);
    }
  });
};

// Update user's lists
export const updateUserLists = async (myName: string, lists: TextList[]) => {
  const userRef = doc(db, 'users', myName);
  await updateDoc(userRef, { lists });
};
