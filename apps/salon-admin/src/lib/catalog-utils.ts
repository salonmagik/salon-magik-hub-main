import { supabase } from "@/lib/supabase";

interface UsageCheckResult {
  hasUsage: boolean;
  packageNames: string[];
  appointmentCount: number;
  deliveryCount: number;
  details: string[];
}

/**
 * Check if services are used in any packages
 */
async function checkServicesInPackages(serviceIds: string[]): Promise<string[]> {
  const { data } = await supabase
    .from("package_items")
    .select("package_id, packages(name)")
    .in("service_id", serviceIds);

  if (!data) return [];

  const packageNames = new Set<string>();
  data.forEach((item: any) => {
    if (item.packages?.name) {
      packageNames.add(item.packages.name);
    }
  });

  return Array.from(packageNames);
}

/**
 * Check if products are in pending deliveries (appointment_products)
 */
async function checkProductsInDeliveries(productIds: string[]): Promise<number> {
  const { data, count } = await supabase
    .from("appointment_products")
    .select("id", { count: "exact" })
    .in("product_id", productIds)
    .eq("fulfillment_status", "pending");

  return count || 0;
}

/**
 * Check if items are in active appointments
 */
async function checkItemsInAppointments(
  itemIds: string[],
  itemType: "service" | "product" | "package"
): Promise<number> {
  if (itemType === "service") {
    const { count } = await supabase
      .from("appointment_services")
      .select("id", { count: "exact" })
      .in("service_id", itemIds)
      .in("status", ["scheduled", "started", "paused"]);
    return count || 0;
  }

  if (itemType === "product") {
    const { count } = await supabase
      .from("appointment_products")
      .select("id", { count: "exact" })
      .in("product_id", itemIds)
      .eq("fulfillment_status", "pending");
    return count || 0;
  }

  if (itemType === "package") {
    const { count } = await supabase
      .from("appointment_services")
      .select("id", { count: "exact" })
      .in("package_id", itemIds)
      .in("status", ["scheduled", "started", "paused"]);
    return count || 0;
  }

  return 0;
}

/**
 * Main function to check if items are in use before deletion/archiving
 */
export async function checkItemUsage(
  itemIds: string[],
  itemType: "service" | "product" | "package" | "voucher"
): Promise<UsageCheckResult> {
  const result: UsageCheckResult = {
    hasUsage: false,
    packageNames: [],
    appointmentCount: 0,
    deliveryCount: 0,
    details: [],
  };

  if (itemIds.length === 0) return result;

  try {
    // Check services in packages
    if (itemType === "service") {
      result.packageNames = await checkServicesInPackages(itemIds);
      if (result.packageNames.length > 0) {
        result.details.push(
          `Used in ${result.packageNames.length} package(s): ${result.packageNames.slice(0, 3).join(", ")}${result.packageNames.length > 3 ? "..." : ""}`
        );
      }
    }

    // Check products in pending deliveries
    if (itemType === "product") {
      result.deliveryCount = await checkProductsInDeliveries(itemIds);
      if (result.deliveryCount > 0) {
        result.details.push(`${result.deliveryCount} pending delivery order(s)`);
      }
    }

    // Check items in active appointments
    if (itemType !== "voucher") {
      result.appointmentCount = await checkItemsInAppointments(
        itemIds,
        itemType as "service" | "product" | "package"
      );
      if (result.appointmentCount > 0) {
        result.details.push(`${result.appointmentCount} active appointment(s)`);
      }
    }

    result.hasUsage =
      result.packageNames.length > 0 ||
      result.appointmentCount > 0 ||
      result.deliveryCount > 0;

    return result;
  } catch (error) {
    console.error("Error checking item usage:", error);
    return result;
  }
}

/**
 * Get a human-readable message for items that are in use
 */
export function getUsageMessage(result: UsageCheckResult): string {
  if (!result.hasUsage) return "";
  
  const parts = result.details.slice(0, 3);
  return `This item cannot be deleted because it's currently in use:\n• ${parts.join("\n• ")}\n\nYou can Archive it instead to hide it from the booking platform.`;
}
