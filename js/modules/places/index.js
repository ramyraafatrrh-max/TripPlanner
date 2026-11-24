/* places module: the place page, adding places, editing a place and reordering a day for the least travel.
   Files: add.js (Add places sheet), edit.js (edit sheet), day.js (reorder/undo/locate), optimize.js (the maths), geo.js (find coordinates), wiki.js (web info). */
import { openAddPlaces } from "./add.js";
import { editStopSheet } from "./edit.js";
import { placeView } from "./detail.js";
import * as day from "./day.js";
import { geocode, locateStop } from "./geo.js";
import { openOptimize } from "./optimizeSheet.js";

export default {
  id: "places", version: "2.0.0", title: "Places and route order",
  description: "Add places with a Google Maps link, reorder a day for the least travel, edit places, place pages.",
  init(ctx) {
    ctx.route("trip/:id/place/:stopId", placeView);
    ctx.service("places", { openAddPlaces, editStopSheet, openOptimize, geocode, locateStop, locateDay: day.locateDay, reorderDay: day.reorderDay, undoReorder: day.undoReorder, rankDays: day.rankDays, hotelPoint: day.hotelPoint });
    ctx.tripAction({ id: "add-places", order: 10, icon: "plus", label: "Add places", run: trip => openAddPlaces(trip) });
  }
};
