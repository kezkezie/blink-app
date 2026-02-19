# Setup Checklist ✅

## Before You Start

- [ ] Node.js and npm installed
- [ ] Project dependencies installed (`npm install`)
- [ ] Supabase project created and configured

---

## Step 1: Environment Variables ✅

Your `.env.local` now has:
```env
NEXT_PUBLIC_SUPABASE_URL=https://hzkufspjozkgmloznkvp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR_KEY]
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TESTING_MODE=true
```

✅ **Already configured!**

---

## Step 2: Supabase Configuration

### Enable Google OAuth

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication > Providers**
4. Find **Google** and click **Enable**
5. Add your Google OAuth credentials:
   - Get them from [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials (type: Web Application)
   - Add redirect URI: `https://hzkufspjozkgmloznkvp.supabase.co/auth/v1/callback`

✅ **Do this if you want Google Sign-In to work**

---

## Step 3: Database Setup

### Create Clients Table

Run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  website_url text,
  industry text,
  plan_tier text DEFAULT 'starter',
  onboarding_status text DEFAULT 'form_submitted',
  onboarding_notes jsonb,
  approval_channel text,
  approval_contact text,
  timezone text DEFAULT 'UTC',
  billing_status text DEFAULT 'trial',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Users can only view their own clients
CREATE POLICY "Users can view their own clients"
  ON clients
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own clients
CREATE POLICY "Users can insert their own clients"
  ON clients
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX clients_user_id_idx ON clients(user_id);
CREATE INDEX clients_created_at_idx ON clients(created_at);
```

✅ **Run this SQL in your Supabase project**

---

## Step 4: Update Auth Email Template (Optional)

In Supabase Dashboard → Authentication → Email Templates

**Magic Link / Confirmation Email:**

Update the confirmation link to redirect to `/auth/callback?next=/onboarding` instead of the default.

---

## Step 5: Test the Flow

### Terminal 1: Start Development Server
```bash
npm run dev
```

### Terminal 2: Test Email Signup
```bash
# 1. Visit http://localhost:3000/signup
# 2. Enter:
#    - Email: testuser@example.com
#    - Password: TestPassword123
# 3. Should see success message and redirect to /onboarding
# 4. Complete onboarding form
# 5. Should redirect to /dashboard
```

### Test Google Signup
```bash
# 1. Visit http://localhost:3000/signup
# 2. Click "Sign up with Google"
# 3. Follow OAuth flow
# 4. Should end up on /onboarding
# 5. Complete form → /dashboard
```

### Test Dashboard Protection
```bash
# 1. Clear browser cookies
# 2. Try to visit http://localhost:3000/dashboard
# 3. Should redirect to /login
# 4. After signup but BEFORE onboarding, trying /dashboard
# 5. Should redirect back to /onboarding
```

---

## Step 6: Verify in Supabase Dashboard

After testing, check:

1. **Auth → Users**
   - New user should appear with metadata: `onboarding_completed: true`

2. **Database → clients table**
   - New client record should exist with all form data
   - Should have `user_id` matching the auth user

---

## ⚠️ Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "Email already exists" | Use a different test email |
| Google OAuth not working | Check OAuth credentials in Supabase |
| Stuck on /onboarding | Check browser console for errors |
| /dashboard always redirects to /onboarding | Verify user metadata has `onboarding_completed: true` |
| "Invalid redirect_uri" on Google auth | Ensure `NEXT_PUBLIC_APP_URL` is correct |

---

## 📱 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/signup` | POST | Email + password signup |
| `/api/auth/google` | POST | Google OAuth initiation |
| `/api/auth/callback` | GET | OAuth callback handler |
| `/api/onboard` | POST | Submit onboarding form |

---

## 🎯 Files Modified/Created

**New:**
- ✅ `src/lib/supabase.ts`
- ✅ `src/app/signup/page.tsx`
- ✅ `src/app/onboarding/page.tsx`
- ✅ `src/app/api/auth/signup/route.ts`
- ✅ `src/app/api/auth/google/route.ts`

**Modified:**
- ✅ `src/app/api/auth/callback/route.ts`
- ✅ `src/middleware.ts`
- ✅ `.env.local`

---

## ✨ What's Working

- ✅ Email signup without verification (testing mode)
- ✅ Google Sign-In OAuth flow
- ✅ Automatic session creation
- ✅ Unique Client ID generation (Supabase UUID)
- ✅ Redirect to onboarding after signup
- ✅ Dashboard protection (requires onboarding completion)
- ✅ Onboarding form with business data collection
- ✅ Client record creation with all metadata

---

## 🚀 Ready to Test!

Run `npm run dev` and test the complete flow:

**Email Flow:** `/signup` → Enter email/password → `/onboarding` → Complete form → `/dashboard`

**Google Flow:** `/signup` → Click Google → OAuth flow → `/onboarding` → Complete form → `/dashboard`

---

**Questions?** Check `SIGNUP_IMPLEMENTATION.md` for detailed documentation.

**Last Updated:** 2026-02-19
