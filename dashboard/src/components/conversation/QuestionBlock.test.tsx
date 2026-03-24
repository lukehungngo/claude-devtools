import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { QuestionBlock } from "./QuestionBlock";

afterEach(cleanup);

describe("QuestionBlock", () => {
  it("renders question text in pending state", () => {
    const { getByText } = render(
      <QuestionBlock
        questionId="q-1"
        questionText="What name should I use?"
        status="pending"
        onSubmitAnswer={vi.fn()}
      />
    );

    expect(getByText("Question from Agent")).toBeTruthy();
    expect(getByText("What name should I use?")).toBeTruthy();
  });

  it("typing and pressing Enter submits the answer", () => {
    const onSubmitAnswer = vi.fn();
    const { container } = render(
      <QuestionBlock
        questionId="q-1"
        questionText="Pick a name?"
        status="pending"
        onSubmitAnswer={onSubmitAnswer}
      />
    );

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea, { target: { value: "SessionCard" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSubmitAnswer).toHaveBeenCalledWith("q-1", "SessionCard");
  });

  it("clicking Submit button submits the answer", () => {
    const onSubmitAnswer = vi.fn();
    const { container, getByText } = render(
      <QuestionBlock
        questionId="q-1"
        questionText="Pick a name?"
        status="pending"
        onSubmitAnswer={onSubmitAnswer}
      />
    );

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "MyComponent" } });
    fireEvent.click(getByText("Submit"));

    expect(onSubmitAnswer).toHaveBeenCalledWith("q-1", "MyComponent");
  });

  it("shows answer text when status is 'answered'", () => {
    const { container } = render(
      <QuestionBlock
        questionId="q-1"
        questionText="Pick a name?"
        status="answered"
        answer="SessionCard"
        onSubmitAnswer={vi.fn()}
      />
    );

    // Should not show textarea
    expect(container.querySelector("textarea")).toBeNull();
    // Should show the answer
    expect(container.textContent).toContain("SessionCard");
    expect(container.textContent).toContain("Your answer:");
  });

  it("does not submit when textarea is empty", () => {
    const onSubmitAnswer = vi.fn();
    const { container } = render(
      <QuestionBlock
        questionId="q-1"
        questionText="Pick a name?"
        status="pending"
        onSubmitAnswer={onSubmitAnswer}
      />
    );

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    expect(onSubmitAnswer).not.toHaveBeenCalled();
  });
});
