import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui/misc";
import { bundledLaunch, codeStatus, desktopStatus } from "@/server/claude-connect";
import { ClaudeConnect } from "./claude-connect";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const user = await requireUser();
  const desktop = !!env().DESKTOP_TOKEN;
  const launch = desktop ? bundledLaunch() : null;
  const claude = launch ? { desktop: await desktopStatus(launch), code: await codeStatus(launch) } : null;
  return (
    <>
      <PageHeader title="Einstellungen" description={desktop ? "Desktop-App" : user.email} />
      <SettingsForms
        user={user}
        dataDir={desktop ? (env().DATA_DIR ?? null) : undefined}
        claude={claude && <ClaudeConnect status={claude} />}
      />
    </>
  );
}
