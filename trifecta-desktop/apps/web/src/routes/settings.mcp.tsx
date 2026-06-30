import { createFileRoute } from "@tanstack/react-router";

import { McpServersPanel } from "../components/settings/McpServersPanel";

function SettingsMcpRoute() {
  return <McpServersPanel />;
}

export const Route = createFileRoute("/settings/mcp")({
  component: SettingsMcpRoute,
});
