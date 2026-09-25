import { Navigate, useLocation } from "react-router-dom";

/** Preserve payment return parameters and audience selection from older links. */
export function LegacyMarketingRedirect() {
  const { search, hash, state } = useLocation();
  return <Navigate to={{ pathname: "/salon/marketing", search, hash }} state={state} replace />;
}
