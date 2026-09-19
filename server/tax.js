import { config } from './config.js';

// Items the Grand Exchange does not tax. Names, lower-cased.
export const TAX_EXEMPT = new Set([
  'old school bond',
  'chisel', 'gardening trowel', 'glassblowing pipe', 'hammer', 'needle', 'pestle and mortar',
  'rake', 'saw', 'secateurs', 'seed dibber', 'shears', 'spade', 'watering can', 'bucket',
  'bronze axe', 'bronze pickaxe', 'shrimps', 'bread', 'cooked meat', 'cooked chicken', 'lobster',
  'swordfish', 'energy potion(4)', 'mind rune', 'body rune', 'earth rune', 'water rune', 'air rune',
  'fire rune', 'chaos rune', 'nature rune', 'law rune', 'cosmic rune', 'death rune', 'blood rune',
  'soul rune', 'astral rune', 'wrath rune', 'sunfire rune', 'dust rune', 'mist rune', 'mud rune',
  'smoke rune', 'steam rune', 'lava rune', 'oak plank', 'teak plank', 'mahogany plank',
]);

/**
 * GE sell tax for one unit sold at `price`.
 * 2% of the sale price, rounded down, capped per item. Items under 50gp pay nothing
 * (2% of 49 rounds down to 0) and a handful of items are exempt.
 */
export function geTax(price, itemName = '', opts = {}) {
  const rate = opts.rate ?? config.geTaxRate;
  const cap = opts.cap ?? config.geTaxCap;
  if (!price || price < 50) return 0;
  if (TAX_EXEMPT.has(String(itemName).toLowerCase())) return 0;
  return Math.min(cap, Math.floor(price * rate));
}

/** Profit per unit when buying at `buy` and selling at `sell`, after tax. */
export function margin(buy, sell, itemName = '', opts) {
  if (!buy || !sell) return 0;
  return sell - buy - geTax(sell, itemName, opts);
}
