import { createContext, useContext, useState, ReactNode, useCallback } from "react";

export interface GiftRecipient {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
  hideSender: boolean;
}

export interface CartItem {
  id: string;
  type: "service" | "package" | "product";
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  durationMinutes?: number;
  locationId?: string;
  schedulingOption: "schedule_now" | "leave_unscheduled" | "scheduled";
  scheduledDate?: string;
  scheduledTime?: string;
  fulfillmentType?: "pickup" | "delivery";
  isGift: boolean;
  giftRecipient?: GiftRecipient;
  imageUrl?: string;
}

interface BookingCartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<CartItem>) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
  getTotalDuration: () => number;
}

const BookingCartContext = createContext<BookingCartContextType | undefined>(undefined);

export function BookingCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: Omit<CartItem, "id">) => {
    const newItem: CartItem = {
      ...item,
      id: crypto.randomUUID(),
    };
    setItems((prev) => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<CartItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const getTotal = useCallback(() => {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [items]);

  const getItemCount = useCallback(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const getTotalDuration = useCallback(() => {
    return items
      .filter((item) => item.type === "service" || item.type === "package")
      .reduce((sum, item) => sum + (item.durationMinutes || 0) * item.quantity, 0);
  }, [items]);

  return (
    <BookingCartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateItem,
        clearCart,
        getTotal,
        getItemCount,
        getTotalDuration,
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
