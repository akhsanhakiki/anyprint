import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.anyprint.app",
  appName: "Anyprint",
  webDir: "dist",
  android: { allowMixedContent: false },
};
export default config;
