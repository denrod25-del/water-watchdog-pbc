import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StateCounty = z.object({
  state: z.string().length(2).regex(/^[A-Z]{2}$/),
  county: z.string().min(1).max(80),
});

export type SavedSearch = {
  id: string;
  state: string;
  county: string;
  label: string | null;
  createdAt: string;
};

export const listSavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SavedSearch[]> => {
    const { data, error } = await context.supabase
      .from("saved_searches")
      .select("id,state_code,county_name,label,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      state: r.state_code as string,
      county: r.county_name as string,
      label: (r.label as string | null) ?? null,
      createdAt: r.created_at as string,
    }));
  });

export const addSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StateCounty.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_searches")
      .upsert(
        {
          user_id: context.userId,
          state_code: data.state.toUpperCase(),
          county_name: data.county,
        },
        { onConflict: "user_id,state_code,county_name" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StateCounty.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_searches")
      .delete()
      .eq("state_code", data.state.toUpperCase())
      .eq("county_name", data.county);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const StateOnly = z.object({ state: z.string().length(2).regex(/^[A-Z]{2}$/) });

/** Counties other users have already searched in this state — surfaces nearby/popular suggestions. */
export const popularCountiesInState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StateOnly.parse(input))
  .handler(async ({ data }): Promise<{ county: string; systemCount: number }[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("county_search_cache")
      .select("county_name,system_count,fetched_at")
      .eq("state_code", data.state.toUpperCase())
      .gt("system_count", 0)
      .order("fetched_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    const seen = new Map<string, number>();
    for (const r of rows ?? []) {
      const c = r.county_name as string;
      if (!seen.has(c)) seen.set(c, (r.system_count as number) ?? 0);
    }
    return Array.from(seen.entries())
      .map(([county, systemCount]) => ({ county, systemCount }))
      .slice(0, 12);
  });