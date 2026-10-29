"use server";

import { existsSync } from "node:fs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDesktop } from "@/lib/env";
import { authedAction, UserError } from "../action";
import { bundledLaunch, connectCode, connectDesktop, disconnectCode, disconnectDesktop } from "../claude-connect";

const target = z.object({ target: z.enum(["desktop", "code"]) });

function requireDesktop() {
  if (!isDesktop()) throw new UserError("Claude lässt sich nur in der Desktop-App direkt verbinden.");
}

export const connectClaude = authedAction(target, async ({ target }) => {
  requireDesktop();
  const launch = bundledLaunch();
  if (!existsSync(launch.args[0]!)) throw new UserError("Der MCP-Server fehlt in dieser App-Version. Bitte die App neu installieren.");
  if (target === "desktop") await connectDesktop(launch);
  else await connectCode(launch);
  revalidatePath("/settings");
});

export const disconnectClaude = authedAction(target, async ({ target }) => {
  requireDesktop();
  if (target === "desktop") await disconnectDesktop();
  else await disconnectCode();
  revalidatePath("/settings");
});
