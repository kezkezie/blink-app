"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { triggerWorkflow } from "@/lib/workflows";
import {
    Loader2,
    ArrowRight,
    Upload,
    Building2,
    Palette,
    CheckCircle,
    X,
    Plus,
    Trash2,
    Type,
    Smile,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PREDEFINED_TONES = [
    "Luxurious", "Modern", "Earthy", "Professional", "Minimal", "Elegant",
    "Warm", "Playful", "Bold", "Trustworthy", "Edgy", "Friendly",
];

const POPULAR_FONTS = [
    "Inter", "Roboto", "Poppins", "Montserrat", "Playfair Display",
    "Merriweather", "Lora", "Open Sans", "Lato", "Oswald", "Custom...",
];

interface BrandCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function BrandCreationModal({ isOpen, onClose, onSuccess }: BrandCreationModalProps) {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    // Form State
    const [brandName, setBrandName] = useState("");
    const [contactName, setContactName] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [description, setDescription] = useState("");
    const [visualStyleGuide, setVisualStyleGuide] = useState("");
    const [primaryColor, setPrimaryColor] = useState("#2563EB");
    const [secondaryColor, setSecondaryColor] = useState("#585954");
    const [primaryFont, setPrimaryFont] = useState("");

    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    const [brandVoice, setBrandVoice] = useState("");
    const [toneKeywords, setToneKeywords] = useState<string[]>([]);
    const [assetFiles, setAssetFiles] = useState<File[]>([]);
    const [assetPreviews, setAssetPreviews] = useState<string[]>([]);

    // Reset form when opened
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            const getUser = async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) setUserId(user.id);
            };
            getUser();
        }
    }, [isOpen]);

    function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoFile(file);
        const reader = new FileReader();
        reader.onload = (event) => setLogoPreview(event.target?.result as string);
        reader.readAsDataURL(file);
    }

    function handleAssetSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setAssetFiles((prev) => [...prev, ...files]);
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (event) => setAssetPreviews((prev) => [...prev, event.target?.result as string]);
            reader.readAsDataURL(file);
        });
    }

    function toggleTone(tone: string) {
        setToneKeywords((prev) =>
            prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]
        );
    }

    async function handleCompleteSetup() {
        if (!userId) return;
        setSaving(true);

        try {
            // 1. Upload Logo
            let finalLogoUrl = null;
            if (logoFile) {
                const fileExt = logoFile.name.split(".").pop();
                const filePath = `brands/${userId}/logo_${Date.now()}.${fileExt}`;
                const { error } = await supabase.storage.from("assets").upload(filePath, logoFile);
                if (!error) {
                    const { data } = supabase.storage.from("assets").getPublicUrl(filePath);
                    finalLogoUrl = data.publicUrl;
                }
            }

            // 2. Upload Assets
            let finalAssetUrls: string[] = [];
            for (const file of assetFiles) {
                const fileExt = file.name.split(".").pop();
                const filePath = `brands/${userId}/asset_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { error } = await supabase.storage.from("assets").upload(filePath, file);
                if (!error) {
                    const { data } = supabase.storage.from("assets").getPublicUrl(filePath);
                    finalAssetUrls.push(data.publicUrl);
                }
            }

            // 3. Ensure Client Record Exists
            let currentClientId = null;
            const { data: existingClient } = await supabase.from("clients").select("id").eq("user_id", userId).maybeSingle();

            if (existingClient) {
                currentClientId = existingClient.id;
            } else {
                const { data: newClient, error: clientError } = await supabase.from("clients")
                    .insert({ user_id: userId, contact_name: contactName, company_name: brandName, contact_email: "user@brand.com", plan_tier: "starter" })
                    .select("id").single();
                if (clientError) throw clientError;
                currentClientId = newClient.id;
            }

            // 4. Create Brand Profile
            const brandPayload: any = {
                client_id: currentClientId,
                brand_name: brandName,
                visual_style_guide: visualStyleGuide,
                brand_voice: brandVoice,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                primary_font: primaryFont || null,
                tone_keywords: toneKeywords,
                is_active: true,
            };

            if (finalLogoUrl) brandPayload.logo_url = finalLogoUrl;
            if (finalAssetUrls.length > 0) brandPayload.uploaded_assets = finalAssetUrls;

            const { data: newBrand, error: brandError } = await supabase
                .from("brand_profiles")
                .insert(brandPayload)
                .select("id")
                .single();

            if (brandError) throw brandError;

            // 5. Trigger n8n Background Workflow
            try {
                triggerWorkflow("blink-brand-extract-001", {
                    client_id: currentClientId,
                    brand_id: newBrand.id,
                    website_url: websiteUrl
                });
            } catch (err) {
                console.error("Workflow trigger issue ignored.");
            }

            setSaving(false);
            onClose();
            if (onSuccess) onSuccess();

        } catch (err: any) {
            console.error("Brand creation failed:", err);
            alert(err.message || "Failed to save brand profile.");
            setSaving(false);
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC] p-0 overflow-hidden">

                {/* Header */}
                <div className="bg-[#191D23] px-6 py-4 border-b border-[#57707A]/30 flex justify-between items-center">
                    <div>
                        <DialogTitle className="text-xl font-bold font-display">Add New Workspace</DialogTitle>
                        <DialogDescription className="text-[#989DAA] text-xs mt-1">
                            Configure the AI brain for this specific brand.
                        </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className={cn("h-1.5 w-8 rounded-full transition-all", step >= s ? "bg-[#C5BAC4]" : "bg-[#57707A]/30")} />
                        ))}
                    </div>
                </div>

                {/* Scrollable Content Area */}
                <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">

                    {/* STEP 1: Basic Info */}
                    {step === 1 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                            <div className="flex items-center gap-2 text-[#C5BAC4] mb-2">
                                <Building2 className="h-5 w-5" />
                                <h3 className="font-bold">Business Details</h3>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#C5BAC4] uppercase mb-2">Brand Name *</label>
                                <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Lup Space" className="bg-[#191D23] border-[#57707A]/40" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#57707A] uppercase mb-2">Your Name *</label>
                                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. John Doe" className="bg-[#191D23] border-[#57707A]/40" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#57707A] uppercase mb-2">Website URL (Optional)</label>
                                <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://..." className="bg-[#191D23] border-[#57707A]/40" />
                                <p className="text-[10px] text-[#57707A] mt-1">We will automatically scrape this for brand context in the background.</p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase mb-2">What does this brand do? *</label>
                                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the products or services..." className="bg-[#191D23] border-[#57707A]/40 resize-none" />
                            </div>

                            <Button onClick={() => setStep(2)} disabled={!brandName || !description} className="w-full bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold mt-2">
                                Continue <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* STEP 2: Visuals */}
                    {step === 2 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                            <div className="flex items-center gap-2 text-[#C5BAC4] mb-2">
                                <Palette className="h-5 w-5" />
                                <h3 className="font-bold">Visual Identity</h3>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase mb-2">Brand Logo</label>
                                {logoPreview ? (
                                    <div className="relative h-24 w-full rounded-xl border border-[#57707A]/40 bg-[#191D23] flex items-center justify-center">
                                        <img src={logoPreview} alt="Logo" className="max-h-full object-contain p-2" />
                                        <button onClick={() => setLogoPreview(null)} className="absolute top-2 right-2 p-1 bg-red-500 rounded-full"><X className="h-4 w-4 text-white" /></button>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center h-24 w-full rounded-xl border-2 border-dashed border-[#57707A]/50 hover:bg-[#57707A]/20 cursor-pointer">
                                        <Upload className="h-5 w-5 text-[#57707A] mb-1" />
                                        <span className="text-[10px] font-bold text-[#989DAA] uppercase">Upload Logo</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoSelect} />
                                    </label>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-[#57707A] uppercase mb-2">Primary Color</label>
                                    <div className="flex items-center gap-2 p-1 border border-[#57707A]/40 rounded-lg bg-[#191D23]">
                                        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-8 w-8 rounded cursor-pointer bg-transparent border-0 p-0" />
                                        <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="border-none h-8 bg-transparent px-1 font-mono text-xs" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-[#57707A] uppercase mb-2">Primary Font</label>
                                    <Select value={primaryFont} onValueChange={setPrimaryFont}>
                                        <SelectTrigger className="h-10 bg-[#191D23] border-[#57707A]/40">
                                            <SelectValue placeholder="Select font" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#2A2F38] border-[#57707A]/50 text-[#DEDCDC]">
                                            {POPULAR_FONTS.map((f) => (<SelectItem key={f} value={f}>{f}</SelectItem>))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase mb-2">Visual Style Guide</label>
                                <Textarea value={visualStyleGuide} onChange={(e) => setVisualStyleGuide(e.target.value)} rows={2} placeholder="e.g. Modern, minimalist, high contrast..." className="bg-[#191D23] border-[#57707A]/40 resize-none" />
                            </div>

                            <div className="flex gap-3 mt-4">
                                <Button variant="outline" onClick={() => setStep(1)} className="border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30">Back</Button>
                                <Button onClick={() => setStep(3)} className="flex-1 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Vibe & Assets */}
                    {step === 3 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                            <div className="flex items-center gap-2 text-[#C5BAC4] mb-2">
                                <Smile className="h-5 w-5" />
                                <h3 className="font-bold">Vibe & Training Data</h3>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase mb-2">Brand Personality</label>
                                <div className="flex flex-wrap gap-2">
                                    {PREDEFINED_TONES.map((tone) => (
                                        <button
                                            key={tone}
                                            onClick={() => toggleTone(tone.toLowerCase())}
                                            className={cn("px-3 py-1.5 rounded-full text-[10px] font-bold border", toneKeywords.includes(tone.toLowerCase()) ? "bg-[#C5BAC4]/10 border-[#C5BAC4] text-[#C5BAC4]" : "border-[#57707A]/40 text-[#57707A]")}
                                        >
                                            {tone}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-[#DEDCDC] uppercase mb-2">Reference Images</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {assetPreviews.map((preview, i) => (
                                        <div key={i} className="relative aspect-square rounded-lg border border-[#57707A]/40 overflow-hidden group">
                                            <img src={preview} alt="asset" className="w-full h-full object-cover" />
                                            <button onClick={() => { setAssetPreviews(prev => prev.filter((_, idx) => idx !== i)); setAssetFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100"><Trash2 className="h-3 w-3 text-white" /></button>
                                        </div>
                                    ))}
                                    <label className="aspect-square rounded-lg border-2 border-dashed border-[#57707A]/50 hover:bg-[#57707A]/20 flex flex-col items-center justify-center cursor-pointer">
                                        <Plus className="h-5 w-5 text-[#57707A]" />
                                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleAssetSelect} />
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button variant="outline" onClick={() => setStep(2)} className="border-[#57707A]/50 text-[#DEDCDC] hover:bg-[#57707A]/30">Back</Button>
                                <Button onClick={handleCompleteSetup} disabled={saving} className="flex-1 bg-[#C5BAC4] hover:bg-white text-[#191D23] font-bold">
                                    {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><CheckCircle className="mr-2 h-4 w-4" /> Create Brand</>}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}