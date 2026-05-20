import { isOwner } from "./db.js";

export const TEXT_MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-4o-mini", label: "GPT-4o mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-5.2", label: "GPT-5.2" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5-nano", label: "GPT-5 nano" }
];

export const IMAGE_MODELS = [
  { id: "gpt-image-1", label: "GPT Image 1" },
  { id: "gpt-image-2", label: "GPT Image 2" }
];

export const DEFAULT_TEXT_MODEL = "gpt-4.1-mini";
export const DEFAULT_IMAGE_MODEL = "gpt-image-1";

export const TEXT_MODEL_FALLBACKS = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1"];
export const IMAGE_MODEL_FALLBACKS = ["gpt-image-1"];

const PLAN_LIMITS = {
  free: {
    gptMessagesPerDay: 10,
    imagesPerDay: 3,
    allowedTextModels: ["gpt-4.1-mini", "gpt-4o-mini"]
  },
  pro: {
    gptMessagesPerDay: 300,
    imagesPerDay: 100,
    allowedTextModels: null
  }
};

export function getUserLimits(user) {
  if (isOwner(user.telegram_id)) {
    return {
      plan: "owner",
      gptMessagesPerDay: Infinity,
      imagesPerDay: Infinity,
      allowedTextModels: TEXT_MODELS.map((m) => m.id)
    };
  }

  const plan = user.subscription_plan === "pro" ? "pro" : "free";
  return { plan, ...PLAN_LIMITS[plan] };
}

export function canUseGpt(user) {
  const limits = getUserLimits(user);
  if (limits.gptMessagesPerDay === Infinity) {
    return true;
  }
  return Number(user.gpt_messages_today) < limits.gptMessagesPerDay;
}

export function canGenerateImage(user) {
  const limits = getUserLimits(user);
  if (limits.imagesPerDay === Infinity) {
    return true;
  }
  return Number(user.images_today) < limits.imagesPerDay;
}

export function canUseTextModel(user, model) {
  const limits = getUserLimits(user);
  if (limits.plan === "owner" || limits.plan === "pro") {
    return true;
  }
  return limits.allowedTextModels.includes(model);
}

export function normalizeTextModelForUser(user, requestedModel) {
  if (canUseTextModel(user, requestedModel)) {
    return requestedModel;
  }
  return DEFAULT_TEXT_MODEL;
}
