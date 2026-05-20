"use client";

function Pulse({ className }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-[#2A2F38] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-[#57707A]/10 before:to-transparent ${className ?? ""}`}
    />
  );
}

export function DashboardShimmer() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-20" />
        ))}
      </div>
      <Pulse className="h-28 rounded-2xl" />
      <div className="rounded-2xl border border-[#57707A]/20 bg-[#2A2F38] overflow-hidden">
        <Pulse className="h-14 rounded-none" />
        <div className="divide-y divide-[#57707A]/10">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <Pulse className="h-12 w-12 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Pulse className="h-3 w-2/3 rounded-full" />
                <Pulse className="h-2.5 w-1/3 rounded-full" />
              </div>
              <Pulse className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ContentGridShimmer() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Pulse className="h-11 w-64 rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-[#2A2F38] border border-[#57707A]/20 overflow-hidden">
            <Pulse className="aspect-square rounded-none" />
            <div className="p-3 space-y-2">
              <Pulse className="h-3 w-3/4 rounded-full" />
              <Pulse className="h-2.5 w-1/2 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarShimmer() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <Pulse className="h-8 w-44 rounded-lg" />
        <div className="flex gap-2">
          <Pulse className="h-8 w-8 rounded-lg" />
          <Pulse className="h-8 w-8 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <Pulse key={i} className="h-7 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, w) => (
        <div key={w} className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, d) => (
            <Pulse key={d} className="h-20 rounded-xl" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function BrandShimmer() {
  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <Pulse className="h-8 w-48 rounded-lg" />
        <Pulse className="h-9 w-36 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-[#2A2F38] border border-[#57707A]/20 p-5 space-y-3">
          <Pulse className="h-3 w-20 rounded-full" />
          <Pulse className="aspect-square rounded-xl" />
        </div>
        <div className="md:col-span-2 rounded-2xl bg-[#2A2F38] border border-[#57707A]/20 p-5 space-y-4">
          <Pulse className="h-3 w-28 rounded-full" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Pulse key={i} className="h-10 rounded-xl" />
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Pulse key={i} className="h-8 w-8 rounded-full" />
            ))}
          </div>
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-[#2A2F38] border border-[#57707A]/20 p-5 space-y-3">
          <Pulse className="h-3 w-32 rounded-full" />
          <Pulse className="h-10 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function SettingsShimmer() {
  return (
    <div className="space-y-6 max-w-2xl animate-in fade-in duration-300">
      <Pulse className="h-8 w-40 rounded-lg" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-[#2A2F38] border border-[#57707A]/20 p-5 space-y-3">
          <Pulse className="h-3 w-28 rounded-full" />
          <Pulse className="h-10 rounded-xl" />
          {i % 2 === 0 && <Pulse className="h-10 rounded-xl" />}
        </div>
      ))}
    </div>
  );
}
