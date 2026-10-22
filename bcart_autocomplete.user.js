// ==UserScript==
// @name         Bカート オートコンプリート（商品名・会社名）
// @namespace    http://tampermonkey.net/
// @version      11.1
// @description  商品一覧の商品名検索に画像付き候補表示／会員一覧の会社名検索に候補表示
// @author       You
// @match        https://*.bcart.jp/admin/products*
// @match        https://*.bcart.jp/admin/customer*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/matatabi1969/bcart-scripts/main/bcart_autocomplete.user.js
// @downloadURL  https://raw.githubusercontent.com/matatabi1969/bcart-scripts/main/bcart_autocomplete.user.js
// ==/UserScript==

(function () {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .bac-dropdown {
      position: absolute; z-index: 99999; background: #fff;
      border: 1.5px solid #3a7bd5; border-radius: 8px;
      box-shadow: 0 6px 24px rgba(58,123,213,0.18);
      min-width: 320px; max-width: 520px; max-height: 420px; overflow-y: auto;
      font-family: 'Hiragino Kaku Gothic Pro', Meiryo, sans-serif; font-size: 13px;
    }
    .bac-dropdown::-webkit-scrollbar { width: 6px; }
    .bac-dropdown::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
    .bac-item {
      display: flex; align-items: center; gap: 10px; padding: 8px 12px;
      cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.12s;
    }
    .bac-item:last-child { border-bottom: none; }
    .bac-item:hover, .bac-item.active { background: #eff6ff; }
    .bac-item-img {
      width: 48px; height: 48px; object-fit: contain;
      border: 1px solid #e2e8f0; border-radius: 5px; background: #f8fafc; flex-shrink: 0;
    }
    .bac-item-icon {
      width: 48px; height: 48px; border: 1px solid #e2e8f0; border-radius: 5px;
      background: #f1f5f9; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 20px;
    }
    .bac-item-text { flex: 1; min-width: 0; }
    .bac-item-name {
      font-weight: bold; color: #1e293b;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px;
    }
    .bac-item-name mark { background: #fef08a; color: #1e293b; border-radius: 2px; padding: 0 1px; }
    .bac-loading { padding: 14px 16px; color: #64748b; text-align: center; font-size: 12px; }
    .bac-empty   { padding: 14px 16px; color: #94a3b8; text-align: center; font-size: 12px; }
  `;
  document.head.appendChild(style);

  function escapeHtml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function highlight(text, kw) {
    if (!kw) return escapeHtml(text);
    const esc = escapeHtml(text);
    const k = kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return esc.replace(new RegExp(`(${k})`,'gi'),'<mark>$1</mark>');
  }
  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); };
  }
  function createDropdown() {
    const el = document.createElement('div');
    el.className = 'bac-dropdown'; el.style.display = 'none';
    document.body.appendChild(el); return el;
  }
  function positionDropdown(dd, input) {
    const r = input.getBoundingClientRect();
    dd.style.top      = (window.scrollY + r.bottom + 2) + 'px';
    dd.style.left     = (window.scrollX + r.left) + 'px';
    dd.style.minWidth = Math.max(320, r.width) + 'px';
    dd.style.maxWidth = Math.max(520, r.width) + 'px';
  }
  function clickSearchButton() {
    const btn = document.querySelector('button[type="submit"], input[type="submit"]')
              || document.querySelector('.search-btn, button.btn-primary');
    if (btn) btn.click();
    else { const form = document.querySelector('form'); if (form) form.submit(); }
  }

  // =============================================
  // 商品一覧から商品名・画像を抽出
  // 商品名: div.__name のテキスト
  // 画像:   td.__img img の src
  // 両者は同じ li.__item 内にある
  // =============================================
  function extractProducts(doc) {
    const items = [];
    const seen  = new Set();

    doc.querySelectorAll('.__name').forEach(nameEl => {
      const name = nameEl.textContent.trim().replace(/\s+/g, ' ');
      if (!name || name.length < 2 || seen.has(name)) return;

      // .__name を含む親要素（li または section など）から画像を探す
      let imgSrc = '';
      const container = nameEl.closest('li') || nameEl.closest('section') || nameEl.closest('article') || nameEl.parentElement;

      if (container) {
        // td.__img img を探す
        const imgEl = container.querySelector('td.__img img, .__img img, img');
        if (imgEl) {
          const src = imgEl.getAttribute('src') || '';
          console.log('[BAC] 画像src:', src, '| 商品名:', name);
          if (src && !src.includes('/assets/') && !src.includes('icon')) {
            imgSrc = src.startsWith('http') ? src : location.origin + src;
          }
        } else {
          console.log('[BAC] 画像なし | 商品名:', name);
        }
      }

      seen.add(name);
      items.push({ name, imgSrc });
    });

    return items;
  }

  // =============================================
  // 会員一覧から会社名を抽出
  // =============================================
  function extractCustomers(doc) {
    const items = [];
    const seen  = new Set();
    const actionWords = ['詳細を見る','編集','受注作成','コピー','削除','ログイン','ポイント発行','価格一覧','操作'];

    doc.querySelectorAll('table tbody tr').forEach(row => {
      const tds = row.querySelectorAll('td');
      if (tds.length < 4) return;

      let companyName = '', personName = '';
      const lines = (tds[3].innerText || tds[3].textContent)
        .split('\n').map(l => l.trim()).filter(Boolean);

      lines.forEach(line => {
        const isAction = actionWords.some(w => line.includes(w));
        if (isAction || /^\d+$/.test(line) || line.length > 80) return;
        if (!companyName) companyName = line;
        else if (!personName) personName = line;
      });

      if (!companyName || seen.has(companyName)) return;
      seen.add(companyName);
      items.push({ companyName, personName });
    });
    return items;
  }

  // =============================================
  // ラベルテキストからinputを探す
  // =============================================
  function findInputByLabel(labelText) {
    let found = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() !== labelText) continue;
      let el = node.parentElement;
      for (let i = 0; i < 5 && el; i++) {
        let sib = el.nextElementSibling;
        while (sib) {
          const inp = sib.tagName === 'INPUT' ? sib : sib.querySelector('input[type="text"]');
          if (inp) { found = inp; break; }
          sib = sib.nextElementSibling;
        }
        if (found) break;
        const inp = el.querySelector('input[type="text"]');
        if (inp && inp !== el) { found = inp; break; }
        el = el.parentElement;
      }
      if (found) break;
    }
    if (found) console.log(`[BAC] 「${labelText}」input: name=${found.name}`);
    return found;
  }

  // =============================================
  // オートコンプリート共通処理
  // =============================================
  function setupAutocomplete({ input, listPath, extractFn, renderItem, getValue }) {
    input.setAttribute('autocomplete', 'new-password');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');

    const paramName = input.name;
    const dropdown  = createDropdown();
    let activeIndex  = -1;
    let currentItems = [];
    let abort        = null;

    const close = () => { dropdown.style.display='none'; activeIndex=-1; currentItems=[]; };

    const search = debounce(async (kw) => {
      if (!kw) { close(); return; }
      if (abort) abort.abort();
      abort = new AbortController();

      positionDropdown(dropdown, input);
      dropdown.style.display = 'block';
      dropdown.innerHTML = '<div class="bac-loading">🔍 検索中…</div>';
      activeIndex = -1;

      try {
        const url = `${location.origin}${listPath}?${paramName}=${encodeURIComponent(kw)}&limit=20`;
        const res = await fetch(url, { credentials:'same-origin', signal:abort.signal });
        const text = await res.text();
        const doc  = new DOMParser().parseFromString(text, 'text/html');

        currentItems = extractFn(doc);

        if (!currentItems.length) {
          dropdown.innerHTML = '<div class="bac-empty">候補が見つかりませんでした</div>';
          return;
        }

        dropdown.innerHTML = currentItems.map((item,i) => renderItem(item, i, kw)).join('');

        dropdown.querySelectorAll('.bac-item').forEach(el => {
          el.addEventListener('mousedown', e => {
            e.preventDefault();
            const idx = parseInt(el.dataset.index);
            if (currentItems[idx]) {
              input.value = getValue(currentItems[idx]);
              close();
              setTimeout(clickSearchButton, 50);
            }
          });
        });

      } catch(e) {
        if (e.name === 'AbortError') return;
        dropdown.innerHTML = '<div class="bac-empty">取得に失敗しました</div>';
      }
    }, 350);

    input.addEventListener('input', () => search(input.value.trim()));
    input.addEventListener('keydown', e => {
      if (dropdown.style.display==='none') return;
      const els = dropdown.querySelectorAll('.bac-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex+1, els.length-1);
        els.forEach((el,i) => el.classList.toggle('active', i===activeIndex));
        els[activeIndex]?.scrollIntoView({block:'nearest'});
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex-1, 0);
        els.forEach((el,i) => el.classList.toggle('active', i===activeIndex));
        els[activeIndex]?.scrollIntoView({block:'nearest'});
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        input.value = getValue(currentItems[activeIndex]);
        close();
        setTimeout(clickSearchButton, 50);
      } else if (e.key === 'Escape') {
        close();
      }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
    window.addEventListener('scroll', () => { if(dropdown.style.display!=='none') positionDropdown(dropdown,input); }, true);
    window.addEventListener('resize', () => { if(dropdown.style.display!=='none') positionDropdown(dropdown,input); });
  }

  // =============================================
  // 初期化
  // =============================================
  function initProductAutocomplete() {
    const input = findInputByLabel('商品名');
    if (!input) return;
    setupAutocomplete({
      input,
      listPath: '/admin/products/list',
      extractFn: extractProducts,
      getValue: item => item.name,
      renderItem: (item, i, kw) => `
        <div class="bac-item" data-index="${i}">
          ${item.imgSrc
            ? `<img class="bac-item-img" src="${escapeHtml(item.imgSrc)}">`
            : `<div class="bac-item-icon">📦</div>`}
          <div class="bac-item-text">
            <div class="bac-item-name">${highlight(item.name, kw)}</div>
          </div>
        </div>`,
    });
  }

  function initCustomerAutocomplete() {
    const input = findInputByLabel('会社名');
    if (!input) return;
    setupAutocomplete({
      input,
      listPath: '/admin/customer/list',
      extractFn: extractCustomers,
      getValue: item => item.companyName,
      renderItem: (item, i, kw) => `
        <div class="bac-item" data-index="${i}">
          <div class="bac-item-icon">🏢</div>
          <div class="bac-item-text">
            <div class="bac-item-name">${highlight(item.companyName, kw)}</div>
            ${item.personName ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(item.personName)}</div>` : ''}
          </div>
        </div>`,
    });
  }

  function init() {
    if      (location.pathname.includes('/admin/products')) initProductAutocomplete();
    else if (location.pathname.includes('/admin/customer')) initCustomerAutocomplete();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

})();
