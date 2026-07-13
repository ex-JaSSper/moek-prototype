(function () {
  const MSG_ADDRESS_MOSCOW_ONLY = 'Введите адрес в пределах г. Москвы';

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function debounce(fn, ms) {
    let t = null;
    const wrapped = function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn.apply(this, args);
      }, ms);
    };
    wrapped.cancel = function () {
      if (t) clearTimeout(t);
      t = null;
    };
    return wrapped;
  }

  function scriptDir() {
    const el = document.currentScript;
    if (el && el.src) return el.src.replace(/[^/]+$/, '');
    return '';
  }

  function resolveAsset(relativePath) {
    const fromScript = scriptDir();
    if (fromScript) {
      try {
        return new URL(relativePath, fromScript).href;
      } catch (_) {}
    }
    try {
      const base = location.href.replace(/[^/]+$/, '');
      return new URL(relativePath, base || location.href).href;
    } catch {
      return relativePath;
    }
  }

  function createWorkerWithFallback(workerUrl) {
    try {
      return Promise.resolve(new Worker(workerUrl, { type: 'classic' }));
    } catch (_) {}

    return fetch(workerUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((code) => {
        const blob = new Blob([code], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const w = new Worker(blobUrl, { type: 'classic' });
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        return w;
      });
  }

  function startupErrorMessage(err, kind, url) {
    const msg = err && err.message ? String(err.message) : String(err || 'unknown');
    if (location.protocol === 'file:') {
      return 'Сервер не запущен';
    }
    if (kind === 'worker') {
      return `Не удалось загрузить worker (${url}): ${msg}`;
    }
    if (kind === 'csv') {
      return `Не удалось загрузить CSV (${url}): ${msg}`;
    }
    return `Не удалось запустить поиск: ${msg}`;
  }

  function normalizeTelHref(phone) {
    const cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('8')) return `+7${cleaned.slice(1)}`;
    return cleaned;
  }

  function highlightAddressHtml(address, query) {
    const a = String(address || '');
    const q = String(query || '').trim();
    if (!q) return escapeHtml(a);
    const lower = a.toLowerCase();
    const ql = q.toLowerCase();
    const idx = lower.indexOf(ql);
    if (idx === -1) return escapeHtml(a);
    return (
      escapeHtml(a.slice(0, idx)) +
      `<mark class="uk-widget__highlight">${escapeHtml(a.slice(idx, idx + ql.length))}</mark>` +
      escapeHtml(a.slice(idx + ql.length))
    );
  }

  function formatValue(value, emptyLabel) {
    const v = String(value == null ? '' : value).trim();
    return v || emptyLabel;
  }

  function escapeMultilineHtml(value) {
    return String(value == null ? '' : value)
      .split(/\r?\n/)
      .map((line) => escapeHtml(line))
      .join('<br>');
  }

  /**
   * Лупа из Figma (экспорт SVG); id градиентов уникальны на инстанс.
   * @param {string} uid безопасный суффикс (например widgetId)
   */
  function searchLeadingIconSvg(uid) {
    const g0 = `ukw-g0-${uid}`;
    const g1 = `ukw-g1-${uid}`;
    return (
      `<svg class="uk-widget__search-leading-svg" width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
      `<circle cx="20" cy="20" r="7" fill="none" stroke="url(#${g0})" stroke-width="2"/>` +
      `<path fill="none" d="M25 25L28.5 28.5" stroke="url(#${g1})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<defs>` +
      `<radialGradient id="${g0}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(13.3717 27) scale(13.1947 86.7554)">` +
      `<stop stop-color="#005DC7"/>` +
      `<stop offset="1" stop-color="#3384E0"/>` +
      `</radialGradient>` +
      `<radialGradient id="${g1}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(25.0929 28.5) scale(3.29867 21.6889)">` +
      `<stop stop-color="#005DC7"/>` +
      `<stop offset="1" stop-color="#3384E0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `</svg>`
    );
  }

  function measureWidgetContentHeight(root) {
    let h = Math.max(root.scrollHeight, root.offsetHeight);
    const suggest = root.querySelector('[data-uk-suggest]');
    if (!suggest) return h;
    const suggestDisplay = suggest.style.display || window.getComputedStyle(suggest).display;
    if (suggestDisplay === 'none') return h;
    const rootRect = root.getBoundingClientRect();
    const suggestRect = suggest.getBoundingClientRect();
    const list = suggest.querySelector('.uk-widget__suggest-list');
    const listRect = list ? list.getBoundingClientRect() : suggestRect;
    const contentBottom = Math.max(suggestRect.bottom, listRect.bottom) - rootRect.top;
    if (contentBottom > 0) h = Math.max(h, Math.ceil(contentBottom));
    return h;
  }

  function isTildaLayoutNode(el) {
    if (!el || !el.classList) return false;
    const cls = el.classList;
    return (
      cls.contains('t-rec') ||
      cls.contains('t123') ||
      cls.contains('t-container') ||
      cls.contains('t-container_100') ||
      cls.contains('t-width') ||
      cls.contains('t-col') ||
      (el.id && /^rec/i.test(el.id))
    );
  }

  /** Zero Block T396: artboard/filter/carrier остаются на 251px в CSS Tilda, rec растёт — белая полоса. */
  function syncTildaZeroBlockHeight(recEl, heightPx) {
    if (!recEl || !recEl.querySelector('.t396')) return false;

    const layers = recEl.querySelectorAll('.t396__artboard, .t396__filter, .t396__carrier');
    for (let i = 0; i < layers.length; i++) {
      layers[i].style.setProperty('height', 'auto', 'important');
      layers[i].style.setProperty('min-height', heightPx, 'important');
      layers[i].style.setProperty('overflow', 'visible', 'important');
    }

    const mount = recEl.querySelector('.uk-widget, #uk-address-widget-mount');
    if (mount) {
      let node = mount.parentElement;
      while (node && node !== recEl) {
        if (node.classList) {
          if (node.classList.contains('tn-elem') || node.classList.contains('tn-atom')) {
            node.style.setProperty('height', 'auto', 'important');
            node.style.setProperty('min-height', '0', 'important');
            node.style.setProperty('overflow', 'visible', 'important');
          }
        }
        node = node.parentElement;
      }
    }

    const artboard = recEl.querySelector('.t396__artboard');
    if (artboard) {
      try {
        const bg = window.getComputedStyle(artboard).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          recEl.style.setProperty('background-color', bg, 'important');
        }
      } catch (_) {}
    }

    return true;
  }

  /** Высота блока Tilda; для T396 дополнительно синхронизирует artboard. */
  function applyTildaHostHeight(root, heightPx) {
    let recEl = null;
    let el = root.parentElement;
    while (el && el !== document.documentElement) {
      const cls = el.classList;
      if (!recEl && ((cls && cls.contains('t-rec')) || (el.id && /^rec/i.test(el.id)))) {
        recEl = el;
      }
      if (isTildaLayoutNode(el)) {
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('height', 'auto', 'important');
        if (el === recEl) {
          el.style.setProperty('min-height', heightPx, 'important');
        } else {
          el.style.setProperty('min-height', '0', 'important');
        }
      }
      el = el.parentElement;
    }
    if (recEl) syncTildaZeroBlockHeight(recEl, heightPx);
  }

  function applyTildaIframeHeight(frame, heightPx) {
    if (!frame) return;
    frame.style.height = heightPx;
    frame.style.minHeight = heightPx;
    frame.style.overflow = 'hidden';
    try {
      const rec = frame.closest('.t-rec, .t123, [id^="rec"]');
      if (!rec) return;
      rec.style.setProperty('height', 'auto', 'important');
      rec.style.setProperty('min-height', '0', 'important');
      rec.style.setProperty('overflow', 'visible', 'important');
    } catch (_) {}
  }

  function onUkWidgetResizeMessage(ev) {
    const data = ev.data;
    if (!data || data.type !== 'uk-widget:resize' || typeof data.height !== 'number') return;
    const heightPx = Math.max(280, Math.ceil(data.height)) + 'px';
    const frames = document.querySelectorAll('iframe');
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow !== ev.source) continue;
      applyTildaIframeHeight(frames[i], heightPx);
      return;
    }
  }

  function ensureParentTildaResizeListener() {
    if (window.parent === window) return false;
    try {
      const parentWin = window.parent;
      if (parentWin.__ukWidgetTildaResizeBound) return true;
      parentWin.__ukWidgetTildaResizeBound = true;
      parentWin.addEventListener('message', onUkWidgetResizeMessage);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** @returns {() => void} */
  function setupEmbedAutoResize(root, widgetId, opts) {
    if (opts.embedAutoResize === false) return function () {};

    const frameEl = window.frameElement;
    const inIframe = window.parent !== window;
    if (inIframe) ensureParentTildaResizeListener();

    const pad = Number(opts.embedResizePadding) >= 0 ? Number(opts.embedResizePadding) : 12;
    let lastHeight = 0;
    let raf = 0;

    function syncEmbedHeight() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        raf = 0;
        const height = Math.ceil(measureWidgetContentHeight(root) + pad);
        if (height < 1 || height === lastHeight) return;
        lastHeight = height;
        const heightPx = height + 'px';
        if (frameEl) {
          applyTildaIframeHeight(frameEl, heightPx);
        }
        if (inIframe) {
          try {
            window.parent.postMessage(
              { type: 'uk-widget:resize', height: height, widgetId: widgetId },
              '*'
            );
          } catch (_) {}
        } else if (!frameEl) {
          applyTildaHostHeight(root, heightPx);
        }
      });
    }

    function syncEmbedHeightSoon() {
      syncEmbedHeight();
      requestAnimationFrame(syncEmbedHeight);
      setTimeout(syncEmbedHeight, 150);
    }

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(syncEmbedHeight).observe(root);
    }
    window.addEventListener('resize', syncEmbedHeight, { passive: true });
    syncEmbedHeightSoon();
    return syncEmbedHeightSoon;
  }

  /**
   * @param {HTMLElement} container
   * @param {{
   *   csvUrl?: string,
   *   workerUrl?: string,
   *   suggestDebounceMs?: number,
   *   suggestLimit?: number (по умолчанию 50, максимум 50),
   *   addressNotFoundMessage?: string,
   *   placeholder?: string (по умолчанию пусто — атрибут не выводится),
   *   showSuggestions?: boolean,
   *   phoneAsLink?: boolean,
   *   emptyValueLabel?: string,
   *   resultMode?: 'single' | 'multiple',
   *   onResolved?: (payload: any) => void,
   *   onCleared?: () => void,
   *   heading?: string,
   *   searchLabel?: string,
   *   findButtonLabel?: string,
   *   secondaryButtonLabel?: string,
   *   secondaryButtonHref?: string,
   *   secondaryButtonNewTab?: boolean,
   *   embedAutoResize?: boolean,
   *   embedResizePadding?: number
   * }} [options]
   */
  function initUkAddressWidget(container, options) {
    if (!container) throw new Error('UkAddressWidget: нет контейнера');

    const opts = options || {};
    const csvUrl = opts.csvUrl || resolveAsset('uk-contacts.csv');
    const workerUrl = opts.workerUrl || resolveAsset('uk-search-worker.js');
    const debounceMs = Number(opts.suggestDebounceMs) > 0 ? Number(opts.suggestDebounceMs) : 220;
    const suggestLimit = Math.min(50, Math.max(1, Number(opts.suggestLimit) || 50));
    const heading =
      opts.heading !== undefined && opts.heading !== null
        ? String(opts.heading)
        : 'Узнать свою Управляющую компанию по\u00a0адресу';
    const defaultInputHint = 'Введите адрес';
    const searchLabel = opts.searchLabel !== undefined ? String(opts.searchLabel) : defaultInputHint;
    const inputPlaceholder =
      opts.inputPlaceholder !== undefined ? String(opts.inputPlaceholder) : defaultInputHint;
    const emptyInputError =
      opts.emptyInputErrorMessage !== undefined ? String(opts.emptyInputErrorMessage) : defaultInputHint;
    const addressNotFoundMessage =
      opts.addressNotFoundMessage !== undefined
        ? String(opts.addressNotFoundMessage)
        : MSG_ADDRESS_MOSCOW_ONLY;
    const findButtonLabel = opts.findButtonLabel !== undefined ? String(opts.findButtonLabel) : 'Найти';
    const secondaryLabelRaw = opts.secondaryButtonLabel != null ? String(opts.secondaryButtonLabel) : '';
    const secondaryLabel = secondaryLabelRaw.trim();
    const secondaryHref = opts.secondaryButtonHref != null ? String(opts.secondaryButtonHref).trim() : '';
    const secondaryNewTab = opts.secondaryButtonNewTab === true;
    const hasCustomPlaceholder = opts.placeholder != null;
    const placeholder = hasCustomPlaceholder ? String(opts.placeholder) : '';
    const showSuggestions = opts.showSuggestions !== false;
    const phoneAsLink = opts.phoneAsLink === true;
    const emptyValueLabel = String(opts.emptyValueLabel || 'не указан');
    const resultMode = opts.resultMode === 'multiple' ? 'multiple' : 'single';
    const onResolved = typeof opts.onResolved === 'function' ? opts.onResolved : null;
    const onCleared = typeof opts.onCleared === 'function' ? opts.onCleared : null;

    const widgetId = `uk-widget-${Math.random().toString(36).slice(2, 9)}`;
    const gradientUid = widgetId.replace(/[^a-zA-Z0-9_-]/g, '');
    const inputId = `${widgetId}-input`;
    const headingHtml = heading.trim()
      ? `<h2 class="uk-widget__heading">${escapeHtml(heading)}</h2>`
      : '';
    const hasSearchLeading = searchLabel.trim() !== '';
    const searchLeadingHtml = hasSearchLeading
      ? `<div class="uk-widget__search-leading" aria-hidden="true">
        <span class="uk-widget__search-leading-icon" aria-hidden="true">${searchLeadingIconSvg(gradientUid)}</span>
        <span class="uk-widget__search-leading-text">${escapeHtml(searchLabel)}</span>
      </div>`
      : '';
    let secondaryHtml = '';
    if (secondaryLabel) {
      const rel = secondaryNewTab ? ' rel="noopener noreferrer"' : '';
      const target = secondaryNewTab ? ' target="_blank"' : '';
      if (secondaryHref) {
        secondaryHtml = `<a class="uk-widget__button uk-widget__button--secondary" href="${escapeHtml(secondaryHref)}"${target}${rel}>${escapeHtml(secondaryLabel)}</a>`;
      } else {
        secondaryHtml = `<button type="button" class="uk-widget__button uk-widget__button--secondary">${escapeHtml(secondaryLabel)}</button>`;
      }
    }
    const rootClasses = ['uk-widget'];
    if (!hasSearchLeading) rootClasses.push('uk-widget--no-leading');
    if (!heading.trim()) rootClasses.push('uk-widget--no-heading');

    container.innerHTML = `
      <div class="${rootClasses.join(' ')}" data-uk-widget="${escapeHtml(widgetId)}">
        <div class="uk-widget__section uk-widget__section--search">
          <div class="uk-widget__search-wrap">
            <div class="uk-widget__search-top">
              ${headingHtml}
              <div class="uk-widget__search-row">
                <label class="uk-widget__label uk-widget__search-bar" for="${escapeHtml(inputId)}">
                  ${searchLeadingHtml}
                  <span class="uk-widget__label-text">Адрес</span>
                  <div class="uk-widget__search-shell">
                    <div class="uk-widget__search-inner">
                      <span class="uk-widget__search-controls">
                        <span class="uk-widget__split">
                          <span class="uk-widget__field uk-widget__field--address">
                            <input id="${escapeHtml(inputId)}" class="uk-widget__input" type="text" inputmode="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${escapeHtml(placeholder)}" aria-autocomplete="list" aria-controls="${escapeHtml(widgetId)}-listbox" aria-expanded="false" />
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>
                </label>
                <div class="uk-widget__search-actions">
                  ${secondaryHtml}
                  <button type="button" class="uk-widget__clear" aria-label="Очистить" title="Очистить" hidden></button>
                  <button class="uk-widget__button uk-widget__button--primary" type="button"><span class="uk-widget__button-label">${escapeHtml(findButtonLabel)}</span></button>
                </div>
              </div>
              <div class="uk-widget__suggest" data-uk-suggest></div>
            </div>
          </div>
        </div>
        <div class="uk-widget__section uk-widget__section--main">
          <div class="uk-widget__content">
            <div class="uk-widget__error" hidden></div>
            <div class="uk-widget__result" hidden></div>
          </div>
        </div>
      </div>
    `;

    const root = container.querySelector('[data-uk-widget]');
    const input = /** @type {HTMLInputElement} */ (root.querySelector('.uk-widget__input'));
    const clearBtn = root.querySelector('.uk-widget__clear');
    const searchBtn = root.querySelector('.uk-widget__button--primary');
    const suggestBox = root.querySelector('[data-uk-suggest]');
    const errorEl = root.querySelector('.uk-widget__error');
    const resultEl = root.querySelector('.uk-widget__result');

    let worker = null;
    let ready = false;
    let suggestItems = [];
    let activeSuggest = -1;
    let inputVersion = 0;
    let lastResolveRequestId = 0;
    let pendingResolveInputVersion = -1;
    let isResolving = false;
    const syncEmbedHeight = setupEmbedAutoResize(root, widgetId, opts);

    function syncHasValueState() {
      const hasValue = String(input.value || '').trim().length > 0;
      root.classList.toggle('uk-widget--has-value', hasValue);
    }

    function syncPlaceholderForState() {
      const hasValue = String(input.value || '').trim().length > 0;
      const isFocused = document.activeElement === input;
      if (hasValue) {
        input.placeholder = '';
      } else if (hasCustomPlaceholder) {
        input.placeholder = placeholder;
      } else if (isFocused) {
        input.placeholder = inputPlaceholder;
      } else {
        input.placeholder = '';
      }
      syncHasValueState();
    }

    function setError(msg) {
      if (!msg) {
        errorEl.hidden = true;
        errorEl.textContent = '';
        return;
      }
      errorEl.hidden = false;
      errorEl.textContent = msg;
      resultEl.hidden = true;
      resultEl.innerHTML = '';
    }

    function hideSuggest() {
      suggestBox.style.display = 'none';
      suggestBox.innerHTML = '';
      suggestItems = [];
      activeSuggest = -1;
      root.classList.remove('uk-widget--suggest-open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      syncEmbedHeight();
    }

    function showAddressNotFoundError() {
      hideSuggest();
      setError(addressNotFoundMessage);
      syncEmbedHeight();
    }

    function syncSuggestListOverflow(list) {
      if (!list || list.classList.contains('uk-widget__suggest-list--empty')) return;
      const needsScroll = list.scrollHeight > list.clientHeight + 1;
      list.classList.toggle('uk-widget__suggest-list--scroll', needsScroll);
      return needsScroll;
    }

    function renderSuggest(items, query) {
      if (!showSuggestions || !items || !items.length) {
        hideSuggest();
        return;
      }
      suggestItems = items;
      activeSuggest = -1;
      const listId = `${widgetId}-listbox`;
      const html = items
        .map(
          (it, i) =>
            `<div class="uk-widget__suggest-item" role="option" aria-selected="false" tabindex="-1" data-suggest-idx="${i}" id="${listId}-opt-${i}">${highlightAddressHtml(
              it.address,
              query
            )}</div>`
        )
        .join('');

      suggestBox.innerHTML = `<div class="uk-widget__suggest-list" id="${listId}" role="listbox">${html}</div>`;
      suggestBox.style.display = 'block';
      root.classList.add('uk-widget--suggest-open');
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
      syncEmbedHeight();
      requestAnimationFrame(function () {
        syncSuggestListOverflow(suggestBox.querySelector('.uk-widget__suggest-list'));
      });
    }

    function renderSuggestEmpty(message) {
      if (!showSuggestions) {
        hideSuggest();
        return;
      }
      const msg = String(message || 'Ничего не найдено');
      const listId = `${widgetId}-listbox`;
      suggestItems = [];
      activeSuggest = -1;
      suggestBox.innerHTML = `<div class="uk-widget__suggest-list uk-widget__suggest-list--empty" id="${listId}" role="listbox"><div class="uk-widget__suggest-empty"><span class="uk-widget__suggest-empty-text">${escapeHtml(msg)}</span></div></div>`;
      suggestBox.style.display = 'block';
      root.classList.add('uk-widget--suggest-open');
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
      syncEmbedHeight();
    }

    function renderPhone(value, emptyFallback) {
      const raw = String(value || '').trim();
      const emptyValue = emptyFallback != null ? String(emptyFallback) : emptyValueLabel;
      if (!raw) return `<span class="uk-widget__uk-cell-value">${escapeHtml(emptyValue)}</span>`;
      if (!phoneAsLink) return `<span class="uk-widget__uk-cell-value uk-widget__uk-phone">${escapeHtml(raw)}</span>`;
      const href = normalizeTelHref(raw);
      if (!href) return `<span class="uk-widget__uk-cell-value uk-widget__uk-phone">${escapeHtml(raw)}</span>`;
      return `<a class="uk-widget__uk-cell-value uk-widget__uk-cell-link uk-widget__uk-phone" href="tel:${escapeHtml(href)}">${escapeHtml(raw)}</a>`;
    }

    function renderEmail(value, emptyFallback) {
      const raw = String(value || '').trim();
      const emptyValue = emptyFallback != null ? String(emptyFallback) : emptyValueLabel;
      if (!raw) return `<span class="uk-widget__uk-cell-value">${escapeHtml(emptyValue)}</span>`;
      const href = `mailto:${raw}`;
      return `<a class="uk-widget__uk-cell-value uk-widget__uk-cell-link" href="${escapeHtml(href)}">${escapeHtml(raw)}</a>`;
    }

    function renderDashIfEmpty(value, emptyFallback) {
      const raw = String(value || '').trim();
      const emptyValue = emptyFallback != null ? String(emptyFallback) : emptyValueLabel;
      if (raw) return escapeMultilineHtml(raw);
      if (emptyValue === '-') return '<span class="uk-widget__uk-empty-dash">-</span>';
      return `<span class="uk-widget__uk-cell-value">${escapeHtml(emptyValue)}</span>`;
    }

    function renderManagement(person, position, emptyFallback) {
      const p = String(person || '').trim();
      const pos = String(position || '').trim();
      const emptyValue = emptyFallback != null ? String(emptyFallback) : emptyValueLabel;
      if (!p && !pos) {
        return `<span class="uk-widget__uk-cell-value">${escapeHtml(emptyValue)}</span>`;
      }
      return `
        ${p ? `<span class="uk-widget__uk-management-person">${escapeHtml(p)}</span>` : ''}
        ${pos ? `<span class="uk-widget__uk-management-position">${escapeHtml(pos)}</span>` : ''}
      `;
    }

    function resultRowKey(row) {
      return [
        row.companyName,
        row.companyAddress,
        row.phone,
        row.email,
        row.contactPerson,
        row.position,
        row.workSchedule
      ]
        .map((value) => String(value || '').trim())
        .join('|');
    }

    function prepareResultRows(rows) {
      const seen = new Set();
      const list = [];
      for (const row of rows || []) {
        if (!String(row.companyName || '').trim()) continue;
        const key = resultRowKey(row);
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(row);
      }
      return resultMode === 'single' ? list.slice(0, 1) : list;
    }

    function renderUkTableHeadHtml() {
      return `
        <div class="uk-widget__uk-table uk-widget__uk-table--global-head" aria-hidden="false">
          <div class="uk-widget__uk-table-head">
            <div class="uk-widget__uk-th">Наименование / Адрес УК</div>
            <div class="uk-widget__uk-th">График работы</div>
            <div class="uk-widget__uk-th">Телефон / Электронная почта</div>
            <div class="uk-widget__uk-th">Руководство</div>
          </div>
          <div class="uk-widget__uk-divider"></div>
        </div>`;
    }

    function renderUkSection(row) {
      const tableEmpty = '-';
      const companyName = formatValue(row.companyName, tableEmpty);
      const ukAddress = renderDashIfEmpty(row.companyAddress, tableEmpty);
      const workSchedule = renderDashIfEmpty(row.workSchedule, tableEmpty);
      const phoneHtml = renderPhone(row.phone, tableEmpty);
      const emailHtml = renderEmail(row.email, tableEmpty);
      const managementHtml = renderManagement(row.contactPerson, row.position, tableEmpty);

      return `
        <section class="uk-widget__uk-block">
          <div class="uk-widget__uk-name">${escapeHtml(companyName)}</div>
          <div class="uk-widget__uk-table">
            <div class="uk-widget__uk-table-row">
              <div class="uk-widget__uk-cell" data-label="Адрес УК">${ukAddress}</div>
              <div class="uk-widget__uk-cell" data-label="График работы">${workSchedule}</div>
              <div class="uk-widget__uk-cell uk-widget__uk-cell--contacts">
                <div class="uk-widget__uk-contact-field" data-label="Телефон">${phoneHtml}</div>
                <div class="uk-widget__uk-contact-field" data-label="Электронная почта">${emailHtml}</div>
              </div>
              <div class="uk-widget__uk-cell uk-widget__uk-cell--management" data-label="Руководство">
                ${managementHtml}
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function renderResult(rows) {
      const list = prepareResultRows(rows);
      if (!list.length) {
        resultEl.hidden = true;
        resultEl.innerHTML = '';
        syncEmbedHeight();
        return;
      }

      const kicker = list.length > 1 ? 'Вас обслуживают УК' : 'Вас обслуживает УК';
      const sections = list
        .map((row, index) => {
          const section = renderUkSection(row);
          if (index === list.length - 1) return section;
          return `${section}<div class="uk-widget__uk-section-divider" aria-hidden="true"></div>`;
        })
        .join('');

      resultEl.innerHTML = `
        <article class="uk-widget__uk-card${list.length === 1 ? ' uk-widget__uk-card--single' : ' uk-widget__uk-card--multi'}">
          <div class="uk-widget__uk-card-inner">
            <div class="uk-widget__uk-kicker">${escapeHtml(kicker)}</div>
            ${renderUkTableHeadHtml()}
            <div class="uk-widget__uk-stack">${sections}</div>
          </div>
        </article>
      `;
      resultEl.hidden = false;
      syncEmbedHeight();
      setTimeout(syncEmbedHeight, 100);
    }

    function runResolve(queryText) {
      if (!worker) return;
      const q = String(queryText != null ? queryText : input.value).trim();
      if (q.length < 2) {
        setError(emptyInputError);
        return;
      }
      if (!ready) {
        setError('Справочник еще загружается, подождите несколько секунд.');
        return;
      }
      hideSuggest();
      isResolving = true;
      lastResolveRequestId += 1;
      pendingResolveInputVersion = inputVersion;
      worker.postMessage({ type: 'resolve', query: q, requestId: lastResolveRequestId });
    }

    function updateActiveSuggest() {
      const items = suggestBox.querySelectorAll('.uk-widget__suggest-item');
      items.forEach((el, idx) => {
        const isActive = idx === activeSuggest;
        el.classList.toggle('uk-widget__suggest-item--active', isActive);
        el.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) {
          input.setAttribute('aria-activedescendant', el.id);
          try {
            el.scrollIntoView({ block: 'nearest' });
          } catch (_) {}
        }
      });
      if (activeSuggest < 0) {
        input.removeAttribute('aria-activedescendant');
      }
    }

    const runSuggest = debounce(function () {
      if (!showSuggestions || !worker || !ready) {
        hideSuggest();
        return;
      }
      const q = input.value.trim();
      if (q.length < 2) {
        hideSuggest();
        return;
      }
      worker.postMessage({ type: 'suggest', query: q, limit: suggestLimit });
    }, debounceMs);

    createWorkerWithFallback(workerUrl)
      .then((w) => {
        worker = w;
        worker.addEventListener('message', (e) => {
          const d = e.data || {};
          if (d.type === 'ready') {
            ready = true;
            return;
          }
          if (d.type === 'suggestResult') {
            if (isResolving) return;
            const currentQ = String(input.value || '').trim();
            const responseQ = String(d.query || '').trim();
            if (responseQ && responseQ !== currentQ) return;
            const items = Array.isArray(d.items) ? d.items : [];
            if (currentQ.length >= 2 && items.length === 0) {
              renderSuggestEmpty('Ничего не найдено');
              return;
            }
            renderSuggest(items, d.query || '');
            return;
          }
          if (d.type === 'resolveResult') {
            if (d.requestId !== lastResolveRequestId) return;
            if (pendingResolveInputVersion !== inputVersion) return;
            isResolving = false;
            pendingResolveInputVersion = -1;
            const res = d.result || {};
            if (!res.ok) {
              if (res.reason === 'short') {
                setError(emptyInputError);
              } else if (res.reason === 'none') {
                showAddressNotFoundError();
              } else {
                setError('Ничего не найдено.');
              }
              return;
            }
            setError('');
            renderResult(res.rows || []);
            if (onResolved) {
              try {
                onResolved({
                  query: input.value.trim(),
                  rows: res.rows || [],
                  first: (res.rows || [])[0] || null
                });
              } catch (_) {}
            }
            return;
          }
          if (d.type === 'error') {
            ready = false;
            setError(String(d.error || 'Ошибка индекса'));
          }
        });
        worker.addEventListener('error', (ev) => {
          setError('Ошибка воркера: ' + (ev.message || 'unknown'));
        });
        return fetch(csvUrl)
          .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          })
          .then((text) => {
            worker.postMessage({ type: 'build', csvText: text });
          })
          .catch((err) => {
            throw new Error(startupErrorMessage(err, 'csv', csvUrl));
          });
      })
      .catch((err) => {
        const errMsg = String(err && err.message ? err.message : err || '');
        if (/Не удалось загрузить CSV/.test(errMsg) || /file:\/\//.test(errMsg)) {
          setError(errMsg);
          return;
        }
        setError(startupErrorMessage(err, 'worker', workerUrl));
      });

    input.addEventListener('input', function () {
      inputVersion += 1;
      isResolving = false;
      clearBtn.hidden = !input.value;
      syncPlaceholderForState();
      setError('');
      if (showSuggestions) runSuggest();
      else hideSuggest();
    });

    input.addEventListener('focus', function () {
      syncPlaceholderForState();
    });

    input.addEventListener('blur', function () {
      syncPlaceholderForState();
    });

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        hideSuggest();
        return;
      }
      if (suggestBox.style.display === 'none') {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          runResolve();
        }
        return;
      }
      const n = suggestItems.length;
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (n < 1) return;
        activeSuggest = activeSuggest < 0 ? 0 : Math.min(n - 1, activeSuggest + 1);
        updateActiveSuggest();
        return;
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (n < 1) return;
        activeSuggest = activeSuggest <= 0 ? 0 : Math.max(0, activeSuggest - 1);
        updateActiveSuggest();
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (activeSuggest >= 0 && suggestItems[activeSuggest]) {
          input.value = suggestItems[activeSuggest].address;
          clearBtn.hidden = false;
          hideSuggest();
          runResolve(input.value);
          return;
        }
        runResolve();
      }
    });

    clearBtn.addEventListener('click', function () {
      input.value = '';
      inputVersion += 1;
      isResolving = false;
      clearBtn.hidden = true;
      hideSuggest();
      setError('');
      resultEl.hidden = true;
      resultEl.innerHTML = '';
      if (onCleared) {
        try {
          onCleared();
        } catch (_) {}
      }
      input.focus();
      syncPlaceholderForState();
    });

    searchBtn.addEventListener('click', function () {
      runResolve();
    });

    suggestBox.addEventListener('mousedown', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-suggest-idx]') : null;
      if (t) ev.preventDefault();
    });

    suggestBox.addEventListener('click', function (ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-suggest-idx]') : null;
      if (!t) return;
      const idx = Number(t.getAttribute('data-suggest-idx'));
      const item = suggestItems[idx];
      if (!item) return;
      input.value = item.address;
      clearBtn.hidden = false;
      syncPlaceholderForState();
      hideSuggest();
      runResolve(item.address);
    });

    window.addEventListener(
      'beforeunload',
      function () {
        if (worker) worker.terminate();
      },
      { once: true }
    );

    syncPlaceholderForState();
    syncHasValueState();
  }

  window.initUkAddressWidget = initUkAddressWidget;
})();
