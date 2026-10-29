import type { SchedulerSettings } from "@/lib/srs/scheduler";

export function schedulerSettings(user: {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
}): SchedulerSettings {
  return {
    requestRetention: user.requestRetention,
    maximumInterval: user.maximumInterval,
    enableFuzz: user.enableFuzz,
  };
}
