"use strict";


const map =
  L.map("map").setView(
    [48.3794, 31.1656],
    6
  );


L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    maxZoom: 19,
    attribution:
      "&copy; OpenStreetMap contributors"
  }
).addTo(map);


let markers = [];
let currentData = [];


const latInput =
  document.getElementById("lat");

const lonInput =
  document.getElementById("lon");

const radiusInput =
  document.getElementById("radius");

const limitInput =
  document.getElementById("limit");

const showMg =
  document.getElementById("showMg");

const showPercent =
  document.getElementById("showPercent");

const loadBtn =
  document.getElementById("loadBtn");

const refreshBtn =
  document.getElementById("refreshBtn");

const status =
  document.getElementById("status");


/*
 * =========================================================
 * UKRAINE SETTINGS
 * =========================================================
 *
 * These are used instead of whatever coordinates the user
 * enters into the inputs.
 *
 * Ukraine approximate center:
 *
 * Latitude:  48.3794
 * Longitude: 31.1656
 *
 * The actual country filtering should also be done in the
 * Netlify OpenAQ function.
 */


const UKRAINE = {

  latitude: 48.3794,

  longitude: 31.1656,

  /*
   * Large enough to cover Ukraine.
   *
   * OpenAQ function should perform the actual
   * country/boundary filtering.
   */
  radiusKm: 25

};


function setStatus(text) {

  status.textContent = text;

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function clearMarkers() {

  markers.forEach(
    marker =>
      map.removeLayer(marker)
  );

  markers = [];

}


function getColor(
  value,
  limit
) {

  const percent =
    value / limit * 100;


  if (
    percent < 25
  ) {
    return "#27ae60";
  }


  if (
    percent < 50
  ) {
    return "#f1c40f";
  }


  if (
    percent < 100
  ) {
    return "#e67e22";
  }


  return "#c0392b";

}


function addMarker(item) {

  const value =
    Number(
      item.valueMgM3
    );


  const limit =
    Number(
      limitInput.value
    );


  if (
    !Number.isFinite(value) ||
    !Number.isFinite(limit) ||
    limit <= 0
  ) {

    return;

  }


  const latitude =
    Number(
      item.latitude
    );


  const longitude =
    Number(
      item.longitude
    );


  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {

    return;

  }


  const percent =
    value / limit * 100;


  const marker =
    L.circleMarker(
      [
        latitude,
        longitude
      ],
      {

        radius: 10,

        color: "#fff",

        weight: 2,

        fillColor:
          getColor(
            value,
            limit
          ),

        fillOpacity: 0.9

      }
    );


  let html = `

    <div class="popup">

      <div class="popup-title">
        Formaldehyde (HCHO)
      </div>

      <div>
        ${escapeHtml(
          item.location ||
          "Air quality station"
        )}
      </div>

      <div>
        Country:
        Ukraine
      </div>

      <hr>

  `;


  if (
    showMg.checked
  ) {

    html += `

      <div class="popup-value">

        <strong>
          ${value.toFixed(4)}
        </strong>

        mg/m³

      </div>

    `;

  }


  if (
    showPercent.checked
  ) {

    html += `

      <div class="popup-value">

        <strong>
          ${percent.toFixed(1)}%
        </strong>

        of reference

      </div>

    `;

  }


  html += `

      <div class="popup-value">

        Reference:
        ${limit.toFixed(4)}
        mg/m³

      </div>

  `;


  if (
    item.datetime
  ) {

    html += `

      <div class="popup-value">

        Time:
        ${escapeHtml(
          item.datetime
        )}

      </div>

    `;

  }


  html += `

      <div class="popup-source">

        Source:
        ${escapeHtml(
          item.source ||
          "Unknown"
        )}

      </div>

    </div>

  `;


  marker.bindPopup(
    html
  );


  marker.addTo(
    map
  );


  markers.push(
    marker
  );

}


function drawData() {

  clearMarkers();


  currentData.forEach(
    addMarker
  );


  if (
    markers.length
  ) {

    const group =
      L.featureGroup(
        markers
      );


    map.fitBounds(
      group
        .getBounds()
        .pad(0.2)
    );

  } else {

    /*
     * If there are no measurements,
     * keep the map centered on Ukraine.
     */

    map.setView(
      [
        UKRAINE.latitude,
        UKRAINE.longitude
      ],
      6
    );

  }

}


async function loadOpenAQ(
  lat,
  lon,
  radius
) {

  const requestUrl =
    `/api/openaq` +
    `?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}` +
    `&radius=${encodeURIComponent(radius)}`;


  console.log(
    "[OpenAQ] Request:",
    requestUrl
  );


  const response =
    await fetch(
      requestUrl,
      {
        method: "GET",

        headers: {
          "Accept":
            "application/json"
        }
      }
    );


  /*
   * Read text first so that an HTML 404
   * page doesn't cause a JSON parsing error.
   */

  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(text);

  } catch (error) {

    throw new Error(
      `OpenAQ returned non-JSON ` +
      `HTTP ${response.status}: ` +
      text.substring(
        0,
        200
      )
    );

  }


  if (
    !response.ok
  ) {

    throw new Error(
      data.error ||
      `OpenAQ proxy failed ` +
      `(HTTP ${response.status})`
    );

  }


  return (
    data.results ||
    []
  );

}


