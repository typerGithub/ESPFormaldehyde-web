export default async (req) => {
  try {
    const url = new URL(req.url);

    const apiKey =
      Netlify.env.get("OPENAQ_API_KEY");

    if (!apiKey) {
      return Response.json(
        {
          error:
            "OPENAQ_API_KEY is not configured"
        },
        { status: 500 }
      );
    }

    /*
     * Ukraine approximate bounding box.
     *
     * south / west / north / east
     */
    const UKRAINE_BBOX = {
      south: 44.2,
      west: 22.1,
      north: 52.4,
      east: 40.3
    };

    const headers = {
      "X-API-Key": apiKey,
      "Accept": "application/json"
    };

    /*
     * Ask OpenAQ for locations in Ukraine's
     * approximate bounding box.
     */
    const locationsUrl =
      "https://api.openaq.org/v3/locations" +
      "?bbox=" +
      [
        UKRAINE_BBOX.west,
        UKRAINE_BBOX.south,
        UKRAINE_BBOX.east,
        UKRAINE_BBOX.north
      ].join(",") +
      "&limit=100";


    console.log(
      "OpenAQ URL:",
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


    if (!locationsResponse.ok) {

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
      locationsData.results || [];


    /*
     * Safety filter:
     * only retain coordinates inside the
     * Ukraine bounding box.
     */
    const ukrainianLocations =
      locations.filter(
        location => {

          const coordinates =
            location.coordinates;

          if (!coordinates) {
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
            lat >= UKRAINE_BBOX.south &&
            lat <= UKRAINE_BBOX.north &&
            lon >= UKRAINE_BBOX.west &&
            lon <= UKRAINE_BBOX.east
          );
        }
      );


    console.log(
      "Ukraine locations:",
      ukrainianLocations.length
    );


    const results = [];


    /*
     * Get latest data for each Ukrainian station.
     */
    for (
      const location
      of ukrainianLocations
    ) {

      try {

        /*
         * Sensor information.
         */
        const sensorsResponse =
          await fetch(
            `https://api.openaq.org/v3/locations/${location.id}/sensors?limit=100`,
            {
              headers
            }
          );


        let sensors = [];


        if (
          sensorsResponse.ok
        ) {

          const sensorsData =
            await sensorsResponse.json();

          sensors =
            sensorsData.results || [];
        }


        const sensorMap =
          new Map();


        for (
          const sensor
          of sensors
        ) {

          sensorMap.set(
            String(sensor.id),
            sensor
          );
        }


        /*
         * Latest measurements.
         */
        const latestResponse =
          await fetch(
            `https://api.openaq.org/v3/locations/${location.id}/latest?limit=100`,
            {
              headers
            }
          );


        if (
          !latestResponse.ok
        ) {
          continue;
        }


        const latestData =
          await latestResponse.json();


        const latest =
          latestData.results || [];


        for (
          const measurement
          of latest
        ) {

          const sensor =
            sensorMap.get(
              String(
                measurement.sensorsId
              )
            );


          const metadata =
            JSON.stringify({
              measurement,
              sensor
            }).toLowerCase();


          /*
           * HCHO / formaldehyde only.
           */
          if (
            !metadata.includes(
              "formaldehyde"
            ) &&
            !metadata.includes(
              "hcho"
            )
          ) {
            continue;
          }


          const value =
            Number(
              measurement.value
            );


          const coordinates =
            measurement.coordinates ||
            location.coordinates;


          if (
            !coordinates ||
            !Number.isFinite(value)
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


          /*
           * Final Ukraine safety check.
           */
          if (
            latitude <
              UKRAINE_BBOX.south ||
            latitude >
              UKRAINE_BBOX.north ||
            longitude <
              UKRAINE_BBOX.west ||
            longitude >
              UKRAINE_BBOX.east
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

            sensorId:
              measurement.sensorsId,

            parameter:
              sensor?.parameter?.name ||
              "HCHO",

            datetime:
              measurement.datetime?.utc ||
              measurement.datetime?.local ||
              null
          });
        }

      } catch (error) {

        console.error(
          "Station failed:",
          location.id,
          error
        );
      }
    }


    return Response.json({

      country:
        "Ukraine",

      source:
        "OpenAQ",

      count:
        results.length,

      results

    });

  } catch (error) {

    console.error(
      "Ukraine OpenAQ error:",
      error
    );


    return Response.json(
      {
        error:
          error.message
      },
      {
        status: 500
      }
    );
  }
};
