import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost";
type Entry = { status: LeadStatus; notes: string };
type Store = Record<string, Entry>;

const KEY = "wq-leads-v1";

function readLocal(): Store {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export function useLeadStore() {
  const { user, loading: authLoading } = useAuth();
  const [store, setStore] = useState<Store>({});
  const migratedRef = useRef(false);

  // Load from DB when signed in, fall back to localStorage when signed out
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setStore(readLocal());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("lead_pipeline")
        .select("pwsid,status,notes")
        .eq("user_id", user.id);
      if (cancelled) return;
      const next: Store = {};
      (data ?? []).forEach((r: any) => {
        next[r.pwsid] = { status: r.status as LeadStatus, notes: r.notes ?? "" };
      });

      // One-time migration of any localStorage entries to the DB
      if (!migratedRef.current) {
        migratedRef.current = true;
        const local = readLocal();
        const toUpsert = Object.entries(local)
          .filter(([pwsid]) => !next[pwsid])
          .map(([pwsid, v]) => ({ user_id: user.id, pwsid, status: v.status, notes: v.notes }));
        if (toUpsert.length) {
          const { error } = await supabase
            .from("lead_pipeline")
            .upsert(toUpsert, { onConflict: "user_id,pwsid" });
          if (!error) {
            toUpsert.forEach((r) => { next[r.pwsid] = { status: r.status as LeadStatus, notes: r.notes }; });
            localStorage.removeItem(KEY);
          }
        }
      }
      setStore(next);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const update = useCallback((pwsid: string, patch: Partial<Entry>) => {
    setStore((prev) => {
      const merged: Entry = {
        status: patch.status ?? prev[pwsid]?.status ?? "new",
        notes: patch.notes ?? prev[pwsid]?.notes ?? "",
      };
      const next = { ...prev, [pwsid]: merged };
      if (user) {
        supabase
          .from("lead_pipeline")
          .upsert({ user_id: user.id, pwsid, ...merged }, { onConflict: "user_id,pwsid" })
          .then(({ error }) => { if (error) console.error("pipeline upsert", error); });
      } else {
        localStorage.setItem(KEY, JSON.stringify(next));
      }
      return next;
    });
  }, [user]);

  return { store, update };
}
