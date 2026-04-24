import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Server-side Supabase client using the service role key.
 * Use this ONLY in server components & API routes — never expose to the browser.
 * Bypasses RLS for admin-level data access.
 *
 * Note: We intentionally omit the Database generic here. The typed generic
 * requires Enums/CompositeTypes/Views/Functions to satisfy GenericSchema in
 * supabase-js v2.95+. Our server actions provide their own input/output type
 * safety at the API boundary.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
