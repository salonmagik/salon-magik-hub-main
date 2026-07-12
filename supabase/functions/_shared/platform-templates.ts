export type PlatformTemplateRow = {
  channel: "email" | "sms";
  template_key: string;
  subject: string | null;
  body: string;
  is_active: boolean | null;
};

export async function fetchPlatformTemplate(
  supabase: any,
  templateKey: string,
  channel: "email" | "sms",
): Promise<PlatformTemplateRow | null> {
  const { data, error } = await supabase
    .from("platform_message_templates")
    .select("channel, template_key, subject, body, is_active")
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PlatformTemplateRow | null) || null;
}

export function renderPlatformTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return Object.entries(values).reduce((content, [key, value]) => {
    return content.replaceAll(`{{${key}}}`, value);
  }, template);
}
