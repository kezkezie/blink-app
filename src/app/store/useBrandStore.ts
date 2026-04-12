import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BrandProfile {
    id: string;
    brand_name: string;
    logo_url: string | null;
}

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