"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2, Mail, Lock, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function GetStartedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✨ NEW: Added fullName state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        router.replace("/dashboard");
      } else {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    // 1. Sign up and pass the full_name into Supabase Auth metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    });

    if (error) {
      alert(error.message);
      setIsSubmitting(false);
      return;
    }

    if (data.user) {
      // 2. Forcefully update the clients table so contact_name and contact_email are never null!
      await supabase.from('clients').update({
        contact_name: fullName,
        contact_email: email
      }).eq('user_id', data.user.id);

      if (!data.session) {
        alert("Please check your email to verify your account.");
        setIsSubmitting(false);
        return;
      }

      // Instantly route them into the app
      router.push("/dashboard");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#191D23]">
        <Loader2 className="h-10 w-10 animate-spin text-[#C5BAC4]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#191D23] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#C5BAC4]/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="h-14 w-14 bg-[#2A2F38] border border-[#57707A]/50 rounded-2xl flex items-center justify-center shadow-inner">
            <Sparkles className="h-7 w-7 text-[#C5BAC4]" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-bold text-[#DEDCDC] font-display animate-in fade-in duration-500 delay-100">
          Create your account
        </h2>
        <p className="mt-3 text-center text-sm text-[#989DAA] animate-in fade-in duration-500 delay-200">
          Start automating your social media today.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500 delay-300">
        <div className="bg-[#2A2F38] py-8 px-6 shadow-2xl sm:rounded-3xl sm:px-10 border border-[#57707A]/30">
          <form onSubmit={handleSignUp} className="space-y-5">

            {/* ✨ NEW: Full Name Input Field */}
            <div>
              <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-[#57707A]" />
                </div>
                <Input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-11 h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-[#57707A]" />
                </div>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#57707A] uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-[#57707A]" />
                </div>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 h-12 bg-[#191D23] border-[#57707A]/40 text-[#DEDCDC] placeholder:text-[#57707A] focus-visible:ring-[#C5BAC4] rounded-xl shadow-inner text-sm"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 bg-[#C5BAC4] hover:bg-white text-[#191D23] mt-4 shadow-lg shadow-[#C5BAC4]/10 font-bold rounded-xl text-base transition-all"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign Up with Email"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}