"use client";

// Casca mínima pra medir o EDITOR do quiz sem login e sem banco: só o estado
// local que o EditorClient normalmente guarda em `settings.quiz`.
import { useState } from "react";
import { QuizEditor } from "../(plataforma)/tridiflow/[id]/QuizEditor";
import type { Quiz } from "@/lib/tridiflow-quiz";
import type { Theme } from "@/lib/tridiflow";

export function QuizEditorProva({ inicial, theme }: { inicial: Quiz; theme: Theme }) {
  const [quiz, setQuiz] = useState<Quiz>(inicial);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 120px)", minHeight: 460, gap: 12 }}>
      <QuizEditor quiz={quiz} onChange={setQuiz} theme={theme} previewKey={0} />
    </div>
  );
}
