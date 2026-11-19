// ES5 source of the "Send to Lead Radar" bookmark. It runs on the page the user is browsing.
// It only reads visible text and links, makes no network requests, and never touches cookies,
// storage, inputs or hidden elements. __ORIGIN__ is replaced with the dashboard address.
export const BOOKMARKLET_SOURCE = String.raw`(function () {
  try {
    var ORIGIN = __ORIGIN__;
    var MAX_ITEMS = 60;
    var MAX_TEXT = 600;
    var MAX_ENCODED = 150000;
    var PRICE = /([$€£]\s?\d|\d[\d.,]*\s?([$€£]|usd|eur|gbp)|\b(usd|eur|gbp)\s?\d)/i;
    function clean(s) {
      return String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t\f\v ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    function flat(s) {
      return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    }
    function cut(s, n) {
      s = String(s);
      return s.length > n ? s.slice(0, n) : s;
    }
    function visible(el) {
      try {
        return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
      } catch (e) {
        return true;
      }
    }
    function tagOf(el) {
      return String((el && el.tagName) || '').toLowerCase();
    }
    var items = [];
    var host = String(location.hostname || '');
    var sel = '';
    try {
      sel = window.getSelection ? String(window.getSelection().toString()) : '';
    } catch (e) {
      sel = '';
    }
    sel = clean(sel);
    if (sel.length > 20) {
      items.push({ text: cut(sel, MAX_TEXT) });
    } else {
      var anchors = document.querySelectorAll('a[href]');
      var seenHref = {};
      var seenCards = [];
      for (var j = 0; j < anchors.length && items.length < MAX_ITEMS; j++) {
        var an = anchors[j];
        var href = String(an.href || '');
        if (!/^https?:/i.test(href) || seenHref[href]) continue;
        if (!visible(an)) continue;
        var card = null;
        var el = an;
        for (var lvl = 0; lvl <= 5 && el; lvl++) {
          var tg = tagOf(el);
          if (tg === 'body' || tg === 'html') break;
          var tx = String(el.innerText || '');
          if (tx.length > 700) break;
          if (tx.length >= 30 && PRICE.test(tx)) {
            card = el;
            break;
          }
          el = el.parentElement;
        }
        if (!card || seenCards.indexOf(card) !== -1) continue;
        seenCards.push(card);
        seenHref[href] = 1;
        var raw = String(card.innerText || '');
        var lines = raw.split('\n');
        var title = '';
        for (var k = 0; k < lines.length; k++) {
          var ln = flat(lines[k]);
          if (ln.length > 2) {
            title = ln;
            break;
          }
        }
        items.push({ text: cut(flat(raw), MAX_TEXT), url: href, title: cut(title, 140) });
      }
      if (!items.length && /(^|\.)(fiverr|upwork)\.com$/i.test(host)) {
        // A single buyer request (Fiverr) or job post (Upwork) you have open. Only the text your browser already shows.
        var root = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        var h1 = document.querySelector('h1');
        var pageText = clean(root ? root.innerText || root.textContent : '');
        if (pageText.length > 40) {
          items.push({
            text: cut(pageText, MAX_TEXT),
            url: String(location.href).split('#')[0].split('?')[0],
            title: cut(flat(h1 ? h1.textContent : document.title), 140)
          });
        }
      }
    }
    var payload = {
      v: 1,
      site: host,
      page_title: cut(flat(document.title), 200),
      page_url: cut(String(location.href), 500),
      items: items
    };
    function enc(o) {
      var b = btoa(unescape(encodeURIComponent(JSON.stringify(o))));
      return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    var data = enc(payload);
    while (data.length > MAX_ENCODED && payload.items.length > 1) {
      payload.items.pop();
      data = enc(payload);
    }
    if (!payload.items.length) {
      window.alert('Lead Radar: nothing to capture here. Select the text of a post, or open a page with a list of offers, then click the bookmark again.');
      return;
    }
    var target = ORIGIN + '/capture#d=' + data;
    var w = null;
    try {
      w = window.open(target, '_blank');
    } catch (e) {
      w = null;
    }
    if (w) {
      try {
        w.opener = null;
      } catch (e) {}
    } else {
      location.href = target;
    }
  } catch (err) {
    try {
      window.alert('The Lead Radar bookmark could not run on this page: ' + (err && err.message ? err.message : err));
    } catch (e) {}
  }
})();`;
