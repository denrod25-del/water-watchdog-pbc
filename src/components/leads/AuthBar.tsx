import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Cloud, CloudOff } from "lucide-react";
import { toast } from "sonner";

export function AuthBar() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 text-xs shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {user ? (
          <>
            <Cloud className="h-3.5 w-3.5 text-primary" />
            <span>Pipeline syncing as <span className="font-semibold text-foreground">{user.email}</span></span>
          </>
        ) : (
          <>
            <CloudOff className="h-3.5 w-3.5" />
            <span>Pipeline saved locally only — sign in to sync across devices</span>
          </>
        )}
      </div>
      {user ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await supabase.auth.signOut();
            toast.success("Signed out");
          }}
          className="h-7 gap-1.5 text-xs"
        >
          <LogOut className="h-3 w-3" /> Sign out
        </Button>
      ) : (
        <Button asChild size="sm" className="h-7 gap-1.5 text-xs">
          <Link to="/auth"><LogIn className="h-3 w-3" /> Sign in</Link>
        </Button>
      )}
    </div>
  );
}
