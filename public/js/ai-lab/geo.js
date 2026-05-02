(function (global) {
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (v) => v * Math.PI / 180;
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calculateBearing(startLat, startLng, destLat, destLng) {
    const toRad = (v) => v * Math.PI / 180;
    const toDeg = (v) => v * 180 / Math.PI;
    const y = Math.sin(toRad(destLng - startLng)) * Math.cos(toRad(destLat));
    const x = Math.cos(toRad(startLat)) * Math.sin(toRad(destLat))
      - Math.sin(toRad(startLat)) * Math.cos(toRad(destLat)) * Math.cos(toRad(destLng - startLng));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  global.AiLabGeo = {
    haversineDistance,
    calculateBearing
  };
})(window);
