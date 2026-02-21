import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ImportType = "products" | "services";

interface ImportRow {
  name: string;
  description?: string | null;
  price: number | string;
  stock_quantity?: number | string;
  duration_minutes?: number | string;
  is_active?: boolean;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const normalized = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeRow(importType: ImportType, row: ImportRow) {
  const normalizedName = String(row.name || "").trim();
  if (!normalizedName) {
    return { error: "Name is required", normalized: null };
  }

  const price = normalizeNumber(row.price, Number.NaN);
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Price must be a valid non-negative number", normalized: null };
  }

  if (importType === "products") {
    const stockQuantity = normalizeNumber(row.stock_quantity, 0);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      return { error: "Stock quantity must be a non-negative number", normalized: null };
    }

    return {
      error: null,
      normalized: {
        name: normalizedName,
        description: row.description ? String(row.description).trim() : null,
        price,
        stock_quantity: stockQuantity,
        status: row.is_active === false ? "inactive" : "active",
      },
    };
  }

  const durationMinutes = normalizeNumber(row.duration_minutes, 30);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "Duration must be a positive number", normalized: null };
  }

  return {
    error: null,
    normalized: {
      name: normalizedName,
      description: row.description ? String(row.description).trim() : null,
      price,
      duration_minutes: durationMinutes,
      status: row.is_active === false ? "inactive" : "active",
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const tenantId = String(body.tenant_id || "").trim();
    const importType = String(body.import_type || "") as ImportType;
    const dryRun = Boolean(body.dry_run);
    const rows = (Array.isArray(body.rows) ? body.rows : []) as ImportRow[];

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rows.length) {
      return new Response(JSON.stringify({ error: "rows must include at least one item" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(["products", "services"] as string[]).includes(importType)) {
      return new Response(JSON.stringify({ error: "import_type must be products or services" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: role } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!role) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobError } = await adminClient
      .from("catalog_import_jobs")
      .insert({
        tenant_id: tenantId,
        import_type: importType,
        status: "processing",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (jobError || !job) throw jobError || new Error("Could not create import job");

    let validCount = 0;
    let invalidCount = 0;
    let importedCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const { error, normalized } = normalizeRow(importType, row);

      if (error || !normalized) {
        invalidCount += 1;
        await adminClient.from("catalog_import_rows").insert({
          job_id: job.id,
          row_number: index + 1,
          raw_json: row,
          status: "invalid",
          error_message: error,
        });
        continue;
      }

      validCount += 1;
      await adminClient.from("catalog_import_rows").insert({
        job_id: job.id,
        row_number: index + 1,
        raw_json: row,
        normalized_json: normalized,
        status: dryRun ? "valid" : "imported",
      });

      if (dryRun) continue;

      if (importType === "products") {
        const { error: upsertError } = await adminClient
          .from("products")
          .upsert({ tenant_id: tenantId, ...normalized }, { onConflict: "tenant_id,name" });
        if (upsertError) {
          invalidCount += 1;
          continue;
        }
      } else {
        const { error: upsertError } = await adminClient
          .from("services")
          .upsert({ tenant_id: tenantId, ...normalized }, { onConflict: "tenant_id,name" });
        if (upsertError) {
          invalidCount += 1;
          continue;
        }
      }
      importedCount += 1;
    }

    const summary = {
      total_rows: rows.length,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      imported_rows: dryRun ? 0 : importedCount,
      dry_run: dryRun,
    };

    await adminClient
      .from("catalog_import_jobs")
      .update({
        status: invalidCount > 0 && validCount === 0 ? "failed" : "completed",
        finished_at: new Date().toISOString(),
        summary_json: summary,
      })
      .eq("id", job.id);

    await adminClient.from("audit_logs").insert({
      action: "catalog_import_completed",
      entity_type: "catalog_import_jobs",
      entity_id: job.id,
      actor_user_id: user.id,
      metadata: {
        tenant_id: tenantId,
        import_type: importType,
        ...summary,
      },
    });

    return new Response(JSON.stringify({ success: true, job_id: job.id, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("bulk-import-catalog error", error);
    return new Response(JSON.stringify({ error: "Unexpected import error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
