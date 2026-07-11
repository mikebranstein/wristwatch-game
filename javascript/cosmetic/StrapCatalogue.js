/**
 * StrapCatalogue — static data source for strap variants.
 *
 * Issue #143 — Strap Swap: Cosmetic Restoration Phase 1 (AC1)
 *
 * Provides the authoritative list of strap variants available for selection
 * during the cosmetic restoration phase. Each variant carries an id,
 * human-readable label, material, colour, and an asset key used by the
 * asset-swap system to locate the appropriate mesh/material reference.
 *
 * The baseline worn strap is a special entry (id: 'worn_original') that
 * represents the default degraded strap arriving with the watch. It is
 * always included and always rendered first in the selection UI so players
 * can compare against the originating condition.
 *
 * Design constraint (Issue #143 Scope): no unlockable/purchasable variants,
 * no custom colour editor — only the pre-authored entries in this file.
 *
 * Phase 2 (crystal) and Phase 3 (case polishing) will add their own
 * catalogue modules following this same data shape.
 */

'use strict';

/**
 * @typedef {Object} StrapVariant
 * @property {string}  id           — unique stable identifier
 * @property {string}  label        — display name shown in selection UI
 * @property {string}  material     — e.g. 'leather' | 'nato' | 'rubber'
 * @property {string}  colour       — descriptive colour string
 * @property {string}  assetKey     — mesh/material reference key for asset-swap
 * @property {boolean} isBaseline   — true only for the worn original strap
 * @property {string}  description  — short flavour description for UI tooltip
 */

/** @type {StrapVariant[]} */
const STRAP_VARIANTS = [
  {
    id: 'worn_original',
    label: 'Original (Worn)',
    material: 'leather',
    colour: 'tan',
    assetKey: 'strap_worn_original',
    isBaseline: true,
    description: 'The original strap — aged leather, discoloured and worn through years of use.',
  },
  {
    id: 'leather_brown',
    label: 'Leather — Chestnut Brown',
    material: 'leather',
    colour: 'brown',
    assetKey: 'strap_leather_brown',
    isBaseline: false,
    description: 'Classic chestnut-brown leather with a clean, polished finish.',
  },
  {
    id: 'leather_black',
    label: 'Leather — Jet Black',
    material: 'leather',
    colour: 'black',
    assetKey: 'strap_leather_black',
    isBaseline: false,
    description: 'Formal jet-black leather — crisp and versatile for any occasion.',
  },
  {
    id: 'nato_olive',
    label: 'NATO — Olive Drab',
    material: 'nato',
    colour: 'olive',
    assetKey: 'strap_nato_olive',
    isBaseline: false,
    description: 'Military-inspired olive drab nylon NATO strap — durable and casual.',
  },
  {
    id: 'nato_navy',
    label: 'NATO — Navy Blue',
    material: 'nato',
    colour: 'navy',
    assetKey: 'strap_nato_navy',
    isBaseline: false,
    description: 'Smart navy-blue nylon NATO strap with a sporty, layered profile.',
  },
];

/**
 * Returns all strap variants (baseline first, then selectable options).
 * @returns {StrapVariant[]}
 */
function getAllStraps() {
  return STRAP_VARIANTS.slice();
}

/**
 * Returns only the selectable (non-baseline) strap variants.
 * These are the options presented as alternatives to the worn original.
 * @returns {StrapVariant[]}
 */
function getSelectableStraps() {
  return STRAP_VARIANTS.filter(v => !v.isBaseline);
}

/**
 * Returns the baseline worn strap variant.
 * @returns {StrapVariant}
 */
function getBaselineStrap() {
  return STRAP_VARIANTS.find(v => v.isBaseline);
}

/**
 * Looks up a strap variant by its id. Returns null if not found.
 * @param {string} id
 * @returns {StrapVariant|null}
 */
function getStrapById(id) {
  return STRAP_VARIANTS.find(v => v.id === id) || null;
}

module.exports = {
  STRAP_VARIANTS,
  getAllStraps,
  getSelectableStraps,
  getBaselineStrap,
  getStrapById,
};
