"use strict";

const CACHE_TIME = 5 * 60 * 1000;

let cache = {
  time: 0,
  data: null
};


export default async (req) => {

  try {

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


    /*
     * =====================================================
     * CACHE
     * =====================================================
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
     * HEADERS
     * =====================================================
     */

    const headers = {

      "X-API-Key":
        apiKey,

      "Accept":
        "application/json"

    };


    /*
     * =====================================================
     * GET UKRAINE LOCATIONS
     * =====================================================
     *
     * OpenAQ supports ISO country filtering.
     *
     * UA = Ukraine
     *
     * We also use the Ukraine bounding box as an
     * additional safety filter.
     */

    const locationsUrl =
      "https://api.openaq.org/v3/locations" +

      "?iso=UA" +

      "&bbox=22.1,44.2,40.3,52.4" +

      "&limit=100";


    console.log(
      "[OpenAQ] Locations request:",
      locationsUrl
    );


    const locationsResponse =
      await fetch(
        locationsUrl,
        {
          method: "GET",
          headers
        }
      );


    const locationsText =
      await locationsResponse.text();


    if (
      !locationsResponse.ok
    ) {

      console.error(
        "[OpenAQ] Locations error:",
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
              "OpenAQ rate limit exceeded. Please wait a few minutes and try again.",

            status:
              429
          },
          {
            status: 429
          }
        );

      }


      if (
        locationsResponse.status ===
        401
      ) {

        return Response.json(
          {
            error:
              "OpenAQ API key was rejected.",

            status:
              401
          },
          {
            status: 401
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


    let locationsData;


    try {

      locationsData =
        JSON.parse(
          locationsText
        );

    } catch (error) {

      return Response.json(
        {
          error:
            "OpenAQ returned invalid JSON"
        },
        {
          status: 502
        }
      );

    }


    const locations =
      locationsData.results ||
      [];


    console.log(
      "[OpenAQ] Locations:",
      locations.length
    );


    /*
     * =====================================================
     * FIND FORMALDEHYDE SENSORS
     * =====================================================
     *
     * The location response contains:
     *
     * location.sensors[]
     *
     * Each sensor has a parameter object.
     */

    const hchoSensors = [];


    for (
      const location
      of locations
    ) {

      const coordinates =
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
       * Final geographic safety filter.
       */

      if (

        latitude < 44.2 ||

        latitude > 52.4 ||

        longitude < 22.1 ||

        longitude > 40.3

      ) {

        continue;

      }


      const sensors =
        location.sensors ||
        [];


      for (
        const sensor
        of sensors
      ) {

        const parameter =
          sensor.parameter ||
          {};


        const parameterName =
          String(
            parameter.name ||
            ""
          ).toLowerCase();


        const displayName =
          String(
            parameter.displayName ||
            ""
          ).toLowerCase();


        const sensorName =
          String(
            sensor.name ||
            ""
          ).toLowerCase();


        const isHCHO =

          parameterName ===
            "formaldehyde" ||

          parameterName ===
            "hcho" ||

          parameterName.includes(
            "formaldehyde"
          ) ||

          parameterName.includes(
            "hcho"
          ) ||

          displayName.includes(
            "formaldehyde"
          ) ||

          displayName.includes(
            "hcho"
          ) ||

          sensorName.includes(
            "formaldehyde"
          ) ||

          sensorName.includes(
            "hcho"
          );


        if (
          !isHCHO
        ) {

          continue;

        }


        hchoSensors.push({

          sensorId:
            sensor.id,

          locationId:
            location.id,

          location:
            location.name ||
            "OpenAQ station",

          latitude,

          longitude,

          parameter:
            parameter.name ||
            parameter.displayName ||
            "HCHO",

          units:
            parameter.units ||
            null

        });

      }

    }


    console.log(
      "[OpenAQ] HCHO sensors:",
      hchoSensors.length
    );


    /*
     * =====================================================
     * GET LATEST VALUE FOR EACH HCHO SENSOR
     * =====================================================
     */

    const results = [];


    /*
     * Prevent an excessive number of requests.
     *
     * Increase later if necessary.
     */

    const sensorsToProcess =
      hchoSensors.slice(
        0,
        50
      );


    for (
      const sensor
      of sensorsToProcess
    ) {

      try {

        const latestUrl =
          `https://api.openaq.org/v3/sensors/${sensor.sensorId}/measurements?limit=1`;


        console.log(
          "[OpenAQ] Sensor:",
          sensor.sensorId
        );


        const response =
          await fetch(
            latestUrl,
            {
              method: "GET",
              headers
            }
          );


        if (
          response.status ===
          429
        ) {

          console.warn(
            "[OpenAQ] Rate limited"
          );


          break;

        }


        if (
          !response.ok
        ) {

          console.warn(
            "[OpenAQ] Sensor request failed:",
            sensor.sensorId,
            response.status
          );


          continue;

        }


        const data =
          await response.json();


        const measurements =
          data.results ||
          [];


        if (
          !measurements.length
        ) {

          continue;

        }


        /*
         * Most recent returned measurement.
         */

        const measurement =
          measurements[0];


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
          measurement.coordinates || {

            latitude:
              sensor.latitude,

            longitude:
              sensor.longitude

          };


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

          latitude < 44.2 ||

          latitude > 52.4 ||

          longitude < 22.1 ||

          longitude > 40.3

        ) {

          continue;

        }


        results.push({

          source:
            "OpenAQ",

          country:
            "Ukraine",

          location:
            sensor.location,

          locationId:
            sensor.locationId,

          sensorId:
            sensor.sensorId,

          latitude,

          longitude,

          valueMgM3:
            value,

          parameter:
            sensor.parameter,

          units:
            sensor.units,

          datetime:
            measurement.datetime?.utc ||
            measurement.datetime?.local ||
            null

        });


      } catch (error) {

        console.error(
          "[OpenAQ] Sensor error:",
          sensor.sensorId,
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

              `${item.sensorId}:` +
              `${item.datetime}`,

              item

            ]
          )

        ).values()

      );


    /*
     * =====================================================
     * FINAL RESPONSE
     * =====================================================
     */

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
     * Save to cache.
     */

    cache = {

      time:
        Date.now(),

      data:
        responseData

    };


    console.log(
      "[OpenAQ] Final HCHO results:",
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
