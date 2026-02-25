import { Navigate } from "react-router-dom";
import { useBackofficeAuth } from "@/hooks";

export default function SalesOpsPage() {
  const { hasBackofficePageAccess, hasBackofficePermission } = useBackofficeAuth();

  if (
    hasBackofficePageAccess("sales_campaigns") &&
    hasBackofficePermission("sales.manage_campaigns")
  ) {
    return <Navigate to="/sales/campaigns" replace />;
  }
  if (
    hasBackofficePageAccess("sales_capture_client") &&
    hasBackofficePermission("sales.capture_client")
  ) {
    return <Navigate to="/sales/capture-client" replace />;
  }
  if (
    hasBackofficePageAccess("sales_conversions") &&
    hasBackofficePermission("sales.view_conversions")
  ) {
    return <Navigate to="/sales/conversions" replace />;
  }
  return <Navigate to="/" replace />;
}
