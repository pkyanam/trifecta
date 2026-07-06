import { createFileRoute } from "@tanstack/react-router";

import { CloudSettings } from "../components/settings/CloudSettings";

export const Route = createFileRoute("/settings/cloud")({
  component: CloudSettings,
});
