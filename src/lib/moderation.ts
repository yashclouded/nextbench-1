/**
 * Client-side Content Moderation Helper
 * Normalizes text to defeat simple homoglyph bypasses (e.g. replacing letters with numbers or symbols)
 * and checks against a blacklist of forbidden terms.
 */

// Homoglyphs and common leetspeak character substitutions mapped to standard English characters
const homoglyphs: Record<string, string> = {
  '@': 'a', '4': 'a', 'ª': 'a', 'æ': 'ae',
  '3': 'e', '€': 'e', '£': 'e',
  '1': 'i', '!': 'i', '|': 'i', '¡': 'i',
  '0': 'o', 'ø': 'o', 'œ': 'oe',
  '5': 's', '$': 's', '§': 's',
  '7': 't', '+': 't',
  '2': 'z', '8': 'b',
  'vv': 'w', 'uu': 'w',
  'ks': 'x', 'cs': 'x',
  '9': 'g', '6': 'g'
};

/**
 * Normalizes a string of text to make it easy to match against a blacklist.
 * - Converts to lowercase.
 * - Substitutes homoglyphs and leetspeak characters.
 * - Removes all whitespace, symbols, punctuation, and digits to counter spaced/dotted bypass attempts (e.g., "s.e.x" -> "sex").
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase();

  // 1. Substitute homoglyphs/leetspeak characters
  normalized = normalized
    .split('')
    .map(char => homoglyphs[char] || char)
    .join('');

  // 2. Resolve double-characters (e.g. "vv" replaced by "w" above) and handle potential spacings
  // 3. Keep only lowercase alphabetic characters (a-z)
  return normalized.replace(/[^a-z]/g, '');
}

// Banned words list (extensible)
export const BANNED_KEYWORDS = [
  'porn',
  'nsfw',
  'sex',
  'nude',
  'hentai',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'pussy',
  'bastard',
  'slut',
  'whore',
  'moderatorbypass', // test word for validation
];

/**
 * Validates whether a text block is free of banned keywords.
 * Returns true if clean (safe), false if it contains flagged content.
 */
export function isTextSafe(text: string): boolean {
  if (!text) return true;
  
  const cleanText = normalizeText(text);

  // Check if any blacklisted keyword exists as a substring of the normalized text
  for (const word of BANNED_KEYWORDS) {
    if (cleanText.includes(word)) {
      return false; // Flagged as unsafe
    }
  }

  return true; // Safe
}
