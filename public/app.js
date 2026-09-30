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


function setStatus(text) {
  status.textContent = text;
}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function clearMarkers() {

  markers.forEach(
    marker => map.removeLayer(marker)
  );

  markers = [];
}


function getColor(value, limit) {

  const percent =
    value / limit * 100;

  if (percent < 25)
    return "#27ae60";

  if (percent < 50)
    return "#f1c40f";

  if (percent < 100)
    return "#e67e22";

  return "#c0392b";
}


function addMarker(item) {

  const value =
    Number(item.valueMgM3);

  const limit =
    Number(limitInput.value);

  if (
    !Number.isFinite(value) ||
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    return;
  }

  const percent =
    value / limit * 100;

  const marker =
    L.circleMarker(
      [
        Number(item.latitude),
        Number(item.longitude)
      ],
      {
        radius: 10,
        color: "#fff",
        weight: 2,
        fillColor:
          getColor(value, limit),
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

      <hr>
  `;


  if (showMg.checked) {

    html += `
      <div class="popup-value">
        <strong>
          ${value.toFixed(4)}
        </strong>
        mg/m³
      </div>
    `;
  }


  if (showPercent.checked) {

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


  if (item.datetime) {

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
          item.source
        )}
      </div>

    </div>
  `;


  marker.bindPopup(html);

  marker.addTo(map);

  markers.push(marker);
}


function drawData() {

  clearMarkers();

  currentData.forEach(
    addMarker
  );


  if (markers.length) {

    const group =
      L.featureGroup(markers);

    map.fitBounds(
      group.getBounds().pad(0.2)
    );
  }
}


async function loadOpenAQ(
  lat,
  lon,
  radius
) {

  const response =
    await fetch(
      `/api/openaq?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&radius=${encodeURIComponent(radius)}`
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data.error ||
      "OpenAQ proxy failed"
    );
  }


  return data.results || [];
}


async function loadExternal(
  lat,
  lon,
  radius
) {

  const response =
    await fetch(
      `/api/external?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&radius=${encodeURIComponent(radius)}`
    );


  const data =
    await response.json();


  if (!response.ok) {

    throw new Error(
      data.error ||
      "External API failed"
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

  const lat =
    Number(latInput.value);

  const lon =
    Number(lonInput.value);

  const radiusKm =
    Number(radiusInput.value);


  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isFinite(radiusKm)
  ) {

    setStatus(
      "Invalid coordinates."
    );

    return;
  }


  const radius =
    Math.min(
      Math.max(
        radiusKm * 1000,
        1
      ),
      25000
    );


  loadBtn.disabled = true;
  refreshBtn.disabled = true;


  setStatus("Loading...");


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


  if (
    openAQResult.status ===
    "fulfilled"
  ) {

    openAQ =
      openAQResult.value;

  } else {

    console.error(
      "OpenAQ:",
      openAQResult.reason
    );
  }


  if (
    externalResult.status ===
    "fulfilled"
  ) {

    external =
      externalResult.value;

  } else {

    console.error(
      "External:",
      externalResult.reason
    );
  }


  currentData = [
    ...openAQ,
    ...external
  ];


  drawData();


  setStatus(
    `OpenAQ: ${
      openAQResult.status ===
      "fulfilled"
        ? openAQ.length
        : "FAILED"
    } | External: ${
      externalResult.status ===
      "fulfilled"
        ? external.length
        : "FAILED"
    }`
  );


  loadBtn.disabled = false;
  refreshBtn.disabled = false;
}


loadBtn.addEventListener(
  "click",
  loadData
);


refreshBtn.addEventListener(
  "click",
  loadData
);


showMg.addEventListener(
  "change",
  drawData
);


showPercent.addEventListener(
  "change",
  drawData
);


limitInput.addEventListener(
  "change",
  drawData
);


loadData();
