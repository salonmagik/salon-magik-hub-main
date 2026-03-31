import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";

export interface BranchOption {
  id: string;
  name: string;
  city: string | null;
  country_code: string;
  address?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  opening_days?: string[] | null;
  availability?: string | null;
}

export interface DeliveryAddress {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  deliveryNotes?: string;
}

export interface GiftRecipient {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
  hideSender: boolean;
  address?: DeliveryAddress;
}

export type ScheduleMode = "schedule_now" | "leave_unscheduled";

export interface CartItem {
  id: string;
  type: "service" | "package" | "product";
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  durationMinutes?: number;
  isGift: boolean;
  giftRecipient?: GiftRecipient;
  imageUrl?: string;
  fulfillmentType?: "pickup" | "delivery";
  eligibleBranches?: BranchOption[];
  branchId?: string;
  branchName?: string;
  scheduleMode?: ScheduleMode;
  scheduledDate?: string;
  scheduledTime?: string;
  selectedStaffId?: string;
  serviceIds?: string[];
}

interface BookingCartMeta {
  giftsBelongToSamePerson: boolean;
}

interface BookingCartContextType {
  items: CartItem[];
  meta: BookingCartMeta;
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<CartItem>) => void;
  updateQuantity: (itemId: string, type: CartItem["type"], delta: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  getTotalDuration: () => number;
  getItemInCart: (itemId: string, type: CartItem["type"]) => CartItem | undefined;
  getGiftItems: () => CartItem[];
  updateMeta: (updates: Partial<BookingCartMeta>) => void;
}

const STORAGE_KEY = "public-booking-cart-v2";
const STORAGE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_META: BookingCartMeta = {
  giftsBelongToSamePerson: true,
};

type PersistedScope = {
  items: CartItem[];
  meta: BookingCartMeta;
  expiresAt: number;
};

type PersistedCartState = Record<string, PersistedScope>;

const BookingCartContext = createContext<BookingCartContextType | undefined>(undefined);

function getStorage(): PersistedCartState {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as PersistedCartState;
    const now = Date.now();
    const next: PersistedCartState = {};

    Object.entries(parsed).forEach(([scope, value]) => {
      if (value?.expiresAt && value.expiresAt > now) {
        next[scope] = value;
      }
    });

    if (Object.keys(next).length !== Object.keys(parsed).length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }

    return next;
  } catch (error) {
    console.error("Error reading booking cart storage:", error);
    return {};
  }
}

