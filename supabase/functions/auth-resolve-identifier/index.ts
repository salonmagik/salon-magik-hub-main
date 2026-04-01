import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (isEmail) {
    return { value: trimmed.toLowerCase(), type: "email" as const };
  }

  const digits = trimmed.replace(/[^\d+]/g, "");
  const normalized = digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : `+${digits.replace(/\D/g, "")}`;
  return { value: normalized, type: "phone" as const };
}

function buildFullName(name: string | null | undefined) {
  return (name || "").trim() || "Salon Magik Client";
}

type AdminClient = ReturnType<typeof createClient>;
type AuthUserSummary = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

async function listAllAuthUsers(admin: AdminClient): Promise<AuthUserSummary[]> {
  const users: AuthUserSummary[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      throw error;
    }

    users.push(
      ...data.users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        user_metadata: (user.user_metadata as Record<string, unknown> | null) ?? {},
      })),
    );

    if (data.users.length < 1000) {
      break;
    }
  }

  return users;
}

async function findAuthUserByIdentifier(
  admin: AdminClient,
  identifier: string,
  type: "email" | "phone",
): Promise<AuthUserSummary | null> {
  const users = await listAllAuthUsers(admin);
  return (
    users.find((user) =>
      type === "email"
        ? (user.email || "").toLowerCase() === identifier.toLowerCase()
        : user.phone === identifier,
    ) ?? null
  );
}

async function findAuthUserById(admin: AdminClient, userId: string): Promise<AuthUserSummary | null> {
  const users = await listAllAuthUsers(admin);
  return users.find((user) => user.id === userId) ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { identifier } = await req.json();
    if (!identifier || typeof identifier !== "string") {
      return new Response(JSON.stringify({ error: "Identifier is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const normalized = normalizeIdentifier(identifier);
    const customerColumn = normalized.type === "email" ? "email" : "phone";

    const { data: matchedCustomers, error: customerError } = await admin
      .from("customers")
      .select("id, user_id, full_name, email, phone")
      .eq(customerColumn, normalized.value);

    if (customerError) {
      throw customerError;
    }

    if (!matchedCustomers || matchedCustomers.length === 0) {
      return new Response(
        JSON.stringify({
          exists: false,
          identifierType: normalized.type,
          hasPassword: false,
          requiresOtp: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const linkedUserIds = [...new Set(matchedCustomers.map((customer) => customer.user_id).filter(Boolean))];
    if (linkedUserIds.length > 1) {
      console.warn("Multiple linked auth users found for identifier", normalized.value, linkedUserIds);
    }

    let authUser =
      (linkedUserIds[0] ? await findAuthUserById(admin, linkedUserIds[0]) : null) ??
      (await findAuthUserByIdentifier(admin, normalized.value, normalized.type));

    if (!authUser) {
      const firstCustomer = matchedCustomers[0];
      const firstName = buildFullName(firstCustomer.full_name).split(" ")[0];
      const remainingNames = buildFullName(firstCustomer.full_name).split(" ").slice(1).join(" ");
      const metadata = {
        first_name: firstName,
        last_name: remainingNames || null,
        full_name: buildFullName(firstCustomer.full_name),
        phone: firstCustomer.phone || null,
        email: firstCustomer.email || null,
        client_account: true,
        password_initialized: false,
      };

      const createPayload: Record<string, unknown> = {
        user_metadata: metadata,
        email_confirm: false,
        phone_confirm: false,
      };
      if (normalized.type === "email") {
        createPayload.email = normalized.value;
      } else {
        createPayload.phone = normalized.value;
      }

      const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser(createPayload);
      if (createUserError) {
        throw createUserError;
      }

      authUser = {
        id: createdUser.user.id,
        email: createdUser.user.email,
        phone: createdUser.user.phone,
        user_metadata: createdUser.user.user_metadata ?? {},
      };
    }

    const matchedCustomerIds = matchedCustomers.map((customer) => customer.id);
    const { error: linkError } = await admin
      .from("customers")
      .update({ user_id: authUser.id })
      .in("id", matchedCustomerIds);
    if (linkError) {
      throw linkError;
    }

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("full_name, phone, client_password_initialized")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (profileLookupError) {
      throw profileLookupError;
    }

    const metadata = (authUser.user_metadata as Record<string, unknown> | null) ?? {};
    const hasPassword =
      existingProfile?.client_password_initialized === true ||
      metadata.password_initialized === true;
    const fullName = buildFullName(
      matchedCustomers[0]?.full_name || (metadata.full_name as string | undefined),
    );
    const phone = matchedCustomers[0]?.phone || authUser.phone || null;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          user_id: authUser.id,
          full_name: fullName,
          phone,
          client_password_initialized: hasPassword,
        },
        { onConflict: "user_id" } as any,
      );

    if (profileError) {
      throw profileError;
    }

    const { error: prefsError } = await admin
      .from("client_account_preferences")
      .upsert({ user_id: authUser.id }, { onConflict: "user_id", ignoreDuplicates: false } as any);
    if (prefsError) {
      throw prefsError;
    }

    return new Response(
      JSON.stringify({
        exists: true,
        identifier: normalized.value,
        identifierType: normalized.type,
        hasPassword,
        requiresOtp: !hasPassword,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("auth-resolve-identifier error", error);
    const message = error instanceof Error ? error.message : "Failed to resolve account";
    return new Response(JSON.stringify({ error: message || "Failed to resolve account" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
