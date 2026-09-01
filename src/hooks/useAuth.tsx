import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/rine";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, displayName?: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) {
      setProfile(data as Profile);
      return;
    }
    // プロフィール未作成の場合は自動で作成（friend_code は DB 側で自動割り当て）
    const { data: created } = await supabase
      .from("profiles")
      .insert({ id: userId, display_name: displayName?.trim() || "ユーザー", friend_code: "" })
      .select("*")
      .maybeSingle();
    if (created) {
      setProfile(created as Profile);
      return;
    }
    const { data: retry } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile((retry as Profile) ?? null);
  }, []);


  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const u = newSession.user;
        const name =
          (u.user_metadata?.['display_name'] as string | undefined) ??
          (u.user_metadata?.['full_name'] as string | undefined);
        setTimeout(() => void loadProfile(u.id, name), 0);
      } else {
        setProfile(null);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      const u = data.session?.user;
      if (u) {
        const name =
          (u.user_metadata?.['display_name'] as string | undefined) ??
          (u.user_metadata?.['full_name'] as string | undefined);
        void loadProfile(u.id, name);
      }

      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
