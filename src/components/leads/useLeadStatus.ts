import { useEffect, useState, useCallback } from "react";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
type Store = Record<string, { status: LeadStatus; notes: string }>;

const KEY = "wq-leads-v1";

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function useLeadStore() {
  const [store, setStore] = useState<Store>({});
  useEffect(() => {
    setStore(read());
  }, []);

  const update = useCallback((pwsid: string, patch: Partial<{ status: LeadStatus; notes: string }>) => {
    setStore((prev) => {
      const next = {
        ...prev,
        [pwsid]: {
          status: patch.status ?? prev[pwsid]?.status ?? "new",
          notes: patch.notes ?? prev[pwsid]?.notes ?? "",
        },
      };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { store, update };
}
