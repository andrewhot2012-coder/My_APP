export function isValidContractorName(text: any): boolean {
  if (!text) return false;
  const str = text.toString().trim();
  if (str === "") return false;
  if (str.indexOf("↳") !== -1 || str.indexOf("👤") !== -1 || str.indexOf("📝") !== -1 || str.indexOf("[") === 0) return false;
  const lower = str.toLowerCase();
  const invalidWords = ["готівка", "банк", "загальне", "прибуток", "покупка", "нам винні", "ми винні", "віддача", "борг", "маржа", "зарахування", "оплатив", "отримано", "взаємозалік"];
  for (let i = 0; i < invalidWords.length; i++) {
    if (lower.indexOf(invalidWords[i]) !== -1) return false;
  }
  return true;
}
