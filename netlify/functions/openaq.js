"use strict";


let cache = {
  time: 0,
  data: null
};


const CACHE_TIME =
  5 * 60 * 1000;


/*
 * Ukraine approximate bounding box.
 */

const UKRAINE = {

  west: 22.1,

  south: 44.2,

  east: 40.3,

  north: 52.4

};


export default async (req) => {

  try {

    /*
     * =====================================================
     * CACHE
     * =====================================================
     *
     * If somebody refreshes the website repeatedly,
     * don't hit OpenAQ every time.
     */

    if (
      cache.data &&
      Date.now() - cache.time <
        CACHE_TIME
    ) {

      console.log(
        "[OpenAQ] Returning cached data"
      );


      return Response.json(
        cache.data,
        {
          headers: {
            "X-OpenAQ-Cache":
              "HIT"
          }
        }
      );

    }


    /*
     * =====================================================
     * API KEY
     * =====================================================
     */

    const apiKey =
      Netlify.env.get(
        "OPENAQ_API_KEY"
      );


    if (!apiKey) {

      return Response.json(
        {
          error:
            "OPENAQ_API_KEY is not configured"
        },
        {
          status: 500
        }
      );

    }


    const headers = {

      "X-API-Key":
        apiKey,

      "Accept":
        "application/json"

    };


    /*
     * =====================================================
     * LOCATIONS
     * =====================================================
     */

    const locationsUrl =
      "https://api.openaq.org/v3/locations" +

      `?bbox=` +

      `${UKRAINE.west},` +

      `${UKRAINE.south},` +

      `${UKRAINE.east},` +

      `${UKRAINE.north}` +

      "&limit=100";


    console.log(
      "[OpenAQ] Locations request:",
      locationsUrl
    );


    const locationsResponse =
      await fetch(
        locationsUrl,
        {
          headers
        }
      );


    const locationsText =
      await locationsResponse.text();


    if (
      !locationsResponse.ok
    ) {

      console.error(
        "[OpenAQ] Locations:",
        locationsResponse.status,
        locationsText
      );


      if (
        locationsResponse.status ===
        429
      ) {

        return Response.json(
          {
            error:
              "OpenAQ rate limit exceeded. Wait a few minutes before trying again.",

            status:
              429
          },
          {
            status: 429
          }
        );

      }


      return Response.json(
        {
          error:
            "OpenAQ locations request failed",

          status:
            locationsResponse.status,

          details:
            locationsText
        },
        {
          status:
            locationsResponse.status
        }
      );

    }


    const locationsData =
      JSON.parse(
        locationsText
      );


    const locations =
      locationsData.results ||
      [];


    /*
     * =====================================================
     * UKRAINE FILTER
     * =====================================================
     */

    const ukrainianLocations =
      locations.filter(
        location => {

          const coordinates =
            location.coordinates;


          if (
            !coordinates
          ) {

            return false;

          }


          const lat =
            Number(
              coordinates.latitude
            );


          const lon =
            Number(
              coordinates.longitude
            );


          return (

            lat >= UKRAINE.south &&

            lat <= UKRAINE.north &&

            lon >= UKRAINE.west &&

            lon <= UKRAINE.east

          );

        }
      );


    console.log(
      "[OpenAQ] Ukraine locations:",
      ukrainianLocations.length
    );


    /*
     * =====================================================
     * RESULTS
     * =====================================================
     */

    const results = [];


    /*
     * =====================================================
     * PROCESS LOCATIONS
     * =====================================================
     *
     * IMPORTANT:
     *
     * We deliberately limit the number of requests.
     *
     */

    const locationsToProcess =
      ukrainianLocations.slice(
        0,
        20
      );


    for (
      const location
      of locationsToProcess
    ) {

      try {

        /*
         * Get latest measurements directly.
         *
         * We don't request /sensors separately.
         */

        const latestUrl =
          `https://api.openaq.org/v3/locations/${location.id}/latest?limit=100`;


        console.log(
          "[OpenAQ] Latest:",
          location.id
        );


        const latestResponse =
          await fetch(
            latestUrl,
            {
              headers
            }
          );


        if (
          latestResponse.status ===
          429
        ) {

          console.warn(
            "[OpenAQ] Rate limited while reading station",
            location.id
          );


          /*
           * Stop immediately rather than making
           * the rate-limit problem worse.
           */

          break;

        }


        if (
          !latestResponse.ok
        ) {

          console.warn(
            "[OpenAQ] Station failed:",
            location.id,
            latestResponse.status
          );


          continue;

        }


        const latestData =
          await latestResponse.json();


        const measurements =
          latestData.results ||
          [];


        /*
         * =================================================
         * FIND FORMALDEHYDE
         * =================================================
         */

        for (
          const measurement
          of measurements
        ) {

          const text =
            JSON.stringify(
              measurement
            ).toLowerCase();


          const isHCHO =

            text.includes(
              "formaldehyde"
            ) ||

            text.includes(
              "hcho"
            );


          if (
            !isHCHO
          ) {

            continue;

          }


          const value =
            Number(
              measurement.value
            );


          if (
            !Number.isFinite(
              value
            )
          ) {

            continue;

          }


          const coordinates =
            measurement.coordinates ||
            location.coordinates;


          if (
            !coordinates
          ) {

            continue;

          }


          const latitude =
            Number(
              coordinates.latitude
            );


          const longitude =
            Number(
              coordinates.longitude
            );


          if (
            !Number.isFinite(
              latitude
            ) ||
            !Number.isFinite(
              longitude
            )
          ) {

            continue;

          }


          /*
           * Final Ukraine check.
           */

          if (

            latitude <
              UKRAINE.south ||

            latitude >
              UKRAINE.north ||

            longitude <
              UKRAINE.west ||

            longitude >
              UKRAINE.east

          ) {

            continue;

          }


          results.push({

            source:
              "OpenAQ",

            country:
              "Ukraine",

            location:
              location.name ||
              "OpenAQ station",

            locationId:
              location.id,

            latitude,

            longitude,

            valueMgM3:
              value,

            parameter:
              "HCHO",

            datetime:
              measurement.datetime?.utc ||
              measurement.datetime?.local ||
              null

          });

        }


      } catch (error) {

        console.error(
          "[OpenAQ] Station error:",
          location.id,
          error
        );

      }

    }


    /*
     * =====================================================
     * REMOVE DUPLICATES
     * =====================================================
     */

    const uniqueResults =
      Array.from(

        new Map(

          results.map(
            item => [

              `${item.locationId}:` +
              `${item.datetime}:` +
              `${item.valueMgM3}`,

              item

            ]
          )

        ).values()

      );


    const responseData = {

      source:
        "OpenAQ",

      country:
        "Ukraine",

      count:
        uniqueResults.length,

      results:
        uniqueResults

    };


    /*
     * =====================================================
     * CACHE
     * =====================================================
     */

    cache = {

      time:
        Date.now(),

      data:
        responseData

    };


    console.log(
      "[OpenAQ] HCHO results:",
      uniqueResults.length
    );


    return Response.json(
      responseData,
      {
        headers: {
          "X-OpenAQ-Cache":
            "MISS"
        }
      }
    );


  } catch (error) {

    console.error(
      "[OpenAQ] MAIN ERROR:",
      error
    );


    return Response.json(
      {
        error:
          error.message ||
          "OpenAQ request failed"
      },
      {
        status: 500
      }
    );

  }

};
