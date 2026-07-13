/**
 * BranchFinderWidget — справочник отделений + Яндекс.Карты.
 */
(function () {
  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  /** Сообщение при запросе адреса вне г. Москвы (саджест / геокод). */
  const MSG_ADDRESS_MOSCOW_ONLY = 'Введите адрес в пределах г. Москвы';

  /**
   * iPhone / iPad (вкл. iPadOS «как Mac»): отдельная сборка исходящей ссылки на Яндекс.Карты —
   * только HTTPS с маркером (см. buildYandexMapsOutboundUrl). Схема yandexmaps:// на части сборок
   * не отображает `pt`; Universal Link по yandex.ru/maps стабильнее открывает приложение с меткой.
   */
  function preferYandexMapsNativeUrlScheme() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true;
    return false;
  }

  /**
   * @param {{ lat: number, lon: number, text?: string, zoom?: number, orgUrl?: string }} opts
   */
  function buildYandexMapsPinUrl(opts = {}) {
    const org = String(opts.orgUrl || '').trim();
    if (org && /^https?:\/\/(yandex\.ru|yandex\.com)\/maps\//i.test(org)) {
      return org;
    }
    const la = Number(opts.lat);
    const lo = Number(opts.lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';
    const zClamped = Math.max(1, Math.min(18, Math.round(Number(opts.zoom) || 16)));
    const q = String(opts.text || '').trim();
    const pt = `${lo},${la},pm2rdm`;
    if (preferYandexMapsNativeUrlScheme()) {
      const p = new URLSearchParams();
      p.set('pt', pt);
      p.set('ll', `${lo},${la}`);
      p.set('z', String(zClamped));
      p.set('l', 'map');
      return `https://yandex.ru/maps/?${p.toString()}`;
    }
    const params = new URLSearchParams();
    params.set('ll', `${lo},${la}`);
    params.set('pt', pt);
    params.set('z', String(zClamped));
    params.set('l', 'map');
    if (q) params.set('text', q);
    return `https://yandex.ru/maps/?${params.toString()}`;
  }

  /** @param {Record<string, unknown>} base */
  function yandexOrgUrlFromRaw(base) {
    if (!base || typeof base !== 'object') return '';
    const keys = ['yandexOrgUrl', 'mapsOrgUrl', 'yandexMapsOrg', 'orgUrl'];
    for (const k of keys) {
      const v = base[k];
      const s = v != null ? String(v).trim() : '';
      if (s && /^https?:\/\/(yandex\.ru|yandex\.com)\/maps\//i.test(s)) return s;
    }
    return '';
  }

  /**
   * Исходящая ссылка для отделения: карточка организации в Картах или pt+text по координатам.
   * @param {{ yandexOrgUrl?: string, coords?: [number, number], name?: string, address?: string }} o
   */
  function officeToYandexOutboundUrl(o, zoom = 16) {
    if (!o) return '';
    const org = o.yandexOrgUrl && String(o.yandexOrgUrl).trim();
    if (org && /^https?:\/\/(yandex\.ru|yandex\.com)\/maps\//i.test(org)) return org;
    if (!Array.isArray(o.coords) || o.coords.length !== 2) return '';
    const lat = Number(o.coords[0]);
    const lon = Number(o.coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    const text = [o.name, o.address].filter(Boolean).join(', ').trim();
    return buildYandexMapsPinUrl({ lat, lon, text, zoom: Number(zoom) || 16 });
  }

  function yandexOutboundLinkAnchor(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    return `<br/><a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" data-branch-finder-outbound="1">Открыть в Яндекс.Картах</a>`;
  }

  /**
   * Bbox г. Москвы (вкл. ТиНАО/зону в API): левый нижний ~ правый верхний угол для Geosuggest strict_bounds.
   * Формат Yandex: lon_min,lat_min~lon_max,lat_max
   */
  const MOSCOW_SUGGEST_BBOX = '36.803,55.142~37.967,56.021';

  function getSuggestBboxString(mapConfig) {
    if (mapConfig && mapConfig.suggestBbox) return String(mapConfig.suggestBbox);
    return MOSCOW_SUGGEST_BBOX;
  }

  /** @returns {{ minLon: number, minLat: number, maxLon: number, maxLat: number } | null} */
  function parseSuggestBbox(bboxStr) {
    const m = String(bboxStr || '').trim().match(/^([\d.+-]+),([\d.+-]+)~([\d.+-]+),([\d.+-]+)$/);
    if (!m) return null;
    return {
      minLon: Number(m[1]),
      minLat: Number(m[2]),
      maxLon: Number(m[3]),
      maxLat: Number(m[4])
    };
  }

  /** @param {[number, number]} coords Яндекс: [lat, lon] */
  function coordsInsideSuggestBbox(coords, bboxStr) {
    const b = parseSuggestBbox(bboxStr);
    if (!b || !coords || coords.length < 2) return false;
    const lat = Number(coords[0]);
    const lon = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
  }

  /** Слияние пересекающихся интервалов подсветки (UTF-16 индексы, как в Geosuggest API). */
  function mergeHlRanges(ranges) {
    const arr = Array.isArray(ranges) ? ranges : [];
    const norm = arr
      .map((h) => ({
        begin: Math.max(0, Math.floor(Number(h && h.begin))),
        end: Math.max(0, Math.floor(Number(h && h.end)))
      }))
      .filter((h) => h.end > h.begin)
      .sort((a, b) => a.begin - b.begin);
    if (!norm.length) return [];
    const out = [norm[0]];
    for (let i = 1; i < norm.length; i++) {
      const cur = norm[i];
      const last = out[out.length - 1];
      if (cur.begin <= last.end) last.end = Math.max(last.end, cur.end);
      else out.push({ ...cur });
    }
    return out;
  }

  /** Безопасная HTML-строка с <mark> по hl из ответа Geosuggest. */
  function applyHighlightsToText(text, hl) {
    const t = String(text || '');
    const ranges = mergeHlRanges(hl);
    if (!ranges.length) return escapeHtml(t);
    let html = '';
    let pos = 0;
    for (const r of ranges) {
      const b = Math.min(r.begin, t.length);
      const e = Math.min(r.end, t.length);
      if (pos < b) html += escapeHtml(t.slice(pos, b));
      if (e > b) html += `<mark class="branch-finder__suggest-hl">${escapeHtml(t.slice(b, e))}</mark>`;
      pos = Math.max(pos, e);
    }
    if (pos < t.length) html += escapeHtml(t.slice(pos));
    return html;
  }

  /** Зум по дистанции «пользователь — отделение» (комфортный обзор, отделение в центре кадра). */
  function zoomFromDistanceMeters(meters) {
    if (!Number.isFinite(meters)) return 15;
    if (meters < 350) return 17;
    if (meters < 900) return 16;
    if (meters < 2200) return 15;
    if (meters < 7000) return 14;
    if (meters < 18000) return 13;
    return 12;
  }

  /** Центр карты на отметке отделения (не setBounds по всем точкам — отделение не уезжает к краю). */
  function setMapCenterOnPrimaryOffice(map, primaryCoords, distanceMeters) {
    if (!map || !primaryCoords || primaryCoords.length < 2) return;
    const z = zoomFromDistanceMeters(distanceMeters);
    const anim = mapPanZoomOptions();
    try {
      map.setCenter(primaryCoords, z, anim);
    } catch (_) {
      try {
        map.setCenter(primaryCoords, z);
      } catch (_) {}
    }
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '';
    if (meters < 1000) return `${Math.round(meters)} м`;
    const km = meters / 1000;
    return `${km.toFixed(km < 10 ? 2 : 1)} км`;
  }

  function loadYMaps({ apiKey, lang = 'ru_RU', load = 'package.full' } = {}) {
    if (window.ymaps && typeof window.ymaps.ready === 'function') {
      // ymaps can exist before modules are fully ready; always wait for ready().
      return new Promise((resolve) => window.ymaps.ready(() => resolve(window.ymaps)));
    }

    if (!apiKey) {
      return Promise.reject(
        new Error('Яндекс.Карты не подключены, передайте apiKey в init({ map: { apiKey } }) или подключите ymaps на странице')
      );
    }

    // Cache by the actual URL params; different `load` implies different modules availability (e.g., SuggestView).
    const cacheKey = `${String(apiKey)}|${String(lang)}|${String(load)}`;
    loadYMaps._promises = loadYMaps._promises || {};
    if (loadYMaps._promises[cacheKey]) return loadYMaps._promises[cacheKey];

    loadYMaps._promises[cacheKey] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=${encodeURIComponent(
        lang
      )}&load=${encodeURIComponent(load)}`;
      s.async = true;
      s.onload = () => {
        if (!window.ymaps || typeof window.ymaps.ready !== 'function') {
          reject(new Error('Не удалось инициализировать Яндекс.Карты'));
          return;
        }
        window.ymaps.ready(() => resolve(window.ymaps));
      };
      s.onerror = () => reject(new Error('Не удалось загрузить Яндекс.Карты'));
      document.head.appendChild(s);
    });

    return loadYMaps._promises[cacheKey];
  }

  /** Административный округ (название содержит «… административный округ»). */
  function isAdministrativeOkrugLabel(name) {
    return /административный\s+округ/i.test(String(name || ''));
  }

  /**
   */
  function extractAdministrativeOkrugNameFromGeoObject(geoObject) {
    if (!geoObject) return '';
    try {
      if (typeof geoObject.getAdministrativeAreas === 'function') {
        const areas = geoObject.getAdministrativeAreas();
        if (Array.isArray(areas) && areas.length) {
          const preferred = areas.find((a) => /административн/i.test(String(a || '')) && /округ/i.test(String(a || '')));
          if (preferred) return String(preferred).trim();
        }
      }
    } catch (_) {}

    try {
      const meta = geoObject.properties && geoObject.properties.get && geoObject.properties.get('metaDataProperty');
      const comps =
        meta &&
        meta.GeocoderMetaData &&
        meta.GeocoderMetaData.Address &&
        Array.isArray(meta.GeocoderMetaData.Address.Components)
          ? meta.GeocoderMetaData.Address.Components
          : null;
      if (comps) {
        const districts = comps.filter((c) => c && (c.kind === 'district' || c.kind === 'area'));
        const admin = districts.find((c) => c && c.name && isAdministrativeOkrugLabel(c.name));
        if (admin && admin.name) return String(admin.name).trim();
      }
    } catch (_) {}

    return '';
  }

  /** Любой district/area (fallback для регионов без «административный округ» в строке). */
  function extractOkrugFromGeoObject(geoObject) {
    if (!geoObject) return '';
    try {
      if (typeof geoObject.getAdministrativeAreas === 'function') {
        const areas = geoObject.getAdministrativeAreas();
        if (Array.isArray(areas) && areas.length) {
          const preferred = areas.find((a) => /административн/i.test(String(a || '')) && /округ/i.test(String(a || '')));
          if (preferred) return String(preferred).trim();
        }
      }
    } catch (_) {}

    try {
      const meta = geoObject.properties && geoObject.properties.get && geoObject.properties.get('metaDataProperty');
      const comps =
        meta &&
        meta.GeocoderMetaData &&
        meta.GeocoderMetaData.Address &&
        Array.isArray(meta.GeocoderMetaData.Address.Components)
          ? meta.GeocoderMetaData.Address.Components
          : null;
      if (comps) {
        const district = comps.find((c) => c && (c.kind === 'district' || c.kind === 'area')) || null;
        if (district && district.name) return String(district.name).trim();
      }
    } catch (_) {}

    return '';
  }

  function firstNonEmptyFromGeoCollection(collection, extractFn) {
    const g = collection && collection.geoObjects ? collection.geoObjects : null;
    if (!g || typeof g.getLength !== 'function') return '';
    const n = g.getLength();
    for (let i = 0; i < n; i++) {
      const v = extractFn(g.get(i));
      if (String(v || '').trim()) return v;
    }
    return '';
  }

  function getGeocoderAddressComponents(geoObject) {
    try {
      const meta =
        geoObject && geoObject.properties && geoObject.properties.get
          ? geoObject.properties.get('metaDataProperty')
          : null;
      const comps =
        meta &&
        meta.GeocoderMetaData &&
        meta.GeocoderMetaData.Address &&
        Array.isArray(meta.GeocoderMetaData.Address.Components)
          ? meta.GeocoderMetaData.Address.Components
          : null;
      return comps;
    } catch (_) {
      return null;
    }
  }

  /**
   */
  function geocoderResultHasStreetOrHouseLevel(geoObject) {
    const comps = getGeocoderAddressComponents(geoObject);
    if (comps && comps.some((c) => c && (c.kind === 'street' || c.kind === 'house'))) return true;
    try {
      const meta =
        geoObject && geoObject.properties && geoObject.properties.get
          ? geoObject.properties.get('metaDataProperty')
          : null;
      const k = meta && meta.GeocoderMetaData && meta.GeocoderMetaData.kind ? String(meta.GeocoderMetaData.kind) : '';
      return k === 'street' || k === 'house';
    } catch (_) {
      return false;
    }
  }

  /** Пользователь явно указывает улицу/микрорайон или дом — ждём не «только Москва». */
  function queryLooksLikeStreetLevelRequest(query) {
    const q = String(query || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!q) return false;
    return (
      /\bул\.?\b/.test(q) ||
      q.includes('улица') ||
      q.includes('проспект') ||
      q.includes('просп.') ||
      q.includes('переулок') ||
      /\bпер\.?\b/.test(q) ||
      q.includes('шоссе') ||
      q.includes('наб.') ||
      q.includes('набережн') ||
      q.includes('бульвар') ||
      /\bб-р\b/.test(q) ||
      q.includes('проезд') ||
      q.includes('площадь') ||
      /\bпл\.?\b/.test(q) ||
      q.includes('аллея') ||
      q.includes('микрорайон') ||
      /\bмкр\.?\b/.test(q) ||
      /\bд\.?\s*\d/.test(q) ||
      /\bдом\s*\d/.test(q)
    );
  }

  /**
   * г. Москва (вкл. ТиНАО / Новомосковск и т.д.): не Московская область за МКАД.
   */
  function geoObjectLooksLikeMoscowCity(geoObject) {
    const comps = getGeocoderAddressComponents(geoObject);
    if (comps) {
      for (const c of comps) {
        if (!c || !c.name) continue;
        const k = String(c.kind || '');
        const n = normalizeArea(String(c.name));
        if (k === 'locality' && (n === 'москва' || n.startsWith('москва '))) return true;
        if (k === 'province' && n === 'москва') return true;
      }
    }
    try {
      const line = geoObject && typeof geoObject.getAddressLine === 'function' ? geoObject.getAddressLine() : '';
      const s = normalizeArea(String(line || ''));
      if ((s.includes('москва') || s.includes(', москва,')) && !s.includes('московская область') && !s.includes('московская обл'))
        return true;
    } catch (_) {}
    return false;
  }

  function geoObjectLooksLikeMoscowOblastNotCity(geoObject) {
    const comps = getGeocoderAddressComponents(geoObject);
    if (comps) {
      for (const c of comps) {
        if (!c || !c.name) continue;
        const n = normalizeArea(String(c.name));
        if (n.includes('московская область') || n.includes('московская обл')) return true;
      }
    }
    try {
      const line = geoObject && typeof geoObject.getAddressLine === 'function' ? geoObject.getAddressLine() : '';
      const s = normalizeArea(String(line || ''));
      if (s.includes('московская область') || s.includes('московская обл')) return true;
    } catch (_) {}
    return false;
  }

  /** Режим «только Москва»: адрес в МО, но не в г. Москве — отклонить. */
  function isAddressOutsideMoscowCity(geoObject) {
    if (!geoObject) return false;
    if (geoObjectLooksLikeMoscowCity(geoObject)) return false;
    return geoObjectLooksLikeMoscowOblastNotCity(geoObject);
  }

  /**
   * Саджест под strict_bounds всё равно возвращает населённые пункты МО.
   * Скрываем пункты с явной «Московской обл.», если это не выглядит как г. Москва / ТиНАО / ЗелАО.
   */
  function shouldRejectMoscowOblastSuggestValue(rawValue) {
    const s = normalizeArea(String(rawValue || ''));
    const mentionsMo = s.includes('московская область') || s.includes('московская обл');
    if (!mentionsMo) return false;
    const moscowCityLine =
      (s.includes('москва') || s.includes(', москва,')) && !s.includes('московская область') && !s.includes('московская обл');
    if (moscowCityLine) return false;
    if (s.includes('ти нао') || s.includes('ти-нао')) return false;
    if (s.includes('троицкий административный округ') || s.includes('новомосковский административный округ')) return false;
    if (s.includes('зеленоград')) return false;
    if (s.includes('щербинка') || s.includes('мосрентген')) return false;
    return true;
  }

  async function resolveUserArea(ymaps, firstGeoObject, userCoords) {
    const directAdmin = extractAdministrativeOkrugNameFromGeoObject(firstGeoObject);
    if (String(directAdmin || '').trim()) return directAdmin;

    let byDistrict = null;
    try {
      byDistrict = await ymaps.geocode(userCoords, { kind: 'district', results: 10 });
    } catch (_) {}

    const reverseAdmin = firstNonEmptyFromGeoCollection(byDistrict, extractAdministrativeOkrugNameFromGeoObject);
    if (String(reverseAdmin || '').trim()) return reverseAdmin;

    const directLegacy = extractOkrugFromGeoObject(firstGeoObject);
    if (String(directLegacy || '').trim()) return directLegacy;

    const reverseLegacy = firstNonEmptyFromGeoCollection(byDistrict, extractOkrugFromGeoObject);
    if (String(reverseLegacy || '').trim()) return reverseLegacy;

    return '';
  }

  function normalizeOffices(offices) {
    if (!Array.isArray(offices)) return [];

    function coordsFromAny(o) {
      if (!o) return null;
      // Preferred: [lat, lon]
      if (Array.isArray(o.coords) && o.coords.length === 2) {
        const lat = Number(o.coords[0]);
        const lon = Number(o.coords[1]);
        return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
      }
      if (typeof o.pos === 'string') {
        const parts = o.pos.trim().split(/\s+/);
        if (parts.length >= 2) {
          const lon = Number(parts[0]);
          const lat = Number(parts[1]);
          return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
        }
      }
      if (Number.isFinite(o.lat) && Number.isFinite(o.lon)) return [Number(o.lat), Number(o.lon)];
      if (Number.isFinite(o.lat) && Number.isFinite(o.lng)) return [Number(o.lat), Number(o.lng)];
      return null;
    }

    return offices
      .map((o) => {
        const base = o && typeof o === 'object' ? o : {};
        return {
          ...base,
          id: base.id,
          name: base.name || '',
          address: base.address || '',
          coords: coordsFromAny(base),
          area: String(base.area || base.okrug || base.district || '').trim(),
          yandexOrgUrl: yandexOrgUrlFromRaw(base)
        };
      })
      .filter((o) => o.name || o.address);
  }

  function normalizeArea(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replaceAll('ё', 'е')
      .replace(/\s+/g, ' ')
      .replace(/[‑–—]/g, '-');
  }

  function canonicalizeAreaName(s) {
    const raw = String(s || '').trim();
    const n = normalizeArea(raw);
    if (!n) return '';

    // Unify "Троицкий административный округ" + "Новомосковский административный округ" into one bucket.
    // Also treat "ТиНАО" as the same bucket.
    if (n.includes('ти нао') || n.includes('ти-нао') || n.includes('тинaо') || n.includes('троицк') || n.includes('новомоск')) {
      return 'ТиНАО';
    }

    // If Yandex returns only "Москва", keep it as is (will likely not match any office area).
    return raw;
  }

  function findNearestGeodesicMany(ymaps, userCoords, offices) {
    const nearest = [];
    let minMeters = Infinity;
    const EPS_METERS = 0.5; // tolerance for float distance and identical coords

    for (const o of offices) {
      if (!o.coords) continue;
      const meters = ymaps.coordSystem.geo.getDistance(userCoords, o.coords);
      if (!Number.isFinite(meters)) continue;

      if (meters + EPS_METERS < minMeters) {
        minMeters = meters;
        nearest.length = 0;
        nearest.push(o);
        continue;
      }

      if (Math.abs(meters - minMeters) <= EPS_METERS) {
        nearest.push(o);
      }
    }

    return nearest.length ? { offices: nearest, meters: minMeters } : null;
  }

  function debounce(fn, waitMs) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  /**
   * Отступ при setBounds (px): выступы иконок + внутренние поля блока карты,
   * чтобы метки «Вы здесь» и отделения не обрезались по краям.
   */
  const MAP_BOUNDS_MARGIN = 96;

  /** Минимальный размах рамки по широте (~170 м), если две точки совпадают или очень близки. */
  const MAP_MIN_BOUNDS_LAT_SPAN = 0.0015;

  /** Длительность панорамирования/зума (мс); только после выбора подсказки / «Найти», не при каждом символе. */
  const MAP_PAN_ZOOM_DURATION_MS = 320;

  function mapPanZoomOptions() {
    return { duration: MAP_PAN_ZOOM_DURATION_MS };
  }

  /**
   * @param {object} geoQueryTarget — массив меток или root map.geoObjects
   * @param {[number, number]} fallbackCenter
   */
  function getMapGeoObjectsBounds(ymaps, map) {
    try {
      if (map.geoObjects && typeof map.geoObjects.getBounds === 'function') {
        const b = map.geoObjects.getBounds();
        if (b && Array.isArray(b[0]) && Array.isArray(b[1])) return b;
      }
    } catch (_) {}
    try {
      return ymaps.geoQuery(map.geoObjects).getBounds();
    } catch (_) {}
    return null;
  }

  /** Расширяет bounds, чтобы при близких координатах setBounds не уходил в чрезмерный зум / не терялась метка. */
  function expandBoundsMinLatSpan(bounds, minLatSpanDeg) {
    const a = bounds[0];
    const b = bounds[1];
    let minLat = Math.min(a[0], b[0]);
    let maxLat = Math.max(a[0], b[0]);
    let minLon = Math.min(a[1], b[1]);
    let maxLon = Math.max(a[1], b[1]);
    const latMid = (minLat + maxLat) / 2;
    const lonMid = (minLon + maxLon) / 2;
    let latSpan = maxLat - minLat;
    let lonSpan = maxLon - minLon;

    const cosLat = Math.max(0.35, Math.abs(Math.cos((latMid * Math.PI) / 180)));
    const minLonSpan = minLatSpanDeg / cosLat;

    if (latSpan < minLatSpanDeg) {
      minLat = latMid - minLatSpanDeg / 2;
      maxLat = latMid + minLatSpanDeg / 2;
    }
    if (lonSpan < minLonSpan) {
      minLon = lonMid - minLonSpan / 2;
      maxLon = lonMid + minLonSpan / 2;
    }
    return [
      [minLat, minLon],
      [maxLat, maxLon]
    ];
  }

  /**
   * После поиска: в кадре все метки (адрес пользователя + отделения), с комфортным зумом.
   * @param {{ userCoords?: [number, number], primaryCoords?: [number, number], primaryDistMeters?: number }} fallback
   */
  function fitMapToSearchPins(ymaps, map, fallback = {}) {
    const anim = { checkZoomRange: true, zoomMargin: MAP_BOUNDS_MARGIN, ...mapPanZoomOptions() };
    const uc = fallback.userCoords;
    const pc = fallback.primaryCoords;
    const pd = fallback.primaryDistMeters;

    try {
      let bounds = getMapGeoObjectsBounds(ymaps, map);
      if (bounds && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
        bounds = expandBoundsMinLatSpan(bounds, MAP_MIN_BOUNDS_LAT_SPAN);
        map.setBounds(bounds, anim);
        return;
      }
    } catch (_) {}

    if (uc && pc && uc.length >= 2 && pc.length >= 2) {
      try {
        const raw = [
          [Math.min(uc[0], pc[0]), Math.min(uc[1], pc[1])],
          [Math.max(uc[0], pc[0]), Math.max(uc[1], pc[1])]
        ];
        map.setBounds(expandBoundsMinLatSpan(raw, MAP_MIN_BOUNDS_LAT_SPAN), anim);
        return;
      } catch (_) {
        try {
          const midLat = (uc[0] + pc[0]) / 2;
          const midLon = (uc[1] + pc[1]) / 2;
          const d = ymaps.coordSystem.geo.getDistance(uc, pc);
          const z = zoomFromDistanceMeters(Number.isFinite(d) ? d : pd);
          map.setCenter([midLat, midLon], z, mapPanZoomOptions());
        } catch (_) {
          setMapCenterOnPrimaryOffice(map, pc, pd);
        }
        return;
      }
    }

    if (pc && pc.length >= 2) {
      setMapCenterOnPrimaryOffice(map, pc, pd);
    } else if (uc && uc.length >= 2) {
      try {
        map.setCenter(uc, 15, mapPanZoomOptions());
      } catch (_) {
        try {
          map.setCenter(uc, 15);
        } catch (_) {}
      }
    }
  }

  function setMapBoundsFromQuery(ymaps, map, geoQueryTarget, fallbackCenter, fallbackZoom) {
    const anim = mapPanZoomOptions();
    try {
      const bounds = ymaps.geoQuery(geoQueryTarget).getBounds();
      if (bounds) {
        map.setBounds(bounds, { checkZoomRange: true, zoomMargin: MAP_BOUNDS_MARGIN, ...anim });
      } else if (Array.isArray(fallbackCenter) && fallbackCenter.length === 2) {
        try {
          map.setCenter(fallbackCenter, fallbackZoom, anim);
        } catch (_) {
          map.setCenter(fallbackCenter, fallbackZoom);
        }
      }
    } catch (_) {
      if (Array.isArray(fallbackCenter) && fallbackCenter.length === 2) {
        try {
          map.setCenter(fallbackCenter, fallbackZoom, anim);
        } catch (_) {
          try {
            map.setCenter(fallbackCenter, fallbackZoom);
          } catch (_) {}
        }
      }
    }
  }

  /** Иконка отделения на карте (общая для всех экземпляров виджета). */
  const OFFICE_ICON_DATA_URL =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iNCIgZmlsbD0iIzAwNzJCQiIvPgo8cGF0aCBkPSJNMTUuNDU1OSAxMS4xOTQ5QzE1LjA0NDcgOS4zNzgxNCAxNC4wMDU1IDcuOTA1MjYgMTMuODYzNCA3LjY2NjAyQzEzLjYzOTEgOC4wMDI0NiAxMi44MDkzIDkuMzAzMzggMTIuMzkwNiAxMC43NDYzQzExLjkzNDUgMTIuMzUzOCAxMS44NjcyIDEzLjc4MTggMTIuMDI0MiAxNS4xODc0QzEyLjE4MTIgMTYuNTkzIDEyLjc3OTMgMTguMDM2IDEyLjc3OTMgMTguMDM2QzEzLjA5MzQgMTguNzkxMSAxMy41NzE5IDE5LjYwNiAxMy44Nzg0IDIwLjAwMjNDMTQuMzI3IDE5LjQxOTEgMTUuMzY2MiAxNy42NjIxIDE1LjY4NzcgMTUuMzc0M0MxNS44NjcyIDE0LjExODMgMTUuODc0NiAxMy4wMDQzIDE1LjQ1NTkgMTEuMTk0OVpNMTMuODYzNCAxOS41NjEyQzEzLjY2MTYgMTkuMTc5OSAxMy4zNDc2IDE4LjQ0NzIgMTMuMzE3NyAxNy4zMTgyQzEzLjMxMDIgMTYuMjI2NiAxMy43NDM4IDE1LjI5MjEgMTMuODcwOSAxNS4wOTc3QzEzLjk4MzEgMTUuMjkyMSAxNC4zNTY5IDE2LjEwNyAxNC40MDE4IDE3LjIyMUMxNC40MzkxIDE4LjMxMjYgMTQuMDcyOCAxOS4xNzI0IDEzLjg2MzQgMTkuNTYxMlpNMTUuMzM2MyAxNC4yNjc4QzE1LjMyMTQgMTQuOTU1NiAxNS4yMzkxIDE1LjY4ODMgMTUuMTM0NSAxNi4xMjJDMTUuMTcxOCAxNS4zNjY4IDE1LjA4MjEgMTQuMzEyNiAxNC45MTAyIDEzLjQ4MjhDMTQuNzM4MiAxMi42NTI5IDE0LjI1MjIgMTEuMjY5NyAxMy44NTYgMTAuNjM0MkMxMy40OTcxIDExLjI0NzMgMTMuMDQ4NSAxMi40MzYgMTIuODE2NyAxMy40NzUzQzEyLjU4NSAxNC41MTQ1IDEyLjU3NzUgMTUuNzcwNiAxMi41Nzc1IDE2LjE0NDRDMTIuNTE3NyAxNS44MzA0IDEyLjM2MDcgMTQuNjk0IDEyLjQwNTUgMTMuNTU3NUMxMi40NDI5IDEyLjYxNTUgMTIuNjU5NyAxMS42NTg1IDEyLjc3OTMgMTEuMjA5OUMxMy4yMzU0IDkuNzI5NTQgMTMuNzU4OCA4Ljc4MDAyIDEzLjg1NiA4LjYzMDQ5QzEzLjk1MzIgOC43ODAwMiAxNC42MDM2IDkuOTQ2MzYgMTQuOTQ3NSAxMS4xNzI1QzE1LjI4NCAxMi40MDYxIDE1LjM1MTMgMTMuNTcyNSAxNS4zMzYzIDE0LjI2NzhaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTQuNTY1NCAyMC40MzQ5SDExLjQxNzhWMjIuNTQzM0wxMS40MjUzIDIyLjUzNThDMTIuMTY1NSAyMS43OTU2IDEzLjM2OTIgMjEuNzk1NiAxNC4xMDk0IDIyLjUzNThDMTQuODQ5NSAyMy4yNzYgMTQuODQ5NSAyNC40Nzk3IDE0LjEwOTQgMjUuMjE5OUwxNC4xMDE5IDI1LjIyNzNDMTQuMTAxOSAyNS4yMjczIDE0LjA5NDQgMjUuMjM0OCAxNC4wODY5IDI1LjIzNDhDMTMuMzQ2OCAyNS45Njc1IDEyLjM4MjMgMjYuMzMzOSAxMS40MTc4IDI2LjMzMzlDMTAuNDQ1OSAyNi4zMzM5IDkuNDczOTEgMjUuOTYgOC43MzM3MyAyNS4yMTk5QzcuNDI1MzQgMjMuOTExNSA3LjI3NTgxIDIxLjg5MjggOC4yNzAxOSAyMC40MTk5QzguNDA0NzcgMjAuMjE4MSA4LjU2MTc3IDIwLjAzMTIgOC43MzM3MyAxOS44NTkyQzkuNDczOTEgMTkuMTE5IDEwLjQ0NTkgMTguNzQ1MiAxMS40MTc4IDE4Ljc0NTJWMTMuNjgzNkM3LjY4NzAyIDEzLjY4MzYgNC42NjY1IDE2LjcwNDEgNC42NjY1IDIwLjQzNDlDNC42NjY1IDI0LjE2NTcgNy42ODcwMiAyNy4xODYyIDExLjQxNzggMjcuMTg2MkMxMy4zNjE3IDI3LjE4NjIgMTUuMTExMiAyNi4zNjM4IDE2LjM0NDggMjUuMDQ3OVYyMC40MzQ5SDE0LjU2NTRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjAuNzMyNyAyMC40MzU1SDIyLjQ4OTdWMjcuMTk0M0gyMS4xMzY1VjIyLjk1NTFIMjEuMDkxNkwyMC4zOTYzIDI3LjE5NDNIMTkuMzEyMkwxOC42MTY5IDIyLjk1NTFIMTguNTcyVjI3LjE5NDNIMTcuMjE4OFYyMC40MzU1SDE4Ljk3NTdMMTkuODUwNSAyNS4xODMxTDIwLjczMjcgMjAuNDM1NVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yMy4yNDQ2IDIxLjYzOTNDMjMuMjQ0NiAyMS4xNjgyIDIzLjMwNDQgMjAuNDM1NSAyNC4yNDY1IDIwLjQzNTVIMjUuMzY4QzI2LjMxNzUgMjAuNDM1NSAyNi4zNjk4IDIxLjE2ODIgMjYuMzY5OCAyMS42MzkzVjI1Ljk4MzFDMjYuMzY5OCAyNi40NTQxIDI2LjMxIDI3LjE4NjggMjUuMzY4IDI3LjE4NjhIMjQuMjQ2NUMyMy4yOTcgMjcuMTg2OCAyMy4yNDQ2IDI2LjQ1NDEgMjMuMjQ0NiAyNS45ODMxVjIxLjYzOTNaTTI1LjAxNjYgMjEuNEMyNS4wMTY2IDIxLjI4MDQgMjQuOTI2OCAyMS4xNzU3IDI0LjgwNzIgMjEuMTc1N0MyNC43MzI1IDIxLjE3NTcgMjQuNTk3OSAyMS4yMjA2IDI0LjU5NzkgMjEuNFYyNi4yMjk5QzI0LjU5NzkgMjYuNDAxOCAyNC43MzI1IDI2LjQ1NDIgMjQuODA3MiAyNi40NTQyQzI0LjkzNDMgMjYuNDU0MiAyNS4wMTY2IDI2LjM0OTUgMjUuMDE2NiAyNi4yMjk5VjIxLjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjguNDgwNyAyNC44MzE3VjI2LjIyOTlDMjguNDgwNyAyNi40MDE4IDI4LjYxNTMgMjYuNDU0MiAyOC42OSAyNi40NTQyQzI4LjgxNzEgMjYuNDU0MiAyOC44OTk0IDI2LjM0OTUgMjguODk5NCAyNi4yMjk5VjI0LjA4NDFIMjcuODA3OFYyMy4zNDM5SDI4Ljg5OTRWMjEuNEMyOC44OTk0IDIxLjI4MDQgMjguODA5NyAyMS4xNzU3IDI4LjY5IDIxLjE3NTdDMjguNjE1MyAyMS4xNzU3IDI4LjQ4MDcgMjEuMjIwNiAyOC40ODA3IDIxLjRWMjIuNTk2M0gyNy4xMjc0VjIxLjYzOTNDMjcuMTI3NCAyMS4xNjgyIDI3LjE4NzMgMjAuNDM1NSAyOC4xMjkzIDIwLjQzNTVIMjkuMjUwOEMzMC4yMDAzIDIwLjQzNTUgMzAuMjUyNiAyMS4xNjgyIDMwLjI1MjYgMjEuNjM5M1YyNS45ODMxQzMwLjI1MjYgMjYuNDU0MSAzMC4xOTI4IDI3LjE4NjggMjkuMjUwOCAyNy4xODY4SDI4LjEyOTNDMjcuMTc5OCAyNy4xODY4IDI3LjEyNzQgMjYuNDU0MSAyNy4xMjc0IDI1Ljk4MzFWMjQuODI0M0gyOC40ODA3VjI0LjgzMTdaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzEuMDA1IDIwLjQzNTVIMzIuMzU4M1YyMy4zNDM5SDMyLjQwMzFMMzIuODQ0MyAyMC40MzU1SDM0LjE5NzVMMzMuNTA5NyAyMy42ODA0TDM0LjMzMjEgMjcuMTk0M0gzMi45Nzg4TDMyLjM5NTcgMjQuMDg0MUgzMi4zNTA4VjI3LjE5NDNIMzAuOTk3NlYyMC40MzU1SDMxLjAwNVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=';

  function officePinOptions(iconHref) {
    return {
      iconLayout: 'default#image',
      iconImageHref: iconHref,
      iconImageSize: [40, 40],
      iconImageOffset: [-20, -40]
    };
  }

  function buildBranchFinderRootClass({ rootClass, theme } = {}) {
    const tokens = new Set(['branch-finder']);
    const add = (raw) => {
      const parts = String(raw || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      for (const p of parts) {
        if (/^[a-zA-Z0-9_-]+$/.test(p)) tokens.add(p);
      }
    };
    add(rootClass);
    if (theme === 'embed' || theme === 'embedded') add('branch-finder--embed');
    if (theme === 'wide') add('branch-finder--wide');
    return [...tokens].join(' ');
  }

  /**
   * Окно геосаджеста (ll = lon,lat; spn): только при suggestMoscowOnly: false.
   * @see https://yandex.com/dev/geosuggest/doc/en/request
   */
  function geosuggestBiasSuffix(mapConfig) {
    if (!mapConfig || mapConfig.suggestBias === false) return '';
    const spn = mapConfig.suggestSpn != null ? String(mapConfig.suggestSpn) : '0.55,0.42';
    let lat;
    let lon;
    if (Array.isArray(mapConfig.suggestCenter) && mapConfig.suggestCenter.length === 2) {
      [lat, lon] = mapConfig.suggestCenter;
    } else if (Array.isArray(mapConfig.center) && mapConfig.center.length === 2) {
      [lat, lon] = mapConfig.center;
    } else {
      lat = 55.75;
      lon = 37.62;
    }
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';
    return `&ll=${encodeURIComponent(`${lo},${la}`)}&spn=${encodeURIComponent(spn)}`;
  }

  /**
   * По умолчанию только Москва: strict_bounds + bbox. Иначе — мягкий bias (ll+spn).
   * suggestMoscowOnly: false — режим «вся Россия» с прежним приоритетом центра карты.
   */
  function buildGeosuggestExtraQuery(mapConfig) {
    if (mapConfig && mapConfig.suggestMoscowOnly === false) return geosuggestBiasSuffix(mapConfig);
    const bbox = getSuggestBboxString(mapConfig);
    return `&strict_bounds=1&bbox=${encodeURIComponent(bbox)}`;
  }

  /**
   * @returns {Array<{ value: string, labelHtml: string }>}
   */
  async function fetchYandexSuggest({ apiKey, text, lang = 'ru_RU', results = 7, extraQuery = '' }) {
    if (!apiKey) throw new Error('Не задан ключ геосаджеста');
    const q = String(text || '').trim();
    if (!q) return [];
    const url = `https://suggest-maps.yandex.ru/v1/suggest?apikey=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(
      q
    )}&lang=${encodeURIComponent(lang)}&results=${encodeURIComponent(results)}&print_address=1&types=house,street,locality${extraQuery}`;

    const res = await fetch(url, { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error(`Suggest HTTP ${res.status}`);
    const data = await res.json();

    const items = Array.isArray(data && data.results) ? data.results : [];
    return items
      .map((it) => {
        const title = it && it.title && it.title.text ? String(it.title.text) : '';
        const titleHl =
          it && it.title ? it.title.hl || it.title.highlights || it.title.highlight || null : null;
        const subtitle = it && it.subtitle && it.subtitle.text ? String(it.subtitle.text) : '';
        const subtitleHl =
          it && it.subtitle ? it.subtitle.hl || it.subtitle.highlights || it.subtitle.highlight || null : null;
        const titleHtml = applyHighlightsToText(title, titleHl);
        const subtitleHtml = subtitle ? applyHighlightsToText(subtitle, subtitleHl) : '';
        const value = subtitle ? `${title}, ${subtitle}` : title;
        const labelHtml = subtitle ? `${titleHtml}, ${subtitleHtml}` : titleHtml;
        const v = value.trim();
        if (!v) return null;
        return { value: v, labelHtml };
      })
      .filter(Boolean);
  }

  function mountSuggestDropdown(root) {
    let box = root.querySelector('[data-branch-finder-suggest]');
    if (box) return box;
    box = document.createElement('div');
    box.setAttribute('data-branch-finder-suggest', '');
    box.className = 'branch-finder__suggest';
    box.innerHTML = '';
    const host =
      root.querySelector('.branch-finder__search-line') ||
      root.querySelector('.branch-finder__search-inner') ||
      root.querySelector('.branch-finder__search-bar');
    if (!host) {
      throw new Error('Не найден контейнер подсказок (.branch-finder__search-line)');
    }
    host.appendChild(box);
    return box;
  }

  function renderSuggestDropdown(box, items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      box.innerHTML = '';
      box.style.display = 'none';
      delete box._branchFinderSuggestItems;
      return;
    }
    box.style.display = 'block';
    box._branchFinderSuggestItems = list;
    box.innerHTML = `
      <div class="branch-finder__suggest-list">
        ${list
          .map(
            (it, i) =>
              `<button type="button" class="branch-finder__suggest-item" data-suggest-idx="${i}">${it.labelHtml}</button>`
          )
          .join('')}
      </div>
    `;
  }

  function setUiState({ button, input }, { loading }) {
    button.disabled = Boolean(loading);
    input.disabled = Boolean(loading);
    if (loading) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
  }

  /**
   * Строка под полем поиска: только нейтральные подсказки и прогресс (без ошибок).
   * Ошибки вынесены в {@link renderContentError} через {@link reportSearchFailure}.
   */
  function renderStatus(statusEl, { type, title, details }) {
    if (type === 'error') return;
    const suppress =
      String(title || '').startsWith('Введите адрес') || String(title || '') === 'Готово';
    if (suppress) {
      statusEl.className = 'branch-finder__status';
      statusEl.innerHTML = '';
      return;
    }

    statusEl.className = 'branch-finder__status branch-finder__status--info';
    statusEl.innerHTML = `
      <div class="branch-finder__status-title">${escapeHtml(title || '')}</div>
      ${details ? `<div class="branch-finder__status-details">${escapeHtml(details)}</div>` : ''}
    `;
  }

  function clearContentError(contentErrorEl) {
    if (!contentErrorEl) return;
    contentErrorEl.textContent = '';
    contentErrorEl.hidden = true;
  }

  /** Текст ошибки — всегда в `.branch-finder__content-error` (одна карточка с картой), единое оформление. */
  function renderContentError(contentErrorEl, resultSuccessEl, { title, details }) {
    if (resultSuccessEl) {
      resultSuccessEl.innerHTML = '';
      resultSuccessEl.hidden = true;
    }
    if (!contentErrorEl) return;
    const ti = String(title || '').trim();
    const de = String(details || '').trim();
    const text = [ti, de].filter(Boolean).join('\n');
    if (!text) {
      clearContentError(contentErrorEl);
      return;
    }
    contentErrorEl.textContent = text;
    contentErrorEl.hidden = false;
  }

  function clearStatusBarForResultMode(statusEl) {
    renderStatus(statusEl, { type: 'info', title: 'Введите адрес', details: '' });
  }

  /** Любая ошибка для пользователя: очищаем статус под поиском, показываем текст в карточке с картой. */
  function reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, { title, details }) {
    clearStatusBarForResultMode(statusEl);
    renderContentError(contentErrorEl, resultSuccessEl, { title, details });
  }

  function formatOfficeBalloon(o, opts = {}) {
    const parts = [`<strong>${escapeHtml(o.name || '')}</strong>`];
    parts.push(`Адрес: ${escapeHtml(o.address || '—')}`);
    const leadership = [o.managerTitle, o.managerTitle2, o.managerName].filter(Boolean).join(' — ');
    if (leadership) parts.push(`Руководство: ${escapeHtml(leadership)}`);
    if (opts.distance != null) parts.push(escapeHtml(formatDistance(opts.distance)));
    if (opts.outboundUrl) {
      const link = yandexOutboundLinkAnchor(opts.outboundUrl);
      if (link) parts.push(link);
    }
    return parts.join('<br/>');
  }

  function shortenArea(area) {
    const a = String(area || '').trim();
    if (!a) return '';
    // "Северный административный округ" -> "Северный"
    return a
      .replace(/\s+административный\s+округ\s*$/i, '')
      .replace(/\s+административного\s+округа\s*$/i, '')
      .trim();
  }

  function renderResult(resultSuccessEl, statusEl, contentErrorEl, { offices, area, addressLine }) {
    const list = Array.isArray(offices) ? offices : [];
    if (!list.length) {
      if (resultSuccessEl) {
        resultSuccessEl.innerHTML = '';
        resultSuccessEl.hidden = true;
      }
      return;
    }

    clearContentError(contentErrorEl);
    clearStatusBarForResultMode(statusEl);

    const headerArea = shortenArea(area || list[0].area || '');
    const captionAddr = String(addressLine || '').trim() || shortenArea(area || '') || '—';
    const captionAddrHtml = escapeHtml(captionAddr);

    if (!resultSuccessEl) return;
    resultSuccessEl.innerHTML = `
      <div class="branch-finder__result-table">
        <p class="branch-finder__result-caption">
          <span class="branch-finder__result-caption-text">Отделение по адресу:</span>
          <span class="branch-finder__result-caption-addr">${captionAddrHtml}</span>
        </p>
        <div class="branch-finder__result-head">
          <div class="branch-finder__result-th">№ отделения</div>
          <div class="branch-finder__result-th">Административный округ</div>
          <div class="branch-finder__result-th">Адрес</div>
          <div class="branch-finder__result-th">Руководство</div>
        </div>
        <div class="branch-finder__result-body">
          ${list
            .map((office) => {
              const num = escapeHtml(office.id ?? '—');
              const areaShort = escapeHtml(shortenArea(office.area || headerArea) || '—');
              const addr = escapeHtml(office.address || '—');

              const managerName = escapeHtml(office.managerName || office.headName || '—');
              const managerTitle1 = escapeHtml(office.managerTitle || office.headTitle || '');
              const managerTitle2 = escapeHtml(office.managerTitle2 || office.headTitle2 || '');
              const managerTitles =
                managerTitle1 || managerTitle2
                  ? `<div class="branch-finder__small">${managerTitle1}</div>${managerTitle2 ? `<div class="branch-finder__small">${managerTitle2}</div>` : ''}`
                  : `<div class="branch-finder__small branch-finder__muted">—</div>`;

              return `
                <div class="branch-finder__result-row">
                  <div class="branch-finder__result-td">
                    <div class="branch-finder__strong">${num}</div>
                  </div>
                  <div class="branch-finder__result-td">
                    <div class="branch-finder__strong">${areaShort}</div>
                  </div>
                  <div class="branch-finder__result-td">
                    <div class="branch-finder__strong">${addr}</div>
                  </div>
                  <div class="branch-finder__result-td">
                    <div class="branch-finder__strong">${managerName}</div>
                    ${managerTitles}
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
    resultSuccessEl.hidden = false;
  }

  /**
   * @param {object} options
   * @param {string} options.containerId — id узла-контейнера
   * @param {Array} options.offices — сырые данные филиалов
   * @param {object} [options.map] — apiKey, lang, load, center, zoom, suggestApiKey / suggestLang;
   *   suggestMoscowOnly (false — подсказки без ограничения Москвой), suggestBbox (bbox для strict_bounds);
   *   при suggestMoscowOnly: false — опционально suggestBias, suggestCenter, suggestSpn.
   * @param {string} [options.rootClass] — доп. CSS-классы корня
   * @param {'embed'|'embedded'|'wide'} [options.theme]
   */
  function init({ containerId, offices, map: mapConfig = {}, rootClass, theme } = {}) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Контейнер не найден: ${containerId}`);

    const normalizedOffices = normalizeOffices(offices);
    const branchFinderRootClass = buildBranchFinderRootClass({ rootClass, theme });

    const inputId = `branch-finder__input--${String(containerId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

    container.innerHTML = `
      <div class="${branchFinderRootClass}" data-branch-finder>
        <div class="branch-finder__section branch-finder__section--search">
          <div class="branch-finder__search-wrap">
            <div class="branch-finder__search-line">
              <div class="branch-finder__search-shell">
                <div class="branch-finder__search-inner">
                  <label class="branch-finder__label branch-finder__search-bar" for="${escapeHtml(inputId)}">
                    <span class="branch-finder__label-text">Адрес</span>
                    <span class="branch-finder__search-controls">
                      <span class="branch-finder__field">
                        <input id="${escapeHtml(inputId)}" class="branch-finder__input" placeholder="Введите адрес" autocomplete="street-address"/>
                        <button type="button" class="branch-finder__clear" aria-label="Сбросить" title="Сбросить" hidden>×</button>
                      </span>
                    </span>
                  </label>
                </div>
              </div>
              <button class="branch-finder__button branch-finder__button--in-search" type="button"><span class="branch-finder__button-label">Найти</span></button>
            </div>
            <div class="branch-finder__status branch-finder__status--info" aria-live="polite"></div>
          </div>
        </div>
        <div class="branch-finder__section branch-finder__section--main">
          <div class="branch-finder__content">
            <div class="branch-finder__content-error" aria-live="assertive" hidden></div>
            <div class="branch-finder__result branch-finder__result--success" aria-live="polite" hidden></div>
            <div class="branch-finder__map" aria-label="Карта"></div>
          </div>
        </div>
      </div>
    `;

    const root = container.querySelector('[data-branch-finder]');
    const input = root.querySelector('.branch-finder__input');
    const button = root.querySelector('.branch-finder__button');
    const clearBtn = root.querySelector('.branch-finder__clear');
    const mapEl = root.querySelector('.branch-finder__map');
    const statusEl = root.querySelector('.branch-finder__section--search .branch-finder__status');
    const contentErrorEl = root.querySelector('.branch-finder__content-error');
    const resultSuccessEl = root.querySelector('.branch-finder__result--success');
    const suggestBox = mountSuggestDropdown(root);

    let destroyed = false;
    let map = null;
    let yandexOutboundLinkObserver = null;

    const initialCenter = Array.isArray(mapConfig.center) ? mapConfig.center : [55.75, 37.61];
    const initialZoom = Number.isFinite(mapConfig.zoom) ? mapConfig.zoom : 10;

    renderStatus(statusEl, {
      type: 'info',
      title: 'Введите адрес и нажмите “Найти”',
      details: ''
    });
    if (!normalizedOffices.length) {
      reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
        title: 'Справочник отделений пуст',
        details: ''
      });
    }

    const controls = { button, input };

    function updateClearVisibility() {
      if (!clearBtn || !input) return;
      if (input.value.trim()) {
        clearBtn.removeAttribute('hidden');
        clearBtn.setAttribute('aria-hidden', 'false');
      } else {
        clearBtn.setAttribute('hidden', '');
        clearBtn.setAttribute('aria-hidden', 'true');
      }
    }

    if (clearBtn) {
      clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    }

    function getSuggestApiKey() {
      return (
        mapConfig.suggestApiKey ||
        window.YMAPS_SUGGEST_API_KEY ||
        window.YSUGGEST_API_KEY ||
        window.YANDEX_SUGGEST_API_KEY ||
        window.GEOSUGGEST_API_KEY
      );
    }
    const suggestLang = mapConfig.suggestLang || mapConfig.lang || 'ru_RU';

    let suggestSeq = 0;
    let suggestWarned = false;
    const debouncedSuggest = debounce(async () => {
      const seq = ++suggestSeq;
      const q = input.value.trim();
      if (!q) {
        renderSuggestDropdown(suggestBox, []);
        clearContentError(contentErrorEl);
        renderStatus(statusEl, { type: 'info', title: 'Введите адрес', details: '' });
        return;
      }
      const suggestApiKey = getSuggestApiKey();
      if (!suggestApiKey) {
        if (!suggestWarned) {
          suggestWarned = true;
          reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
            title: 'Подсказки адреса не настроены',
            details:
              'Добавьте ключ геосаджеста в config.js (window.YSUGGEST_API_KEY) или передайте map.suggestApiKey. ' +
              'Проверьте, что config.js подключён ДО widget.js и ДО вызова init()'
          });
        }
        return;
      }
      try {
        let items = await fetchYandexSuggest({
          apiKey: suggestApiKey,
          text: q,
          lang: suggestLang,
          results: 7,
          extraQuery: buildGeosuggestExtraQuery(mapConfig)
        });
        if (seq !== suggestSeq) return;
        if (mapConfig.suggestMoscowOnly !== false) {
          items = items.filter((it) => !shouldRejectMoscowOblastSuggestValue(it.value));
        }
        if (q.length < 2) {
          clearContentError(contentErrorEl);
        }
        if (!items.length && q.length >= 2 && mapConfig.suggestMoscowOnly !== false) {
          reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
            title: MSG_ADDRESS_MOSCOW_ONLY,
            details: ''
          });
          renderSuggestDropdown(suggestBox, []);
          return;
        }
        if (items.length) {
          clearContentError(contentErrorEl);
          renderStatus(statusEl, { type: 'info', title: 'Введите адрес', details: '' });
        }
        renderSuggestDropdown(suggestBox, items);
      } catch (e) {
        // Don't block search; just hide dropdown on errors, but show a single helpful hint.
        if (seq !== suggestSeq) return;
        renderSuggestDropdown(suggestBox, []);
        if (!suggestWarned) {
          suggestWarned = true;
          reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
            title: 'Подсказки адресов недоступны',
            details:
              'Частые причины: запуск страницы как file:// (нужен http(s)), CORS/ограничение домена для ключа, лимиты API.' +
              (e && e.message ? ` Технически: ${String(e.message)}` : '')
          });
        }
      }
    }, 200);

    function hideSuggest() {
      renderSuggestDropdown(suggestBox, []);
    }

    input.addEventListener('input', () => {
      debouncedSuggest();
      updateClearVisibility();
    });
    input.addEventListener('blur', () => {
      setTimeout(() => hideSuggest(), 120);
    });

    suggestBox.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-suggest-idx]') : null;
      if (!btn || !suggestBox._branchFinderSuggestItems) return;
      const idx = Number(btn.getAttribute('data-suggest-idx'));
      const row = suggestBox._branchFinderSuggestItems[idx];
      const val = row && row.value ? String(row.value) : '';
      if (val) input.value = val;
      hideSuggest();
      updateClearVisibility();
      try {
        button.click();
      } catch (_) {}
    });

    let searchSeq = 0;
    let resetMapToAllOffices = null;

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchSeq += 1;
        input.value = '';
        hideSuggest();
        if (resultSuccessEl) {
          resultSuccessEl.innerHTML = '';
          resultSuccessEl.hidden = true;
        }
        clearContentError(contentErrorEl);
        clearStatusBarForResultMode(statusEl);
        if (!normalizedOffices.length) {
          reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
            title: 'Справочник отделений пуст',
            details: ''
          });
        }
        updateClearVisibility();
        if (typeof resetMapToAllOffices === 'function') resetMapToAllOffices();
      });
    }

    loadYMaps({ apiKey: mapConfig.apiKey, lang: mapConfig.lang, load: mapConfig.load || 'package.full' })
      .then((ymaps) => {
        if (destroyed) return;

        map = new ymaps.Map(mapEl, {
          center: initialCenter,
          zoom: initialZoom,
          controls: ['zoomControl']
        });

        /** Строка для параметра `text` в ссылке «Открыть Яндекс.Карты» (поисковый запрос в приложении). */
        let lastYandexMapsShareText = '';
        /** Координаты метки отделения для `pt` (долгота,широта), если есть результат поиска. */
        let lastYandexMapsOfficePt = '';

        /** Запасная ссылка для системной подписи карты (не балунов): центр, при поиске — pt основного отделения. */
        function buildYandexMapsOutboundUrl() {
          if (!map) return '';
          let center;
          let zoom;
          try {
            center = map.getCenter();
            zoom = map.getZoom();
          } catch (_) {
            return '';
          }
          if (!center || center.length < 2) return '';
          const lat = Number(center[0]);
          const lon = Number(center[1]);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
          const zClamped = Math.max(1, Math.min(18, Math.round(Number(zoom) || 10)));
          const pt = String(lastYandexMapsOfficePt || '').trim();
          const q = String(lastYandexMapsShareText || '').trim();
          if (pt) {
            const parts = pt.split(',').map((s) => s.trim());
            const plon = Number(parts[0]);
            const plat = Number(parts[1]);
            if (parts.length >= 2 && Number.isFinite(plon) && Number.isFinite(plat)) {
              const pinUrl = buildYandexMapsPinUrl({ lat: plat, lon: plon, text: q, zoom: zClamped });
              if (pinUrl) return pinUrl;
            }
          }
          const params = new URLSearchParams();
          params.set('ll', `${lon},${lat}`);
          params.set('z', String(zClamped));
          params.set('l', 'map');
          if (q) params.set('text', q);
          return `https://yandex.ru/maps/?${params.toString()}`;
        }

        let patchYandexOutboundRaf = 0;
        function schedulePatchYandexMapsOutboundLinks() {
          if (destroyed || !map) return;
          if (patchYandexOutboundRaf) cancelAnimationFrame(patchYandexOutboundRaf);
          patchYandexOutboundRaf = requestAnimationFrame(() => {
            patchYandexOutboundRaf = 0;
            const url = buildYandexMapsOutboundUrl();
            if (!url || !mapEl) return;
            try {
              mapEl.querySelectorAll('a[href]').forEach((a) => {
                if (a.hasAttribute && a.hasAttribute('data-branch-finder-outbound')) return;
                const href = a.getAttribute('href') || '';
                if (/\/maps\/org\//.test(href)) return;
                const h = href.toLowerCase();
                const isYandexMapsOutbound =
                  h.includes('yandex.ru/maps') ||
                  h.includes('yandex.com/maps') ||
                  /maps\.yandex\.(ru|com)/i.test(href) ||
                  h.startsWith('yandexmaps:');
                if (!isYandexMapsOutbound) return;
                a.setAttribute('href', url);
              });
            } catch (_) {}
          });
        }

        yandexOutboundLinkObserver = new MutationObserver(() => schedulePatchYandexMapsOutboundLinks());
        yandexOutboundLinkObserver.observe(mapEl, { childList: true, subtree: true });
        try {
          map.events.add('boundschange', () => schedulePatchYandexMapsOutboundLinks());
        } catch (_) {}
        schedulePatchYandexMapsOutboundLinks();
        setTimeout(schedulePatchYandexMapsOutboundLinks, 400);
        setTimeout(schedulePatchYandexMapsOutboundLinks, 1200);

        function nudgeMapContainerSize() {
          if (destroyed || !map) return;
          try {
            if (map.container && typeof map.container.fitToViewport === 'function') map.container.fitToViewport();
          } catch (_) {}
          schedulePatchYandexMapsOutboundLinks();
        }

        function scrollMapIntoViewCenter() {
          if (destroyed || !mapEl) return;
          try {
            mapEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          } catch (_) {}
        }

        function renderOfficePlacemarks() {
          const withCoords = normalizedOffices.filter((o) => Array.isArray(o.coords) && o.coords.length === 2);
          const byCoords = new Map();
          for (const o of withCoords) {
            const key = `${o.coords[0]},${o.coords[1]}`;
            if (!byCoords.has(key)) byCoords.set(key, []);
            byCoords.get(key).push(o);
          }

          const officePlacemarks = [];
          for (const offices of byCoords.values()) {
            const first = offices[0];
            const hint = offices.length > 1 ? `${offices.length} отделений` : first.name;
            const balloon = offices
              .map((o) => formatOfficeBalloon(o, { outboundUrl: officeToYandexOutboundUrl(o) }))
              .join('<br/><br/>');
            officePlacemarks.push(
              new ymaps.Placemark(
                first.coords,
                { hintContent: hint, balloonContent: balloon },
                officePinOptions(OFFICE_ICON_DATA_URL)
              )
            );
          }

          if (officePlacemarks.length) {
            const collection = new ymaps.GeoObjectCollection({}, {});
            officePlacemarks.forEach((pm) => collection.add(pm));
            map.geoObjects.add(collection);
          }
        }

        function showAllOfficesOnMap() {
          lastYandexMapsShareText = '';
          lastYandexMapsOfficePt = '';
          map.geoObjects.removeAll();
          renderOfficePlacemarks();
          setMapBoundsFromQuery(ymaps, map, map.geoObjects, initialCenter, initialZoom);
          requestAnimationFrame(() => requestAnimationFrame(nudgeMapContainerSize));
        }

        showAllOfficesOnMap();
        resetMapToAllOffices = showAllOfficesOnMap;
        clearStatusBarForResultMode(statusEl);

        async function handleSearch() {
          const seq = ++searchSeq;
          const address = input.value.trim();
          if (!address) {
            reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
              title: 'Введите адрес',
              details: ''
            });
            return;
          }
          if (!normalizedOffices.length) {
            reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
              title: 'Справочник отделений пуст',
              details: ''
            });
            return;
          }

          setUiState(controls, { loading: true });
          renderStatus(statusEl, { type: 'info', title: 'Ищем адрес…' });
          if (resultSuccessEl) {
            resultSuccessEl.innerHTML = '';
            resultSuccessEl.hidden = true;
          }
          clearContentError(contentErrorEl);

          try {
            const res = await ymaps.geocode(address, { results: 1 });
            if (seq !== searchSeq) return; // stale
            const first = res.geoObjects.get(0);
            if (!first) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: 'Адрес не найден',
                details: 'Уточните адрес и попробуйте ещё раз'
              });
              return;
            }

            if (queryLooksLikeStreetLevelRequest(address) && !geocoderResultHasStreetOrHouseLevel(first)) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: 'Адрес не найден',
                details: 'Проверьте название улицы или выберите адрес из подсказок'
              });
              return;
            }

            const userCoords = first.geometry.getCoordinates();
            const bboxStr = getSuggestBboxString(mapConfig);
            if (mapConfig.suggestMoscowOnly !== false && !coordsInsideSuggestBbox(userCoords, bboxStr)) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: MSG_ADDRESS_MOSCOW_ONLY,
                details: ''
              });
              return;
            }

            if (mapConfig.suggestMoscowOnly !== false && isAddressOutsideMoscowCity(first)) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: MSG_ADDRESS_MOSCOW_ONLY,
                details: ''
              });
              return;
            }

            const userAreaRaw = await resolveUserArea(ymaps, first, userCoords);
            const userArea = canonicalizeAreaName(userAreaRaw);
            if (!String(userArea || '').trim()) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: 'Не удалось определить округ по адресу',
                details: 'Выберите адрес из подсказок или уточните запрос'
              });
              return;
            }

            const areaNorm = normalizeArea(userArea);
            const officesInArea = normalizedOffices.filter((o) => normalizeArea(canonicalizeAreaName(o.area)) === areaNorm);
            if (!officesInArea.length) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: 'В этом округе нет отделений',
                details: `Округ: ${userArea}`
              });
              return;
            }

            const nearest = findNearestGeodesicMany(ymaps, userCoords, officesInArea);
            if (!nearest || !nearest.offices.length) {
              reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
                title: 'Не удалось подобрать отделение',
                details: ''
              });
              return;
            }
            const scored = nearest.offices.map((o) => ({ ...o, meters: nearest.meters }));
            const resolvedAddressLine =
              typeof first.getAddressLine === 'function' ? first.getAddressLine() : address;

            map.geoObjects.removeAll();

            const userPinUrl = buildYandexMapsPinUrl({
              lat: userCoords[0],
              lon: userCoords[1],
              text: String(resolvedAddressLine || address || '').trim(),
              zoom: 16
            });
            const userBalloon =
              escapeHtml(String(resolvedAddressLine || address || '').trim()) +
              yandexOutboundLinkAnchor(userPinUrl);

            const userPlacemark = new ymaps.Placemark(
              userCoords,
              { hintContent: 'Вы здесь', balloonContent: userBalloon },
              { preset: 'islands#blueCircleIcon' }
            );

            const officePlacemarks = scored
              .filter((o) => Array.isArray(o.coords) && o.coords.length === 2)
              .map(
                (o) =>
                  new ymaps.Placemark(
                    o.coords,
                    {
                      hintContent: o.name,
                      balloonContent: formatOfficeBalloon(o, {
                        distance: o.meters,
                        outboundUrl: officeToYandexOutboundUrl(o)
                      })
                    },
                    officePinOptions(OFFICE_ICON_DATA_URL)
                  )
              );

            map.geoObjects.add(userPlacemark);
            officePlacemarks.forEach((pm) => map.geoObjects.add(pm));

            const primaryOffice = scored[0];
            const officeShareLabel = primaryOffice
              ? [primaryOffice.name, primaryOffice.address].filter(Boolean).join(', ').trim()
              : '';
            lastYandexMapsShareText =
              officeShareLabel || String(resolvedAddressLine || address || '').trim();
            const primaryCoords =
              primaryOffice && Array.isArray(primaryOffice.coords) && primaryOffice.coords.length === 2
                ? primaryOffice.coords
                : null;
            if (
              primaryCoords &&
              Number.isFinite(primaryCoords[0]) &&
              Number.isFinite(primaryCoords[1])
            ) {
              lastYandexMapsOfficePt = `${primaryCoords[1]},${primaryCoords[0]}`;
            } else {
              lastYandexMapsOfficePt = '';
            }
            renderResult(resultSuccessEl, statusEl, contentErrorEl, {
              offices: scored,
              area: userArea,
              addressLine: resolvedAddressLine
            });
            renderStatus(statusEl, { type: 'info', title: 'Готово' });
            const primaryDist =
              primaryOffice && Number.isFinite(primaryOffice.meters) ? primaryOffice.meters : nearest.meters;
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (destroyed || seq !== searchSeq) return;
                fitMapToSearchPins(ymaps, map, {
                  userCoords,
                  primaryCoords,
                  primaryDistMeters: primaryDist
                });
                nudgeMapContainerSize();
                scrollMapIntoViewCenter();
              });
            });
          } catch (e) {
            reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
              title: 'Ошибка поиска',
              details: e && e.message ? String(e.message) : 'Попробуйте позже'
            });
          } finally {
            setUiState(controls, { loading: false });
          }
        }

        button.addEventListener('click', handleSearch);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') handleSearch();
        });
      })
      .catch((e) => {
        if (destroyed) return;
        reportSearchFailure(statusEl, contentErrorEl, resultSuccessEl, {
          title: 'Карта недоступна',
          details: e && e.message ? String(e.message) : 'Проверьте подключение Яндекс.Карт'
        });
      });

    return {
      destroy() {
        destroyed = true;
        if (yandexOutboundLinkObserver) {
          try {
            yandexOutboundLinkObserver.disconnect();
          } catch (_) {}
          yandexOutboundLinkObserver = null;
        }
        if (map) {
          try {
            map.destroy();
          } catch (_) {}
        }
        container.innerHTML = '';
      }
    };
  }

  window.BranchFinderWidget = { init };
})();