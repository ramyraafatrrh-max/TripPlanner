/* parsers module: reads PDFs. Other modules use it only through the "parse" service.
   To improve hotel reading, edit just hotel.js; for flights flight.js; for the day-by-day plan itinerary.js. */
import { readPdf } from "./pdftext.js";
import { parseHotelPages } from "./hotel.js";
import { parseFlightPages } from "./flight.js";
import { parseItinerary } from "./itinerary.js";

export default {
  id: "parsers", version: "2.0.0", title: "PDF readers",
  description: "Reads itinerary, hotel and flight PDFs on the phone. hotel.js, flight.js and itinerary.js can each be updated alone.",
  init(ctx) {
    ctx.service("parse", {
      readPdf,
      async itinerary(file, opts) { return parseItinerary(await readPdf(file), opts); },
      async hotel(file, opts) { return parseHotelPages(await readPdf(file), opts); },
      async flights(file, opts) { return parseFlightPages(await readPdf(file), Object.assign({ fileName: file.name }, opts)); }
    });
  }
};
