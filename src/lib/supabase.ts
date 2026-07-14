// Supabase client — wire up VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
// import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export { supabaseUrl, supabaseAnonKey };

// Uncomment after: pnpm add @supabase/supabase-js
// export const supabase = createClient(supabaseUrl, supabaseAnonKey);
