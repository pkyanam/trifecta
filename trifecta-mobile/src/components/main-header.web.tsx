import { SmartHeader } from "./smart-header";
import { useDrawer } from "./drawer-content";

export function MainHeader() {
  const { openDrawer } = useDrawer();
  return <SmartHeader onMenuPress={openDrawer} />;
}