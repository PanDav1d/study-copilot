"use client";

import dynamic from "next/dynamic";

/** The runner keeps its draft in localStorage, so it renders on the client only. */
export const ExamRunnerLoader = dynamic(() => import("./exam-runner").then((m) => m.ExamRunner), {
  ssr: false,
  loading: () => <div className="py-24 text-center text-sm text-muted-foreground">Lade Probeklausur …</div>,
});
