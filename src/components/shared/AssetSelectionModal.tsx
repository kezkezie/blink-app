"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Search, ImageIcon, FolderOpen } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/hooks/useClient";
import { useBrandStore } from "@/app/store/useBrandStore"; // ✨ 1. Import brand store
import { cn } from "@/lib/utils";

interface AssetSelectionModalProps {
    open: boolean;
    onClose: () => void;
    onSelect: (url: string) => void;
}

interface AssetRow {
    id: string;
    caption: string | null;
    image_urls: string[] | null;
    content_type: string;
    created_at: string;
}

export function AssetSelectionModal({ open, onClose, onSelect }: AssetSelectionModalProps) {
    const { clientId } = useClient();
    const { activeBrand } = useBrandStore(); // ✨ 2. Get active brand

    const [assets, setAssets] = useState<AssetRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");

    // Fetch assets when the modal opens
    useEffect(() => {
        // ✨ 3. Abort if no active brand
        if (!open || !clientId || !activeBrand) return;

        let cancelled = false;
        async function fetchAssets() {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("content")
                    .select("id, caption, image_urls, content_type, created_at")
                    .eq("client_id", clientId)
                    .eq("brand_id", activeBrand!.id) // ✨ 4. Isolate by Brand!
                    .not("image_urls", "is", null)
                    .order("created_at", { ascending: false })
                    .limit(100);

                if (!cancelled && data) {
                    // Only keep rows that actually have image URLs
                    setAssets(data.filter((r: AssetRow) => r.image_urls && r.image_urls.length > 0));
                }
                if (error) console.error("AssetSelectionModal fetch error:", error);
            } catch (err) {
                console.error("AssetSelectionModal error:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchAssets();
        return () => { cancelled = true; };
    }, [open, clientId, activeBrand?.id]); // ✨ 5. Add activeBrand.id to dependency array

    // Flatten all image URLs from all content rows
    const allImages = useMemo(() => {
        const imgs: { url: string; caption: string; contentType: string }[] = [];
        for (const asset of assets) {
            for (const url of asset.image_urls || []) {
                // Only include image-like URLs (skip audio, video files)
                const lower = url.toLowerCase();
                if (lower.endsWith(".mp3") || lower.endsWith(".mp4") || lower.endsWith(".wav") || lower.endsWith(".webm")) continue;
                imgs.push({
                    url,
                    caption: asset.caption || "",
                    contentType: asset.content_type,
                });
            }
        }
        return imgs;
    }, [assets]);

    // Filter by search term
    const filtered = useMemo(() => {
        if (!search.trim()) return allImages;
        const q = search.toLowerCase();
        return allImages.filter(
            (img) =>
                img.caption.toLowerCase().includes(q) ||
                img.contentType.toLowerCase().includes(q) ||
                img.url.toLowerCase().includes(q)
        );
    }, [allImages, search]);

    const handleSelect = (url: string) => {
        onSelect(url);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
            {/* ✨ 6. Themed Modal Container */}
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] shadow-2xl custom-scrollbar">
                <DialogHeader className="border-b border-[#57707A]/20 pb-4">
                    <DialogTitle className="flex items-center gap-2 text-xl font-display text-[#DEDCDC]">
                        <FolderOpen className="h-5 w-5 text-[#C5BAC4]" />
                        Select from Library
                    </DialogTitle>
                    <DialogDescription className="text-[#989DAA] font-medium">
                        Choose an image from your uploaded assets.
                    </DialogDescription>
                </DialogHeader>

                {/* Search bar */}
                <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#57707A]" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by caption or type..."
                        className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg transition-all shadow-inner bg-[#191D23] border border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus:outline-none focus:ring-2 focus:ring-[#C5BAC4]"
                    />
                </div>

                {/* Image grid */}
                <div className="flex-1 overflow-y-auto min-h-[300px] -mx-1 px-1 custom-scrollbar mt-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-[#989DAA] gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-[#C5BAC4]" />
                            <span className="text-sm font-medium">Loading your library...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-[#57707A] gap-3">
                            <ImageIcon className="h-10 w-10 opacity-40" />
                            <span className="text-sm font-medium text-[#989DAA]">
                                {search ? "No matching assets found" : "No assets in your library yet"}
                            </span>
                            <span className="text-xs text-[#57707A]">
                                {search ? "Try a different search term" : "Upload assets to see them here"}
                            </span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3 pb-2">
                            {filtered.map((img, i) => (
                                <button
                                    key={`${img.url}-${i}`}
                                    type="button"
                                    onClick={() => handleSelect(img.url)}
                                    className={cn(
                                        "group relative aspect-square bg-[#191D23] border border-[#57707A]/30 hover:border-[#C5BAC4]/60 hover:shadow-md transition-all rounded-xl overflow-hidden",
                                        "focus:outline-none focus:ring-2 focus:ring-[#C5BAC4] focus:ring-offset-2 focus:ring-offset-[#2A2F38]"
                                    )}
                                >
                                    <img
                                        src={img.url}
                                        alt={img.caption || "Asset"}
                                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                                    />
                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#191D23]/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                                        <span className="text-[10px] font-bold text-[#DEDCDC] leading-tight line-clamp-2 drop-shadow-md">
                                            {img.caption || img.contentType.replace("_", " ")}
                                        </span>
                                    </div>
                                    {/* Content type badge */}
                                    <div className="absolute top-2 right-2 bg-[#191D23]/80 backdrop-blur-md border border-[#57707A]/50 text-[#C5BAC4] text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider shadow-lg">
                                        {img.contentType.replace("_", " ")}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}