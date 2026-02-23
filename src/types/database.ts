// ============================================
// Blink Database Types — mirrors supabase-schema.sql
// ============================================

// --------------- Enums / Unions ---------------

export type PlanTier = "starter" | "pro" | "agency" | "enterprise" | "custom";
export type BillingStatus = "active" | "paused" | "cancelled" | "trial";
export type OnboardingStatus =
  | "pending"
  | "form_submitted"
  | "review"
  | "approved"
  | "active"
  | "churned";
export type ApprovalChannel = "whatsapp" | "email" | "slack" | "telegram";

export type BrandSource = "extracted" | "generated" | "manual";

export type ContentType =
  | "post_image"
  | "carousel"
  | "story"
  | "reel"
  | "video"
  | "thumbnail"
  | "infographic"
  | "quote_card"
  | "promo"
  | "blog"
  | "newsletter"
  | "ad";

export type ContentStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "scheduled"
  | "posted"
  | "failed";

export type Platform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "twitter"
  | "linkedin"
  | "youtube"
  | "pinterest"
  | "shopify"
  | "threads";

export type ScheduleStatus =
  | "queued"
  | "posting"
  | "posted"
  | "failed"
  | "cancelled";

export type ConversationType = "dm" | "comment" | "mention" | "story_reply";
export type ConversationStatus =
  | "open"
  | "auto_replied"
  | "escalated"
  | "resolved"
  | "ignored";
export type Sentiment = "positive" | "neutral" | "negative" | "urgent";
export type SenderType = "customer" | "ai_bot" | "human_agent";
export type MessageDirection = "inbound" | "outbound";

export type AssetType =
  | "logo"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "font"
  | "brand_guide";
export type StorageProvider = "google_drive" | "supabase" | "cloudinary";
export type ProductAvailability =
  | "available"
  | "out_of_stock"
  | "discontinued"
  | "coming_soon";

export type WorkflowType =
  | "onboarding"
  | "brand_extract"
  | "content_gen"
  | "posting"
  | "auto_reply"
  | "analytics_pull"
  | "approval";

export type WorkflowStatus = "running" | "success" | "failed" | "review_needed";

// --------------- Row Types ---------------

