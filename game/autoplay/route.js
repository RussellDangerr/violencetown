// route.js — quest 1 as goals, named by id (plans/quest1-autoplay.md §4 B).
// The only file that knows quest 1. Each fix_car stage maps to goals worked in
// order; player.js decides how, from live map data, so a map edit moves the
// route with it. The quest engine advancing a stage is what ends its goals.
//
//   use    walk to an open tile beside the examinable, face it, press E
//   kill   hit the enemy with this tag until it is gone
//   take   walk onto the item — pickups are automatic
//   reach  walk into the transition to that map

export const ROUTES = {
    fix_car: {
        examine_car:       [{ use: 'car', map: 'town-map.json' }],
        recover_converter: [{ kill: 'wererat_boss', map: 'sewer-map.json' }, { take: 'catalytic_converter', map: 'sewer-map.json' }],
        escape_sewer:      [{ reach: 'town-map.json' }],
        return_to_car:     [{ use: 'car', map: 'town-map.json' }],
    },
};
