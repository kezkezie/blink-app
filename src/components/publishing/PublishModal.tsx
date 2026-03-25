"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, Youtube, Instagram, Music, LayoutGrid, Smartphone, CirclePlay } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublishModalProps {
    open: boolean;
    onClose: () => void;
    videoUrl: string | null;
}

export function PublishModal({ open, onClose, videoUrl }: PublishModalProps) {
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['tiktok', 'youtube', 'instagram']);
    const [igFormat, setIgFormat] = useState<'reel' | 'story' | 'feed'>('reel');

    const togglePlatform = (platform: string) => {
        setSelectedPlatforms(prev =>
            prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
        );
    };

    const handlePublish = () => {
        console.log("Publishing to:", selectedPlatforms);
        if (selectedPlatforms.includes('instagram')) console.log("Instagram Format:", igFormat);
        console.log("Video URL:", videoUrl);
        alert("PostForMe.dev Publishing logic will go here! Check console.");
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-blue-600 text-xl">
                        <Send className="w-5 h-5" /> Publish to Socials
                    </DialogTitle>
                    <DialogDescription>
                        Select the platforms to distribute your generated content seamlessly.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">

                    {/* TikTok Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-black text-white rounded-lg"><Music className="w-5 h-5" /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-800">TikTok</p>
                                <p className="text-[10px] text-gray-500">Auto-posts as vertical video</p>
                            </div>
                        </div>
                        <input type="checkbox" checked={selectedPlatforms.includes('tiktok')} onChange={() => togglePlatform('tiktok')} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </div>

                    {/* YouTube Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-red-600 text-white rounded-lg"><Youtube className="w-5 h-5" /></div>
                            <div>
                                <p className="text-sm font-bold text-gray-800">YouTube</p>
                                <p className="text-[10px] text-gray-500">Auto-formats as a Short if 9:16</p>
                            </div>
                        </div>
                        <input type="checkbox" checked={selectedPlatforms.includes('youtube')} onChange={() => togglePlatform('youtube')} className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer" />
                    </div>

                    {/* Instagram Toggle */}
                    <div className="flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden transition-all">
                        <div className="flex items-center justify-between p-3 hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white rounded-lg"><Instagram className="w-5 h-5" /></div>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">Instagram</p>
                                    <p className="text-[10px] text-gray-500">Select specific posting format below</p>
                                </div>
                            </div>
                            <input type="checkbox" checked={selectedPlatforms.includes('instagram')} onChange={() => togglePlatform('instagram')} className="w-5 h-5 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer" />
                        </div>

                        {/* Nested Instagram Settings */}
                        {selectedPlatforms.includes('instagram') && (
                            <div className="bg-gray-50 p-3 border-t border-gray-100 flex flex-col gap-2 pl-14">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="radio" checked={igFormat === 'reel'} onChange={() => setIgFormat('reel')} className="text-pink-600 focus:ring-pink-500" />
                                    <Smartphone className={cn("w-4 h-4", igFormat === 'reel' ? "text-pink-600" : "text-gray-400 group-hover:text-gray-600")} />
                                    <span className={cn("text-xs font-semibold", igFormat === 'reel' ? "text-gray-900" : "text-gray-500")}>Reel (Recommended for Video)</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="radio" checked={igFormat === 'story'} onChange={() => setIgFormat('story')} className="text-pink-600 focus:ring-pink-500" />
                                    <CirclePlay className={cn("w-4 h-4", igFormat === 'story' ? "text-pink-600" : "text-gray-400 group-hover:text-gray-600")} />
                                    <span className={cn("text-xs font-semibold", igFormat === 'story' ? "text-gray-900" : "text-gray-500")}>Story (24hr expiration)</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input type="radio" checked={igFormat === 'feed'} onChange={() => setIgFormat('feed')} className="text-pink-600 focus:ring-pink-500" />
                                    <LayoutGrid className={cn("w-4 h-4", igFormat === 'feed' ? "text-pink-600" : "text-gray-400 group-hover:text-gray-600")} />
                                    <span className={cn("text-xs font-semibold", igFormat === 'feed' ? "text-gray-900" : "text-gray-500")}>Feed / Carousel</span>
                                </label>
                            </div>
                        )}
                    </div>

                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handlePublish} disabled={selectedPlatforms.length === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md">
                        <Send className="w-4 h-4 mr-2" /> Publish Now
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}