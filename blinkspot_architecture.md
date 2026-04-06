# BlinkSpot — Architecture Reference

> **Generated**: 2026-04-06 · **Purpose**: Token-efficient knowledge base for AI agents.

---

## 1. Project Vision & Scope

BlinkSpot is an AI-powered **video generation & social-media management SaaS**. Core capabilities:

- **AI Video Storytelling** — 4-slot visual storyboard with per-scene AI model selection (Seedance, Kling, etc.), TTS audio generation, and FFmpeg WASM compositing in-browser.
- **Dynamic Prompt Engineering** — AI-assisted prompt suggestion for video scenes, B-roll concepts, and image generation via OpenAI + n8n pipeline.
- **Supabase Syncing** — Full CMS: content lifecycle (draft → approval → scheduled → posted), social-account CRUD, analytics, brand profiles, and asset library.
- **Social Publishing** — Multi-platform scheduling via PostForMe.dev integration (Instagram, TikTok, Facebook, LinkedIn, YouTube, etc.).
- **n8n Workflow Automation** — Onboarding, content generation, image generation, approval flows, and analytics pulls routed through a self-hosted n8n instance.

---

## 2. Tech Stack & Core Libraries

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Language | TypeScript | ^5 |
| React | React + React DOM | 19.2.3 |
| Styling | Tailwind CSS v4 | ^4 |
| UI Components | shadcn/ui (via Radix primitives) | — |
| Icons | Lucide React | ^0.564.0 |
| Animation | Framer Motion | ^12.38.0 |
| Auth & DB | Supabase (JS client + SSR + Auth Helpers) | ^2.95.3 |
| Video Compositing | FFmpeg WASM (core + ffmpeg + util) | ^0.12.x |
| AI | OpenAI SDK | ^6.25.0 |
| Charts | Recharts | ^3.7.0 |
| File Upload | react-dropzone | ^15.0.0 |
| Toasts | Sonner | ^2.0.7 |
| Social Publishing | post-for-me | ^2.6.1 |
| Utility | clsx, tailwind-merge, class-variance-authority | — |
| Testing | Vitest (unit), Playwright (e2e) | — |

---

## 3. Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, metadata)
│   ├── page.tsx                  # Landing page / marketing site
│   ├── globals.css               # Tailwind base + custom design tokens
│   ├── api/                      # 22 API route handlers (see §5)
│   │   ├── ai/prompt-helper/
│   │   ├── auth/{google,signup}/
│   │   ├── brand/suggest/
│   │   ├── content/analyze/
│   │   ├── fetch-media/
│   │   ├── generate-scene/
│   │   ├── onboard/
│   │   ├── post-results/
│   │   ├── social-accounts/{auth-url,callback,disconnect,list,sync}/
│   │   ├── social-posts/schedule/
│   │   ├── tts/
│   │   ├── video/{nano-banana,storyboard,suggest,suggest-frame}/
│   │   ├── webhooks/postforme/
│   │   └── workflows/
│   ├── auth/                     # Auth callback page
│   ├── login/                    # Login page
│   ├── get-started/              # Onboarding flow
│   └── dashboard/                # Authenticated dashboard
│       ├── layout.tsx            # Dashboard shell (sidebar, topbar)
│       ├── page.tsx              # Dashboard home / overview
│       ├── analytics/
│       ├── approvals/
│       ├── brand/
│       ├── calendar/
│       ├── content/              # Content list + [id] detail + [id]/edit
│       ├── generate/             # AI content generation page
│       ├── settings/
│       ├── upload/
│       └── video/                # Video Studio page
│
├── components/
│   ├── video/                    # Video generation UI (core feature)
│   │   ├── types.ts              # BRollScene, VideoSetupProps, etc.
│   │   ├── StorytellingSetup.tsx  # 4-slot storyboard + director panel (114 KB)
│   │   ├── UgcSetup.tsx          # UGC-style video setup
│   │   ├── CinematicSetup.tsx    # Cinematic mode setup
│   │   ├── ClothingSetup.tsx     # Clothing showcase setup
│   │   └── ProductRevealSetup.tsx # Product reveal setup
│   ├── ui/                       # shadcn/ui primitives (17 components)
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── switch.tsx
│   │   ├── tabs.tsx
│   │   ├── textarea.tsx
│   │   └── tooltip.tsx
│   ├── layout/                   # App shell
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   ├── MobileNav.tsx
│   │   └── VideoEditorUI.tsx     # FFmpeg timeline/render editor (66 KB)
│   ├── shared/                   # Reusable cross-feature
│   │   ├── AssetSelectionModal.tsx
│   │   ├── PlatformIcon.tsx
│   │   └── StatusBadge.tsx
│   ├── content/
│   │   ├── CalendarView.tsx
│   │   └── ContentCard.tsx
│   ├── brand/
│   │   └── BrandRefinementModal.tsx
│   ├── image/
│   │   └── SemanticImageEditor.tsx
│   └── publishing/
│       └── PublishModal.tsx
│
├── hooks/
│   └── useClient.ts              # Fetches & caches current client from Supabase
│
├── lib/
│   ├── supabase.ts               # Browser Supabase client
│   ├── supabase-server.ts        # Server-side Supabase client
│   ├── workflows.ts              # triggerWorkflow(), triggerWorkflowWithFile(), generateImagesForPosts()
│   ├── posting.ts                # Social posting logic
│   ├── postforme.ts              # PostForMe.dev API wrapper
│   └── utils.ts                  # cn() helper (clsx + tailwind-merge)
│
├── types/
│   └── database.ts               # Full Supabase schema types (12 tables, all enums)
│
├── middleware.ts                  # Auth guard & route protection
│
└── __tests__/
    ├── e2e/
    │   ├── storyboard-ui.spec.ts
    │   └── video-editor-ui.spec.ts
    └── unit/
        ├── api-fetch-media.test.ts
        ├── api-nano-banana.test.ts
        ├── ffmpeg-filter-graph.test.ts
        ├── storyboard-logic.test.ts
        ├── supabase-status-constraint.test.ts
        └── video-editor-logic.test.ts
