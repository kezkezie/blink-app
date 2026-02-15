import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Server-side Supabase client using the service role key.
 * Use this ONLY in server components & API routes — never expose to the browser.
 * Bypasses RLS for admin-level data access.
 */
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey)
