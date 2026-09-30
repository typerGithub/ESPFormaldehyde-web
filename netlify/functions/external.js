export default async (req) => {

  try {

    const url =
      new URL(req.url);


    const lat =
      url.searchParams.get("lat");

    const lon =
      url.searchParams.get("lon");

    const radius =
      url.searchParams.get(
        "radius"
      ) || "10000";


    const apiKey =
      Netlify.env.get(
        "EXTERNAL_API_KEY"
      );


    if (!apiKey) {

      return Response.json(
        {
          error:
            "EXTERNAL_API_KEY is not configured"
        },
        {
          status: 500
        }
      );
    }


    /*
     * CHANGE THIS TO YOUR EXTERNAL API.
     */
    const externalUrl =
      "https://YOUR-EXTERNAL-API.example.com/formaldehyde" +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&radius=${encodeURIComponent(radius)}`;


    const response =
      await fetch(
        externalUrl,
        {
          headers: {

            "X-API-Key":
              apiKey,

            "Accept":
              "application/json"
          }
        }
      );


    const text =
      await response.text();


    if (!response.ok) {

      return Response.json(
        {
          error:
            "External API request failed",

          status:
            response.status,

          details:
            text
        },
        {
          status:
            response.status
        }
      );
    }


    return new Response(
      text,
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/json"
        }
      }
    );


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
