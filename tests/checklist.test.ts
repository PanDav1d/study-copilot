import { describe, expect, it } from "vitest";
import { appendTask, taskItems, taskProgress, toggleTask } from "@/lib/checklist";

const md = ["## Themen", "- [ ] Normalformen", "- [x] ER-Modell", "  - [ ] Kardinalitäten", "", "```", "- [ ] kein Thema (Code)", "```", "1. [X] SQL"].join("\n");

describe("exam topic checklist", () => {
  it("finds tasks outside code blocks with their line", () => {
    expect(taskItems(md)).toEqual([
      { line: 2, done: false, text: "Normalformen" },
      { line: 3, done: true, text: "ER-Modell" },
      { line: 4, done: false, text: "Kardinalitäten" },
      { line: 9, done: true, text: "SQL" },
    ]);
    expect(taskProgress(md)).toEqual({ done: 2, total: 4 });
  });

  it("toggles exactly one line and nothing else", () => {
    const on = toggleTask(md, 2);
    expect(on.split("\n")[1]).toBe("- [x] Normalformen");
    expect(toggleTask(on, 2)).toBe(md);
    expect(toggleTask(md, 9).split("\n")[8]).toBe("1. [ ] SQL");
    expect(toggleTask(md, 7)).toBe(md); // inside the code block
    expect(toggleTask(md, 1)).toBe(md);
  });

  it("appends after the last task, keeping sub-items together", () => {
    const list = "- [ ] A\n  - [ ] A1\n  Notiz\n\nText danach";
    expect(appendTask(list, " B \n")).toBe("- [ ] A\n  - [ ] A1\n  Notiz\n- [ ] B\n\nText danach");
    expect(appendTask("", "X")).toBe("- [ ] X");
    expect(appendTask("Einleitung\n", "X")).toBe("Einleitung\n\n- [ ] X");
  });
});
