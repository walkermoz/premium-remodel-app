export const appUrl = (
  process.env.EXPO_PUBLIC_APP_URL || "https://servicebuddy-ui.vercel.app"
).replace(/\/$/, "");

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

export function hasConfiguration() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
