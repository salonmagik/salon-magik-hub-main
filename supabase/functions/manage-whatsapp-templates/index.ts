import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateTemplateRequest {
  templateName: string;
  templateContent: string;
  variables: string[];
  provider: "termii" | "meta";
}

interface UpdateTemplateRequest {
  templateId: string;
  templateName?: string;
  templateContent?: string;
  variables?: string[];
}

interface ApproveTemplateRequest {
  templateId: string;
  termiiTemplateId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT token and get user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's tenant
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (rolesError || !userRoles) {
      return new Response(
        JSON.stringify({ error: "User not associated with any tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = userRoles.tenant_id;
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter((p) => p);
    const method = req.method;

    // Route handlers
    // POST /create - Create new template
    if (method === "POST" && pathParts[pathParts.length - 1] === "create") {
      const body: CreateTemplateRequest = await req.json();

      // Validate required fields
      if (!body.templateName || !body.templateContent || !body.provider) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: templateName, templateContent, provider",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate provider
      if (body.provider !== "termii" && body.provider !== "meta") {
        return new Response(
          JSON.stringify({ error: "Invalid provider. Must be 'termii' or 'meta'" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate template content is valid JSON
      try {
        JSON.parse(body.templateContent);
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid template content. Must be valid JSON" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate variable placeholders match variables array count
      const variables = body.variables || [];
      const placeholderPattern = /\{\{(\d+)\}\}/g;
      const placeholders = body.templateContent.match(placeholderPattern) || [];
      const uniquePlaceholders = [...new Set(placeholders)];

      if (uniquePlaceholders.length !== variables.length) {
        return new Response(
          JSON.stringify({
            error: `Template variable count mismatch. Found ${uniquePlaceholders.length} placeholders but ${variables.length} variables provided`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create template
      const { data: template, error: createError } = await supabase
        .from("whatsapp_templates")
        .insert({
          tenant_id: tenantId,
          template_name: body.templateName,
          template_content: body.templateContent,
          variables: variables,
          status: "pending",
          provider: body.provider,
        })
        .select()
        .single();

      if (createError) {
        // Check for unique constraint violation
        if (createError.code === "23505") {
          return new Response(
            JSON.stringify({
              error: "Template with this name already exists for your salon",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log audit event
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: user.id,
        action: "whatsapp_template_created",
        resource_type: "whatsapp_template",
        resource_id: template.id,
        details: {
          template_name: body.templateName,
          provider: body.provider,
        },
      });

      return new Response(
        JSON.stringify({ success: true, template }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /list - List all templates
    if (method === "GET" && pathParts[pathParts.length - 1] === "list") {
      const provider = url.searchParams.get("provider");
      const status = url.searchParams.get("status");

      let query = supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (provider) {
        query = query.eq("provider", provider);
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data: templates, error: listError } = await query;

      if (listError) {
        return new Response(
          JSON.stringify({ error: listError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ templates }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PUT /update/:id - Update template
    if (method === "PUT" && pathParts.includes("update")) {
      const templateId = pathParts[pathParts.length - 1];
      const body: UpdateTemplateRequest = await req.json();

      // Verify template exists and belongs to tenant
      const { data: existingTemplate, error: fetchError } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError || !existingTemplate) {
        return new Response(
          JSON.stringify({ error: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only allow updates for pending or rejected templates
      if (existingTemplate.status !== "pending" && existingTemplate.status !== "rejected") {
        return new Response(
          JSON.stringify({
            error: "Only pending or rejected templates can be updated",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: any = {};
      if (body.templateName) updateData.template_name = body.templateName;
      if (body.templateContent) {
        // Validate JSON
        try {
          JSON.parse(body.templateContent);
          updateData.template_content = body.templateContent;
        } catch (e) {
          return new Response(
            JSON.stringify({ error: "Invalid template content. Must be valid JSON" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      if (body.variables) updateData.variables = body.variables;

      // Validate variable placeholders if both content and variables are updated
      const finalContent = body.templateContent || existingTemplate.template_content;
      const finalVariables = body.variables || existingTemplate.variables;
      const placeholderPattern = /\{\{(\d+)\}\}/g;
      const placeholders = finalContent.match(placeholderPattern) || [];
      const uniquePlaceholders = [...new Set(placeholders)];

      if (uniquePlaceholders.length !== finalVariables.length) {
        return new Response(
          JSON.stringify({
            error: `Template variable count mismatch. Found ${uniquePlaceholders.length} placeholders but ${finalVariables.length} variables provided`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: updatedTemplate, error: updateError } = await supabase
        .from("whatsapp_templates")
        .update(updateData)
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (updateError) {
        // Check for unique constraint violation
        if (updateError.code === "23505") {
          return new Response(
            JSON.stringify({
              error: "Template with this name already exists for your salon",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log audit event
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: user.id,
        action: "whatsapp_template_updated",
        resource_type: "whatsapp_template",
        resource_id: templateId,
        details: {
          changes: updateData,
        },
      });

      return new Response(
        JSON.stringify({ success: true, template: updatedTemplate }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DELETE /:id - Delete template
    if (method === "DELETE") {
      const templateId = pathParts[pathParts.length - 1];

      // Verify template exists and belongs to tenant
      const { data: existingTemplate, error: fetchError } = await supabase
        .from("whatsapp_templates")
        .select("status")
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError || !existingTemplate) {
        return new Response(
          JSON.stringify({ error: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only allow deletion for pending or rejected templates
      if (existingTemplate.status !== "pending" && existingTemplate.status !== "rejected") {
        return new Response(
          JSON.stringify({
            error: "Only pending or rejected templates can be deleted",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: deleteError } = await supabase
        .from("whatsapp_templates")
        .delete()
        .eq("id", templateId)
        .eq("tenant_id", tenantId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log audit event
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: user.id,
        action: "whatsapp_template_deleted",
        resource_type: "whatsapp_template",
        resource_id: templateId,
      });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /status/:id - Get template status
    if (method === "GET" && pathParts.includes("status")) {
      const templateId = pathParts[pathParts.length - 1];

      const { data: template, error: fetchError } = await supabase
        .from("whatsapp_templates")
        .select("id, template_name, status, template_id, provider")
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError || !template) {
        return new Response(
          JSON.stringify({ error: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ status: template.status, template }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PATCH /approve/:id - Manually approve template
    if (method === "PATCH" && pathParts.includes("approve")) {
      const templateId = pathParts[pathParts.length - 1];
      const body: ApproveTemplateRequest = await req.json();

      if (!body.termiiTemplateId) {
        return new Response(
          JSON.stringify({
            error: "Missing required field: termiiTemplateId",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify template exists and belongs to tenant
      const { data: existingTemplate, error: fetchError } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .single();

      if (fetchError || !existingTemplate) {
        return new Response(
          JSON.stringify({ error: "Template not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update template status to approved
      const { data: approvedTemplate, error: updateError } = await supabase
        .from("whatsapp_templates")
        .update({
          status: "approved",
          template_id: body.termiiTemplateId,
        })
        .eq("id", templateId)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log audit event
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        user_id: user.id,
        action: "whatsapp_template_approved",
        resource_type: "whatsapp_template",
        resource_id: templateId,
        details: {
          termii_template_id: body.termiiTemplateId,
        },
      });

      return new Response(
        JSON.stringify({ success: true, template: approvedTemplate }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalid route
    return new Response(
      JSON.stringify({ error: "Invalid route or method" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in manage-whatsapp-templates:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
