"use strict";


export default async (req) => {

  try {

    /*
     * =====================================================
     * OPENAQ API KEY
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
     * UKRAINE
     * =====================================================
     *
     * Approximate bounding box:
     *
     * West:   22.1
     * South:  44.2
     * East:   40.3
     * North:  52.4
     *
     * This prevents us from requesting a giant
     * 700 km radius around the center of Ukraine.
     */

    const west = 22.1;
    const south = 44.2;
    const east = 40.3;
    const north = 52.4;


    /*
     * =====================================================
     * OPENAQ HEADERS
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
     * GET LOCATIONS
     * =====================================================
     */

    const locationsUrl =
      "https://api.openaq.org/v3/locations" +
      `?bbox=${west},${south},${east},${north}` +
      "&limit=100";


    console.log(
      "[OpenAQ] Request:",
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


    /*
     * =====================================================
     * HANDLE OPENAQ ERRORS
     * =====================================================
     */

    if (
      !locationsResponse.ok
    ) {

      console.error(
        "[OpenAQ] HTTP error:",
        locationsResponse.status,
        locationsText
      );


      if (
        locationsResponse.status === 429
      ) {

        return Response.json(
          {
            error:
              "OpenAQ rate limit exceeded. Please wait and try again.",

            status:
              429,

            details:
              locationsText
          },
          {
            status: 429
          }
        );

      }


      if (
        locationsResponse.status === 401
      ) {

        return Response.json(
          {
            error:
              "OpenAQ API key was rejected.",

            status:
              401,

            details:
              locationsText
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


    /*
     * =====================================================
     * PARSE LOCATIONS
     * =====================================================
     */

    let locationsData;


    try {

      locationsData =
        JSON.parse(
          locationsText
        );

    } catch (error) {

      console.error(
        "[OpenAQ] Invalid JSON:",
        locationsText
      );


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
      "[OpenAQ] Locations found:",
      locations.length
    );


    /*
     * =====================================================
     * FILTER UKRAINE LOCATIONS
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

            return false;

          }


          return (

            latitude >= south &&

            latitude <= north &&

            longitude >= west &&

            longitude <= east

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
     */

    for (
      const location
      of ukrainianLocations
    ) {

      try {

        /*
         * -----------------------------------------------
         * Get sensors
         * -----------------------------------------------
         */

        const sensorsUrl =
          `https://api.openaq.org/v3/locations/${location.id}/sensors?limit=100`;


        const sensorsResponse =
          await fetch(
            sensorsUrl,
            {
              method: "GET",
              headers
            }
          );


        let sensors = [];


        if (
          sensorsResponse.ok
        ) {

          const sensorsText =
            await sensorsResponse.text();


          try {

            const sensorsData =
              JSON.parse(
                sensorsText
              );


            sensors =
              sensorsData.results ||
              [];

          } catch (error) {

            console.warn(
              "[OpenAQ] Invalid sensors JSON:",
              location.id
            );

          }

        }


        /*
         * Map sensors by ID.
         */

        const sensorMap =
          new Map();


        for (
          const sensor
          of sensors
        ) {

          sensorMap.set(
            String(
              sensor.id
            ),
            sensor
          );

        }


        /*
         * -----------------------------------------------
         * Get latest measurements
         * -----------------------------------------------
         */

        const latestUrl =
          `https://api.openaq.org/v3/locations/${location.id}/latest?limit=100`;


        const latestResponse =
          await fetch(
            latestUrl,
            {
              method: "GET",
              headers
            }
          );


        /*
         * If this particular station fails,
         * continue with the next station.
         */

        if (
          !latestResponse.ok
        ) {

          console.warn(
            "[OpenAQ] Latest failed:",
            location.id,
            latestResponse.status
          );


          continue;

        }


        const latestText =
          await latestResponse.text();


        let latestData;


        try {

          latestData =
            JSON.parse(
              latestText
            );

        } catch (error) {

          console.warn(
            "[OpenAQ] Invalid latest JSON:",
            location.id
          );


          continue;

        }


        const measurements =
          latestData.results ||
          [];


        /*
         * -----------------------------------------------
         * Process measurements
         * -----------------------------------------------
         */

        for (
          const measurement
          of measurements
        ) {

          /*
           * Find matching sensor.
           */

          const sensor =
            sensorMap.get(
              String(
                measurement.sensorsId
              )
            );


          /*
           * Try to identify formaldehyde.
           */

          const parameter =
            measurement.parameter ||
            sensor?.parameter ||
            {};


          const parameterName =
            String(
              parameter.name ||
              parameter.displayName ||
              sensor?.name ||
              measurement.parameterName ||
              ""
            ).toLowerCase();


          const parameterDisplay =
            String(
              parameter.displayName ||
              ""
            ).toLowerCase();


          const sensorText =
            JSON.stringify(
              sensor || {}
            ).toLowerCase();


          const isFormaldehyde =
            parameterName.includes(
              "formaldehyde"
            ) ||

            parameterName ===
              "hcho" ||

            parameterName.includes(
              "hcho"
            ) ||

            parameterDisplay.includes(
              "formaldehyde"
            ) ||

            parameterDisplay.includes(
              "hcho"
            ) ||

            sensorText.includes(
              "formaldehyde"
            ) ||

            sensorText.includes(
              "hcho"
            );


          if (
            !isFormaldehyde
          ) {

            continue;

          }


          /*
           * ---------------------------------------------
           * Measurement value
           * ---------------------------------------------
           */

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


          /*
           * ---------------------------------------------
           * Coordinates
           * ---------------------------------------------
           */

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
           * ---------------------------------------------
           * FINAL UKRAINE FILTER
           * ---------------------------------------------
           */

          if (
            latitude < south ||
            latitude > north ||
            longitude < west ||
            longitude > east
          ) {

            continue;

          }


          /*
           * ---------------------------------------------
           * Add result
           * ---------------------------------------------
           *
           * This format is intentionally the same as
           * the format expected by your app.js.
           */

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

            latitude:
              latitude,

            longitude:
              longitude,

            valueMgM3:
              value,

            sensorId:
              measurement.sensorsId,

            parameter:
              parameter.name ||
              parameter.displayName ||
              "HCHO",

            datetime:
              measurement.datetime?.utc ||
              measurement.datetime?.local ||
              null

          });

        }


      } catch (error) {

        /*
         * Don't let one broken station stop the
         * entire Ukraine request.
         */

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
              `${item.sensorId}:` +
              `${item.datetime}`,

              item

            ]
          )

        ).values()

      );


    console.log(
      "[OpenAQ] HCHO results:",
      uniqueResults.length
    );


    /*
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return Response.json({

  source:
    "OpenAQ",

  country:
    "Ukraine",

  count:
    uniqueResults.length,

  results:
    uniqueResults,

  debug: {

    locationsFound:
      locations.length,

    ukrainianLocations:
      ukrainianLocations.length,

    hchoResults:
      uniqueResults.length

  }

});


  } catch (error) {

    console.error(
      "[OpenAQ] MAIN ERROR:",
      error
    );


    return Response.json(
      {
        error:
          error.message ||
          "Unknown OpenAQ error"
      },
      {
        status: 500
      }
    );

  }

};
