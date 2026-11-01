/* מרכז הטיפים ל Claude, לוגיקה. הטיפים עצמם נמצאים ב tips-data.js */
(function () {
  "use strict";

  var CATEGORIES = [
    { id: "skills", label: "סקילים" },
    { id: "agents", label: "סוכני משנה" },
    { id: "features", label: "פקודות ופיצ'רים" },
    { id: "github", label: "מאגרי GitHub" },
    { id: "general", label: "קלוד כללי" }
  ];
  var CODES = { features: "CMD", agents: "AGT", skills: "SKL", github: "GIT", general: "GEN", all: "ALL", saved: "SAV" };
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var TAGS = ["ניסיתי ועבד מעולה", "לנסות בהמשך", "שימושי לצוות", "חוסך טוקנים"];
  var KEYS = {
    feedback: "claude_tips_hub_feedback_v1",
    theme: "claude_tips_hub_theme_v1",
    chats: "claude_tips_hub_tip_chats_v1",
    ai: "claude_tips_hub_ai_config_v1"
  };

  var state = {
    theme: document.documentElement.getAttribute("data-theme") || "light",
    lang: "he",
    cardLang: {},
    category: "all",
    range: 14,
    sel: null,
    product: "all",
    query: "",
    openChat: {},
    openRow: {},
    openReview: {},
    tipChats: {},
    globalChat: [{ role: "ai", text: "שלום! אני מכיר את כל הטיפים באתר. על מה תרצה לדבר?" }],
    ai: { provider: "builtin", apiKey: "" },
    feedback: {}
  };

  /* ---------- עזרים ---------- */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // טקסט עברי עם מונחים באנגלית: כל רצף לטיני נעטף ב bdi כדי שלא יתהפך (למשל /btw בסוף כותרת)
  function bidi(raw) {
    var re = /(?:--|[\/.@#])?[A-Za-z][\w\-.\/@]*(?:\s+[A-Za-z][\w\-.\/@]*)*/g;
    var out = "", last = 0, m;
    while ((m = re.exec(raw))) {
      out += esc(raw.slice(last, m.index)) + '<bdi dir="ltr">' + esc(m[0]) + "</bdi>";
      last = m.index + m[0].length;
    }
    return out + esc(raw.slice(last));
  }

  function codeDir(s) {
    var he = (s.match(/[֐-׿]/g) || []).length;
    var en = (s.match(/[A-Za-z]/g) || []).length;
    return he > en ? "rtl" : "ltr";
  }

  // טקסט צ'אט: מנקים HTML ואז מאפשרים רק **מודגש** ו `קוד`
  function rich(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function icon(name, extra) {
    return '<svg class="icon ' + (extra || "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function store(key, value) {
    try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch (e) {}
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function loadState() {
    try {
      var fb = JSON.parse(load(KEYS.feedback) || "null");
      if (fb && typeof fb === "object") state.feedback = fb;
      var chats = JSON.parse(load(KEYS.chats) || "null");
      if (chats && typeof chats === "object") state.tipChats = chats;
      var ai = JSON.parse(load(KEYS.ai) || "null");
      if (ai && typeof ai === "object") state.ai = ai;
    } catch (e) {}
  }

  function saveState() {
    store(KEYS.feedback, state.feedback);
    store(KEYS.chats, state.tipChats);
    store(KEYS.ai, state.ai);
  }

  var toastTimer;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function copy(text) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("הועתק"); } catch (e) { toast("ההעתקה לא נתמכת בדפדפן הזה"); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("הועתק"); }, fallback);
    } else fallback();
  }

  function fb(id) {
    return state.feedback[id] || { favorite: false, rating: 0, tag: "", note: "" };
  }
  function hasReview(f) { return Boolean((f.note && f.note.trim()) || f.rating > 0 || f.tag); }

  function dateKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dateLabel(key) {
    var now = new Date();
    var y = new Date(now); y.setDate(now.getDate() - 1);
    var pretty = new Date(key + "T12:00:00").toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
    if (key === dateKey(now)) return { main: "היום", sub: pretty };
    if (key === dateKey(y)) return { main: "אתמול", sub: pretty };
    return { main: pretty, sub: "" };
  }
  function catLabel(id) {
    var c = CATEGORIES.filter(function (x) { return x.id === id; })[0];
    return c ? c.label : id;
  }

  /* ---------- ערכת נושא ---------- */

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    $("theme-icon").innerHTML = '<use href="#i-' + (state.theme === "dark" ? "sun" : "moon") + '"/>';
    $("theme-btn").title = state.theme === "dark" ? "מצב בהיר" : "מצב כהה";
    $("meta-theme-color").setAttribute("content", state.theme === "dark" ? "#121417" : "#f7f6f2");
  }

  /* ---------- טאבים ומסננים ---------- */

  function savedCount() {
    return TIPS_DATA.filter(function (t) { var f = fb(t.id); return f.favorite || hasReview(f); }).length;
  }

  function renderTabs() {
    var items = [{ id: "all", label: "הכל", n: TIPS_DATA.length }]
      .concat(CATEGORIES.map(function (c) {
        return { id: c.id, label: c.label, n: TIPS_DATA.filter(function (t) { return t.category === c.id; }).length };
      }))
      .concat([{ id: "saved", label: "שמורים", n: savedCount() }]);
    $("tabs").innerHTML = items.map(function (it) {
      return '<button class="tab' + (it.id !== 'all' && it.id !== 'saved' ? ' c-' + it.id : '') + '" role="tab" type="button" data-cat="' + it.id + '" aria-selected="' + (state.category === it.id) + '">' +
        '<i class="dot"></i>' + esc(it.label) + '<span class="n">' + it.n + "</span></button>";
    }).join("");
  }

  function renderRangeSelect() {
    $("range-select").value = String(state.range);
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    return TIPS_DATA.filter(function (t) {
      var f = fb(t.id);
      if (state.category === "saved") { if (!(f.favorite || hasReview(f))) return false; }
      else if (state.category !== "all" && t.category !== state.category) return false;
      if (state.range > 0 && dayDiff(latestDate(), t.date) >= state.range) return false;
      if (state.product !== "all" && t.product !== state.product) return false;
      if (q) {
        var hay = [t.titleHe, t.summaryHe, t.originalTitle, t.originalText, t.codeSnippet, t.sourceName, f.note || ""].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  /* ---------- כרטיסים ---------- */

  function tipMessages(tip) {
    if (!state.tipChats[tip.id] || !state.tipChats[tip.id].length) {
      state.tipChats[tip.id] = [{ role: "ai", text: 'שאל אותי על הטיפ "' + tip.titleHe + '": איך מיישמים אותו, דוגמאות נוספות, או מתי כדאי להשתמש בו.' }];
    }
    return state.tipChats[tip.id];
  }

  function msgsHtml(list) {
    return list.map(function (m) { return '<div class="msg ' + m.role + '">' + rich(m.text) + "</div>"; }).join("");
  }

  function contentHtml(tip, mode) {
    var he = "<h3>" + bidi(tip.titleHe) + "</h3><p>" + bidi(tip.summaryHe) + "</p>";
    var en = '<div class="en">' + (tip.originalTitle ? "<h3>" + esc(tip.originalTitle) + "</h3>" : "") + '<blockquote class="quote">' + esc(tip.originalText) + "</blockquote></div>";
    if (mode === "he") return he;
    if (mode === "orig") return en;
    return '<div class="both"><div><div class="tag-label">עברית</div>' + he + '</div><div><div class="tag-label" dir="ltr">Original</div>' + en + "</div></div>";
  }

  function detailHtml(tip, f, mode) {
    var chatOpen = !!state.openChat[tip.id];
    var revOpen = !!state.openReview[tip.id];
    var stars = [1, 2, 3, 4, 5].map(function (s) {
      return '<button type="button" data-act="rate" data-id="' + tip.id + '" data-star="' + s + '" aria-pressed="' + (s <= f.rating) + '" aria-label="' + s + ' כוכבים">' + icon("star", "filled") + "</button>";
    }).join("");
    var tags = TAGS.map(function (t) {
      return '<button type="button" data-act="tag" data-id="' + tip.id + '" data-tag="' + esc(t) + '" aria-pressed="' + (f.tag === t) + '">' + esc(t) + "</button>";
    }).join("");
    var langBtn = mode === "orig" ? "עברית" : "English";
    return '<div class="fdetail" id="detail-' + tip.id + '">' +
      '<div class="tools"><span class="spacer"></span>' +
        '<button class="chip-btn" type="button" data-act="card-lang" data-id="' + tip.id + '" title="החלפת שפה בשורה זו">' + langBtn + "</button>" +
        '<button class="icon-btn fav" type="button" data-act="fav" data-id="' + tip.id + '" aria-pressed="' + f.favorite + '" aria-label="שמירה במועדפים" title="שמירה במועדפים">' + icon("star", f.favorite ? "filled" : "") + "</button>" +
      "</div>" +
      contentHtml(tip, mode) +
      '<div class="code"><pre dir="' + codeDir(tip.codeSnippet) + '">' + (codeDir(tip.codeSnippet) === "rtl" ? bidi(tip.codeSnippet) : esc(tip.codeSnippet)) + '</pre><button type="button" data-act="copy" data-id="' + tip.id + '">' + icon("copy") + "העתקה</button></div>" +
      '<div class="card-foot">' +
        '<span>מקור: <a class="src" href="' + esc(tip.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(tip.sourceName) + "</a></span>" +
        '<span class="spacer"></span>' +
        '<button class="link-btn" type="button" data-act="toggle-chat" data-id="' + tip.id + '" aria-expanded="' + chatOpen + '">' + icon("chat") + "שאל על הטיפ</button>" +
        '<button class="link-btn" type="button" data-act="toggle-review" data-id="' + tip.id + '" aria-expanded="' + revOpen + '">' + icon("pen") + "חוות דעת" + (hasReview(f) ? " ✓" : "") + "</button>" +
      "</div>" +
      '<div class="panel" data-panel="chat" ' + (chatOpen ? "" : "hidden") + ">" +
        '<div class="hint-row">' +
          '<button type="button" data-act="quick" data-id="' + tip.id + '" data-prompt="איך מיישמים את הטיפ הזה שלב אחר שלב?">איך מיישמים?</button>' +
          '<button type="button" data-act="quick" data-id="' + tip.id + '" data-prompt="תן לי דוגמה מעשית נוספת">דוגמה נוספת</button>' +
          '<button type="button" data-act="quick" data-id="' + tip.id + '" data-prompt="מה היתרון לעומת השיטה הרגילה?">מה היתרון?</button>' +
        "</div>" +
        '<div class="msgs" id="msgs-' + tip.id + '">' + msgsHtml(tipMessages(tip)) + "</div>" +
        '<div class="row"><input type="text" id="chat-in-' + tip.id + '" data-chat-input="' + tip.id + '" placeholder="כתוב שאלה על הטיפ" aria-label="שאלה על הטיפ">' +
        '<button class="btn" type="button" data-act="send" data-id="' + tip.id + '">שלח</button></div>' +
      "</div>" +
      '<div class="panel" data-panel="review" ' + (revOpen ? "" : "hidden") + ">" +
        "<h4>הדירוג וחוות הדעת שלי</h4>" +
        '<div class="stars" role="group" aria-label="דירוג">' + stars + "</div>" +
        '<div class="chips">' + tags + "</div>" +
        '<div class="row"><input type="text" id="note-' + tip.id + '" value="' + esc(f.note || "") + '" placeholder="מה למדתי, איך ליישם" aria-label="חוות דעת">' +
        '<button class="btn" type="button" data-act="save-note" data-id="' + tip.id + '">שמירה</button></div>' +
      "</div>" +
    "</div>";
  }

  var LINE_LETTER = { features: "/", agents: "A", skills: "S", github: "G", general: "C" };
  var LINE_ORDER = ["features", "agents", "skills", "github", "general"];
  var COL_W = 138;

  function isMobile() { return window.matchMedia("(max-width: 720px)").matches; }

  function latestDate() {
    return TIPS_DATA.map(function (t) { return t.date; }).sort().pop();
  }

  function dayDiff(a, b) {
    return Math.round((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 86400000);
  }

  function addDays(key, n) {
    var d = new Date(key + "T12:00:00");
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }

  // כותרת קצרה לתחנה: עד הנקודתיים, הסוגר או המילה "עם"
  function shortTitle(t) {
    var s = t.split(/[:(]| עם | בעזרת | באמצעות /)[0].trim();
    if (s.length < 10) s = t;
    if (s.length > 40) s = s.slice(0, 38).replace(/\s+\S*$/, "") + "…";
    return s;
  }

  function selectedTip(list) {
    var cur = list.filter(function (t) { return t.id === state.sel; })[0];
    return cur || null;
  }

  function dayCells(list) {
    var latest = latestDate();
    var earliest = list.length ? list.map(function (t) { return t.date; }).sort()[0] : latest;
    var span = state.range > 0 ? Math.min(state.range, dayDiff(latest, earliest) + 1) : dayDiff(latest, earliest) + 1;
    var days = [];
    for (var i = 0; i < Math.max(span, 1); i++) days.push(addDays(latest, -i));
    return days;
  }

  function dateHead(key, i) {
    var d = new Date(key + "T12:00:00");
    var wd = d.toLocaleDateString("he-IL", { weekday: "short" });
    var today = key === dateKey(new Date());
    return '<span class="mdate' + (today ? " today" : "") + '" style="right:' + (i * COL_W) + "px;width:" + COL_W + 'px"><b>' + d.getDate() + "." + (d.getMonth() + 1) + "</b>" + esc(wd) + "</span>";
  }

  function detailBox(tip) {
    var f = fb(tip.id);
    var mode = state.cardLang[tip.id] || state.lang;
    return '<div class="kicker">' + esc(catLabel(tip.category)) + " · " + esc(tip.product) + " · " + esc(tip.date) + "</div>" + detailHtml(tip, f, mode);
  }

  function mapHtml(list, sel) {
    var days = dayCells(list);
    var cells = {};
    list.forEach(function (t) { var k = t.category + "|" + t.date; (cells[k] = cells[k] || []).push(t); });
    var width = days.length * COL_W;
    var html = '<div class="mapwrap"><div class="mapscroll" id="mapscroll"><div class="mboard">';
    html += '<div class="mrow mhead"><div class="mlabel">קווים</div><div class="mtrack" style="width:' + width + 'px">' + days.map(dateHead).join("") + "</div></div>";
    LINE_ORDER.forEach(function (cat) {
      var stops = "";
      days.forEach(function (d, i) {
        var group = cells[cat + "|" + d] || [];
        group.forEach(function (t, j) {
          var k = group.length;
          var cx = i * COL_W + COL_W / 2 + (j - (k - 1) / 2) * (COL_W / k) * 0.9;
          var w = k > 1 ? Math.floor(COL_W / k) - 8 : COL_W - 16;
          var f = fb(t.id);
          stops += '<div class="stop' + (sel && sel.id === t.id ? " sel" : "") + '" style="right:' + (cx - w / 2) + "px;width:" + w + 'px">' +
            '<button class="stn' + (f.favorite ? " fav" : "") + '" type="button" data-act="select" data-id="' + t.id + '" aria-pressed="' + (!!sel && sel.id === t.id) + '" aria-label="' + esc(t.titleHe) + '"></button>' +
            '<span class="slabel">' + bidi(shortTitle(t.titleHe)) + "</span></div>";
        });
      });
      html += '<div class="mrow mline c-' + cat + '"><div class="mlabel"><i class="badge">' + LINE_LETTER[cat] + "</i>" + esc(catLabel(cat)) + "</div>" +
        '<div class="mtrack" style="width:' + width + 'px"><div class="mbar"></div>' + stops + "</div></div>";
    });
    html += "</div></div></div>";
    return html;
  }

  function linesHtml(list, sel) {
    return LINE_ORDER.map(function (cat) {
      var items = list.filter(function (t) { return t.category === cat; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? -1 : 1); });
      if (!items.length) return "";
      return '<section class="vline c-' + cat + '"><h3><i class="badge">' + LINE_LETTER[cat] + "</i>" + esc(catLabel(cat)) + " <small>" + items.length + "</small></h3><ol>" +
        items.map(function (t) {
          var f = fb(t.id);
          var open = !!sel && sel.id === t.id;
          var d = new Date(t.date + "T12:00:00");
          return "<li>" + '<button class="vstn' + (f.favorite ? " fav" : "") + '" type="button" data-act="select" data-id="' + t.id + '" aria-pressed="' + open + '">' +
            bidi(shortTitle(t.titleHe)) + "<small>" + d.getDate() + "." + (d.getMonth() + 1) + "</small></button>" +
            (open ? '<div class="vdetail">' + detailBox(t) + "</div>" : "") + "</li>";
        }).join("") + "</ol></section>";
    }).join("");
  }

  function render() {
    var scrollY = window.scrollY;
    var oldScroll = $("mapscroll") ? $("mapscroll").scrollLeft : null;
    renderTabs();
    var list = filtered();
    $("empty").hidden = list.length > 0;
    var mobile = isMobile();
    var sel = selectedTip(list);
    if (!sel && !mobile && list.length) {
      sel = list.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? -1 : 1); })[0];
      state.sel = sel.id;
    }
    var out = "";
    if (list.length) {
      if (mobile) out = '<div class="vlines">' + linesHtml(list, sel) + "</div>";
      else {
        var c = sel ? "c-" + sel.category : "";
        out = mapHtml(list, sel) + '<div class="mdetail ' + c + '" id="detail-slot"><div class="bar"></div><div class="in">' + (sel ? detailBox(sel) : "") + "</div></div>";
      }
    }
    $("tips").innerHTML = out;
    if (oldScroll !== null && $("mapscroll")) $("mapscroll").scrollLeft = oldScroll;
    window.scrollTo(0, scrollY);
  }

  function scrollDetail() {
    var el = isMobile() ? document.querySelector(".vdetail") : $("detail-slot");
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.bottom > innerHeight || r.top < 120) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ---------- צ'אט ---------- */

  function gemini(prompt) {
    return fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": state.ai.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }).then(function (r) { return r.json(); }).then(function (d) {
      return d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts[0].text;
    });
  }

  function useGemini() { return state.ai.provider === "gemini" && state.ai.apiKey; }

  function tipReply(tip, question) {
    var q = question.trim().toLowerCase();
    var local = function () {
      if (/איך מיישמים|שלב|להתחיל|להתקין/.test(q))
        return 'כדי ליישם את "' + tip.titleHe + '":\n1. פתח את סביבת העבודה שלך ב ' + tip.product + ".\n2. השתמש בפקודה או בתבנית מהכרטיס:\n`" + tip.codeSnippet + "`\n3. נסה קודם על משימה קטנה, ורק אחר כך הכנס לכל הפרויקט.";
      if (/דוגמה|קוד|תבנית/.test(q))
        return "דוגמה להעתקה:\n`" + tip.codeSnippet + '`\n\nלפי המקור הרשמי (' + tip.sourceName + ').';
      if (/יתרון|הבדל|למה/.test(q))
        return 'היתרון של "' + tip.titleHe + '":\n• חלון ההקשר נשאר נקי וחוסך טוקנים.\n• תוצאות עקביות יותר בסשנים ארוכים.\n• מבוסס על ההמלצה ב ' + tip.sourceName + ".";
      if (/פשוט|הסבר/.test(q)) return "במילים פשוטות: " + tip.summaryHe;
      return tip.summaryHe + "\n\nהפקודה המרכזית:\n`" + tip.codeSnippet + "`";
    };
    if (useGemini()) {
      var prompt = "אתה מומחה ל Claude ול Claude Code. הטיפ:\nכותרת: " + tip.titleHe + "\nתקציר: " + tip.summaryHe + "\nמקור: " + tip.originalText + "\nפקודה: " + tip.codeSnippet + "\n\nשאלה: " + question + "\nענה בעברית פשוטה ומעשית.";
      return gemini(prompt).then(function (r) { return r || local(); }, local);
    }
    return Promise.resolve(local());
  }

  function globalReply(question) {
    var q = question.trim().toLowerCase();
    var latest = TIPS_DATA.map(function (t) { return t.date; }).sort().pop();
    var local = function () {
      if (/סכם|היום/.test(q)) {
        var today = TIPS_DATA.filter(function (t) { return t.date === latest; });
        return "בעדכון האחרון (" + latest + ") יש " + today.length + " טיפים:\n" + today.map(function (t, i) { return (i + 1) + ". " + t.titleHe; }).join("\n");
      }
      if (/טוקנים|זיכרון|הקשר|context/.test(q))
        return "שלוש דרכים לשמור על הקשר נקי:\n1. `/btw` לשאלות צד שלא נכנסות להיסטוריה.\n2. סוכני משנה ב `.claude/agents/` למחקר שרץ בחלון נפרד.\n3. `CLAUDE.md` קצר, ונהלים ספציפיים ב `.claude/skills/`.";
      if (/claude\.md|תבנית/.test(q))
        return "תבנית ל CLAUDE.md:\n\n# Code Style\n- Use ES modules\n- Prefer strict types\n\n# Workflow\n- Run a single test before the full suite\n- Run the linter after editing\n\nנהלים שנדרשים רק לפעמים עדיף לשים ב `.claude/skills/`.";
      if (/הבדל|skill|subagent|סקיל|אייג'נט|סוכן/.test(q))
        return "**Skill**: חבילת הוראות (SKILL.md) שמלמדת את קלוד איך לבצע משימה חוזרת.\n**Subagent**: עוזר עצמאי שרץ בחלון זיכרון נפרד ומחזיר סיכום.\n**MCP**: חיבור לכלים חיצוניים כמו GitHub, Notion או Drive.";
      var m = TIPS_DATA.filter(function (t) {
        return [t.titleHe, t.summaryHe, t.originalText, t.codeSnippet].join(" ").toLowerCase().indexOf(q) !== -1;
      })[0];
      if (m) return 'מצאתי: "' + m.titleHe + '"\n\n' + m.summaryHe + "\n\n`" + m.codeSnippet + "`";
      return "יש כרגע " + TIPS_DATA.length + " טיפים. אפשר לשאול למשל: מה זה `/btw`, מה ההבדל בין Skill ל Subagent, או תבנית ל CLAUDE.md.";
    };
    if (useGemini()) {
      var ctx = TIPS_DATA.map(function (t, i) { return (i + 1) + ". [" + t.date + "] " + t.titleHe + ": " + t.summaryHe + " | " + t.codeSnippet; }).join("\n");
      return gemini("אתה עוזר באתר טיפים ל Claude. הטיפים:\n" + ctx + "\n\nשאלה: " + question + "\nענה בעברית ברורה ומעשית.").then(function (r) { return r || local(); }, local);
    }
    return Promise.resolve(local());
  }

  function updateTipMsgs(tipId) {
    var tip = TIPS_DATA.filter(function (t) { return t.id === tipId; })[0];
    var box = $("msgs-" + tipId);
    if (!box || !tip) return;
    box.innerHTML = msgsHtml(tipMessages(tip));
    box.scrollTop = box.scrollHeight;
  }

  function sendTip(tipId, custom) {
    var tip = TIPS_DATA.filter(function (t) { return t.id === tipId; })[0];
    var input = $("chat-in-" + tipId);
    var q = (custom !== undefined ? custom : input ? input.value : "").trim();
    if (!tip || !q) return;
    if (input && custom === undefined) input.value = "";
    tipMessages(tip).push({ role: "user", text: q });
    updateTipMsgs(tipId);
    tipReply(tip, q).then(function (r) {
      tipMessages(tip).push({ role: "ai", text: r });
      saveState();
      updateTipMsgs(tipId);
    });
  }

  function renderGlobalChat() {
    var box = $("chat-msgs");
    box.innerHTML = msgsHtml(state.globalChat);
    box.parentNode.scrollTop = box.parentNode.scrollHeight;
  }

  function sendGlobal(custom) {
    var input = $("chat-input");
    var q = (custom !== undefined ? custom : input.value).trim();
    if (!q) return;
    if (custom === undefined) input.value = "";
    state.globalChat.push({ role: "user", text: q });
    renderGlobalChat();
    globalReply(q).then(function (r) {
      state.globalChat.push({ role: "ai", text: r });
      renderGlobalChat();
    });
  }

  function toggleChat(open) {
    var panel = $("chat-panel");
    var show = open === undefined ? panel.hidden : open;
    panel.hidden = !show;
    $("chat-fab").setAttribute("aria-expanded", String(show));
    if (show) { renderGlobalChat(); $("chat-input").focus(); }
  }

  /* ---------- התקנה ---------- */

  var installPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installPrompt = e; });
  window.addEventListener("appinstalled", function () { installPrompt = null; toast("האפליקציה הותקנה"); });

  function openInstall() {
    var body = $("install-body");
    var go = $("install-go");
    var standalone = matchMedia("(display-mode: standalone)").matches;
    var isWeb = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    go.hidden = true;
    if (standalone) {
      body.innerHTML = "<p>האתר כבר רץ כאפליקציה מותקנת.</p>";
    } else if (installPrompt) {
      body.innerHTML = "<p>אפשר להתקין עכשיו. תיווצר אפליקציה עם אייקון משלה, חלון נפרד וקיצור בתפריט התחל.</p>";
      go.hidden = false;
    } else if (isWeb) {
      body.innerHTML = '<p>אם הדפדפן לא הציע התקנה אוטומטית, עושים זאת ידנית:</p><ol><li>ב Chrome או Edge פותחים את תפריט הדפדפן.</li><li>בוחרים "שמירה והעברה" ואז "התקנת האתר כאפליקציה" (ב Edge: "אפליקציות" ואז "התקנת האתר").</li><li>אחרי ההתקנה אפשר להצמיד לשורת המשימות.</li></ol>';
    } else {
      body.innerHTML = '<p>הדף נפתח כקובץ מהמחשב, ובמצב כזה הדפדפן לא מאפשר התקנה מלאה.</p><ol><li>להעלות את התיקייה לאחסון עם כתובת https, למשל Netlify Drop או GitHub Pages, ולפתוח משם.</li><li>או להפעיל את <code>Open-Claude-Tips-App.bat</code> מהתיקייה, שפותח חלון נקי בלי שורת כתובת.</li></ol>';
    }
    $("dlg-install").showModal();
  }

  function mailPreview() {
    var latest = TIPS_DATA.map(function (t) { return t.date; }).sort().pop();
    var tips = TIPS_DATA.filter(function (t) { return t.date === latest; });
    $("mail-body").innerHTML = '<div class="hd">נושא: ' + tips.length + " טיפים חדשים ל Claude ול Claude Code</div>" +
      "<p>בוקר טוב רועי, הסריקה היומית הסתיימה. אלה הטיפים החדשים:</p><ul>" +
      tips.map(function (t) { return "<li><strong>" + esc(catLabel(t.category)) + ":</strong> " + esc(t.titleHe) + "</li>"; }).join("") + "</ul>";
  }

  /* ---------- אירועים ---------- */

  $("tips").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    var id = b.getAttribute("data-id");
    var cur = fb(id);

    if (act === "select") {
      state.sel = state.sel === id && isMobile() ? null : id;
      render();
      scrollDetail();
    } else if (act === "card-lang") {
      var now = state.cardLang[id] || state.lang;
      state.cardLang[id] = now === "orig" ? "he" : "orig";
      render();
    } else if (act === "fav") {
      state.feedback[id] = Object.assign({}, cur, { favorite: !cur.favorite });
      saveState(); render();
      toast(state.feedback[id].favorite ? "נשמר במועדפים" : "הוסר מהמועדפים");
    } else if (act === "copy") {
      var tip = TIPS_DATA.filter(function (t) { return t.id === id; })[0];
      if (tip) copy(tip.codeSnippet);
    } else if (act === "toggle-chat") {
      state.openChat[id] = !state.openChat[id];
      render();
      if (state.openChat[id]) { var i = $("chat-in-" + id); if (i) i.focus(); updateTipMsgs(id); }
    } else if (act === "toggle-review") {
      state.openReview[id] = !state.openReview[id];
      render();
    } else if (act === "send") {
      sendTip(id);
    } else if (act === "quick") {
      sendTip(id, b.getAttribute("data-prompt"));
    } else if (act === "rate") {
      var s = parseInt(b.getAttribute("data-star"), 10);
      state.feedback[id] = Object.assign({}, cur, { rating: cur.rating === s ? 0 : s });
      saveState(); render();
    } else if (act === "tag") {
      var tg = b.getAttribute("data-tag");
      state.feedback[id] = Object.assign({}, cur, { tag: cur.tag === tg ? "" : tg });
      saveState(); render();
    } else if (act === "save-note") {
      var inp = $("note-" + id);
      state.feedback[id] = Object.assign({}, cur, { note: inp ? inp.value.trim() : "" });
      saveState(); render();
      toast("חוות הדעת נשמרה");
    }
  });

  $("tips").addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var inp = e.target.closest("input[data-chat-input]");
    if (inp) { e.preventDefault(); sendTip(inp.getAttribute("data-chat-input")); }
  });

  $("tabs").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]");
    if (!b) return;
    state.category = b.getAttribute("data-cat");
    render();
  });

  $("lang-seg").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-lang]");
    if (!b) return;
    state.lang = b.getAttribute("data-lang");
    state.cardLang = {};
    Array.prototype.forEach.call($("lang-seg").querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", String(x === b));
    });
    render();
  });

  $("search-input").addEventListener("input", function (e) { state.query = e.target.value; render(); });
  $("range-select").addEventListener("change", function (e) { state.range = parseInt(e.target.value, 10); render(); });
  $("product-select").addEventListener("change", function (e) { state.product = e.target.value; render(); });

  $("reset-btn").addEventListener("click", function () {
    state.category = "all"; state.range = 14; state.product = "all"; state.query = "";
    $("search-input").value = ""; $("range-select").value = "14"; $("product-select").value = "all";
    render();
  });

  $("theme-btn").addEventListener("click", function () {
    state.theme = state.theme === "dark" ? "light" : "dark";
    store(KEYS.theme, state.theme);
    applyTheme();
  });

  // תפריט
  var menu = $("menu"), menuBtn = $("menu-btn");
  function setMenu(open) { menu.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); }
  menuBtn.addEventListener("click", function (e) { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { setMenu(false); if (!$("chat-panel").hidden) toggleChat(false); } });
  menu.addEventListener("click", function (e) {
    var b = e.target.closest("[data-menu]");
    if (!b) { setMenu(false); return; }
    setMenu(false);
    var k = b.getAttribute("data-menu");
    if (k === "install") openInstall();
    else if (k === "mail") { mailPreview(); $("dlg-mail").showModal(); }
    else if (k === "export") { copy(JSON.stringify(state.feedback, null, 2)); toast("חוות הדעת הועתקו כ JSON"); }
    else if (k === "settings") {
      $("api-provider").value = state.ai.provider || "builtin";
      $("api-key").value = state.ai.apiKey || "";
      $("dlg-settings").showModal();
    }
  });

  document.querySelectorAll("dialog").forEach(function (d) {
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.hasAttribute("data-close")) d.close();
    });
  });
  $("settings-save").addEventListener("click", function () {
    state.ai.provider = $("api-provider").value;
    state.ai.apiKey = $("api-key").value.trim();
    saveState();
    $("dlg-settings").close();
    toast("ההגדרות נשמרו");
  });
  $("install-go").addEventListener("click", function () {
    if (!installPrompt) return;
    installPrompt.prompt();
    $("dlg-install").close();
  });

  // צ'אט כללי
  $("chat-fab").addEventListener("click", function () { toggleChat(); });
  $("chat-close").addEventListener("click", function () { toggleChat(false); });
  $("chat-clear").addEventListener("click", function () {
    state.globalChat = [{ role: "ai", text: "השיחה נוקתה. במה אפשר לעזור?" }];
    renderGlobalChat();
  });
  $("chat-send").addEventListener("click", function () { sendGlobal(); });
  $("chat-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendGlobal(); } });
  document.querySelectorAll("#chat-panel .hint-row button").forEach(function (b) {
    b.addEventListener("click", function () { sendGlobal(b.getAttribute("data-prompt")); });
  });

  /* ---------- אתחול ---------- */

  loadState();
  applyTheme();
  renderRangeSelect();
  render();
  window.matchMedia("(max-width: 720px)").addEventListener("change", function () { render(); });

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    // כשגרסה חדשה של האפליקציה מתחלפת, טוענים מחדש פעם אחת כדי להציג את התוכן העדכני
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hadController && !window.__reloaded) { window.__reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register("sw.js").then(function (reg) { reg.update(); }).catch(function () {});
  }
})();
