"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { StructureTree } from "@/server/queries/structure";
import type { DocumentOption } from "@/server/queries/documents";

interface StudyData {
  tree: StructureTree;
  documents: DocumentOption[];
  /** Rooms used so far, most used first. */
  rooms: string[];
}

export const ROOM_LIST_ID = "known-rooms";

const Ctx = createContext<StudyData>({ tree: [], documents: [], rooms: [] });

/** Makes the semester/module/lecture tree and document list available to all dialogs. */
export function StudyDataProvider({ value, children }: { value: StudyData; children: ReactNode }) {
  return (
    <Ctx.Provider value={value}>
      {children}
      {/* One shared list – every room field suggests from it via list={ROOM_LIST_ID}. */}
      <datalist id={ROOM_LIST_ID}>
        {value.rooms.map((r) => <option key={r} value={r} />)}
      </datalist>
    </Ctx.Provider>
  );
}

export function useStudyData() {
  return useContext(Ctx);
}

export function useModules() {
  const { tree } = useStudyData();
  return tree.flatMap((s) => s.modules.map((m) => ({ ...m, semesterId: s.id, semesterName: s.name })));
}
