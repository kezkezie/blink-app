import { ExamplesGallery } from "@/components/studio/examples/ExamplesGallery";

export default function ExamplesPage() {
  return (
    <div className="max-w-[1240px] mx-auto pt-2 md:pt-6 pb-16">
      <p className="text-sm mb-1" style={{ color: "var(--s-soft)" }}>Made with BlinkSpot</p>
      <h2 className="text-[26px] md:text-[32px] font-semibold leading-tight tracking-tight mb-2">Examples</h2>
      <p className="text-[14px] mb-5 max-w-[640px]" style={{ color: "var(--s-soft)" }}>
        Every one of these was made in BlinkSpot for a made-up brand. Click one to see the exact prompt and settings, then make your own from it.
      </p>
      <ExamplesGallery />
    </div>
  );
}
