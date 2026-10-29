import { BookOpen, Brain, CalendarClock, GraduationCap } from "lucide-react";

export const EVENT_ICONS = {
  LECTURE: BookOpen,
  STUDY: Brain,
  DEADLINE: CalendarClock,
  OTHER: CalendarClock,
  EXAM: GraduationCap,
} as const;
