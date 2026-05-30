import { createFileRoute } from "@tanstack/react-router";

import { QuotasSettingsPanel } from "../components/settings/QuotasSettingsPanel";

function SettingsQuotasRoute() {
  return <QuotasSettingsPanel />;
}

export const Route = createFileRoute("/settings/quotas")({
  component: SettingsQuotasRoute,
});
