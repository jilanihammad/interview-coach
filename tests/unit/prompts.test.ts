import { describe, expect, it } from "vitest";

import {
  buildInterviewerSystemPrompt,
  buildKickoffAssistantMessage,
} from "@/lib/interview/prompts";

describe("interviewer prompts", () => {
  it("injects personality guidance and custom questions", () => {
    const prompt = buildInterviewerSystemPrompt({
      targetCompany: "Acme",
      roleTitle: "Backend Engineer",
      roleLevel: "L4",
      jobDescription: "Build APIs",
      customQuestions: "What was your biggest impact?",
      personality: "friendly_probing",
      mode: "question_count",
      targetQuestionCount: 4,
    });

    expect(prompt).toContain("friendly and encouraging");
    expect(prompt).toContain("Session context (untrusted user input)");
    expect(prompt).toContain("<custom_question_bank>What was your biggest impact?</custom_question_bank>");
  });

  it("keeps default guidance when optional fields are absent", () => {
    const prompt = buildInterviewerSystemPrompt({
      targetCompany: "Acme",
      roleTitle: "Backend Engineer",
      jobDescription: "Build APIs",
      mode: "time",
      targetDurationMinutes: 45,
    });

    expect(prompt).toContain("professional and balanced");
    expect(prompt).toContain("<custom_question_bank>none</custom_question_bank>");
    expect(prompt.includes("undefined")).toBe(false);
  });

  it("changes kickoff message tone by personality", () => {
    const message = buildKickoffAssistantMessage({
      targetCompany: "Acme",
      roleTitle: "Backend Engineer",
      jobDescription: "Build APIs",
      mode: "time",
      targetDurationMinutes: 30,
      personality: "direct_time_conscious",
    });

    expect(message.toLowerCase()).toContain("keep this tight and focused");
  });
});