export interface Client {
  id: string;
  user_id: string | null;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  website_url: string | null;
  industry: string | null;
  plan_tier: PlanTier;
  monthly_fee: number | null;
  billing_status: BillingStatus;
  onboarding_status: OnboardingStatus;
  onboarding_notes: string | null;
  approval_channel: ApprovalChannel;
  approval_contact: string | null;
  timezone: string;
  google_drive_folder_id: string | null;
  google_drive_folder_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandProfile {
  id: string;
  client_id: string;
  source: BrandSource;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  additional_colors: string[];
  primary_font: string | null;
  secondary_font: string | null;
  font_weights: string[];
  image_style: string | null;
  composition_notes: string | null;
  logo_usage_rules: string | null;
  brand_voice: string | null;
  tone_keywords: string[];
  vocabulary_notes: string | null;
  preferred_formats: string[];
  dos: string | null;
  donts: string | null;
  brand_guidelines_url: string | null;
  uploaded_assets: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  category: string | null;
  availability: ProductAvailability;
  key_features: string[];
  common_questions: Array<{ q: string; a: string }>;
  product_url: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FAQ {
  id: string;
  client_id: string;
  question: string;
  answer: string;
  category: string | null;
  priority: number;
  created_at: string;
}

export interface SocialAccount {
  id: string;
  client_id: string;
  platform: Platform;
  account_name: string | null;
  account_id: string | null;
  blotato_profile_id: string | null;
  postforme_account_id: string | null;
  meta_page_id: string | null;
  meta_page_token: string | null;
  is_active: boolean;
  connected_at: string;
}

export interface Content {
  id: string;
  client_id: string;
  content_type: ContentType;
  caption: string | null;
  caption_short: string | null;
  hashtags: string | null;
  call_to_action: string | null;
  image_url: string | null;
  image_urls: string[];
  video_url: string | null;
  ai_prompt_used: string | null;
  image_prompt_used: string | null;
  ai_model: string | null;
  target_platforms: Platform[];
  status: ContentStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  variant_group: string | null;
  variant_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentSchedule {
  id: string;
  content_id: string;
  client_id: string;
  social_account_id: string | null;
  platform: string;
  scheduled_at: string;
  posted_at: string | null;
  blotato_post_id: string | null;
  postforme_post_id: string | null;
  status: ScheduleStatus;
  error_message: string | null;
  platform_post_id: string | null;
  platform_post_url: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  social_account_id: string | null;
  platform: string;
  conversation_type: ConversationType;
  external_user_id: string | null;
  external_username: string | null;
  related_post_id: string | null;
  status: ConversationStatus;
  escalated_at: string | null;
  escalation_reason: string | null;
  detected_sentiment: Sentiment | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  message_text: string;
  sender_type: SenderType | null;
  ai_model_used: string | null;
  ai_confidence: number | null;
  platform_message_id: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  client_id: string;
  asset_type: AssetType;
  file_name: string | null;
  file_url: string;
  storage_provider: StorageProvider;
  mime_type: string | null;
  file_size_bytes: number | null;
  purpose: string | null;
  related_content_id: string | null;
  created_at: string;
}

export interface Analytics {
  id: string;
  content_schedule_id: string | null;
  client_id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  reach: number;
  impressions: number;
  conversions: number;
  conversion_value: number;
  recorded_at: string;
}

export interface WorkflowRun {
  id: string;
  client_id: string | null;
  workflow_name: string;
  workflow_type: WorkflowType | null;
  status: WorkflowStatus;
  n8n_execution_id: string | null;
  input_summary: Record<string, unknown> | null;
  output_summary: Record<string, unknown> | null;
  error_details: string | null;
  started_at: string;
  completed_at: string | null;
}

// --------------- Supabase Database Type ---------------

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client;
        Insert: Partial<Client> &
          Pick<Client, "company_name" | "contact_name" | "contact_email">;
        Update: Partial<Client>;
      };
      brand_profiles: {
        Row: BrandProfile;
        Insert: Partial<BrandProfile> & Pick<BrandProfile, "client_id">;
        Update: Partial<BrandProfile>;
      };
      products: {
        Row: Product;
        Insert: Partial<Product> & Pick<Product, "client_id" | "name">;
        Update: Partial<Product>;
      };
      faqs: {
        Row: FAQ;
        Insert: Partial<FAQ> & Pick<FAQ, "client_id" | "question" | "answer">;
        Update: Partial<FAQ>;
      };
      social_accounts: {
        Row: SocialAccount;
        Insert: Partial<SocialAccount> &
          Pick<SocialAccount, "client_id" | "platform">;
        Update: Partial<SocialAccount>;
      };
      content: {
        Row: Content;
        Insert: Partial<Content> & Pick<Content, "client_id" | "content_type">;
        Update: Partial<Content>;
      };
      content_schedule: {
        Row: ContentSchedule;
        Insert: Partial<ContentSchedule> &
          Pick<
            ContentSchedule,
            "content_id" | "client_id" | "platform" | "scheduled_at"
          >;
        Update: Partial<ContentSchedule>;
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation> &
          Pick<Conversation, "client_id" | "platform" | "conversation_type">;
        Update: Partial<Conversation>;
      };
      conversation_messages: {
        Row: ConversationMessage;
        Insert: Partial<ConversationMessage> &
          Pick<
            ConversationMessage,
            "conversation_id" | "direction" | "message_text"
          >;
        Update: Partial<ConversationMessage>;
      };
      assets: {
        Row: Asset;
        Insert: Partial<Asset> &
          Pick<Asset, "client_id" | "asset_type" | "file_url">;
        Update: Partial<Asset>;
      };
      analytics: {
        Row: Analytics;
        Insert: Partial<Analytics> & Pick<Analytics, "client_id" | "platform">;
        Update: Partial<Analytics>;
      };
      workflow_runs: {
        Row: WorkflowRun;
        Insert: Partial<WorkflowRun> & Pick<WorkflowRun, "workflow_name">;
        Update: Partial<WorkflowRun>;
      };
    };
  };
}
