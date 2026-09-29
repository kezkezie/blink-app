/**
 * Which model serves which AI task — the ONE place that decision lives.
 *
 * W2 of the launch loop picks models per task by running the output-quality eval
 * (scripts/eval) against candidates. Changing a model here must be justified by
 * an eval result recorded in LOOP_STATE.md, never by taste.
 *
 * Values below are what each route used before the adapter existed, so adopting
 * the adapter changes no behaviour.
 */
export type LlmProvider = "openai";

export type LlmTaskConfig = {
  provider: LlmProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
};

export const LLM_TASKS = {
  /** Short 15-40 word concept seed (prompt-helper). Deliberately small. */
  conceptSeed: { provider: "openai", model: "gpt-4o", maxTokens: 80, temperature: 0.9 },
  /** Assisted Creation: concepts + creative direction, may read inspiration images. */
  assistedCreation: { provider: "openai", model: "gpt-4o", maxTokens: 900, temperature: 0.8 },
  /** Brand suggestions from brand context. */
  brandSuggest: { provider: "openai", model: "gpt-4o-mini", maxTokens: 150, temperature: 0.7 },
  /** Brand autofill from website / social URLs. */
  brandAutofill: { provider: "openai", model: "gpt-4o-mini" },
  /** Caption / analysis of existing media (vision). */
  contentAnalyze: { provider: "openai", model: "gpt-4o", maxTokens: 600, temperature: 0.7 },
  /** Video suggestion, storyboard and frame helpers (secured video routes). */
  videoHelper: { provider: "openai", model: "gpt-4o-mini" },
} as const satisfies Record<string, LlmTaskConfig>;

export type LlmTask = keyof typeof LLM_TASKS;
