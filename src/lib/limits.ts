export type PlanTier = 'free' | 'starter' | 'pro' | 'agency';
export type BillingCycle = 'monthly' | 'weekly';

export interface TierLimits {
    maxBrands: number;
    maxPosts: number;       // ✨ Renamed from maxPostsPerMonth since it's now per cycle
    maxStorageDays: number;
    hasRefineBrain: boolean;
}

// Define concrete limits for both Monthly and Weekly cycles
export const TIER_CAPS: Record<PlanTier, { monthly: TierLimits; weekly: TierLimits }> = {
    free: {
        monthly: { maxBrands: 1, maxPosts: 5, maxStorageDays: 7, hasRefineBrain: false },
        weekly: { maxBrands: 1, maxPosts: 5, maxStorageDays: 7, hasRefineBrain: false },
    },
    starter: {
        monthly: { maxBrands: 2, maxPosts: 30, maxStorageDays: 30, hasRefineBrain: true },
        weekly: { maxBrands: 2, maxPosts: 7, maxStorageDays: 7, hasRefineBrain: true },
    },
    pro: {
        monthly: { maxBrands: 6, maxPosts: 60, maxStorageDays: 60, hasRefineBrain: true },
        weekly: { maxBrands: 6, maxPosts: 15, maxStorageDays: 14, hasRefineBrain: true },
    },
    agency: {
        monthly: { maxBrands: 10, maxPosts: 200, maxStorageDays: 364, hasRefineBrain: true },
        weekly: { maxBrands: 10, maxPosts: 50, maxStorageDays: 30, hasRefineBrain: true },
    }
};

// Helper utility for use in components
// Defaults to 'free' tier and 'monthly' cycle if nothing is passed
export const getLimitForTier = (tier: string | null | undefined, cycle: BillingCycle = 'monthly'): TierLimits => {
    // Normalize the incoming string, fallback to 'free'
    const normalizedTier = (tier?.toLowerCase() || 'free') as PlanTier;

    // If the tier exists in our caps object, return the limits for the requested cycle
    if (TIER_CAPS[normalizedTier]) {
        return TIER_CAPS[normalizedTier][cycle];
    }

    // Default ultimate fallback
    return TIER_CAPS.free.monthly;
};