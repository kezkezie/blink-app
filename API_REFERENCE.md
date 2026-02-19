# API Reference - Signup & Onboarding Endpoints

## 📡 Endpoints Overview

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---|
| `/api/auth/signup` | POST | Email + password signup | No |
| `/api/auth/google` | POST | Initiate Google OAuth | No |
| `/api/auth/callback` | GET | OAuth callback handler | No |
| `/api/onboard` | POST | Submit onboarding form | Yes |

---

## 1️⃣ Email Signup

### Endpoint
```
POST /api/auth/signup
```

### Request
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

### Success Response (200)
```json
{
  "success": true,
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Signup successful! Redirecting to onboarding..."
}
```

### Error Response (400)
```json
{
  "error": "Email and password are required"
}
```

```json
{
  "error": "User already registered"
}
```

### What It Does
1. Validates email and password
2. Creates user in Supabase Auth
3. **Does NOT** send verification email (testing mode)
4. Immediately creates session
5. Returns unique Client ID (Supabase user UUID)

### Frontend Usage
```typescript
const response = await fetch('/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    email: 'test@example.com',
    password: 'TestPassword123'
  })
})

const data = await response.json()
if (response.ok) {
  localStorage.setItem('clientId', data.clientId)
  router.push('/onboarding')
}
```

---

## 2️⃣ Google OAuth Flow

### Endpoint
```
POST /api/auth/google
```

### Request
```json
{}  // No body required
```

### Response
Redirects to Google OAuth URL (HTTP 307)

### What It Does
1. Initiates Supabase OAuth flow with Google
2. Redirects user to Google login/consent screen
3. After user approves, Google redirects to `/auth/callback`
4. Session is created automatically

### Frontend Usage
```typescript
const handleGoogleSignup = async () => {
  const response = await fetch('/api/auth/google', {
    method: 'POST'
  })
  
  // Browser will follow the redirect to Google
  // After approval, user redirected to /auth/callback
}
```

---

## 3️⃣ Auth Callback Handler

### Endpoint
```
GET /api/auth/callback?code=AUTH_CODE&next=/onboarding
```

### Query Parameters
- `code` (string, required): Authorization code from Supabase
- `next` (string, optional): Where to redirect after auth (default: `/onboarding`)

### Response
HTTP 307 Redirect to `next` parameter with session cookies set

### What It Does
1. Exchanges authorization code for session
2. Sets authentication cookies (httpOnly, secure)
3. Redirects to requested path (or `/onboarding`)

### Automatic Flow
- **Email signup:** Calls this after session creation → redirects to `/onboarding`
- **Google OAuth:** Google redirects here after user approval → redirects to `/onboarding`

---

## 4️⃣ Onboarding Submission

### Endpoint
```
POST /api/onboard
```

### Authentication
**Required:** Must be authenticated (session cookie required)

### Request
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "business_name": "Acme Inc",
  "contact_name": "John Doe",
  "email": "john@acme.com",
  "phone": "+1-555-0123",
  "website_url": "https://acme.com",
  "industry": "Technology",
  "description": "We create AI tools for content creators",
  "plan": "starter"
}
```

### Success Response (200)
```json
{
  "success": true,
  "clientId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Welcome! Acme Inc has been onboarded successfully."
}
```

### Error Response (500)
```json
{
  "error": "Failed to create client record"
}
```

### What It Does
1. Validates user authentication
2. Creates new record in `clients` table
3. Links client to user via `user_id`
4. Creates associated brand profiles and social accounts
5. Generates unique Client ID (if not already set)
6. Logs onboarding completion
7. Updates user metadata: `onboarding_completed: true`

### Frontend Usage
```typescript
const handleOnboardingSubmit = async (formData) => {
  const response = await fetch('/api/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...formData,
      user_id: session.user.id,
      plan: 'starter'
    })
  })

  const data = await response.json()
  if (response.ok) {
    // Update user metadata
    await supabase.auth.updateUser({
      data: { onboarding_completed: true }
    })
    
    // Redirect to dashboard
    router.push('/dashboard')
  }
}
```

---

## 🔄 Complete Flow Examples

### Email Signup → Onboarding → Dashboard

```
1. POST /api/auth/signup
   Request: { email, password }
   Response: { success, clientId }
   Action: Set session cookie, redirect to /onboarding

2. User fills onboarding form at /onboarding

3. POST /api/onboard
   Request: { user_id, business_name, ... }
   Response: { success, clientId }
   Action: Create client record, set onboarding_completed: true

4. GET /dashboard
   Middleware checks: onboarding_completed === true
   Result: ✅ Access granted
```

### Google Signup → Onboarding → Dashboard

```
1. POST /api/auth/google
   Response: Redirect to Google OAuth URL

2. User logs in with Google

3. GET /api/auth/callback?code=AUTH_CODE
   Response: Redirect to /onboarding
   Action: Set session cookie, redirect to /onboarding

4. User fills onboarding form

5. POST /api/onboard
   [Same as above...]

6. GET /dashboard
   [Same as above...]
```

---

## 🔑 Environment Variables Used

```env
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY       # Supabase service role (server-side only)
NEXT_PUBLIC_APP_URL             # Your app URL (for OAuth redirects)
NEXT_PUBLIC_TESTING_MODE        # true = skip email verification
```

---

## 🔐 Security Headers & Cookies

### Set on Signup/OAuth
```
Set-Cookie: sb-access-token=jwt_token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
Set-Cookie: sb-refresh-token=jwt_token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
Set-Cookie: sb-auth-token=jwt_token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800
```

### Required Headers
- `Content-Type: application/json` for POST requests
- No CORS headers needed (same-origin requests)

---

## ✅ Validation Rules

### Email Signup
- **Email:** Valid email format (validated by Supabase)
- **Password:** Min 8 characters (Supabase requirement)
- **Client ID:** Auto-generated UUID, unique per user

### Onboarding
- **business_name:** Required, string
- **contact_name:** Required, string
- **email:** Required, valid email
- **phone:** Optional, string
- **website_url:** Optional, valid URL format
- **industry:** Optional, string
- **description:** Optional, text
- **plan:** Enum (starter, pro, agency)

---

## 🐛 Error Codes & Meanings

| Code | Message | Cause | Fix |
|------|---------|-------|-----|
| 400 | Email already exists | User signup with existing email | Use different email |
| 400 | Email and password required | Missing fields | Provide both |
| 401 | Unauthorized | Not authenticated | Login first |
| 500 | Failed to create client | DB error | Check database |
| 500 | Server configuration error | Missing env vars | Check .env.local |

---

## 📊 Data Models

### Auth User
```typescript
interface AuthUser {
  id: string                    // UUID (Client ID)
  email: string
  created_at: string
  updated_at: string
  user_metadata: {
    onboarding_completed: boolean
    client_id?: string
  }
}
```

### Client Record
```typescript
interface Client {
  id: string
  user_id: string              // References auth.users.id
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string
  website_url?: string
  industry?: string
  plan_tier: string
  onboarding_status: string
  billing_status: string
  created_at: string
  updated_at: string
}
```

---

## 🧪 Testing with cURL

### Email Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123"
  }'
```

### Onboarding
```bash
curl -X POST http://localhost:3000/api/onboard \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=YOUR_TOKEN" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "business_name": "Test Co",
    "contact_name": "John",
    "email": "test@example.com",
    "plan": "starter"
  }'
```

---

**Last Updated:** 2026-02-19  
**API Version:** 1.0  
**Status:** Production Ready ✅
