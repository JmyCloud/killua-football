import { ANALYSIS_PACKS } from "@/lib/analysis";

export const GPT_PACKS = ANALYSIS_PACKS;

export const GPT_READ_MODES = Object.freeze(["full", "safe"]);

export function isValidGptPack(pack) {
  return GPT_PACKS.includes(String(pack ?? ""));
}