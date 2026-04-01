import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, User } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthInput } from "@/components/auth/AuthInput";
import { AuthButton } from "@/components/auth/AuthButton";
import { AuthPhoneInput } from "@/components/auth/AuthPhoneInput";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@ui/use-toast";

export default function CompleteSignupPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState((user?.user_metadata?.first_name as string | undefined) || "");
  const [lastName, setLastName] = useState((user?.user_metadata?.last_name as string | undefined) || "");
  const [phone, setPhone] = useState((user?.user_metadata?.phone as string | undefined) || "");
  const [isSaving, setIsSaving] = useState(false);

  const email = useMemo(() => user?.email || "", [user?.email]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      toast({
        title: "Missing information",
        description: "First name, last name, and phone are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName,
          phone: phone.trim(),
        },
      });
      if (authError) throw authError;

      if (user?.id) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          user_id: user.id,
          full_name: fullName,
          phone: phone.trim(),
        });
        if (profileError) throw profileError;
      }

      await refreshProfile();
      toast({
        title: "Profile completed",
        description: "Your account details have been updated.",
      });
      navigate("/onboarding", { replace: true });
    } catch (error) {
      console.error("complete signup failed", error);
      toast({
        title: "Failed to complete signup",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthLayout title="Complete your signup" subtitle="We need a few more details before you continue to onboarding.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthInput
            label="First name"
            type="text"
            placeholder="First name"
            icon={<User size={18} />}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <AuthInput
            label="Last name"
            type="text"
            placeholder="Last name"
            icon={<User size={18} />}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>

        <AuthInput label="Email" type="email" placeholder="Email" icon={<Mail size={18} />} value={email} onChange={() => {}} disabled />

        <AuthPhoneInput label="Phone number" value={phone} onChange={setPhone} />

        <AuthButton type="submit" isLoading={isSaving}>
          Continue to onboarding
        </AuthButton>
      </form>
    </AuthLayout>
  );
}
