import { describe, expect, it } from "vitest";
import { gradeWebAnswer } from "../grading/web-answer";

describe("gradeWebAnswer", () => {
  it("returns failed status with score 0 for empty answers", () => {
    const grade = gradeWebAnswer({ answer: "" });
    expect(grade.status).toBe("failed");
    expect(grade.score).toBe(0);
    expect(grade.wordCount).toBe(0);
    // Falls back to the default 3-dimension rubric.
    expect(grade.dimensions).toHaveLength(3);
  });

  it("rewards length + evidence + structure with a passing score", () => {
    const longAnswer =
      "Paragraph one explores the cause.\n\n" +
      "- Bullet evidence [1] supports the claim\n" +
      "- Second bullet [2] adds nuance\n\n" +
      "Therefore the conclusion follows because the data converges and " +
      "since the trend is consistent across folds, we accept the result.";
    const grade = gradeWebAnswer({
      answer: longAnswer,
      rubric: [
        { id: "evidence", label: "Evidence grounding", weight: 0.5 },
        { id: "reasoning", label: "Causal reasoning", weight: 0.3 },
        { id: "structure", label: "Structure", weight: 0.2 },
      ],
      passThreshold: 0.5,
    });
    expect(grade.status).toBe("passed");
    expect(grade.score).toBeGreaterThanOrEqual(0.5);
    expect(grade.dimensions.map((d) => d.id)).toEqual([
      "evidence",
      "reasoning",
      "structure",
    ]);
  });

  it("extracts text from object-shaped answers", () => {
    const grade = gradeWebAnswer({
      answer: { text: "Short evidence [1] because data shows it." },
    });
    expect(grade.wordCount).toBeGreaterThan(0);
    expect(grade.status).not.toBe("failed");
  });

  it("uses the authored stage rubric weights when aggregating", () => {
    const grade = gradeWebAnswer({
      answer: "tiny",
      rubric: [
        { id: "a", label: "A", weight: 10 },
        { id: "b", label: "B", weight: 0 },
      ],
    });
    // With weight 0 on dimension b, the aggregate equals dimension a's score.
    expect(grade.score).toBeCloseTo(grade.dimensions[0]!.score, 5);
  });
});