```

---

## 4. Key File Registry

### Video Generation (Core Feature)

| Feature | Path |
|---|---|
| Storyboard UI (4-slot + Director) | `src/components/video/StorytellingSetup.tsx` |
| UGC Setup | `src/components/video/UgcSetup.tsx` |
| Cinematic Setup | `src/components/video/CinematicSetup.tsx` |
| Clothing Showcase Setup | `src/components/video/ClothingSetup.tsx` |
| Product Reveal Setup | `src/components/video/ProductRevealSetup.tsx` |
| Video Mode Types & Props | `src/components/video/types.ts` |
| Video Studio Page | `src/app/dashboard/video/page.tsx` |
| FFmpeg Timeline / Render Editor | `src/components/layout/VideoEditorUI.tsx` |
| Semantic Image Editor | `src/components/image/SemanticImageEditor.tsx` |
| Asset Selection Modal | `src/components/shared/AssetSelectionModal.tsx` |

### API Routes

| Feature | Path |
|---|---|
| AI Prompt Helper | `src/app/api/ai/prompt-helper/route.ts` |
| Scene Generation | `src/app/api/generate-scene/route.ts` |
| TTS Audio | `src/app/api/tts/route.ts` |
| Video Prompt Suggest | `src/app/api/video/suggest/route.ts` |
| Video Frame Suggest | `src/app/api/video/suggest-frame/route.ts` |
| Video Storyboard Save | `src/app/api/video/storyboard/route.ts` |
| Nano-Banana Video API | `src/app/api/video/nano-banana/route.ts` |
| n8n Workflow Proxy | `src/app/api/workflows/route.ts` |
| Content Analysis | `src/app/api/content/analyze/route.ts` |
| Brand Suggestions | `src/app/api/brand/suggest/route.ts` |
| Media Fetch | `src/app/api/fetch-media/route.ts` |
| Onboarding | `src/app/api/onboard/route.ts` |
| Post Results | `src/app/api/post-results/route.ts` |
| Social Posts Schedule | `src/app/api/social-posts/schedule/route.ts` |
| Social Accounts CRUD | `src/app/api/social-accounts/{auth-url,callback,disconnect,list,sync}/route.ts` |
| Auth (Signup + Google) | `src/app/api/auth/{signup,google}/route.ts` |
| PostForMe Webhook | `src/app/api/webhooks/postforme/route.ts` |

### Dashboard Pages

| Page | Path |
|---|---|
| Dashboard Home | `src/app/dashboard/page.tsx` |
| Content List | `src/app/dashboard/content/page.tsx` |
| Content Detail | `src/app/dashboard/content/[id]/page.tsx` |
| Content Edit | `src/app/dashboard/content/[id]/edit/page.tsx` |
| AI Content Generator | `src/app/dashboard/generate/page.tsx` |
| Video Studio | `src/app/dashboard/video/page.tsx` |
| Calendar | `src/app/dashboard/calendar/page.tsx` |
| Analytics | `src/app/dashboard/analytics/page.tsx` |
| Approvals | `src/app/dashboard/approvals/page.tsx` |
| Brand | `src/app/dashboard/brand/page.tsx` |
| Settings | `src/app/dashboard/settings/page.tsx` |
| Upload | `src/app/dashboard/upload/page.tsx` |

### Infrastructure

| Feature | Path |
|---|---|
| Supabase Client (Browser) | `src/lib/supabase.ts` |
| Supabase Client (Server) | `src/lib/supabase-server.ts` |
| n8n Workflow Trigger Utils | `src/lib/workflows.ts` |
| Social Posting Logic | `src/lib/posting.ts` |
| PostForMe.dev API Wrapper | `src/lib/postforme.ts` |
| Utility (cn) | `src/lib/utils.ts` |
| Auth Middleware | `src/middleware.ts` |
| Full DB Schema Types | `src/types/database.ts` |
| Client Data Hook | `src/hooks/useClient.ts` |
| Dashboard Layout Shell | `src/app/dashboard/layout.tsx` |

### Layout & Shared Components

| Component | Path |
|---|---|
| Sidebar Navigation | `src/components/layout/Sidebar.tsx` |
| Top Bar | `src/components/layout/TopBar.tsx` |
| Mobile Navigation | `src/components/layout/MobileNav.tsx` |
| Calendar View | `src/components/content/CalendarView.tsx` |
| Content Card | `src/components/content/ContentCard.tsx` |
| Brand Refinement Modal | `src/components/brand/BrandRefinementModal.tsx` |
| Publish Modal | `src/components/publishing/PublishModal.tsx` |
| Platform Icon | `src/components/shared/PlatformIcon.tsx` |
| Status Badge | `src/components/shared/StatusBadge.tsx` |

---

## 5. Database Schema (Supabase)

12 tables defined in `src/types/database.ts`:

| Table | Purpose | Key Fields |
|---|---|---|
| `clients` | Tenant/client records | `user_id`, `plan_tier`, `onboarding_status`, `approval_channel` |
| `brand_profiles` | Visual identity & voice | `client_id`, colors, fonts, `brand_voice`, `tone_keywords` |
| `products` | Product catalog | `client_id`, `name`, `price`, `key_features`, `common_questions` |
| `faqs` | Client FAQ library | `client_id`, `question`, `answer`, `priority` |
| `social_accounts` | Connected platforms | `client_id`, `platform`, `postforme_account_id`, `meta_page_id` |
| `content` | Generated content items | `client_id`, `content_type`, `status`, `ai_prompt_used`, `image_url` |
| `content_schedule` | Publishing schedule | `content_id`, `platform`, `scheduled_at`, `status` |
| `conversations` | DMs / comments / mentions | `client_id`, `platform`, `conversation_type`, `status`, `sentiment` |
| `conversation_messages` | Individual messages | `conversation_id`, `direction`, `sender_type`, `ai_confidence` |
| `assets` | Media library | `client_id`, `asset_type`, `file_url`, `storage_provider` |
| `analytics` | Post performance metrics | `client_id`, `platform`, views/likes/comments/shares/reach |
| `workflow_runs` | n8n execution log | `workflow_name`, `workflow_type`, `status`, `n8n_execution_id` |

### Key Enums

`PlanTier` · `BillingStatus` · `OnboardingStatus` · `ApprovalChannel` · `ContentType` (12 variants) · `ContentStatus` (7 variants) · `Platform` (9 variants) · `ScheduleStatus` · `ConversationType` · `Sentiment` · `AssetType` · `WorkflowType` · `WorkflowStatus`

---

## 6. n8n Integration Pattern

```
Browser → lib/workflows.ts → /api/workflows/route.ts → n8n instance (CORS proxy)
```

**Workflow names** (triggered via `triggerWorkflow(path, body)`):

- `blink-generate-images` — Batch image generation for posts
- Other workflows: onboarding, brand extraction, content generation, approval, analytics pull

---

## 7. Video Generation Modes

The Video Studio (`dashboard/video/page.tsx`) supports **5 modes**, each with a dedicated setup component:

| Mode | Component | Description |
|---|---|---|
| `storytelling` | `StorytellingSetup` | 4-slot storyboard, per-scene AI model, TTS, director panel |
| `ugc` | `UgcSetup` | User-generated content style with reference upload |
| `cinematic` | `CinematicSetup` | Cinematic mode with primary asset |
| `clothing` | `ClothingSetup` | Clothing showcase with model + garment uploads |
| `product_reveal` | `ProductRevealSetup` | Product reveal with before/after assets |

All modes share the `VideoSetupProps` interface. `StorytellingSetup` extends it with `StorytellingSetupProps` (B-roll scenes, storyboard management).

---

## 8. Testing

| Type | Files | Runner |
|---|---|---|
| Unit | 6 tests in `src/__tests__/unit/` | Vitest |
| E2E | 2 specs in `src/__tests__/e2e/` | Playwright |

Coverage: API routes, FFmpeg filter graph, storyboard logic, video editor logic, Supabase status constraints.
