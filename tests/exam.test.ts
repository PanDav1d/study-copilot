import { describe, expect, it } from "vitest";
import { buildExamPrompt, extractJson, germanGrade, gradeExam, gradeQuestion, parseExamText, questionToCard, type ExamQuestion } from "@/lib/exam";

const sample = {
  title: "Probeklausur DB",
  timeLimit: 60,
  questions: [
    { type: "single", question: "Welche NF verbietet transitive Abhängigkeiten?", options: ["1NF", "2NF", "3NF"], correct: "C", points: 2, topic: "Normalisierung" },
    { type: "multiple", question: "Welche sind DML?", options: ["SELECT", "CREATE", "UPDATE", "DROP"], correct: ["A", "C"], points: 2 },
    { type: "text", question: "Erkläre ACID.", answer: "Atomicity, Consistency, Isolation, Durability", points: 4 },
  ],
};

describe("parseExamText", () => {
  it("parses JSON wrapped in prose and code fences", () => {
    const res = parseExamText(`Hier ist deine Klausur:\n\`\`\`json\n${JSON.stringify(sample)}\n\`\`\`\nViel Erfolg!`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.exam.title).toBe("Probeklausur DB");
    expect(res.exam.timeLimit).toBe(60);
    expect(res.exam.questions.map((q) => q.type)).toEqual(["single", "multiple", "text"]);
    expect(res.exam.questions[0]!.correct).toEqual([2]);
    expect(res.exam.questions[1]!.correct).toEqual([0, 2]);
    expect(res.exam.questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
  });

  it("accepts a bare array, option text as solution and infers types", () => {
    const res = parseExamText(JSON.stringify([
      { question: "2+2?", options: ["3", "4"], correct: "4" },
      { question: "Warum?", answer: "Darum" },
    ]));
    expect(res.ok && res.exam.questions.map((q) => [q.type, q.correct, q.points])).toEqual([["single", [1], 1], ["text", [], 4]]);
  });

  it("repairs smart quotes and trailing commas", () => {
    const res = parseExamText(`{“questions”: [{“question”: “A?”, “answer”: “B”,},]}`);
    expect(res.ok).toBe(true);
  });

  it("reports actionable errors per question", () => {
    const res = parseExamText(JSON.stringify({ questions: [
      { question: "x", options: ["a", "b"], correct: "D" },
      { question: "y", options: ["a", "b"], correct: 1 },
      { question: "z" },
      { type: "single", question: "w", options: ["a", "b"], correct: ["A", "B"] },
    ] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toHaveLength(4);
    expect(res.errors[0]).toMatch(/^Frage 1: .*keiner Antwortoption/);
    expect(res.errors[1]).toMatch(/Buchstaben/);
    expect(res.errors[2]).toMatch(/Musterlösung/);
    expect(res.errors[3]).toMatch(/multiple/);
  });

  it("rejects text without JSON", () => {
    expect(parseExamText("keine klausur").ok).toBe(false);
    expect(extractJson("abc")).toBeNull();
  });
});

describe("grading", () => {
  const parsed = parseExamText(JSON.stringify(sample));
  const qs = (parsed.ok ? parsed.exam.questions : []) as ExamQuestion[];

  it("grades single and multiple choice with partial credit", () => {
    expect(gradeQuestion(qs[0]!, { choice: [2] })).toEqual({ earned: 2, status: "correct" });
    expect(gradeQuestion(qs[0]!, { choice: [1] })).toEqual({ earned: 0, status: "wrong" });
    expect(gradeQuestion(qs[1]!, { choice: [0] })).toEqual({ earned: 1, status: "partial" });
    expect(gradeQuestion(qs[1]!, { choice: [0, 1] })).toEqual({ earned: 0, status: "wrong" });
    expect(gradeQuestion(qs[1]!, { choice: [0, 1, 3] }).earned).toBe(0);
    expect(gradeQuestion(qs[1]!, undefined).status).toBe("unanswered");
  });

  it("needs a self-assessment for text answers and clamps it", () => {
    expect(gradeQuestion(qs[2]!, { text: "ACID ist …" }).status).toBe("pending");
    expect(gradeQuestion(qs[2]!, { text: "ACID ist …", self: 99 }).earned).toBe(4);
    expect(gradeQuestion(qs[2]!, { text: " ", self: 4 }).status).toBe("unanswered");
  });

  it("sums the exam and estimates a grade", () => {
    const r = gradeExam(qs, { q1: { choice: [2] }, q2: { choice: [0] }, q3: { text: "x", self: 2 } });
    expect(r.earned).toBe(5);
    expect(r.max).toBe(8);
    expect(r.percent).toBeCloseTo(62.5);
    expect(r.grade).toBe(3.3);
    expect(r.pending).toBe(0);
    expect(r.topics[0]!.topic).toBe("Ohne Thema");
  });

  it("uses the German grade scale", () => {
    expect(germanGrade(100)).toBe(1.0);
    expect(germanGrade(50)).toBe(4.0);
    expect(germanGrade(49.9)).toBe(5.0);
  });

  it("turns missed questions into flashcards", () => {
    const card = questionToCard(qs[1]!);
    expect(card.front).toContain("A) SELECT");
    expect(card.back).toContain("**A)** SELECT");
    expect(card.back).toContain("**C)** UPDATE");
  });
});

describe("buildExamPrompt", () => {
  it("includes module info, notes on request and the format", () => {
    const ctx = { moduleName: "Datenbanken", examType: "Klausur", examDuration: 90, examTopics: "- SQL", notes: "## Sitzung\n- 3NF → keine transitiven Abh." };
    const withNotes = buildExamPrompt(ctx, { questionCount: 10, difficulty: "mittel", includeNotes: true });
    expect(withNotes).toContain("„Datenbanken“");
    expect(withNotes).toContain("90 Minuten");
    expect(withNotes).toContain("3NF");
    expect(withNotes).toContain('"correct": "B"');
    expect(buildExamPrompt(ctx, { questionCount: 10, difficulty: "mittel", includeNotes: false })).not.toContain("3NF");
  });
});
