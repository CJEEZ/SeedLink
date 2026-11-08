import { ref, type DataSnapshot, type DatabaseReference } from 'firebase/database';
import { database, getConfiguredDatabase } from '../firebase';

export type SeedCategory = 'Rice' | 'Corn' | 'Fruit' | 'Vegetables';

export interface SeedBatch {
  id: string;
  seedName: string;
  category: SeedCategory;
  stock: number;
  municipality: string;
  batchCode: string;
  expiryDate: string;
  depot: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'in_transit' | 'delivered' | 'rejected';

export interface AllocationRequest {
  id: string;
  requesterUid: string;
  requesterName: string;
  batchId: string;
  depot: string;
  seedName: string;
  category: SeedCategory;
  requestedBags: number;
  municipality: string;
  status: RequestStatus;
  deliveryVerified: boolean;
  truckId?: string;
  freightNote?: string;
  latitude?: number;
  longitude?: number;
  lastLocationAt?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  deliveryVerifiedAt?: string;
}

export function inventoryFromSnapshot(snapshot: DataSnapshot): SeedBatch[] {
  const records = snapshot.val() as Record<string, Omit<SeedBatch, 'id'>> | null;
  return Object.entries(records ?? {}).map(([id, batch]) => ({ ...batch, id }));
}

export function requestsFromSnapshot(snapshot: DataSnapshot): AllocationRequest[] {
  const records = snapshot.val() as Record<string, Omit<AllocationRequest, 'id'>> | null;
  return Object.entries(records ?? {}).map(([id, request]) => ({ ...request, id }));
}

const INVENTORY_STORAGE_KEY = 'seedlink-demo-inventory';
const REQUESTS_STORAGE_KEY = 'seedlink-demo-requests';

const defaultInventory: SeedBatch[] = [
  {
    id: 'demo-batch-rice-1',
    seedName: 'IR64 Rice',
    category: 'Rice',
    stock: 430,
    municipality: 'Calapan City',
    batchCode: 'RICE-CAL-101',
    expiryDate: '2027-12-31',
    depot: 'Calapan Seed Hub',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-batch-fruit-1',
    seedName: 'Cantaloupe',
    category: 'Fruit',
    stock: 210,
    municipality: 'Naujan',
    batchCode: 'FRUIT-NAU-206',
    expiryDate: '2027-10-15',
    depot: 'Naujan Depot',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const defaultRequests: AllocationRequest[] = [
  {
    id: 'demo-request-1',
    requesterUid: 'seedlink-farmer-demo',
    requesterName: 'Demo Farmer',
    batchId: 'demo-batch-rice-1',
    depot: 'Calapan Seed Hub',
    seedName: 'IR64 Rice',
    category: 'Rice',
    requestedBags: 60,
    municipality: 'Calapan City',
    status: 'approved',
    deliveryVerified: true,
    note: 'For the upcoming wet season.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deliveryVerifiedAt: new Date().toISOString(),
  },
];

export function getStoredInventory(): SeedBatch[] {
  const storedInventory = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
  if (!storedInventory) {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(defaultInventory));
    return defaultInventory;
  }
  try {
    return JSON.parse(storedInventory) as SeedBatch[];
  } catch {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(defaultInventory));
    return defaultInventory;
  }
}

export function persistInventory(items: SeedBatch[]) {
  window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
}

export function getStoredRequests(): AllocationRequest[] {
  const storedRequests = window.localStorage.getItem(REQUESTS_STORAGE_KEY);
  if (!storedRequests) {
    window.localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(defaultRequests));
    return defaultRequests;
  }
  try {
    return JSON.parse(storedRequests) as AllocationRequest[];
  } catch {
    window.localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(defaultRequests));
    return defaultRequests;
  }
}

export function persistRequests(items: AllocationRequest[]) {
  window.localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(items));
}

export const userProfileRef = (uid: string): DatabaseReference | null => {
  if (!database) return null;
  return ref(getConfiguredDatabase(), `users/${uid}`);
};

export const inventoryRef = (): DatabaseReference | null => {
  if (!database) {
    return null;
  }
  return ref(getConfiguredDatabase(), 'seedInventory');
};

export const inventoryItemRef = (id: string): DatabaseReference | null => {
  if (!database) {
    return null;
  }
  return ref(getConfiguredDatabase(), `seedInventory/${id}`);
};

export const requestsRef = (): DatabaseReference | null => {
  if (!database) {
    return null;
  }
  return ref(getConfiguredDatabase(), 'allocationRequests');
};

export const requestItemRef = (id: string): DatabaseReference | null => {
  if (!database) {
    return null;
  }
  return ref(getConfiguredDatabase(), `allocationRequests/${id}`);
};