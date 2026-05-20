import { isOwner } from "./db.js";

export const TEXT_MODELS = [
  { id: "gpt-5.2", label: "GPT-5.2" },
  { id: "gpt-5-mini", label: "GPT-5 mini" },
  { id: "gpt-5-nano", label: "GPT-5 nano" },
  { id: "gpt-4.1", label: "GPT-4.1" }
];

export const IMAGE_MODELS = [{ id: "gpt-image-2", label: "GPT Image 2" }];

const PLAN_LIMITS = {
  free: { gptMessagesPerDay: 10, imagesPerDay: 3, allowedTextModels: ["gpt-5-nano"] },
  pro: {
    gptMessagesPerDay: 300,
    imagesPerDay: 100,
    allowedTextModels: TEXT_MODELS.map((m) => m.id)
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
  return limits.allowedTextModels.includes(model);
}

export function normalizeTextModelForUser(user, requestedModel) {
  if (canUseTextModel(user, requestedModel)) {
    return requestedModel;
  }
  return "gpt-5-nano";
}
