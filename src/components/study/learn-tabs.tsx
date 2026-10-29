import { LinkTabs } from "@/components/ui/tabs";

/** "Lernen" is one place in the navigation – its three parts are tabs. */
export function LearnTabs({ active }: { active: "review" | "flashcards" | "exams" }) {
  return (
    <LinkTabs
      className="mb-6"
      active={active}
      tabs={[
        { key: "review", label: "Wiederholen", href: "/review" },
        { key: "flashcards", label: "Karteikarten", href: "/flashcards" },
        { key: "exams", label: "Probeklausuren", href: "/exams" },
      ]}
    />
  );
}
