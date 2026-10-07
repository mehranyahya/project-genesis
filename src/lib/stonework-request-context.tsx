import { createContext, useContext, useState, type ReactNode } from "react";

import type { StoneworkCategoryId } from "./stoneworks";

const StoneworkRequestContext = createContext<{
  category: StoneworkCategoryId | null;
  selectCategory: (category: StoneworkCategoryId | null) => void;
}>({ category: null, selectCategory: () => undefined });

/** Category only, in memory. No personal data, URL, storage or network persistence. */
export function StoneworkRequestProvider({ children }: { children: ReactNode }) {
  const [category, selectCategory] = useState<StoneworkCategoryId | null>(null);
  return (
    <StoneworkRequestContext.Provider value={{ category, selectCategory }}>
      {children}
    </StoneworkRequestContext.Provider>
  );
}

export function useStoneworkRequest() {
  return useContext(StoneworkRequestContext);
}
