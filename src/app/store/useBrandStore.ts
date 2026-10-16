import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BrandProfile {
    id: string;
    brand_name: string;
    logo_url: string | null;
    /** Set for a brand someone shared with this user (2026-10-13): the owner's workspace and the user's role. */
    client_id?: string;
    role?: 'owner' | 'editor' | 'viewer';
    owner_name?: string;
    /** When a shared brand's access ends (2026-10-16); null or absent: no end. */
    access_until?: string | null;
}

/** The active brand is someone else's, shared with this user. */
export const isSharedBrand = (b: BrandProfile | null | undefined): b is BrandProfile & { client_id: string; role: 'editor' | 'viewer' } =>
    !!b && !!b.client_id && (b.role === 'editor' || b.role === 'viewer');

interface BrandState {
    activeBrand: BrandProfile | null;
    availableBrands: BrandProfile[];
    setActiveBrand: (brand: BrandProfile | null) => void;
    setAvailableBrands: (brands: BrandProfile[]) => void;
}

export const useBrandStore = create<BrandState>()(
    persist(
        (set) => ({
            activeBrand: null,
            availableBrands: [],
            setActiveBrand: (brand) => set({ activeBrand: brand }),
            setAvailableBrands: (brands) => set({ availableBrands: brands }),
        }),
        {
            name: 'blink-active-brand',
            // Only persist the active brand to localStorage
            partialize: (state) => ({
                activeBrand: state.activeBrand,
            }),
        }
    )
);