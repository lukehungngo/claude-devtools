import { useState, useRef } from "react";
import { HelpCircle } from "lucide-react";

interface QuestionBlockProps {
  questionId: string;
  questionText: string;
  status: "pending" | "answered";
  answer?: string;
  onSubmitAnswer: (questionId: string, answer: string) => void;
}

export function QuestionBlock({
  questionId,
  questionText,
  status,
  answer,
  onSubmitAnswer,
}: QuestionBlockProps) {
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPending = status === "pending";

  function handleSubmit() {
    if (!inputValue.trim() || submitting) return;
    setSubmitting(true);
    onSubmitAnswer(questionId, inputValue.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="rounded-xl border border-dt-accent/30 bg-dt-accent/5 p-3 my-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <HelpCircle size={16} className="text-dt-accent" />
        <span className="text-sm font-semibold text-dt-text0">
          Question from Agent
        </span>
      </div>

      {/* Question text */}
      <div className="text-sm text-dt-text1 pl-6 mb-2 whitespace-pre-wrap">
        {questionText}
      </div>

      {/* Answer input or display */}
      <div className="pl-6">
        {isPending && !submitting ? (
          <div className="flex items-center gap-2">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Type your answer..."
              aria-label={`Answer to agent question: ${questionText.slice(0, 50)}`}
              className="flex-1 bg-dt-bg2 border border-dt-border rounded-lg px-3 py-1.5 text-sm text-dt-text0 font-mono resize-none outline-none focus:border-dt-accent transition-colors"
            />
            <button
              onClick={handleSubmit}
              disabled={!inputValue.trim()}
              aria-label="Submit answer"
              className={`px-3 py-1.5 rounded-dt text-sm font-semibold transition-all ${
                inputValue.trim()
                  ? "bg-dt-accent text-white cursor-pointer"
                  : "bg-dt-bg3 text-dt-text2 cursor-default"
              }`}
            >
              Submit
            </button>
          </div>
        ) : isPending && submitting ? (
          <span className="text-xs text-dt-text2">Submitting...</span>
        ) : (
          <div className="text-xs text-dt-text2" aria-live="polite">
            <span className="font-semibold">Your answer:</span>{" "}
            <span className="text-dt-text1">{answer}</span>
          </div>
        )}
      </div>
    </div>
  );
}
