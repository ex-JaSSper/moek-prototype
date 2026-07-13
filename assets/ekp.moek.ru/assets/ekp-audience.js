/**
 * EKP multi-segment menu (prod).
 * Tilda: перед </body> — ekp-menu-controller.js + этот файл.
 *
 * Супер-меню: навигация через ссылки Tilda (см. docs/TILDA-CHECKLIST.md).
 * JS: data-audience-entry fallback + menuMap на entry-страницах.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ekp_audience';
  var DEFAULT_AUDIENCE = 'private';
  var SUPER_MENU_ROOT_ID = 'rec1341410431';

  var UK_MENU_MAP = {
    'ux-yk-menu1_yk': '/ux-yk-menu2_yk',
    'ux-yk-menu1_statklientom': '/ux-yk-menu2_statklientom',
    'ux-yk-menu1_pribori': '/ux-yk-menu2_pribor',
    'ux-yk-menu1_servis': '/ux-yk-menu2_servis',
    'ux-yk-menu1_uslugi': '/ux-yk-menu2_uslugi',
    'ux-yk-menu1_pomosh': '/ux-yk-menu2_pomosh',
    'ux-yk-menu1_poisk': '/ux-yk-menu2_poisk',
    'ux-yk-menu1_soobshit': '/ux-yk-menu2_soobshit',
    'ux-yk-menu1_rasheti': '/ux-yk-menu2_rasheti',
    'ux-yk-menu1_oplata': '/ux-yk-menu2_oplata'
  };

  var PRIVATE_MENU_MAP = {
    'ux-menu1_statklientom': '/page139637106.html',
    'ux-menu1_chetchiki': '/page139637236.html',
    'ux-menu1_rasheti': '/page139637216.html',
    'ux-menu1_pomosh': '/page139637186.html',
    'ux-menu1_oplata': '/page139637176.html',
    'ux-menu1_servis': '/page139637166.html',
    'ux-menu1_uslugi': '/page139637156.html',
    'ux-menu1_poisk': '/page139637146.html',
    'ux-menu1_soobshit': '/page139637126.html',
    'ux-menu1_fiz': '/page137649216.html'
  };

  var SO_MENU_MAP = {
    'ux-so-menu1_statklientom': '/ux-so-menu2_statklientom',
    'ux-so-menu1_pribor': '/ux-so-menu2_pribor',
    'ux-so-menu1_rasheti': '/ux-so-menu2_rasheti',
    'ux-so-menu1_poisk': '/ux-so-menu2_poisk',
    'ux-so-menu1_so': '/ux-so-menu2_so'
  };

  var KB_MENU_MAP = {
    'ux-kb-menu1_kb': '/ux-kb-menu2_kb',
    'ux-kb-menu1_statklientom': '/ux-kb-menu2_statklientom',
    'ux-kb-menu1_pribor': '/ux-kb-menu2_pribor',
    'ux-kb-menu1_rasheti': '/ux-kb-menu2_rasheti',
    'ux-kb-menu1_poisk': '/ux-kb-menu2_poisk',
    'ux-kb-menu1_pomosh': '/ux-kb-menu2_pomosh',
    'ux-kb-menu1_servis': '/ux-kb-menu2_servis',
    'ux-kb-menu1_uslugi': '/ux-kb-menu2_uslugi',
    'ux-kb-menu1_kbobshit': '/ux-kb-menu2_kbobshit'
  };

  var NO_MENU_MAP = {
    'ux-no-menu1_no': '/ux-no-menu2_no',
    'ux-no-menu1_statklientom': '/ux-no-menu2_statklientom',
    'ux-no-menu1_pribor': '/ux-no-menu2_pribor',
    'ux-no-menu1_rasheti': '/ux-no-menu2_rasheti',
    'ux-no-menu1_poisk': '/ux-no-menu2_poisk',
    'ux-no-menu1_pomosh': '/ux-no-menu2_pomosh',
    'ux-no-menu1_servis': '/ux-no-menu2_servis',
    'ux-no-menu1_uslugi': '/ux-no-menu2_uslugi',
    'ux-no-menu1_noobshit': '/ux-no-menu2_noobshit'
  };

  var MB_MENU_MAP = {
    'ux-mb-menu1_mb': '/ux-mb-menu2_mb',
    'ux-mb-menu1_statklientom': '/ux-mb-menu2_statklientom',
    'ux-mb-menu1_pribor': '/ux-mb-menu2_pribor',
    'ux-mb-menu1_rasheti': '/ux-mb-menu2_rasheti',
    'ux-mb-menu1_poisk': '/ux-mb-menu2_poisk',
    'ux-mb-menu1_pomosh': '/ux-mb-menu2_pomosh',
    'ux-mb-menu1_servis': '/ux-mb-menu2_servis',
    'ux-mb-menu1_uslugi': '/ux-mb-menu2_uslugi',
    'ux-mb-menu1_mbobshit': '/ux-mb-menu2_mbobshit'
  };

  var PS_MENU_MAP = {
    'ux-ps-menu1_ps': '/ux-ps-menu2_ps',
    'ux-ps-menu1_statklientom': '/ux-ps-menu2_statklientom',
    'ux-ps-menu1_zaiavki': '/ux-ps-menu2_zaiavki',
    'ux-ps-menu1_poisk': '/ux-ps-menu2_poisk',
    'ux-ps-menu1_pomosh': '/ux-ps-menu2_pomosh',
    'ux-ps-menu1_servis': '/ux-ps-menu2_servis',
    'ux-ps-menu1_uslugi': '/ux-ps-menu2_uslugi',
    'ux-ps-menu1_psobshit': '/ux-ps-menu2_psobshit'
  };

  /** Текст карточки супер-меню → id (fallback без href в Tilda) */
  var SUPER_MENU_TEXT_MATCHERS = [
    { re: /сервисным|доверенным компаниям потребителей моэк/i, id: 'service_orgs' },
    { re: /управляющим|в жилых домах/i, id: 'uk' },
    { re: /частным лицам|на прямых договорах/i, id: 'private' },
    { re: /крупному бизнесу/i, id: 'large_business' },
    { re: /некоммерческим|некоммерческие организации/i, id: 'nonprofit' },
    { re: /малому бизнесу/i, id: 'small_business' },
    { re: /подключение к сетям|подключению к сетям/i, id: 'grid_connection' },
    { re: /каталог/i, id: 'catalog' }
  ];

  var AUDIENCE_REGISTRY = {
    private: {
      label: 'Частным лицам',
      status: 'live',
      entryPath: '/',
      menuBar: '/menu',
      menuMap: PRIVATE_MENU_MAP,
      overlayTop: '66px'
    },
    uk: {
      label: 'Управляющим компаниям',
      status: 'live',
      entryPath: '/ux-yk-header',
      menuBar: '/yk-menu',
      menuMap: UK_MENU_MAP,
      overlayTop: '66px',
      pathHints: ['/ux-yk-header', '/yk-menu', '/ux-yk-menu2_']
    },
    service_orgs: {
      label: 'Сервисным организациям',
      status: 'live',
      entryPath: '/ux-so-header',
      menuBar: '/so-menu',
      menuMap: SO_MENU_MAP,
      overlayTop: '66px',
      pathHints: ['/ux-so-header', '/so-menu', '/ux-so-menu2_']
    },
    large_business: {
      label: 'Крупному бизнесу',
      status: 'pilot',
      entryPath: '/ux-kb-header',
      menuBar: '/kb-menu',
      menuMap: KB_MENU_MAP,
      overlayTop: '66px',
      pathHints: ['/ux-kb-header', '/kb-menu', '/ux-kb-menu2_']
    },
    nonprofit: {
      label: 'Некоммерческим организациям',
      status: 'pilot',
      entryPath: '/ux-no-header',
      menuBar: '/no-menu',
      menuMap: NO_MENU_MAP,
      overlayTop: '66px',
      pathHints: ['/ux-no-header', '/no-menu', '/ux-no-menu2_']
    },
    small_business: {
      label: 'Малому бизнесу',
      status: 'pilot',
      entryPath: '/ux-mb-header',
      menuBar: '/mb-menu',
      menuMap: MB_MENU_MAP,
      overlayTop: '66px',
      pathHints: ['/ux-mb-header', '/mb-menu', '/ux-mb-menu2_']
    },
    grid_connection: {
      label: 'Подключение к сетям',
      status: 'pilot',
      entryPath: '/ux-ps-header',
      menuBar: '/ps-menu',
      menuMap: PS_MENU_MAP,
      overlayTop: '66px',
      pathHints: ['/ux-ps-header', '/ps-menu', '/ux-ps-menu2_']
    },
    catalog: {
      label: 'Каталог',
      status: 'soon',
      entryPath: null,
      menuBar: '/kt-menu',
      menuMap: {},
      overlayTop: '66px',
      pathHints: ['/kt-menu', '/ux-kt-menu2_']
    }
  };

  function getRegistry() {
    return AUDIENCE_REGISTRY;
  }

  function isValidAudience(id) {
    return id && Object.prototype.hasOwnProperty.call(AUDIENCE_REGISTRY, id);
  }

  function isLiveAudience(id) {
    var cfg = AUDIENCE_REGISTRY[id];
    return cfg && (cfg.status === 'live' || cfg.status === 'pilot') && cfg.entryPath;
  }

  function inferAudienceFromPath() {
    var path = window.location.pathname.toLowerCase();
    var best = null;
    var bestLen = 0;

    for (var id in AUDIENCE_REGISTRY) {
      if (!Object.prototype.hasOwnProperty.call(AUDIENCE_REGISTRY, id)) continue;
      var hints = AUDIENCE_REGISTRY[id].pathHints;
      if (!hints) continue;
      for (var i = 0; i < hints.length; i++) {
        var hint = hints[i].toLowerCase();
        if (path.indexOf(hint) !== -1 && hint.length > bestLen) {
          best = id;
          bestLen = hint.length;
        }
      }
    }
    return best;
  }

  function getAudience() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('audience');
    if (fromUrl && isValidAudience(fromUrl)) return fromUrl;

    var fromPath = inferAudienceFromPath();
    if (fromPath) return fromPath;

    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidAudience(stored)) return stored;

    return DEFAULT_AUDIENCE;
  }

  function normalizeText(text) {
    return (text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function matchAudienceByCardText(label) {
    if (!label) return null;
    for (var i = 0; i < SUPER_MENU_TEXT_MATCHERS.length; i++) {
      if (SUPER_MENU_TEXT_MATCHERS[i].re.test(label)) {
        return SUPER_MENU_TEXT_MATCHERS[i].id;
      }
    }
    return null;
  }

  function entryPathForAudience(audienceId) {
    var cfg = AUDIENCE_REGISTRY[audienceId];
    return cfg && cfg.entryPath ? cfg.entryPath : null;
  }

  function tagSuperMenuEntries() {
    var root = document.getElementById(SUPER_MENU_ROOT_ID);
    if (!root) return;

    function tagEl(el, audienceId) {
      var entry = entryPathForAudience(audienceId);
      if (!entry || !isLiveAudience(audienceId)) return;
      el.setAttribute('data-audience-entry', entry);
      el.style.cursor = 'pointer';
    }

    root.querySelectorAll('[data-elem-type="shape"]').forEach(function (shape) {
      var label = normalizeText(shape.textContent);
      tagEl(shape, matchAudienceByCardText(label));
    });

    root.querySelectorAll('.tn-elem.page').forEach(function (pageEl) {
      tagEl(pageEl, matchAudienceByCardText(normalizeText(pageEl.textContent)));
    });

    root.querySelectorAll('[data-audience-option]').forEach(function (el) {
      var id = el.getAttribute('data-audience-option');
      if (id) tagEl(el, id);
    });
  }

  function collectMenuBars() {
    var bars = ['/menu'];
    for (var id in AUDIENCE_REGISTRY) {
      if (!Object.prototype.hasOwnProperty.call(AUDIENCE_REGISTRY, id)) continue;
      var bar = AUDIENCE_REGISTRY[id].menuBar;
      if (bar && bars.indexOf(bar) === -1) bars.push(bar);
    }
    return bars;
  }

  function applyMenuIframes(audienceId) {
    var cfg = AUDIENCE_REGISTRY[audienceId];
    if (!cfg || !cfg.menuBar) return;

    var bars = collectMenuBars();
    document.querySelectorAll('iframe[src]').forEach(function (iframe) {
      var src = iframe.getAttribute('src') || '';
      var isMenuIframe = bars.some(function (bar) {
        return src.indexOf(bar) !== -1;
      });
      if (isMenuIframe) {
        iframe.setAttribute('src', cfg.menuBar);
      }
    });
  }

  function applyMenuController(audienceId) {
    var cfg = AUDIENCE_REGISTRY[audienceId];
    if (!cfg || !window.EKPMenuController) return;

    var map = cfg.menuMap || {};
    if (Object.keys(map).length === 0) return;

    window.EKPMenuController.init({
      menuMap: map,
      overlayTop: cfg.overlayTop || '66px'
    });
    window.EKPMenuController.setMenuMap(map);
  }

  function applyAudience(id, options) {
    options = options || {};
    if (!isValidAudience(id)) id = DEFAULT_AUDIENCE;

    var cfg = AUDIENCE_REGISTRY[id];
    document.documentElement.dataset.audience = id;
    localStorage.setItem(STORAGE_KEY, id);

    applyMenuIframes(id);
    applyMenuController(id);

    if (!options.silent) {
      window.dispatchEvent(
        new CustomEvent('ekp-audience-change', { detail: { id: id, config: cfg } })
      );
    }
  }

  function buildEntryUrl(audienceId) {
    var entry = entryPathForAudience(audienceId);
    if (!entry) return null;
    var url = new URL(entry, window.location.origin);
    url.searchParams.set('audience', audienceId);
    return url.pathname + url.search;
  }

  function navigateToEntry(audienceId) {
    if (!isLiveAudience(audienceId)) return;
    var href = buildEntryUrl(audienceId);
    if (!href) return;
    localStorage.setItem(STORAGE_KEY, audienceId);
    window.location.assign(href);
  }

  function setAudience(id) {
    applyAudience(id);
    var url = new URL(window.location.href);
    url.searchParams.set('audience', id);
    window.history.replaceState({}, '', url);
  }

  /** Fallback: клик по data-audience-entry, если в Tilda ещё нет <a href> */
  function bindSuperMenuEntryFallback() {
    document.addEventListener('click', function (e) {
      var root = document.getElementById(SUPER_MENU_ROOT_ID);
      if (!root || !root.contains(e.target)) return;

      var link = e.target.closest('a[href]');
      if (link) {
        var href = link.getAttribute('href');
        if (href && href !== '#' && href.indexOf('javascript:') !== 0) {
          return;
        }
      }

      var el = e.target.closest('[data-audience-entry]');
      if (!el) return;

      var path = el.getAttribute('data-audience-entry');
      if (!path) return;

      e.preventDefault();
      window.location.assign(path);
    });
  }

  function init() {
    var id = getAudience();
    applyAudience(id, { silent: true });
    tagSuperMenuEntries();
    bindSuperMenuEntryFallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.EKP = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_AUDIENCE: DEFAULT_AUDIENCE,
    SUPER_MENU_ROOT_ID: SUPER_MENU_ROOT_ID,
    AUDIENCE_REGISTRY: AUDIENCE_REGISTRY,
    getRegistry: getRegistry,
    getAudience: getAudience,
    setAudience: setAudience,
    applyAudience: applyAudience,
    navigateToEntry: navigateToEntry,
    buildEntryUrl: buildEntryUrl
  };
})();
