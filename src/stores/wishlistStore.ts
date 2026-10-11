import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface WishlistStore {
  handles: string[];
  toggle: (handle: string) => void;
}

export const useWishlistStore = create<WishlistStore>()(
  persist(
    (set, get) => ({
      handles: [],
      toggle: (handle) => {
        const handles = get().handles;
        set({
          handles: handles.includes(handle)
            ? handles.filter((h) => h !== handle)
            : [...handles, handle],
        });
      },
    }),
    { name: "vitaminku-wishlist", storage: createJSONStorage(() => localStorage) },
  ),
);
