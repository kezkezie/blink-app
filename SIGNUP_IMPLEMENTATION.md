# Signup & Onboarding Flow Implementation Guide

## ✅ What's Been Implemented

### 1. **Authentication Options** ✓
- **Email + Password Sign-up** (no email verification in testing mode)
  - User fills in email and password
  - Immediate session creation (no confirmation email required)
  - Generates unique Client ID (Supabase user UUID)
  
- **Google Sign-In**
  - OAuth flow via `/api/auth/google`
  - Redirects to Google OAuth, then back to auth callback
  - Automatically creates user record
  - Generates unique Client ID

### 2. **No Email Verification (Testing Mode)** ✓
- Email signup skips verification step
- User is immediately authenticated after signup
- Session is created instantly
- Controlled via `NEXT_PUBLIC_TESTING_MODE=true` in `.env.local`

### 3. **Redirect to Onboarding** ✓
- All new users (email or Google) are redirected to `/onboarding`
- Dashboard is protected - users cannot access until onboarding is complete
- Middleware checks `user_metadata.onboarding_completed` flag
- Onboarding form collects business information
- Unique Client ID is stored after onboarding completion

---

## 📁 Files Created/Modified

### New Files
```
src/
├── lib/
│   └── supabase.ts                    # Supabase client for browser
├── app/
│   ├── signup/
│   │   └── page.tsx                   # Signup page (Email + Google)
│   ├── onboarding/
│   │   └── page.tsx                   # Onboarding form
│   └── api/
│       └── auth/
│           ├── signup/
│           │   └── route.ts           # Email signup handler
│           └── google/
│               └── route.ts           # Google OAuth handler
```

### Modified Files
```
src/
├── app/
│   └── api/
│       └── auth/
│           └── callback/
│               └── route.ts           # Updated to redirect to /onboarding
└── middleware.ts                       # Updated to check onboarding status
```

---

## 🔑 Environment Variables

Added to `.env.local`:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TESTING_MODE=true
```

**For Production:**
- Change `NEXT_PUBLIC_APP_URL` to your production domain
- Change `NEXT_PUBLIC_TESTING_MODE=false` to require email verification

---

## 🔄 Flow Diagram

### Email + Password Flow
```
User visits /signup
    ↓
Enters email & password
    ↓
POST /api/auth/signup
    ↓
User created in Supabase Auth
Session created immediately (no email verification)
    ↓
Client ID generated (Supabase UUID)
    ↓
Redirect to /onboarding
    ↓
User completes onboarding form
    ↓
POST /api/onboard
    ↓
Client record created with business info
User metadata updated: onboarding_completed = true
    ↓
Redirect to /dashboard
```

### Google Sign-In Flow
```
User visits /signup
    ↓
Clicks "Sign up with Google"
    ↓
POST /api/auth/google
    ↓
Redirect to Google OAuth
    ↓
User signs in with Google
    ↓
Google redirects back to /auth/callback
    ↓
Session created
Client ID generated (Supabase UUID)
    ↓
Redirect to /onboarding
    ↓
[Same as above...]
```

---

## 🔐 Security Notes

1. **Password Hashing**: Supabase handles all password hashing automatically
2. **Session Storage**: Sessions are stored in httpOnly cookies (secure by default)
3. **Client ID**: Uses Supabase user UUID (cryptographically secure)
4. **Testing Mode**: Email verification can be re-enabled by setting `NEXT_PUBLIC_TESTING_MODE=false`

---

## 🚀 How to Test

### 1. **Email + Password Signup**
```bash
npm run dev
# Visit http://localhost:3000/signup
# Enter email: test@example.com
# Enter password: TestPassword123
# Should redirect to /onboarding
```

### 2. **Google Sign-In**
```bash
# Visit http://localhost:3000/signup
# Click "Sign up with Google"
# Should redirect to Google OAuth
# After approval, should redirect to /onboarding
```

### 3. **Onboarding**
```bash
# Complete the onboarding form
# Click "Complete Setup"
# Should redirect to /dashboard
# Verify client record was created with all info
```

### 4. **Dashboard Protection**
```bash
# Try to visit /dashboard directly after signup (before onboarding)
# Should redirect back to /onboarding
# After completing onboarding, /dashboard should be accessible
```

---

## 📊 Database Structure

### Users Table (Supabase Auth)
```sql
-- Automatically managed by Supabase
id: uuid (Client ID)
email: string
created_at: timestamp
user_metadata:
  - onboarding_completed: boolean
  - client_id: string (same as id)
```

### Clients Table (Created by onboarding)
```sql
id: uuid
user_id: uuid (references auth.users.id)
company_name: string
contact_name: string
contact_email: string
contact_phone: string
website_url: string
industry: string
plan_tier: enum ('starter', 'pro', 'agency')
onboarding_status: enum
created_at: timestamp
```

---

## 🐛 Troubleshooting

### Issue: "Email already exists"
- Check if user already signed up with that email
- Solution: Use a different email or implement "forgot password" flow

### Issue: Google OAuth not working
- Ensure Google OAuth credentials are set up in Supabase dashboard
- Check `NEXT_PUBLIC_APP_URL` matches your OAuth redirect URL
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

### Issue: User stuck on onboarding
- Check browser console for errors
- Verify `/api/onboard` route is working
- Check Supabase `clients` table was created with data

### Issue: Cannot access /dashboard after onboarding
- Check middleware is recognizing `onboarding_completed = true`
- Verify user metadata was updated in Supabase auth
- Clear browser cookies and try again

---

## ✨ Next Steps

1. **Enable Email Verification for Production**
   - Set `NEXT_PUBLIC_TESTING_MODE=false` in production `.env`
   - Users will receive verification emails

2. **Add Additional Onboarding Steps**
   - Social media account connection
   - Brand profile setup
   - Payment method collection

3. **Implement Password Reset**
   - Create `/forgot-password` page
   - Add password reset email flow

4. **Add Login Page**
   - Email + password login
   - Google Sign-In login
   - "Remember me" functionality

---

## 📚 Relevant Documentation

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Next.js Integration](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)

---

**Last Updated:** 2026-02-19
**Status:** ✅ Ready for Testing
