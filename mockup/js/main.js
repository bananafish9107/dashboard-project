document.addEventListener("DOMContentLoaded", function () {
  // ---------- 1. 右侧列表元素 ----------
  const stationListEl = document.querySelector(".station-list");
  console.log("stationListEl = ", stationListEl);

  // ---------- 2. 地图初始化 ----------
  const mapContainer = document.querySelector(".map");
  mapContainer.id = "map";

  const map = L.map(mapContainer, {
    scrollWheelZoom: true,
  }).setView([40.2, -74.6], 8);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://carto.com/">CARTO</a>, &copy; OpenStreetMap contributors',
  }).addTo(map);

  // ---------- 3. 全局变量：中心点数据和图层 ----------
  let centers = []; // [{ id, name, lat, lng, score }, ...]
  let centersReady = false;

  const centerMarkersLayer = L.layerGroup().addTo(map);
  let highlightLayer = L.layerGroup().addTo(map);
  let userMarker = null;

  // ---------- 4. 从 GeoJSON 加载 NJ_Fishnet_CenterPoints ----------
  fetch("data/NJ_Fishnet_CenterPoints_WGS84.geojson")
    .then((res) => res.json())
    .then((data) => {
      console.log("GeoJSON loaded, feature count:", data.features.length);
      console.log("First feature example:", data.features[0]);

      data.features.forEach((feature, idx) => {
        if (!feature.geometry || feature.geometry.type !== "Point") return;

        const [lng, lat] = feature.geometry.coordinates;
        const props = feature.properties || {};

        const score = Number(props.score);
        // 过滤：只保留 score >= 3 的点
        if (Number.isNaN(score) || score < 3) return;

        const gridId =
          props.grid_id !== undefined && props.grid_id !== null
            ? props.grid_id
            : idx + 1;

        const hasUSA     = props.has_usa === 1 || props.has_usa === "1";
        const hasAsian   = props.has_asian === 1 || props.has_asian === "1";
        const hasMVC     = props.has_mvc === 1 || props.has_mvc === "1";
        const hasPark    = props.has_park === 1 || props.has_park === "1";
        const hasMuseum  = props.has_museum === 1 || props.has_museum === "1";

        const poiFlags = [hasUSA, hasAsian, hasMVC, hasPark, hasMuseum];
        const poiCount = poiFlags.filter(Boolean).length;



        const center = {
          id: gridId,
          name: `Grid cell ${gridId}`,
          lat,
          lng,
          score,

        hasUSA,
        hasAsian,
        hasMVC,
        hasPark,
        hasMuseum,
        poiCount,
        };

        centers.push(center);

        // 点大小按 score 变化
        const radius = 4 + (score - 3) * 3; // 3分→4px，4分→7px，5分→10px

        const marker = L.circleMarker([lat, lng], {
          radius,
          color: "#2A81CB",
          weight: 1,
          fillColor: "#2A81CB",
          fillOpacity: 0.7,
        }).addTo(centerMarkersLayer);

        marker.bindPopup(
          `<strong>${center.name}</strong><br>Score: ${score.toFixed(2)}`
        );
      });

      centersReady = true;
      console.log("Loaded centers:", centers.length);
    })
    .catch((err) => {
      console.error(
        "Error loading NJ_Fishnet_CenterPoints_WGS84.geojson:",
        err
      );
    });

  // ---------- 5. 工具函数：两点距离（km） ----------
  function distanceInKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ---------- 6. 更新右侧列表 ----------
  function updateStationList(userLocation, nearestCenter, topHighScoreCenters) {
  if (!stationListEl || !nearestCenter) return;

  // 小工具：根据距离（英里）估计开车时间（假设 50 mph）
  const driveMinutesFromMiles = (miles) =>
    Math.round((miles / 50) * 60);

  let html = "";

  // ---------- 1. 最近网格中心（Your nearest grid center） ----------
  const nearestDistanceMiNum = nearestCenter.distanceKm * 0.621371;
  const nearestDistanceMi = nearestDistanceMiNum.toFixed(1);
  const nearestDriveMin = driveMinutesFromMiles(nearestDistanceMiNum);

  const nearestPoiCount =
    typeof nearestCenter.poiCount === "number"
      ? nearestCenter.poiCount
      : 0;

  html += `
    <li class="station" aria-expanded="false">
      <header class="name">Your nearest grid center</header>

      <span class="distance">
        ${nearestDistanceMi} mi
      </span>

      <span class="available-bikes">
        Score: ${nearestCenter.score.toFixed(2)}
      </span>

      <span class="available-docks">
        ~${nearestDriveMin} min drive
      </span>

      <span class="next-drop-off-est">
        Nearby high-score centers: ${topHighScoreCenters.length}
      </span>

      <span class="next-pick-up-est">
        Nearby POIs: ${nearestPoiCount}
      </span>
    </li>
  `;

  // ---------- 2. High-score center #1 / #2 / #3 ----------
  topHighScoreCenters.forEach((center, idx) => {
    const distMiNum = center.distanceKm * 0.621371;
    const distMi = distMiNum.toFixed(1);
    const driveMin = driveMinutesFromMiles(distMiNum);

    const poiCount =
      typeof center.poiCount === "number" ? center.poiCount : 0;

    html += `
      <li class="station" aria-expanded="false">
        <header class="name">
          High-score center #${idx + 1}
        </header>

        <span class="distance">
          ${distMi} mi
        </span>

        <span class="available-bikes">
          Score: ${center.score.toFixed(2)}
        </span>

        <span class="available-docks">
          ~${driveMin} min drive
        </span>

        <span class="next-drop-off-est">
          Nearby POIs: ${poiCount}
        </span>

        <span class="next-pick-up-est">
          Click marker on the map to see more
        </span>
      </li>
    `;
  });

  stationListEl.innerHTML = html;
}


  // ---------- 7. 地图点击：高亮最近三个高分点 + 更新右侧 ----------
  map.on("click", (e) => {
    if (!centersReady) {
      console.warn("Centers not loaded yet.");
      return;
    }

    const userLocation = {
      lat: e.latlng.lat,
      lng: e.latlng.lng,
    };

    // 1) 用户点击位置的 marker
    if (userMarker) {
      userMarker.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map);
    }
    userMarker.bindPopup("Your chosen location").openPopup();

    // 2) 只保留 score >= 4 的高分 centerpoints
    const highCenters = centers.filter((c) => c.score >= 4);

    if (highCenters.length === 0) {
      console.warn("No centers with score >= 4");
      return;
    }

    // 3) 计算这些高分点到点击位置的距离，并按距离排序
    const sortedHighCenters = highCenters
      .map((center) => ({
        ...center,
        distanceKm: distanceInKm(
          userLocation.lat,
          userLocation.lng,
          center.lat,
          center.lng
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // 最近的三个高分中心点
    const nearestThreeHighCenters = sortedHighCenters.slice(0, 3);

    // 4) 清空旧高亮
    highlightLayer.clearLayers();

    // 5) 高亮最近的那一个（黄圈 + 红边）
    const primary = nearestThreeHighCenters[0];
    const primaryDistMi = (primary.distanceKm * 0.621371).toFixed(1);

    L.circleMarker([primary.lat, primary.lng], {
      radius: 12,
      weight: 3,
      color: "#ff3300", // 红色边
      fillColor: "#ffe066", // 黄色填充
      fillOpacity: 0.9,
    })
      .addTo(highlightLayer)
      .bindPopup(
        `<strong>Nearest high-score center</strong><br>
         ID: ${primary.id}<br>
         Score: ${primary.score.toFixed(2)}<br>
         Distance: ${primaryDistMi} mi`
      )
      .openPopup();

    // 6) 另外两个高分点（绿色圈）
    nearestThreeHighCenters.slice(1).forEach((center, idx) => {
      const distMi = (center.distanceKm * 0.621371).toFixed(1);

      L.circleMarker([center.lat, center.lng], {
        radius: 9,
        weight: 2,
        color: "#2b8a3e", // 绿色边
        fillColor: "#a1d99b", // 浅绿填充
        fillOpacity: 0.85,
      })
        .addTo(highlightLayer)
        .bindPopup(
          `<strong>High-score center #${idx + 2}</strong><br>
           ID: ${center.id}<br>
           Score: ${center.score.toFixed(2)}<br>
           Distance: ${distMi} mi`
        );
    });

    // 7) 更新右侧 panel，显示这三个高分 center 的信息
    updateStationList(userLocation, primary, nearestThreeHighCenters);
  });
});