async function loadExternal(
  lat,
  lon,
  radius
) {

  const requestUrl =
    `/api/external` +
    `?lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}` +
    `&radius=${encodeURIComponent(radius)}`;


  console.log(
    "[External] Request:",
    requestUrl
  );


  const response =
    await fetch(
      requestUrl,
      {
        method: "GET",

        headers: {
          "Accept":
            "application/json"
        }
      }
    );


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(text);

  } catch (error) {

    throw new Error(
      `External API returned ` +
      `non-JSON HTTP ${response.status}: ` +
      text.substring(
        0,
        200
      )
    );

  }


  if (
    !response.ok
  ) {

    throw new Error(
      data.error ||
      `External API failed ` +
      `(HTTP ${response.status})`
    );

  }


  return (

    data.results ||

    data.data ||

    data.measurements ||

    []

  );

}


async function loadData() {

  /*
   * =======================================================
   * ALWAYS USE UKRAINE
   * =======================================================
   *
   * We intentionally don't use the values typed into the
   * latitude/longitude fields.
   */

  const lat =
    UKRAINE.latitude;


  const lon =
    UKRAINE.longitude;


  const radius =
    UKRAINE.radiusKm * 1000;


  /*
   * Keep the existing input fields synchronized
   * with Ukraine.
   */

  if (
    latInput
  ) {

    latInput.value =
      lat;

  }


  if (
    lonInput
  ) {

    lonInput.value =
      lon;

  }


  if (
    radiusInput
  ) {

    radiusInput.value =
      UKRAINE.radiusKm;

  }


  loadBtn.disabled =
    true;


  refreshBtn.disabled =
    true;


  setStatus(
    "Loading Ukraine..."
  );


  try {

    /*
     * Load both APIs at the same time.
     */

    const [
      openAQResult,
      externalResult
    ] =
      await Promise.allSettled([

        loadOpenAQ(
          lat,
          lon,
          radius
        ),

        loadExternal(
          lat,
          lon,
          radius
        )

      ]);


    let openAQ = [];

    let external = [];


    /*
     * OpenAQ
     */

    if (
      openAQResult.status ===
      "fulfilled"
    ) {

      openAQ =
        openAQResult.value;


      console.log(
        "[OpenAQ] Results:",
        openAQ
      );

    } else {

      console.error(
        "[OpenAQ] FAILED:",
        openAQResult.reason
      );

    }


    /*
     * External API
     */

    if (
      externalResult.status ===
      "fulfilled"
    ) {

      external =
        externalResult.value;


      console.log(
        "[External] Results:",
        external
      );

    } else {

      console.error(
        "[External] FAILED:",
        externalResult.reason
      );

    }


    /*
     * =====================================================
     * FINAL UKRAINE FILTER
     * =====================================================
     *
     * The Netlify functions should already filter Ukraine.
     *
     * This additional frontend filter ensures that anything
     * accidentally returned outside Ukraine isn't displayed.
     *
     * This is an approximate bounding box, not an exact
     * international border polygon.
     */

    const ukraineFiltered =
      [
        ...openAQ,
        ...external
      ].filter(
        item => {

          const itemLat =
            Number(
              item.latitude
            );

          const itemLon =
            Number(
              item.longitude
            );


          if (
            !Number.isFinite(
              itemLat
            ) ||
            !Number.isFinite(
              itemLon
            )
          ) {

            return false;

          }


          /*
           * Approximate Ukraine bounding box.
           */

          return (

            itemLat >= 44.2 &&

            itemLat <= 52.4 &&

            itemLon >= 22.1 &&

            itemLon <= 40.3

          );

        }
      );


    currentData =
      ukraineFiltered;


    drawData();


    /*
     * Status
     */

    const openAQStatus =
      openAQResult.status ===
      "fulfilled"

        ? `${openAQ.length}`

        : "FAILED";


    const externalStatus =
      externalResult.status ===
      "fulfilled"

        ? `${external.length}`

        : "FAILED";


    setStatus(

      `Ukraine | ` +

      `OpenAQ: ${openAQStatus} | ` +

      `External: ${externalStatus} | ` +

      `Displayed: ${currentData.length}`

    );


  } catch (error) {

    console.error(
      "[MAIN ERROR]",
      error
    );


    setStatus(
      `Error: ${error.message}`
    );


  } finally {

    loadBtn.disabled =
      false;


    refreshBtn.disabled =
      false;

  }

}


if (
  loadBtn
) {

  loadBtn.addEventListener(
    "click",
    loadData
  );

}


if (
  refreshBtn
) {

  refreshBtn.addEventListener(
    "click",
    loadData
  );

}


if (
  showMg
) {

  showMg.addEventListener(
    "change",
    drawData
  );

}


if (
  showPercent
) {

  showPercent.addEventListener(
    "change",
    drawData
  );

}


if (
  limitInput
) {

  limitInput.addEventListener(
    "change",
    drawData
  );

}


/*
 * Initial load.
 */

loadData();
