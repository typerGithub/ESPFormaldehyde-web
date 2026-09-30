export default async (req) => {

  try {

    const url =
      new URL(req.url);

    const lat =
      Number(
        url.searchParams.get("lat")
      );

    const lon =
      Number(
        url.searchParams.get("lon")
      );

    const radius =
      Math.min(
        Math.max(
          Number(
            url.searchParams.get(
              "radius"
            ) || 10000
          ),
          1
        ),
        25000
      );


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {

      return Response.json(
        {
          error:
            "Invalid coordinates"
        },
        {
          status: 400
        }
      );
    }


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


    const locationsUrl =
      "https://api.openaq.org/v3/locations" +
      `?coordinates=${lat},${lon}` +
      `&radius=${radius}` +
      "&limit=100";


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
            "OpenAQ request failed",

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


    const results = [];


    for (
      const location
      of locations
    ) {

      try {

        const sensorsResponse =
          await fetch(
            `https://api.openaq.org/v3/locations/${location.id}/sensors?limit=100`,
            {
              headers
            }
          );


        const sensorsData =
          sensorsResponse.ok
            ? await sensorsResponse.json()
            : {
                results: []
              };


        const sensors =
          sensorsData.results || [];


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


        for (
          const measurement
          of latestData.results || []
        ) {

          const sensor =
            sensorMap.get(
              String(
                measurement.sensorsId
              )
            );


          const text =
            JSON.stringify({
              measurement,
              sensor
            }).toLowerCase();


          if (
            !text.includes(
              "formaldehyde"
            ) &&
            !text.includes(
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
            !Number.isFinite(value) ||
            !coordinates
          ) {
            continue;
          }


          results.push({

            source:
              "OpenAQ",

            location:
              location.name ||
              "OpenAQ station",

            locationId:
              location.id,

            latitude:
              Number(
                coordinates.latitude
              ),

            longitude:
              Number(
                coordinates.longitude
              ),

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
          "Station error:",
          location.id,
          error
        );
      }
    }


    return Response.json({

      source:
        "OpenAQ",

      count:
        results.length,

      results

    });


  } catch (error) {

    console.error(
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
