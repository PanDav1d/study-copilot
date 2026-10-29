import { GraduationCap } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-accent/60 to-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 rounded-xl bg-primary p-3 text-primary-foreground shadow-lg">
            <GraduationCap className="size-7" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Study Copilot</h1>
          <p className="text-sm text-muted-foreground">Dein Lernbegleiter fürs DHBW-Studium</p>
        </div>
        {children}
      </div>
    </main>
  );
}
