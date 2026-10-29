import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return <EmptyState icon={SearchX} title="Nicht gefunden" description="Diese Seite existiert nicht oder wurde gelöscht." action={<Link href="/" className={buttonClass("secondary")}>Zur Übersicht</Link>} className="mt-10" />;
}
