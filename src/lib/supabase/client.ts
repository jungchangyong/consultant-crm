import { createBrowserClient } from '@supabase/ssr';
import { DEMO_MODE } from '@/lib/mock-data';

export function createClient() {
  if (DEMO_MODE) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
