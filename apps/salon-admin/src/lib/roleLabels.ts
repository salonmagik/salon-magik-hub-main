export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Front desk staff",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return ROLE_LABELS[role] || role;
}
