# Pet location data

The bundled pet layer contains 324 reference markers for Verteron (183 distinct
pets) and 313 for Altgard (147 distinct pets). The application reads pets.js
locally and makes no requests to the source website.

Source: the Pets group of the existing IMapp map snapshots for
https://interactivemap.app/aion2/maps/verteron and
https://interactivemap.app/aion2/maps/altgard. The source category names and pet
names are preserved. Empty Special categories are omitted.

| Map | Cogni | Fera | Natura | Varian |
| --- | ---: | ---: | ---: | ---: |
| Verteron | 48 | 189 | 62 | 25 |
| Altgard | 53 | 169 | 52 | 39 |

Each marker retains its source ID. Species IDs combine category and normalized
name; locations with the same species are controlled by one checkbox.

Coordinates use the same landmark registration as the hidden-cube atlas.
For source tiles_geometry coordinates [lat, lng], normalized image coordinates
are x = lng × xScale + xShift and y = lat × yScale + yShift:

| Map | xScale | xShift | yScale | yShift |
| --- | ---: | ---: | ---: | ---: |
| Verteron | 0.23791401695031855 | 14.25029143899826 | 0.23845592354478168 | 8.64590909158801 |
| Altgard | 0.23866834714622842 | 16.17897830799444 | 0.23920049301413585 | 5.847782077211264 |

The registration was fitted against 56 Verteron and 61 Altgard teleport
landmarks, then validated against all hidden-cube reference locations (maximum
normalized distance below 0.3 on a 1000-unit image). Every pet marker is checked
for a unique source ID, finite coordinates and image bounds during import.
Counts describe known reference locations, not guaranteed current spawns.
