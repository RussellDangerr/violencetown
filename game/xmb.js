// game/xmb.js — the XMB usable-bar model. Pure, headless, testable.
//
// The always-live bottom bar is a VIEW over game.inventory, not a separate
// container: it filters the bag for "usable" items (throw / self-consumable)
// and groups them into horizontal categories, each with a vertical item column.
// Gear (useType:'equip'), quest/inert items (useType:'none'), learn tomes and
// the melee weapon never appear here — they live in the bag or on the body.

export const XMB_CATEGORIES = ['throw', 'drink', 'eat'];   // left-to-right bar order
export const XMB_LABELS = { throw: 'THROW', drink: 'DRINK', eat: 'EAT' };

// Which XMB column an item belongs to, or null if it is not a bar usable.
// An explicit `consumeKind` ('drink'|'eat') on the item def wins; otherwise a
// self-use food (category 'ambro') → eat, and any other self-use → drink.
export function xmbCategoryOf(def) {
    if (!def) return null;
    if (def.useType === 'throw') return 'throw';
    if (def.useType === 'self') {
        if (def.consumeKind === 'drink' || def.consumeKind === 'eat') return def.consumeKind;
        return def.category === 'ambro' ? 'eat' : 'drink';
    }
    return null;
}

// Build the bar from an inventory array (slots {itemDef,count}|null). Only
// non-empty categories appear, in XMB_CATEGORIES order. Each item carries its
// backing inventory `slot` so callers can drive the existing use paths.
export function buildXmbBar(inventory) {
    const cols = XMB_CATEGORIES.map(key => ({ key, label: XMB_LABELS[key], items: [] }));
    const byKey = Object.fromEntries(cols.map(c => [c.key, c]));
    (inventory || []).forEach((stack, slot) => {
        if (!stack || !stack.itemDef) return;
        const cat = xmbCategoryOf(stack.itemDef);
        if (cat && byKey[cat]) byKey[cat].items.push({ slot, itemDef: stack.itemDef, count: stack.count });
    });
    return { columns: cols.filter(c => c.items.length > 0) };
}

// Resolve the live selection against a bar. `cat` is the remembered current
// category key; `pick` is { throw:id, drink:id, eat:id } remembering the last
// item id per category. Clamps gracefully when items change or a category
// empties (empty categories are absent from bar.columns). Returns
// { column, item, itemIndex, colIndex } or null when the bar is empty.
export function resolveXmbSelection(bar, cat, pick) {
    const cols = bar.columns;
    if (!cols.length) return null;
    let colIndex = cols.findIndex(c => c.key === cat);
    if (colIndex < 0) colIndex = 0;
    const column = cols[colIndex];
    const wantId = (pick && pick[column.key]) || null;
    let itemIndex = column.items.findIndex(it => it.itemDef.id === wantId);
    if (itemIndex < 0) itemIndex = 0;
    return { column, item: column.items[itemIndex], itemIndex, colIndex };
}

// Move the category cursor to the prev/next non-empty column (wraps). Returns
// the new category key (unchanged when the bar is empty).
export function cycleXmbCategory(bar, cat, dir) {
    const cols = bar.columns;
    if (!cols.length) return cat;
    let i = cols.findIndex(c => c.key === cat);
    if (i < 0) i = 0;
    return cols[(i + dir + cols.length) % cols.length].key;
}

// Move the item cursor within the current column (wraps). Returns the new
// remembered item id for that category (null when the column is empty/absent).
export function cycleXmbItem(bar, cat, pick, dir) {
    const cols = bar.columns;
    const column = cols.find(c => c.key === cat) || cols[0];
    if (!column) return null;
    const wantId = (pick && pick[column.key]) || null;
    let i = column.items.findIndex(it => it.itemDef.id === wantId);
    if (i < 0) i = 0;
    return column.items[(i + dir + column.items.length) % column.items.length].itemDef.id;
}
