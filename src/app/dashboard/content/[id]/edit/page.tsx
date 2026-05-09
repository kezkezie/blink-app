"use client";

import { use, useEffect, useState } from "react";
import { ArrowLeft, Wand2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { SemanticImageEditor } from "@/components/image/SemanticImageEditor";

export default function ImageStudioPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Load the image from Supabase when the page opens
    useEffect(() => {
        async function loadImage() {
            try {
                const { data } = await supabase.from("content").select("image_urls").eq("id", id).single();
                if (data && data.image_urls) {
                    let urls = data.image_urls;
                    if (typeof urls === "string") urls = JSON.parse(urls);
                    if (Array.isArray(urls) && urls.length > 0) {
                        setImageUrl(urls[0]);
                    }
                }
            } catch (err) {
                console.error("Failed to load image", err);
            } finally {
                setLoading(false);
            }
        }
        loadImage();
    }, [id]);

    return (
        <div className="space-y-6 h-full flex flex-col pt-8 pb-4">
            {/* 🟢 HEADER */}
            <div className="flex items-center justify-between px-6 pb-5 border-b border-[#57707A]/20">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2.5 rounded-full border border-[#57707A]/40 bg-[#2A2F38] shadow-sm text-[#989DAA] hover:text-[#DEDCDC] hover:bg-[#57707A]/20 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="p-1 rounded-md bg-[#C5BAC4]/10 border border-[#C5BAC4]/20"><Wand2 className="w-4 h-4 text-[#C5BAC4]" /></span>
                            <h1 className="text-2xl font-bold text-[#DEDCDC] font-display">AI Image Studio</h1>
                        </div>
                        <p className="text-sm text-[#989DAA]">JSON Geometry Editor <span className="font-mono text-xs opacity-50 ml-2">({id})</span></p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => router.back()} className="bg-[#191D23] border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/20 hover:text-white transition-all">
                        Exit Studio
                    </Button>
                </div>
            </div>

            {/* 🟢 THE STUDIO ENGINE */}
            <div className="flex-1 px-6">
                {loading ? (
                    <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#C5BAC4] animate-spin" /></div>
                ) : imageUrl ? (
                    <SemanticImageEditor contentId={id} initialImageUrl={imageUrl} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#989DAA] font-medium">No image found to edit.</div>
                )}
            </div>
        </div>
    );
}