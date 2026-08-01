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
    // A function replacer, not a string, is required here: replaceAll treats
    // "$"-sequences in a string replacement specially (e.g. "$&" re-inserts
    // the matched text), and generated temp passwords are drawn from a
    // charset that includes "$" and "&" — a password containing "$&" would
    // silently corrupt the substitution. A function return value is used
    // literally, with no special-pattern handling.
    return content.replaceAll(`{{${key}}}`, () => value);
  }, template);
}
