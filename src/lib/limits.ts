export type PlanTier = 'starter' | 'pro' | 'agency';

export interface TierLimits {
    maxBrands: number;
    maxPostsPerMonth: number;
    maxStorageDays: number;
    hasRefineBrain: boolean;
}

// Define concrete limits based on your TIERS data
export const TIER_CAPS: Record<PlanTier, TierLimits> = {
    starter: {
        maxBrands: 2,
        maxPostsPerMonth: 30,
        maxStorageDays: 30,
        hasRefineBrain: true,
    },
    pro: {
        maxBrands: 6,
        maxPostsPerMonth: 60,
        maxStorageDays: 60,
        hasRefineBrain: true,
    },
    agency: {
        maxBrands: 10,
        maxPostsPerMonth: 200,
        maxStorageDays: 364,
        hasRefineBrain: true,
    }
};

// Helper utility for use in components
export const getLimitForTier = (tier: string | null | undefined): TierLimits => {
    // Normalize the incoming string, fallback to 'starter' if null/undefined
    const normalizedTier = (tier?.toLowerCase() || 'starter') as PlanTier;

    // If the tier exists in our caps object, return it
    if (TIER_CAPS[normalizedTier]) {
        return TIER_CAPS[normalizedTier];
    }

    // Default fallback (just in case 'enterprise' or 'custom' is in the DB)
    return TIER_CAPS.starter;
};