function persistScope(scope: string, value: PersistedScope | null) {
  if (typeof window === "undefined") return;

  const current = getStorage();
  if (value) {
    current[scope] = value;
  } else {
    delete current[scope];
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

function autoSelectSingleBranch(item: Omit<CartItem, "id">): Omit<CartItem, "id"> {
  if ((item.eligibleBranches?.length || 0) !== 1) return item;
  const branch = item.eligibleBranches![0];
  return {
    ...item,
    branchId: item.branchId || branch.id,
    branchName: item.branchName || branch.name,
  };
}

function normalizeCartItem(item: CartItem): CartItem {
  const normalizedScheduleMode =
    item.type === "product" ? undefined : item.scheduleMode || "schedule_now";

  if ((item.eligibleBranches?.length || 0) === 1 && !item.branchId) {
    const branch = item.eligibleBranches![0];
    return {
      ...item,
      branchId: branch.id,
      branchName: item.branchName || branch.name,
      scheduleMode: normalizedScheduleMode,
    };
  }

  return {
    ...item,
    scheduleMode: normalizedScheduleMode,
  };
}

function cloneUnit(item: CartItem): CartItem {
  return {
    ...item,
    id: crypto.randomUUID(),
    quantity: 1,
    branchId: item.branchId,
    branchName: item.branchName,
    scheduleMode: item.scheduleMode ?? (item.type === "product" ? undefined : "schedule_now"),
    scheduledDate: item.scheduledDate,
    scheduledTime: item.scheduledTime,
    selectedStaffId: item.selectedStaffId,
  };
}

export function BookingCartProvider({
  children,
  scopeKey,
}: {
  children: ReactNode;
  scopeKey?: string;
}) {
  const activeScope = scopeKey || "default";
  const persisted = useMemo(() => getStorage()[activeScope], [activeScope]);

  const [items, setItems] = useState<CartItem[]>(() => (persisted?.items || []).map(normalizeCartItem));
  const [meta, setMeta] = useState<BookingCartMeta>(persisted?.meta || DEFAULT_META);

  useEffect(() => {
    setItems((persisted?.items || []).map(normalizeCartItem));
    setMeta(persisted?.meta || DEFAULT_META);
  }, [persisted?.expiresAt, activeScope]);

  useEffect(() => {
    if (items.length === 0 && meta.giftsBelongToSamePerson === DEFAULT_META.giftsBelongToSamePerson) {
      persistScope(activeScope, null);
      return;
    }

    persistScope(activeScope, {
      items,
      meta,
      expiresAt: Date.now() + STORAGE_TTL_MS,
    });
  }, [activeScope, items, meta]);

  const addItem = useCallback((incoming: Omit<CartItem, "id">) => {
    const item = autoSelectSingleBranch({
      ...incoming,
      scheduleMode: incoming.type === "product" ? undefined : incoming.scheduleMode || "schedule_now",
    });

    setItems((prev) => {
      if (item.type === "product") {
        const existingIndex = prev.findIndex(
          (entry) =>
            entry.type === "product" &&
            entry.itemId === item.itemId &&
            entry.fulfillmentType === item.fulfillmentType &&
            entry.branchId === item.branchId &&
            entry.isGift === item.isGift,
        );

        if (existingIndex >= 0) {
          return prev.map((entry, index) =>
            index === existingIndex
              ? { ...entry, quantity: entry.quantity + Math.max(1, item.quantity || 1) }
              : entry,
          );
        }
      }

      const unitsToAdd = item.type === "product" ? 1 : Math.max(1, item.quantity || 1);
      const nextItems =
        item.type === "product"
          ? [{ ...item, id: crypto.randomUUID(), quantity: Math.max(1, item.quantity || 1) }]
          : Array.from({ length: unitsToAdd }, () => ({
              ...item,
              id: crypto.randomUUID(),
              quantity: 1,
            }));

      return [...prev, ...nextItems];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<CartItem>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextItem = { ...item, ...updates };
        if (updates.branchId && item.eligibleBranches?.length) {
          const branch = item.eligibleBranches.find((entry) => entry.id === updates.branchId);
          nextItem.branchName = branch?.name || nextItem.branchName;
        }
        if (updates.scheduleMode === "leave_unscheduled") {
          nextItem.scheduledDate = undefined;
          nextItem.scheduledTime = undefined;
          nextItem.selectedStaffId = undefined;
        }
        if (updates.branchId && updates.branchId !== item.branchId) {
          nextItem.scheduledDate = undefined;
          nextItem.scheduledTime = undefined;
          nextItem.selectedStaffId = undefined;
        }
        return nextItem;
      }),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setMeta(DEFAULT_META);
  }, []);

  const updateQuantity = useCallback((itemId: string, type: CartItem["type"], delta: number) => {
    setItems((prev) => {
      const matches = prev.filter((item) => item.itemId === itemId && item.type === type);
      if (matches.length === 0) return prev;

      if (type === "product") {
        const target = matches[0];
        const nextQuantity = target.quantity + delta;
        if (nextQuantity <= 0) {
          return prev.filter((item) => item.id !== target.id);
        }
        return prev.map((item) => (item.id === target.id ? { ...item, quantity: nextQuantity } : item));
      }

      if (delta > 0) {
        const base = matches[matches.length - 1];
        return [...prev, cloneUnit(base)];
      }

      return prev.filter((item) => item.id !== matches[matches.length - 1].id);
    });
  }, []);

  const getItemInCart = useCallback(
    (itemId: string, type: CartItem["type"]): CartItem | undefined => {
      const matchingItems = items.filter((item) => item.itemId === itemId && item.type === type);
      if (matchingItems.length === 0) return undefined;
      const first = matchingItems[0];
      const aggregatedQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...first,
        quantity: aggregatedQuantity,
      };
    },
    [items],
  );

  const getGiftItems = useCallback((): CartItem[] => {
    return items.filter((item) => item.isGift);
  }, [items]);

  const getTotal = useCallback(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  const getItemCount = useCallback(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const getTotalDuration = useCallback(() => {
    return items
      .filter((item) => item.type === "service" || item.type === "package")
      .reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  }, [items]);

  const updateMeta = useCallback((updates: Partial<BookingCartMeta>) => {
    setMeta((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <BookingCartContext.Provider
      value={{
        items,
        meta,
        addItem,
        removeItem,
        updateItem,
        updateQuantity,
        clearCart,
        getTotal,
        getItemCount,
        getTotalDuration,
        getItemInCart,
        getGiftItems,
        updateMeta,
      }}
    >
      {children}
    </BookingCartContext.Provider>
  );
}

export function useBookingCart() {
  const context = useContext(BookingCartContext);
  if (!context) {
    throw new Error("useBookingCart must be used within BookingCartProvider");
  }
  return context;
}
