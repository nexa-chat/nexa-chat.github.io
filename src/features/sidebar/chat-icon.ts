import { ChefHat, Code2, HeartPulse, Languages, Lightbulb, type LucideIcon, MessageSquare, PenLine, Plane, Sigma, Wallet } from "lucide-react";

/**
 * Word starts, so "calcul" also matches "calculer". The boundary is Unicode-aware: JavaScript's
 * \b treats accented letters as non-word characters, which would miss "équation".
 */
function startsOf(words: readonly string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})`, "u");
}

/**
 * A chat's icon, guessed from words in its title, in English and French. It's a scanning aid
 * only, so a wrong guess costs little and nothing is sent anywhere to make it.
 */
const RULES: readonly { icon: LucideIcon; pattern: RegExp }[] = [
  {
    icon: Code2,
    pattern: startsOf(["code", "coding", "bug", "debug", "function", "fonction", "typescript", "javascript", "python", "react", "next\\.?js", "api", "sql", "regex", "css", "html", "error", "erreur", "stack ?trace", "git", "docker", "script", "compil"]),
  },
  { icon: Sigma, pattern: startsOf(["math", "équation", "equation", "calcul", "integral", "intégral", "algebra", "algèbre", "derivative", "dérivée", "probabilit", "statisti", "matrix", "matrice"]) },
  { icon: Plane, pattern: startsOf(["trip", "travel", "voyage", "flight", "vol ", "hotel", "hôtel", "visit", "vacation", "vacances", "itinerary", "itinéraire"]) },
  { icon: Languages, pattern: startsOf(["translat", "tradu"]) },
  { icon: PenLine, pattern: startsOf(["email", "e-mail", "mail", "letter", "lettre", "write", "écri", "draft", "brouillon", "essay", "essai", "post ", "article", "story", "histoire", "cv\\b", "resume"]) },
  { icon: ChefHat, pattern: startsOf(["recipe", "recette", "cook", "cuisin", "meal", "repas", "dinner", "dîner"]) },
  { icon: Wallet, pattern: startsOf(["budget", "price", "prix", "cost", "coût", "invest", "money", "argent", "tax", "impôt", "salary", "salaire", "financ"]) },
  { icon: HeartPulse, pattern: startsOf(["health", "santé", "sport", "workout", "training", "entraînement", "diet", "régime", "sleep", "sommeil"]) },
  { icon: Lightbulb, pattern: startsOf(["explain", "expliqu", "learn", "apprend", "what is", "qu'est-ce", "how does", "comment", "why", "pourquoi", "idea", "idée"]) },
];

export function chatIcon(title: string): LucideIcon {
  const lower = title.toLowerCase();
  return RULES.find((rule) => rule.pattern.test(lower))?.icon ?? MessageSquare;
}
