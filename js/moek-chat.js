/*
  Виджет чат-бота МОЭК (moek-chat.js) — профессиональная версия.
  Реализована "бронебойная" распаковка JSON для suggestions.
  + HTML-рендеринг ответов бота
  + Сохранение истории диалога между страницами (сброс при перезагрузке)
  + Подсветка текста при клике по ссылкам в ответе бота
*/
(function () {
  "use strict";

  var CONFIG = {
    webhookUrl: "https://n8n.flowise.atwinta.online/webhook/1e90a1cb-a532-4283-8b08-908278e098e9",
    botName: "Виртуальный помощник",
    botSub: "ПАО «МОЭК»",
    welcome: "Здравствуйте! Подскажу по оплате, счётчикам, тарифам и переходу на прямой договор. С чего начнём?",
    ackMessage: "Изучаю ваш вопрос…",
    placeholder: "Введите сообщение",
    typingSpeed: 14,
    answerFields: ["output", "text", "message", "answer", "response", "reply"],
    hideJivo: true,
    starters: [
      "Как передать показания счётчика?",
      "Как оплатить без комиссии?",
      "Что такое прямой договор?"
    ],

    // ── Селектор моделей: выбранная уходит на вебхук в поле model ──
    models: [
      { id: "z-ai/glm-4.5-air",                    label: "GLM 4.5 Air" },
      { id: "qwen/qwen3-next-80b-a3b-instruct",    label: "Qwen3 Next 80B" },
      { id: "z-ai/glm-4.6",                        label: "GLM 4.6" },
      { id: "qwen/qwen3-235b-a22b-2507",           label: "Qwen3 235B" },
      { id: "z-ai/glm-4.5",                        label: "GLM 4.5" }
    ],
    defaultModel: "z-ai/glm-4.6",

    // ── Подсветка: ссылки бота ведут на ЗЕРКАЛО (текущий хост), а не на живой сайт ──
    // Пути зеркала совпадают с ekp.moek.ru (/slug), поэтому меняем только хост.
    mirrorLinks: true,
    // хосты живого сайта, которые подменяем на текущий origin
    liveHosts: ["ekp.moek.ru", "www.ekp.moek.ru", "moek.ru", "www.moek.ru"],
    colors: {
      primary: "#0072bb",
      primaryDark: "#005a96",
      dark: "#142857",
      accent: "#ff8f00",
      botBg: "#f4f6f9",
      userBg: "#0072bb",
      text: "#1a2233",
      sub: "#8a97a8",
      line: "#eaeef2",
      surface: "#ffffff",
      canvas: "#fbfcfd"
    }
  };

  var ICON = {
    logo: '<svg viewBox="0 0 44 44" width="44" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="44" height="44" rx="22" fill="#fff"/><path d="M22 9c0 4.4-4.4 5.6-4.4 9.9 0 1.7 1.1 3.3 2.5 4C19.1 21 20 18.7 22 16.5c-.3 3.3 3.3 4.4 3.3 8.3 0 3.1-2.5 5.5-5.5 5.5s-5.5-2.2-5.5-5.5C14.3 18.1 22 18.1 22 9z" fill="#0072bb"/><path d="M24.8 22c1.7 1.3 2.2 3.1 2.2 4.6 0 2.2-1.8 4-4 4-1.4 0-2.7-.8-3.4-2 2.9.3 4.9-1.5 5.2-6.6z" fill="#ff8f00"/></svg>',
    chat: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.6L3 20.5l1.4-5.8A8.5 8.5 0 1 1 21 11.5z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8.5" cy="11.5" r="1" fill="#fff"/><circle cx="12" cy="11.5" r="1" fill="#fff"/><circle cx="15.5" cy="11.5" r="1" fill="#fff"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 12h13M12 6.5l5.5 5.5-5.5 5.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9.5" y="4" width="5" height="10" rx="2.5" fill="currentColor"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="7" width="10" height="10" rx="2.5" fill="#fff"/></svg>'
  };

  function getSessionId() {
    var key = "moek_chat_session", id = null;
    try { id = sessionStorage.getItem(key); } catch (e) {}
    if (!id) {
      id = "sess-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem(key, id); } catch (e) {}
    }
    return id;
  }
  var SESSION_ID = getSessionId();

  // ══════════ ВЫБРАННАЯ МОДЕЛЬ ══════════
  function getModel() {
    var m = null;
    try { m = sessionStorage.getItem("moek_chat_model"); } catch (e) {}
    var known = CONFIG.models.some(function (x) { return x.id === m; });
    return known ? m : CONFIG.defaultModel;
  }
  function setModel(id) {
    try { sessionStorage.setItem("moek_chat_model", id); } catch (e) {}
  }
  var CURRENT_MODEL = getModel();

  // ══════════ ССЫЛКА НА ЗЕРКАЛО + ПОДСВЕТКА ТЕКСТА ══════════
  // Бот отдаёт ссылку на живой сайт (https://ekp.moek.ru/slug), но нам нужна
  // навигация ПО ЗЕРКАЛУ. Пути зеркала идентичны живому сайту (/slug),
  // поэтому подменяем только хост на текущий origin.
  // Плюс добавляем Text Fragment (#:~:text=...) из текста ответа бота —
  // браузер прокрутит к этому фрагменту и подсветит его на странице.

  function stripTags(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = String(html || "");
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  // Готовим кандидатов для подсветки: осмысленные предложения из ответа бота.
  function pickHighlightPhrases(answerHtml) {
    var text = stripTags(answerHtml);
    // отрезаем служебный хвост "Источник: ..." — его на странице нет
    text = text.replace(/Источник\s*:.*$/i, "").trim();

    // режем на предложения / пункты списка
    var parts = text.split(/(?<=[.!?;:])\s+|\s*[•·]\s*/);

    var phrases = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim()
        .replace(/^\d+[.)]\s*/, "")   // "1. " в начале пункта
        .replace(/[«»"']/g, "")       // кавычки часто отличаются от страницы
        .trim();
      // слишком короткие фразы дают ложные совпадения, слишком длинные — не находятся
      if (p.length >= 25 && p.length <= 160 && /[а-яё]/i.test(p)) {
        phrases.push(p);
      }
      if (phrases.length >= 3) break;   // 2-3 фрагментов достаточно
    }
    return phrases;
  }

  // Кодирование фразы для передачи в хэше
  function encFrag(s) {
    return encodeURIComponent(s);
  }

  // Вместо браузерного #:~:text= (он требует ДОСЛОВНОГО совпадения, а бот
  // перефразирует) передаём фразы в собственном хэше #moekhl=...
  // На целевой странице наш же скрипт найдёт текст по ЧАСТИЧНОМУ совпадению
  // (по ключевым словам, как Ctrl+F) и подсветит его.
  function buildTextFragment(phrases) {
    if (!phrases.length) return "";
    return "#moekhl=" + encFrag(phrases.join(" || "));
  }

  // Переписываем ссылку бота на зеркало + добавляем подсветку
  function toMirrorUrl(href, answerHtml) {
    var url;
    try { url = new URL(href, window.location.origin); } catch (e) { return href; }

    var isLive = CONFIG.liveHosts.some(function (h) {
      return url.hostname === h || url.hostname.endsWith("." + h);
    });

    // ссылки на живой сайт МОЭК → ведём на зеркало (тот же путь, текущий хост)
    if (CONFIG.mirrorLinks && isLive) {
      url = new URL(url.pathname + url.search, window.location.origin);
    } else if (url.origin !== window.location.origin) {
      // сторонние домены не трогаем
      return href;
    }

    // добавляем подсветку текста ответа
    var frag = buildTextFragment(pickHighlightPhrases(answerHtml));
    return url.toString().replace(/#.*$/, "") + frag;
  }

  // ========== НОВОЕ: утилиты для HTML и истории ==========
  function sanitizeHtml(html) {
    if (typeof html !== "string") return "";
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "");
  }

  function containsHtml(str) {
    return typeof str === "string" && /<[a-z][\s\S]*>/i.test(str);
  }

  function initLinks(container) {
    // текст всего ответа бота — из него берём фразы для подсветки на странице
    var answerHtml = container.innerHTML;

    var links = container.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      a.classList.add("moek-link");
      a.setAttribute("rel", "noopener");

      var raw = a.getAttribute("href");
      if (!raw) continue;

      // СРАЗУ переписываем href на зеркало (+ #:~:text= для подсветки),
      // чтобы правильный адрес был виден и при наведении, а не только по клику
      var mirrored = toMirrorUrl(raw, answerHtml);
      a.setAttribute("href", mirrored);

      // клик обрабатываем сами: переход в той же вкладке, в обход
      // навигационного перехватчика Tilda
      a.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = this.getAttribute("href");
      });
    }
  }

  var chatHistory = [];
  function pushHistory(item) {
    chatHistory.push(item);
    saveChatState();
  }
  function saveChatState() {
    try {
      sessionStorage.setItem("moek_chat_state", JSON.stringify({
        history: chatHistory,
        greeted: greeted,
        open: win && win.classList.contains("open")
      }));
    } catch (e) {}
  }
  function loadChatState() {
    var isReload = false;
    try {
      if (window.performance && performance.getEntriesByType) {
        var nav = performance.getEntriesByType("navigation")[0];
        if (nav && nav.type === "reload") isReload = true;
      } else if (window.performance && performance.navigation) {
        if (performance.navigation.type === 1) isReload = true;
      }
    } catch (e) {}
    if (isReload) {
      try { sessionStorage.removeItem("moek_chat_state"); } catch (e) {}
      return;
    }
    try {
      var state = JSON.parse(sessionStorage.getItem("moek_chat_state"));
      if (!state || !state.history || !state.history.length) return;
      greeted = state.greeted || false;
      chatHistory = state.history;
      chatHistory.forEach(function (item) {
        if (item.type === "msg") {
          if (item.who === "bot" && item.isHtml) {
            var row = document.createElement("div");
            row.className = "moek-row bot";
            row.innerHTML = miniAva + '<div class="moek-bubble"></div>';
            var bub = row.querySelector(".moek-bubble");
            bub.innerHTML = '<div class="moek-html">' + sanitizeHtml(item.text) + '</div>';
            initLinks(bub);
            body.appendChild(row);
          } else {
            var row2 = document.createElement("div");
            row2.className = "moek-row " + item.who;
            row2.innerHTML = (item.who === "bot" ? miniAva : "") + '<div class="moek-bubble"></div>';
            row2.querySelector(".moek-bubble").textContent = item.text;
            body.appendChild(row2);
          }
        } else if (item.type === "suggestions") {
          var container = document.createElement("div");
          container.className = "moek-sugg-container";
          item.items.forEach(function (q) {
            var p = document.createElement("button");
            p.className = "moek-pill";
            p.textContent = q;
            p.addEventListener("click", function () {
              if (busy) return;
              clearSuggestions();
              input.value = q;
              sendText();
            });
            container.appendChild(p);
          });
          body.appendChild(container);
        }
      });
      if (state.open) {
        win.classList.add("open");
        input.focus();
      }
      scrollDown();
    } catch (e) {}
  }
  // ========== КОНЕЦ НОВОГО ==========

  var C = CONFIG.colors;
  var css = ""
    + "#moek-chat-btn{position:fixed;right:24px;bottom:24px;z-index:2147483646;width:56px;height:56px;border:0;border-radius:16px;background:" + C.primary + ";cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,90,150,.28);transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s;}"
    + "#moek-chat-btn:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,90,150,.36);}"
    + "#moek-chat-btn:active{transform:translateY(0);}"
    + "#moek-chat-btn svg{display:block;pointer-events:none;}"
    + "#moek-chat-win{position:fixed;right:24px;bottom:92px;z-index:2147483647;width:400px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 130px);background:" + C.surface + ";border:1px solid " + C.line + ";border-radius:20px;box-shadow:0 20px 60px rgba(20,40,87,.18);display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}"
    + "#moek-chat-win.open{display:flex;animation:moekopen .28s cubic-bezier(.4,0,.2,1);}"
    + "@keyframes moekopen{from{opacity:0;transform:translateY(16px) scale(.98);}to{opacity:1;transform:none;}}"
    + "#moek-chat-head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid " + C.line + ";background:" + C.surface + ";}"
    + "#moek-chat-head .ava{width:44px;height:44px;flex-shrink:0;position:relative;}"
    + "#moek-chat-head .ava svg{display:block;box-shadow:0 2px 8px rgba(0,114,187,.18);border-radius:50%;}"
    + "#moek-chat-head .ava .live{position:absolute;right:-1px;bottom:-1px;width:12px;height:12px;border-radius:50%;background:#2ecc71;border:2.5px solid #fff;}"
    + "#moek-chat-head .meta{flex:1;min-width:0;}"
    + "#moek-chat-head .nm{font-weight:600;font-size:15px;color:" + C.text + ";line-height:1.25;letter-spacing:-.01em;}"
    + "#moek-chat-head .sub{font-size:12.5px;color:" + C.sub + ";margin-top:1px;}"
    + "#moek-chat-close{width:32px;height:32px;border:0;border-radius:10px;background:transparent;color:" + C.sub + ";cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,color .2s;flex-shrink:0;}"
    + "#moek-chat-close:hover{background:" + C.botBg + ";color:" + C.text + ";}"
    + "#moek-chat-body{flex:1;overflow-y:auto;padding:20px 18px;background:" + C.canvas + ";display:flex;flex-direction:column;gap:14px;scroll-behavior:smooth;}"
    + ".moek-row{display:flex;gap:9px;align-items:flex-end;max-width:88%;animation:moekrise .32s cubic-bezier(.4,0,.2,1);}"
    + ".moek-row.bot{align-self:flex-start;}"
    + ".moek-row.user{align-self:flex-end;flex-direction:row-reverse;}"
    + ".moek-row .mini{width:26px;height:26px;flex-shrink:0;border-radius:50%;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);}"
    + ".moek-row.user .mini{display:none;}"
    + "@keyframes moekrise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}"
    + ".moek-bubble{padding:11px 14px;border-radius:14px;font-size:14px;line-height:1.55;color:" + C.text + ";word-wrap:break-word;white-space:pre-wrap;letter-spacing:-.005em;}"
    + ".moek-row.bot .moek-bubble{background:" + C.botBg + ";border-bottom-left-radius:4px;}"
    + ".moek-row.user .moek-bubble{background:" + C.userBg + ";color:#fff;border-bottom-right-radius:4px;}"
    + ".moek-typing{display:flex;gap:4px;padding:13px 15px;background:" + C.botBg + ";border-radius:14px;border-bottom-left-radius:4px;}"
    + ".moek-typing span{width:6px;height:6px;border-radius:50%;background:#b3c0cf;animation:moekdot 1.4s infinite ease-in-out;}"
    + ".moek-typing span:nth-child(2){animation-delay:.18s;}.moek-typing span:nth-child(3){animation-delay:.36s;}"
    + "@keyframes moekdot{0%,70%,100%{opacity:.35;transform:scale(.85);}35%{opacity:1;transform:scale(1);}}"
    + ".moek-sugg-container{display:flex;flex-direction:column;gap:7px;align-self:flex-start;max-width:92%;padding-left:35px;animation:moekrise .32s cubic-bezier(.4,0,.2,1);}"
    + ".moek-pill{background:" + C.surface + ";border:1px solid #d8e0e8;color:" + C.primary + ";padding:9px 14px;border-radius:12px;font-size:13px;line-height:1.35;cursor:pointer;text-align:left;font-family:inherit;font-weight:500;transition:background .2s,border-color .2s,transform .1s;}"
    + ".moek-pill:hover{background:#f0f6fb;border-color:" + C.primary + ";}"
    + ".moek-pill:active{transform:scale(.985);}"
    // ── селектор моделей (строка над полем ввода) ──
    + "#moek-chat-modelbar{display:flex;align-items:center;gap:8px;padding:8px 14px 0;background:" + C.surface + ";}"
    + "#moek-chat-modelbar label{font-size:11.5px;color:" + C.sub + ";white-space:nowrap;}"
    + "#moek-chat-model{flex:1;min-width:0;height:30px;border:1px solid #dce3ea;border-radius:8px;background:" + C.surface + ";color:" + C.text + ";font-size:12.5px;font-family:inherit;padding:0 8px;outline:none;cursor:pointer;transition:border-color .2s;}"
    + "#moek-chat-model:focus{border-color:" + C.primary + ";}"
    + "#moek-chat-model:disabled{background:" + C.botBg + ";color:#aab4c0;cursor:default;}"
    + "#moek-chat-foot{display:flex;align-items:flex-end;gap:8px;padding:12px 14px;border-top:1px solid " + C.line + ";background:" + C.surface + ";}"
    + "#moek-chat-input{flex:1;box-sizing:border-box;height:42px;border:1px solid #dce3ea;border-radius:12px;padding:10px 14px;font-size:14px;line-height:1.4;font-family:inherit;color:" + C.text + ";outline:none;resize:none;overflow-y:auto;white-space:pre-wrap;word-wrap:break-word;transition:border-color .2s,box-shadow .2s;}"
    + "#moek-chat-input::placeholder{color:#aab4c0;}"
    + "#moek-chat-input:focus{border-color:" + C.primary + ";box-shadow:0 0 0 3px rgba(0,114,187,.1);}"
    + "#moek-chat-input:disabled{background:" + C.botBg + ";color:#aab4c0;}"
    + "#moek-chat-input::-webkit-scrollbar{width:5px;}#moek-chat-input::-webkit-scrollbar-thumb{background:#d5dde5;border-radius:3px;}"
    + ".moek-ico-btn{width:42px;height:42px;flex-shrink:0;border:0;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .12s;}"
    + ".moek-ico-btn:active{transform:scale(.94);}"
    + "#moek-chat-send{background:" + C.primary + ";}"
    + "#moek-chat-send:hover{background:" + C.primaryDark + ";}"
    + "#moek-chat-send:disabled{background:#cfd8e0;cursor:default;}"
    + "#moek-chat-mic{background:" + C.botBg + ";color:" + C.primary + ";}"
    + "#moek-chat-mic:hover{background:#e9eef3;}"
    + "#moek-chat-mic.rec{background:#e8482f;color:#fff;animation:moekrec 1.5s infinite;}"
    + "@keyframes moekrec{0%,100%{box-shadow:0 0 0 0 rgba(232,72,47,.4);}50%{box-shadow:0 0 0 6px rgba(232,72,47,0);}}"
    + "#moek-chat-body::-webkit-scrollbar{width:5px;}#moek-chat-body::-webkit-scrollbar-thumb{background:#d5dde5;border-radius:3px;}#moek-chat-body::-webkit-scrollbar-track{background:transparent;}"
    // ========== НОВОЕ: стили для HTML-контента и подсветки ==========
    + ".moek-html{font-size:14px;line-height:1.55;}"
    + ".moek-html p{margin:0 0 8px 0;}"
    + ".moek-html p:last-child{margin-bottom:0;}"
    + ".moek-html ul{margin:0 0 8px 0;padding-left:18px;}"
    + ".moek-html li{margin-bottom:4px;}"
    + ".moek-html strong{font-weight:600;color:" + C.dark + ";}"
    + ".moek-html a{color:" + C.primary + ";text-decoration:underline;font-weight:500;}"
    + ".moek-html a:hover{color:" + C.primaryDark + ";}"
    + ".moek-highlight{animation:moekHighlight 5s ease;}"
    + "@keyframes moekHighlight{0%{background:#fff3cd;box-shadow:0 0 0 3px #fff3cd;border-radius:4px;}80%{background:#fff3cd;box-shadow:0 0 0 3px #fff3cd;border-radius:4px;}100%{background:transparent;box-shadow:none;}}"
    // ========== КОНЕЦ НОВЫХ СТИЛЕЙ ==========
    + (CONFIG.hideJivo ? "jdiv,[class^='jivo'],#jvlabelWrap{display:none!important;visibility:hidden!important;}" : "");

  function el(h) { var d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; }

  var styleTag = document.createElement("style");
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  var btn = el('<button id="moek-chat-btn" aria-label="Открыть чат">' + ICON.chat + '</button>');
  var win = el(
    '<div id="moek-chat-win" role="dialog" aria-label="Чат с помощником МОЭК">' +
      '<div id="moek-chat-head">' +
        '<div class="ava">' + ICON.logo + '<span class="live"></span></div>' +
        '<div class="meta">' +
          '<div class="nm">' + CONFIG.botName + '</div>' +
          '<div class="sub">' + CONFIG.botSub + ' · онлайн</div>' +
        '</div>' +
        '<button id="moek-chat-close" aria-label="Закрыть">' + ICON.close + '</button>' +
      '</div>' +
      '<div id="moek-chat-body"></div>' +
      '<div id="moek-chat-modelbar">' +
        '<label for="moek-chat-model">Модель</label>' +
        '<select id="moek-chat-model" aria-label="Выбор модели">' +
          CONFIG.models.map(function (m) {
            return '<option value="' + m.id + '"' + (m.id === CURRENT_MODEL ? ' selected' : '') + '>' + m.label + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div id="moek-chat-foot">' +
        '<button class="moek-ico-btn" id="moek-chat-mic" aria-label="Голосовое сообщение">' + ICON.mic + '</button>' +
        '<textarea id="moek-chat-input" rows="1" placeholder="' + CONFIG.placeholder + '"></textarea>' +
        '<button class="moek-ico-btn" id="moek-chat-send" aria-label="Отправить">' + ICON.send + '</button>' +
      '</div>' +
    '</div>'
  );
  document.body.appendChild(btn);
  document.body.appendChild(win);

  // Изоляция кликов чата от навигационного перехватчика Tilda.
  function insideChat(t) {
    return t && t.closest && (t.closest("#moek-chat-win") || t.closest("#moek-chat-btn"));
  }

  // ═══════════════════════════════════════════════════════════════
  // ЭКРАНИРОВАНИЕ ЧАТА ОТ НАВИГАЦИОННОГО ПЕРЕХВАТЧИКА
  //
  // Перехватчик Tilda (MOEK_MENU_FIX) висит в CAPTURE-фазе на document и через
  // document.elementsFromPoint «просвечивает» окно чата насквозь: находит ссылку
  // ПОД чатом и делает переход. Наша изоляция в bubble-фазе не успевает —
  // capture срабатывает раньше. Отсюда проваливание кликов.
  //
  // Решение: подменяем сам elementsFromPoint. Если точка клика попала в чат —
  // возвращаем ТОЛЬКО элементы чата, скрывая всё, что под ним. Перехватчик не
  // находит ссылок → перехода нет. События мы при этом НЕ гасим, поэтому
  // кнопки внутри чата продолжают работать.
  //
  // Плюс: не зависит от патчей страниц — работает даже после пересборки зеркала.
  // ═══════════════════════════════════════════════════════════════
  (function shieldChatFromNav() {
    if (!document.elementsFromPoint) return;
    var original = document.elementsFromPoint.bind(document);

    document.elementsFromPoint = function (x, y) {
      var els = original(x, y) || [];
      if (!els.length) return els;

      var top = els[0];
      if (top && top.closest && top.closest("#moek-chat-win, #moek-chat-btn")) {
        // клик в области чата — прячем от перехватчика всё, что лежит под ним
        return els.filter(function (el) {
          return el.closest && el.closest("#moek-chat-win, #moek-chat-btn");
        });
      }
      return els;
    };
  })();

  ["click","mousedown","mouseup","touchstart","touchend","pointerdown","pointerup"].forEach(function (evt) {
    win.addEventListener(evt, function (e) { e.stopPropagation(); }, false);
    btn.addEventListener(evt, function (e) { e.stopPropagation(); }, false);
  });

  var body = win.querySelector("#moek-chat-body");
  var input = win.querySelector("#moek-chat-input");
  var sendBtn = win.querySelector("#moek-chat-send");
  var micBtn = win.querySelector("#moek-chat-mic");
  var modelSel = win.querySelector("#moek-chat-model");

  // выбор модели сохраняем — переживает переходы между страницами
  modelSel.addEventListener("change", function () {
    CURRENT_MODEL = this.value;
    setModel(CURRENT_MODEL);
  });

  var busy = false, greeted = false;
  var miniAva = '<div class="mini">' + ICON.logo.replace('width="44" height="44"', 'width="26" height="26"') + '</div>';

  function scrollDown() { body.scrollTop = body.scrollHeight; }

  // ========== ИЗМЕНЕНО: addMsg теперь умеет HTML ==========
  function addMsg(text, who, isHtml) {
    var row = document.createElement("div");
    row.className = "moek-row " + who;
    row.innerHTML = (who === "bot" ? miniAva : "") + '<div class="moek-bubble"></div>';
    var bub = row.querySelector(".moek-bubble");
    if (who === "bot" && isHtml) {
      bub.innerHTML = '<div class="moek-html">' + sanitizeHtml(text) + '</div>';
      initLinks(bub);
    } else {
      bub.textContent = text;
    }
    body.appendChild(row); scrollDown(); return row;
  }

  function showTyping() {
    var row = document.createElement("div");
    row.className = "moek-row bot";
    row.innerHTML = miniAva + '<div class="moek-typing"><span></span><span></span><span></span></div>';
    body.appendChild(row); scrollDown(); return row;
  }

  // ========== ИЗМЕНЕНО: typeOut теперь пропускает HTML сразу ==========
  function typeOut(text) {
    return new Promise(function (resolve) {
      if (containsHtml(text)) {
        addMsg(text, "bot", true);
        pushHistory({type: "msg", who: "bot", text: text, isHtml: true});
        resolve();
        return;
      }
      var row = document.createElement("div");
      row.className = "moek-row bot";
      row.innerHTML = miniAva + '<div class="moek-bubble"></div>';
      var bub = row.querySelector(".moek-bubble");
      body.appendChild(row);
      var i = 0;
      (function step() {
        if (i <= text.length) { bub.textContent = text.slice(0, i); i++; scrollDown(); setTimeout(step, CONFIG.typingSpeed); }
        else { pushHistory({type: "msg", who: "bot", text: text, isHtml: false}); resolve(); }
      })();
    });
  }

  function setBusy(v) {
    busy = v; input.disabled = v; sendBtn.disabled = v; micBtn.disabled = v;
    if (modelSel) modelSel.disabled = v;   // модель не меняем во время ответа
    if (!v) input.focus();
  }
  function clearSuggestions() {
    var old = body.querySelectorAll(".moek-sugg-container");
    for (var i = 0; i < old.length; i++) { old[i].remove(); }
  }
  function renderSuggestions(list) {
    clearSuggestions();
    var container = document.createElement("div");
    container.className = "moek-sugg-container";
    list.forEach(function (q) {
      var p = document.createElement("button");
      p.className = "moek-pill";
      p.textContent = q;
      p.addEventListener("click", function () {
        if (busy) return;
        clearSuggestions();
        input.value = q;
        sendText();
      });
      container.appendChild(p);
    });
    body.appendChild(container);
    scrollDown();
    pushHistory({type: "suggestions", items: list});
  }

  // Обновленная "бронебойная" функция извлечения ответа
  function extractAnswer(data) {
    var out = { text: "", suggestions: [] };

    function tryJSON(str) {
      if (typeof str !== "string") return false;
      var t = str.trim();
      if (t.charAt(0) === "{" || t.charAt(0) === "[") {
        try { return JSON.parse(t); } catch (e) {}
      }
      return false;
    }

    function parse(obj) {
      if (!obj) return;
      if (typeof obj === "string") {
        var j = tryJSON(obj);
        if (j) { parse(j); return; }
        out.text = obj;
        return;
      }
      if (Array.isArray(obj) && obj.length) { parse(obj[0]); return; }
      if (typeof obj === "object") {
        if (Array.isArray(obj.suggestions)) out.suggestions = obj.suggestions;
        for (var i = 0; i < CONFIG.answerFields.length; i++) {
          var f = CONFIG.answerFields[i];
          if (obj[f] != null && String(obj[f]).trim() !== "") {
            var val = String(obj[f]);
            var nested = tryJSON(val);
            if (nested && typeof nested === "object" && (nested.suggestions || nested.output || nested.text || nested.answer)) {
              parse(nested);
              return;
            }
            out.text = val;
            return;
          }
        }
        if (obj.json) parse(obj.json);
        else if (obj.body) parse(obj.body);
      }
    }

    parse(data);
    if (!out.text) out.text = "Извините, не удалось получить ответ. Попробуйте переформулировать вопрос.";
    return out;
  }

  // ========== ИЗМЕНЕНО: sendText теперь сохраняет историю ==========
  function sendText() {
    var text = input.value.trim();
    if (!text || busy) return;
    clearSuggestions();
    input.value = "";
    addMsg(text, "user");
    pushHistory({type: "msg", who: "user", text: text});
    ackAndSend({ sessionId: SESSION_ID, message: text, type: "text", model: CURRENT_MODEL }, false);
  }

  // ========== ИЗМЕНЕНО: ackAndSend теперь различает HTML и plain text ==========
  function ackAndSend(payload, isForm) {
    setBusy(true);
    addMsg(CONFIG.ackMessage, "bot");
    pushHistory({type: "msg", who: "bot", text: CONFIG.ackMessage});
    var typing = showTyping();
    var opts = isForm
      ? { method: "POST", body: payload }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) };

    fetch(CONFIG.webhookUrl, opts)
      .then(function (r) { return r.text(); })
      .then(function (raw) {
        var d = raw;
        while (typeof d === "string" && (d.trim().indexOf("{") === 0 || d.trim().indexOf("[") === 0)) {
          try { d = JSON.parse(d); } catch (e) { break; }
        }
        return extractAnswer(d);
      })
      .catch(function () { return { text: "Не удалось связаться с сервисом. Проверьте соединение и попробуйте ещё раз.", suggestions: [] }; })
      .then(function (res) {
        typing.remove();
        if (containsHtml(res.text)) {
          addMsg(res.text, "bot", true);
          pushHistory({type: "msg", who: "bot", text: res.text, isHtml: true});
          if (res.suggestions && res.suggestions.length) {
            renderSuggestions(res.suggestions);
          }
          setBusy(false);
        } else {
          typeOut(res.text).then(function () {
            if (res.suggestions && res.suggestions.length) {
              renderSuggestions(res.suggestions);
            }
          }).then(function () { setBusy(false); });
        }
      });
  }

  // голос
  var mediaRecorder = null, chunks = [], recording = false;
  function toggleRecord() { if (busy) return; recording ? stopRecord() : startRecord(); }
  function startRecord() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      addMsg("Запись голоса не поддерживается в этом браузере.", "bot");
      pushHistory({type: "msg", who: "bot", text: "Запись голоса не поддерживается в этом браузере."});
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      mediaRecorder = new MediaRecorder(stream); chunks = [];
      mediaRecorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(chunks, { type: "audio/webm" });
        addMsg("Голосовое сообщение отправлено", "user");
        pushHistory({type: "msg", who: "user", text: "Голосовое сообщение отправлено"});
        var fd = new FormData();
        fd.append("sessionId", SESSION_ID); fd.append("type", "audio"); fd.append("model", CURRENT_MODEL); fd.append("audio", blob, "voice.webm");
        ackAndSend(fd, true);
      };
      mediaRecorder.start(); recording = true;
      micBtn.classList.add("rec"); micBtn.innerHTML = ICON.stop;
    }).catch(function () {
      addMsg("Не удалось получить доступ к микрофону.", "bot");
      pushHistory({type: "msg", who: "bot", text: "Не удалось получить доступ к микрофону."});
    });
  }
  function stopRecord() {
    if (mediaRecorder && recording) { mediaRecorder.stop(); recording = false; micBtn.classList.remove("rec"); micBtn.innerHTML = ICON.mic; }
  }

  // ========== ИЗМЕНЕНО: openChat/closeChat теперь сохраняют состояние окна ==========
  function openChat() {
    win.classList.add("open");
    saveChatState();
    if (!greeted) {
      greeted = true;
      setTimeout(function () {
        addMsg(CONFIG.welcome, "bot");
        pushHistory({type: "msg", who: "bot", text: CONFIG.welcome});
        if (CONFIG.starters && CONFIG.starters.length) setTimeout(function () { renderSuggestions(CONFIG.starters); }, 250);
      }, 300);
    }
    input.focus();
  }
  function closeChat() { win.classList.remove("open"); saveChatState(); }

  btn.addEventListener("click", function (e) { e.stopPropagation(); win.classList.contains("open") ? closeChat() : openChat(); });
  win.querySelector("#moek-chat-close").addEventListener("click", closeChat);
  sendBtn.addEventListener("click", sendText);
  micBtn.addEventListener("click", toggleRecord);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } });

  if (CONFIG.hideJivo) {
    var tries = 0;
    var iv = setInterval(function () {
      document.querySelectorAll("jdiv,[class^='jivo'],#jvlabelWrap").forEach(function (n) { n.style.display = "none"; });
      if (++tries > 20) clearInterval(iv);
    }, 500);
  }

  // ========== НОВОЕ: восстановление истории при старте ==========
  loadChatState();

  // ========== НОВОЕ: переинициализация ссылок при возврате через bfcache ==========
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      body.querySelectorAll(".moek-html").forEach(function (el) { initLinks(el); });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // ПОДСВЕТКА ТЕКСТА НА СТРАНИЦЕ (частичное совпадение, как Ctrl+F)
  //
  // Браузерный #:~:text= требует ДОСЛОВНОГО совпадения — а бот отвечает
  // своими словами, поэтому он не срабатывает. Здесь мы читаем фразы из
  // нашего хэша #moekhl=..., ищем на странице блоки с наибольшим совпадением
  // по ключевым словам, подсвечиваем их и прокручиваем к первому.
  // ═══════════════════════════════════════════════════════════════

  var HL_STYLE = ""
    + "mark.moek-hit{background:#ffe98a;color:inherit;padding:1px 2px;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.05);}"
    + ".moek-hit-block{background:#fff8dc!important;outline:2px solid #ffd54f;outline-offset:2px;border-radius:4px;"
    + "animation:moekHitPulse 2.2s ease-out 1;scroll-margin-top:120px;}"
    + "@keyframes moekHitPulse{0%{background:#ffe066!important;}100%{background:#fff8dc!important;}}";

  // стоп-слова: по ним не ищем, они есть везде
  var STOP = new Set(("и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по " +
    "только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть " +
    "был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней " +
    "для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому " +
    "этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда " +
    "можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много " +
    "разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда " +
    "конечно всю между").split(" "));

  function normalize(s) {
    return String(s || "").toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^\wа-я0-9\s@+()-]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ключевые слова фразы (без стоп-слов и коротышей)
  function keywords(phrase) {
    return normalize(phrase).split(" ").filter(function (w) {
      return w.length >= 4 && !STOP.has(w);
    });
  }

  // основа слова: отбрасываем окончание, чтобы ловить разные формы
  // ("показания" / "показаний" / "показаниями" → "показан")
  function stem(w) {
    w = w.replace(/[^\wа-я0-9@+()-]/gi, "");
    if (w.length <= 5) return w;
    return w.slice(0, Math.max(5, Math.floor(w.length * 0.7)));
  }

  function highlightOnPage(phrasesRaw) {
    var phrases = phrasesRaw.split("||").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!phrases.length) return;

    // все ключевые слова из ответа бота
    var allKw = [];
    phrases.forEach(function (p) { allKw = allKw.concat(keywords(p)); });
    allKw = Array.from(new Set(allKw));
    if (!allKw.length) return;

    // основы слов — по ним ищем (ловит разные формы: показания/показаний)
    var stems = Array.from(new Set(allKw.map(stem))).filter(function (s) { return s.length >= 4; });
    if (!stems.length) return;

    // стили подсветки
    var st = document.createElement("style");
    st.textContent = HL_STYLE;
    document.head.appendChild(st);

    // кандидаты — текстовые блоки страницы (Tilda хранит текст в tn-atom)
    var blocks = document.querySelectorAll(
      "p, li, td, th, h1, h2, h3, h4, h5, h6, .tn-atom, .t-text, .t-name, .t-descr, blockquote"
    );

    var scored = [];
    blocks.forEach(function (el) {
      // пропускаем сам чат и невидимое
      if (el.closest("#moek-chat-win") || el.closest("#moek-chat-btn")) return;
      var txt = (el.innerText || el.textContent || "").trim();
      if (txt.length < 20 || txt.length > 1200) return;

      var norm = normalize(txt);
      var hits = 0;
      stems.forEach(function (st2) {
        if (norm.indexOf(st2) !== -1) hits++;
      });
      if (hits >= 2) {   // минимум 2 совпадения — иначе шум
        scored.push({ el: el, score: hits / stems.length, hits: hits, len: txt.length });
      }
    });

    if (!scored.length) return;

    // сортируем: сначала по числу совпадений, потом по компактности блока
    scored.sort(function (a, b) {
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.len - b.len;
    });

    // берём лучшие блоки (топ по совпадениям, но не больше 6)
    var best = scored.slice(0, 6).filter(function (s) {
      return s.hits >= Math.max(2, Math.floor(scored[0].hits * 0.5));
    });

    // подсвечиваем совпадения внутри найденных блоков (как Ctrl+F)
    best.forEach(function (item) {
      item.el.classList.add("moek-hit-block");
      markKeywords(item.el, stems);
    });

    // прокручиваем к первому совпадению
    setTimeout(function () {
      best[0].el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 260);
  }

  // оборачивает вхождения (по основам слов) в <mark> внутри блока
  function markKeywords(root, stems) {
    var rx;
    try {
      var esc = stems
        .filter(function (k) { return k.length >= 4; })
        .map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
      if (!esc.length) return;
      // основа + возможное окончание: подсвечиваем слово целиком
      rx = new RegExp("(" + esc.join("|") + ")[а-яё\\w]*", "gi");
    } catch (e) { return; }

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.trim().length > 1) nodes.push(n);
    }

    nodes.forEach(function (node) {
      var text = node.nodeValue;
      if (!rx.test(text)) return;
      rx.lastIndex = 0;

      var frag = document.createDocumentFragment();
      var last = 0, m;
      while ((m = rx.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var mk = document.createElement("mark");
        mk.className = "moek-hit";
        mk.textContent = m[0];
        frag.appendChild(mk);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
  }

  // читаем хэш #moekhl=... при загрузке страницы
  (function checkHighlightHash() {
    var m = window.location.hash.match(/[#&]moekhl=([^&]+)/);
    if (!m) return;
    var phrases;
    try { phrases = decodeURIComponent(m[1]); } catch (e) { return; }

    // ждём, пока Tilda дорисует контент
    function run() { setTimeout(function () { highlightOnPage(phrases); }, 400); }
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run);
  })();
})();