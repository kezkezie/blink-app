# 🚀 Quick Start - Signup & Onboarding

## ⚡ 30-Second Setup

```bash
# 1. Make sure dependencies are installed
npm install

# 2. Start the dev server
npm run dev

# 3. Open browser
open http://localhost:3000/signup
```

## ✅ Test the Full Flow (2 minutes)

### Email Signup
```
1. Click on "Sign up" link
2. Enter: test@example.com
3. Enter password: TestPassword123
4. Click "Sign Up"
✅ Should redirect to /onboarding
```

### Complete Onboarding
```
1. Fill in form:
   - Business Name: "Test Co"
   - Contact Name: "John Doe"
   - Phone: "+1-555-0123"
   - Industry: "Technology"
   - Website: "https://test.com"
2. Click "Complete Setup"
✅ Should redirect to /dashboard
```

### Verify Dashboard Access
```
1. You should be on /dashboard
2. Clear cookies, try to visit /dashboard
3. Should redirect to /login
✅ Protection works!
```

## 🔑 What You Need to Know

| Item | Status | Notes |
|------|--------|-------|
| Email signup | ✅ Ready | No email verification needed |
| Google signup | ⚠️ Setup needed | Enable in Supabase console |
| Testing mode | ✅ Active | Set via NEXT_PUBLIC_TESTING_MODE |
| Client ID | ✅ Auto-generated | Uses Supabase UUID |
| Onboarding | ✅ Complete | Form collects business info |
| Dashboard | ✅ Protected | Requires onboarding completion |

## 📁 Key Files

```
src/app/signup/page.tsx              ← Signup form (Email + Google)
src/app/onboarding/page.tsx          ← Onboarding form
src/app/api/auth/signup/route.ts     ← Email signup API
src/lib/supabase.ts                  ← Supabase client
```

## 🔧 Environment (Already Set)

```env
NEXT_PUBLIC_SUPABASE_URL=https://...  ✅
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     ✅
NEXT_PUBLIC_APP_URL=http://localhost:3000  ✅
NEXT_PUBLIC_TESTING_MODE=true         ✅
```

## 📖 Full Documentation

- 📋 **IMPLEMENTATION_SUMMARY.md** - Complete overview
- 📝 **API_REFERENCE.md** - All API endpoints
- ✅ **SETUP_CHECKLIST.md** - Step-by-step guide
- 🔍 **SIGNUP_IMPLEMENTATION.md** - Technical details

## ❓ Common Questions

**Q: Do I need to verify email?**  
A: No! Testing mode is enabled. Production: set `NEXT_PUBLIC_TESTING_MODE=false`

**Q: Where is my Client ID?**  
A: In localStorage after signup, or in Supabase auth user table

**Q: Can I skip onboarding?**  
A: No! Middleware blocks dashboard until onboarding is complete

**Q: How do I enable Google Sign-In?**  
A: Go to Supabase console → Authentication → Google provider

**Q: What if onboarding fails?**  
A: Check browser console for errors, verify API route is working

## 🎯 What to Test

- [ ] Email signup works
- [ ] Session is created (check cookies)
- [ ] Redirect to onboarding works
- [ ] Onboarding form accepts input
- [ ] Submit creates client record
- [ ] Redirect to dashboard works
- [ ] Can't access dashboard before onboarding
- [ ] Client ID is stored

## ⚠️ If Something Breaks

1. **Clear browser cookies** (hard refresh doesn't work)
2. **Check browser console** for JavaScript errors
3. **Check server logs** for API errors
4. **Verify Supabase is up** and credentials are correct
5. **Read SETUP_CHECKLIST.md** for troubleshooting

## 🚀 Next Steps After Testing

1. **Enable Google OAuth** (optional)
   - Go to Supabase console → Authentication → Google
   - Add Google OAuth credentials
   
2. **Create clients table** (if not auto-created)
   - See SQL in SETUP_CHECKLIST.md
   
3. **Configure for production**
   - Change `NEXT_PUBLIC_APP_URL` to your domain
   - Set `NEXT_PUBLIC_TESTING_MODE=false`
   - Enable email verification

## 📞 Need Help?

- 📖 Check **IMPLEMENTATION_SUMMARY.md** for architecture
- 🔗 Check **API_REFERENCE.md** for endpoint details
- ✅ Check **SETUP_CHECKLIST.md** for step-by-step guide
- 🐛 Check **SIGNUP_IMPLEMENTATION.md** for troubleshooting

---

**Status:** ✅ Ready to test!  
**Time to test:** ~5 minutes  
**Complexity:** Low - everything is pre-configured

**Happy testing! 🎉**
