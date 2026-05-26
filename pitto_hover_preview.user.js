// ==UserScript==
// @name         PITTO 受注ホバープレビュー v3.11
// @version      3.11
// @description  受注一覧・出荷一覧で番号にカーソルを乗せると内容をポップアップ表示
// @match        https://pitto.i15.bcart.jp/admin/order/list*
// @match        https://pitto.i15.bcart.jp/admin/logistics/list*
// @match        https://pitto.i15.bcart.jp/admin/customer/*/view*
// @grant        GM_xmlhttpRequest
// @connect      pitto.i15.bcart.jp
// ==/UserScript==

(function () {
  'use strict';

  const PREVIEW_COUNT = 5;

  // ---- ポップアップDOM ----
  const popup = document.createElement('div');
  popup.id = 'pitto-popup';
  popup.style.cssText = `
    position:fixed; z-index:99999;
    background:#fff; border:1px solid #ddd; border-radius:8px;
    box-shadow:0 4px 20px rgba(0,0,0,0.18);
    min-width:380px; max-width:540px;
    max-height:80vh; overflow-y:auto;
    font-size:13px; line-height:1.6; color:#333;
    display:none; pointer-events:auto;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  `;
  document.body.appendChild(popup);

  let hideTimer = null;
  let currentUrl = null;
  const cache = {};

  // ---- 位置調整 ----
  function updatePosition(x, y) {
    const pw = popup.offsetWidth  || 420;
    const ph = popup.offsetHeight || 200;
    const wx = window.innerWidth;
    const wy = window.innerHeight;
    let left = x + 16, top = y + 16;
    if (left + pw > wx - 10) left = x - pw - 10;
    if (top  + ph > wy - 10) top  = y - ph - 10;
    popup.style.left = Math.max(5, left) + 'px';
    popup.style.top  = Math.max(5, top)  + 'px';
  }

  function showPopup(x, y, html) {
    popup.innerHTML = html;
    popup.style.display = 'block';
    updatePosition(x, y);
    bindPopupEvents();
  }

  function hidePopup() {
    popup.style.display = 'none';
    currentUrl = null;
  }

  function bindPopupEvents() {
    popup.querySelectorAll('.pp-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        popup.querySelectorAll('.pp-tab').forEach(t => {
          t.style.borderBottom = '2px solid transparent';
          t.style.color = '#666'; t.style.fontWeight = 'normal'; t.style.background = '#f5f5f5';
        });
        popup.querySelectorAll('.pp-panel').forEach(p => p.style.display = 'none');
        tab.style.borderBottom = '2px solid #1a73e8';
        tab.style.color = '#1a73e8'; tab.style.fontWeight = 'bold'; tab.style.background = '#fff';
        const target = popup.querySelector('#' + tab.dataset.target);
        if (target) target.style.display = 'block';
      });
    });
    popup.querySelectorAll('.pp-more-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        popup.querySelectorAll('.' + btn.dataset.group).forEach(r => r.style.display = 'table-row');
        btn.closest('tr').style.display = 'none';
      });
    });
  }

  popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popup.addEventListener('mouseleave', () => { hideTimer = setTimeout(hidePopup, 300); });

  // ---- ユーティリティ ----
  function getTableValue(doc, labelText) {
    for (const td of doc.querySelectorAll('td')) {
      if (td.textContent.trim() === labelText) {
        const next = td.nextElementSibling;
        return next ? next.textContent.trim() : '-';
      }
    }
    return '-';
  }

  function extractProductRows(table) {
    return Array.from(table.querySelectorAll('tbody tr')).filter(r => r.querySelector('td a'));
  }

  function parseAmount(str) {
    if (!str) return 0;
    return parseInt(str.replace(/[^0-9]/g, ''), 10) || 0;
  }

  function formatYen(n) {
    return '¥' + Math.round(n).toLocaleString();
  }

  // 商品名を正規化（余分な空白・改行を除去）
  function normalizeName(str) {
    return str ? str.replace(/\s+/g, ' ').trim() : '';
  }

  function getColMap(table) {
    const ths = Array.from(table.querySelectorAll('th')).map(h => h.textContent.trim());
    const cm = {
      name:    ths.findIndex(t => t.includes('商品名')),
      setName: ths.findIndex(t => t.includes('セット名')),
      tax:     ths.findIndex(t => t === '税率'),
      qty:     ths.findIndex(t => t === '受注数' || t === '合計受注数'),
      sub:     ths.findIndex(t => t === '小計'),
      price:   ths.findIndex(t => t === '単価'),
    };
    if (cm.name < 0) cm.name = 0;
    if (cm.qty  < 0) cm.qty  = ths.length - 2;
    if (cm.sub  < 0) cm.sub  = ths.length - 1;
    return cm;
  }

  function getRowData(row, cm) {
    const cols = row.querySelectorAll('td');
    const nameLink = cols[cm.name] ? cols[cm.name].querySelector('a') : null;
    return {
      name:    normalizeName(nameLink ? nameLink.textContent : (cols[cm.name] ? cols[cm.name].textContent : '-')),
      setName: cm.setName >= 0 && cols[cm.setName] ? cols[cm.setName].textContent.trim() : '',
      tax:     cm.tax     >= 0 && cols[cm.tax]     ? cols[cm.tax].textContent.trim()     : '10%',
      qty:     cm.qty     >= 0 && cols[cm.qty]     ? cols[cm.qty].textContent.trim()     : '0',
      sub:     cm.sub     >= 0 && cols[cm.sub]     ? cols[cm.sub].textContent.trim()     : '',
      price:   cm.price   >= 0 && cols[cm.price]   ? cols[cm.price].textContent.trim()   : '',
    };
  }

  // ---- 商品セクションHTML生成（小計あり版）----
  function buildProductSection(rows, cm, groupId) {
    if (!rows.length) return '<p style="color:#888;font-size:12px;margin:4px 0;">商品情報なし</p>';

    const preview = rows.slice(0, PREVIEW_COUNT);
    const rest    = rows.slice(PREVIEW_COUNT);

    let totalEx = 0, totalInc = 0;
    rows.forEach(row => {
      const d = getRowData(row, cm);
      const sub     = parseAmount(d.sub);
      const taxRate = parseFloat(d.tax) / 100 || 0.1;
      totalEx  += sub;
      totalInc += Math.round(sub * (1 + taxRate));
    });

    let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;

    const renderRow = (row, i, hidden, groupId) => {
      const d      = getRowData(row, cm);
      const border = i > 0 ? 'border-top:1px solid #f0f0f0;' : '';
      const cls    = hidden ? `class="pp-hidden-${groupId}"` : '';
      const disp   = hidden ? 'display:none;' : '';
      return `<tr ${cls} style="${disp}">
        <td style="padding:4px 6px 4px 0;${border}vertical-align:top;max-width:175px;word-break:break-all;">
          ${d.name}${d.setName ? `<br><span style="color:#999;font-size:11px;">${d.setName}</span>` : ''}
        </td>
        <td style="padding:4px 6px 4px 0;${border}vertical-align:top;white-space:nowrap;">×${d.qty}</td>
        <td style="padding:4px 0;${border}vertical-align:top;white-space:nowrap;text-align:right;">${d.sub || '-'}</td>
      </tr>`;
    };

    preview.forEach((row, i) => { html += renderRow(row, i, false, ''); });

    if (rest.length > 0) {
      rest.forEach((row, i) => { html += renderRow(row, preview.length + i, true, groupId); });
      html += `<tr><td colspan="3" style="padding:3px 0;">
        <button class="pp-more-btn" data-group="pp-hidden-${groupId}"
          style="background:none;border:1px solid #ccc;border-radius:4px;padding:2px 10px;font-size:11px;color:#555;cursor:pointer;">
          ▼ 他 ${rest.length} 件を表示
        </button></td></tr>`;
    }

    html += `<tr><td colspan="3" style="border-top:2px solid #eee;padding-top:5px;text-align:right;font-size:12px;">
      <span style="color:#666;">税別 ${formatYen(totalEx)}</span>　<strong>税込 ${formatYen(totalInc)}</strong>
    </td></tr></table>`;

    return html;
  }

  // ---- 受注詳細パース ----
  function parseOrderDetail(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const orderNo   = getTableValue(doc, '受注番号');
    const orderDate = getTableValue(doc, '受注日時');
    const company   = getTableValue(doc, '会社名');
    const staff     = getTableValue(doc, '担当者');

    const shippingSelects = Array.from(doc.querySelectorAll('select')).filter(sel =>
      Array.from(sel.options).some(o => o.textContent.includes('発送'))
    );

    const shipped = [], unshipped = [];

    shippingSelects.forEach(sel => {
      const opt = sel.options[sel.selectedIndex];
      const isShipped = opt && (opt.textContent.includes('発送済') || opt.textContent.includes('出荷済'));

      // 納品日を取得
      let deliveryDate = '';
      let container = sel.closest('table') || sel.closest('div') || sel.parentElement;
      for (let i = 0; i < 10; i++) {
        if (!container) break;
        const tds = container.querySelectorAll ? Array.from(container.querySelectorAll('td, label')) : [];
        for (const td of tds) {
          if (td.textContent.trim().replace(/\s+/g, '') === '納品日') {
            const next = td.nextElementSibling;
            if (next) {
              const input = next.querySelector('input[type="text"], input:not([type])');
              const val = input ? (input.getAttribute('value') || input.value || '').trim() : next.textContent.trim();
              if (val) { deliveryDate = val; break; }
            }
          }
        }
        // 「納品日」ラベルのすぐ後のinputを直接探す
        if (!deliveryDate) {
          const inputs = container.querySelectorAll ? Array.from(container.querySelectorAll('input')) : [];
          for (const input of inputs) {
            const prev = input.previousElementSibling || input.parentElement?.previousElementSibling;
            if (prev && prev.textContent.includes('納品日')) {
              deliveryDate = (input.getAttribute('value') || input.value || '').trim();
              if (deliveryDate) break;
            }
          }
        }
        if (deliveryDate) break;
        container = container.parentElement;
      }

      let searchEl = sel.closest('table') || sel.closest('div') || sel.parentElement;
      let productTable = null;
      for (let i = 0; i < 12; i++) {
        if (!searchEl) break;
        const siblings = searchEl.parentElement ? Array.from(searchEl.parentElement.children) : [];
        const idx = siblings.indexOf(searchEl);
        for (let j = idx + 1; j < siblings.length; j++) {
          const sib = siblings[j];
          const ths = sib.querySelectorAll ? Array.from(sib.querySelectorAll('th')).map(h => h.textContent.trim()) : [];
          if (ths.some(t => t.includes('商品名')) && ths.some(t => t.includes('小計'))) {
            productTable = sib.tagName === 'TABLE' ? sib : sib.querySelector('table');
            break;
          }
        }
        if (productTable) break;
        searchEl = searchEl.parentElement;
      }

      if (productTable) {
        const cm   = getColMap(productTable);
        const rows = extractProductRows(productTable);
        if (isShipped) shipped.push({ rows, cm, deliveryDate });
        else           unshipped.push({ rows, cm, deliveryDate });
      }
    });

    // フォールバック
    if (!shipped.length && !unshipped.length) {
      for (const table of doc.querySelectorAll('table')) {
        const ths = Array.from(table.querySelectorAll('th')).map(h => h.textContent.trim());
        if (ths.some(t => t.includes('商品名')) && ths.some(t => t.includes('小計'))) {
          unshipped.push({ rows: extractProductRows(table), cm: getColMap(table) });
        }
      }
    }

    // 受注TOTAL
    let grandEx = 0, grandInc = 0;
    [...shipped, ...unshipped].forEach(({ rows, cm }) => {
      rows.forEach(row => {
        const d = getRowData(row, cm);
        const sub     = parseAmount(d.sub);
        const taxRate = parseFloat(d.tax) / 100 || 0.1;
        grandEx  += sub;
        grandInc += Math.round(sub * (1 + taxRate));
      });
    });

    const hasBoth = shipped.length > 0 && unshipped.length > 0;
    const isCustomerPage = /\/admin\/customer\//.test(window.location.pathname);
    let bodyHtml = '';

    // 発送済みの納品日別グループHTML（会員ページのみ）
    function buildShippedByDeliveryDate(shippedBlocks) {
      // 納品日でグループ化
      const groups = {};
      shippedBlocks.forEach(({ rows, cm, deliveryDate }) => {
        const key = deliveryDate || '未設定';
        if (!groups[key]) groups[key] = { rows: [], cm };
        groups[key].rows.push(...rows);
      });

      // 日付順ソート（未設定は末尾）
      const sortedKeys = Object.keys(groups).sort((a, b) => {
        if (a === '未設定') return 1;
        if (b === '未設定') return -1;
        return a.localeCompare(b);
      });

      let html = '';
      sortedKeys.forEach((key, i) => {
        const { rows, cm } = groups[key];
        const groupId = `sh_${i}`;
        html += `
          <div style="margin-bottom:10px;">
            <div style="font-size:11px;color:#555;font-weight:bold;
                        background:#f5f5f5;padding:3px 6px;border-radius:3px;margin-bottom:4px;">
              📅 納品日: ${key}
            </div>
            ${buildProductSection(rows, cm, groupId)}
          </div>`;
      });
      return html;
    }

    if (hasBoth) {
      const shRows = shipped.flatMap(x => x.rows);
      const unRows = unshipped.flatMap(x => x.rows);
      const shippedContent = isCustomerPage
        ? buildShippedByDeliveryDate(shipped)
        : buildProductSection(shRows, shipped[0].cm, 'shipped');
      bodyHtml = `
        <div style="display:flex;border-bottom:1px solid #eee;margin-bottom:8px;">
          <div class="pp-tab" data-target="pp-shipped"
            style="padding:5px 14px;cursor:pointer;font-size:12px;
                   border-bottom:2px solid #1a73e8;color:#1a73e8;font-weight:bold;background:#fff;">
            📦 発送済み (${shRows.length})
          </div>
          <div class="pp-tab" data-target="pp-unshipped"
            style="padding:5px 14px;cursor:pointer;font-size:12px;
                   border-bottom:2px solid transparent;color:#666;background:#f5f5f5;">
            🕐 未発送 (${unRows.length})
          </div>
        </div>
        <div id="pp-shipped" class="pp-panel" style="display:block;">
          ${shippedContent}
        </div>
        <div id="pp-unshipped" class="pp-panel" style="display:none;">
          ${buildProductSection(unRows, unshipped[0].cm, 'unshipped')}
        </div>`;
    } else if (shipped.length > 0) {
      const shippedContent = isCustomerPage
        ? buildShippedByDeliveryDate(shipped)
        : buildProductSection(shipped.flatMap(x=>x.rows), shipped[0].cm, 'shipped');
      bodyHtml = `<div style="font-size:11px;font-weight:bold;color:#080;margin-bottom:6px;">📦 発送済み</div>
        ${shippedContent}`;
    } else {
      const cm = unshipped[0]?.cm || { name:0, setName:1, tax:2, qty:3, sub:4, price:-1 };
      bodyHtml = `<div style="font-size:11px;font-weight:bold;color:#c06000;margin-bottom:6px;">🕐 未発送</div>
        ${buildProductSection(unshipped.flatMap(x=>x.rows), cm, 'unshipped')}`;
    }

    return `
      <div style="padding:12px 16px 0;">
        <div style="border-bottom:2px solid #1a73e8;margin-bottom:10px;padding-bottom:7px;">
          <strong style="font-size:14px;color:#1a73e8;">受注 #${orderNo}</strong>
          <span style="float:right;font-size:11px;color:#888;">${orderDate.substring(0,16)}</span>
        </div>
        <div style="margin-bottom:10px;">
          🏥 <strong>${company}</strong>
          ${staff && staff !== '-' ? `<span style="color:#555;font-size:12px;">　${staff}</span>` : ''}
        </div>
        ${bodyHtml}
        <div style="border-top:2px solid #1a73e8;margin-top:8px;padding:8px 0 10px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <strong>受注 TOTAL</strong>
            <span><span style="color:#666;">税別 ${formatYen(grandEx)}</span>　<strong style="color:#1a73e8;">税込 ${formatYen(grandInc)}</strong></span>
          </div>
        </div>
      </div>`;
  }

  // 出荷詳細パース（受注詳細を参照して金額計算）
  function parseLogisticsDetail(logisticsHtml, logisticsId, orderHtml) {
    const parser = new DOMParser();
    const ldoc = parser.parseFromString(logisticsHtml, 'text/html');

    // 発送状況
    let statusText = '-';
    for (const td of ldoc.querySelectorAll('td')) {
      if (td.textContent.trim() === '発送状況') {
        const next = td.nextElementSibling;
        if (next) { statusText = next.textContent.trim(); break; }
      }
    }
    if (statusText === '-') {
      for (const sel of ldoc.querySelectorAll('select')) {
        if (Array.from(sel.options).some(o => o.textContent.includes('発送'))) {
          const opt = sel.options[sel.selectedIndex];
          if (opt) statusText = opt.textContent.trim();
          break;
        }
      }
    }
    const isShipped   = statusText.includes('発送済') || statusText.includes('出荷済');
    const statusColor = isShipped ? '#080' : '#c06000';
    const statusIcon  = isShipped ? '📦' : '🕐';

    // 出荷詳細の商品行
    let lRows = [], lCm = { name:0, setName:1, tax:-1, qty:3, sub:-1, price:-1 };
    for (const table of ldoc.querySelectorAll('table')) {
      const ths = Array.from(table.querySelectorAll('th')).map(h => h.textContent.trim());
      if (ths.some(t => t.includes('商品名'))) {
        lCm = {
          name:    ths.findIndex(t => t.includes('商品名')),
          setName: ths.findIndex(t => t.includes('セット名')),
          tax:     -1,
          qty:     ths.findIndex(t => t === '受注数' || t === '合計受注数'),
          sub:     -1,
          price:   -1,
        };
        if (lCm.name < 0) lCm.name = 0;
        if (lCm.qty  < 0) lCm.qty  = ths.length - 1;
        lRows = extractProductRows(table);
        break;
      }
    }

    // 受注詳細から対応する出荷ブロックの商品単価を取得
    // 戦略：出荷詳細の受注番号列の値を使って受注詳細の商品テーブルを照合
    const priceMap = {};
    if (orderHtml) {
      const odoc = parser.parseFromString(orderHtml, 'text/html');

      // 出荷詳細の商品行にある受注番号（最初の行から取得）
      let targetOrderNo = null;
      if (lRows.length > 0) {
        // 出荷詳細テーブルの「受注番号」列インデックスを取得
        let orderNoColIdx = -1;
        for (const table of ldoc.querySelectorAll('table')) {
          const ths = Array.from(table.querySelectorAll('th')).map(h => h.textContent.trim());
          if (ths.some(t => t.includes('商品名'))) {
            orderNoColIdx = ths.findIndex(t => t === '受注番号');
            if (orderNoColIdx >= 0) {
              const firstRow = lRows[0];
              const cols = firstRow.querySelectorAll('td');
              const orderNoLink = cols[orderNoColIdx] ? cols[orderNoColIdx].querySelector('a') : null;
              targetOrderNo = orderNoLink ? orderNoLink.textContent.trim() : (cols[orderNoColIdx] ? cols[orderNoColIdx].textContent.trim() : null);
            }
            break;
          }
        }
      }


      // 受注詳細の商品テーブルをすべて取得
      const allProductTables = Array.from(odoc.querySelectorAll('table')).filter(table => {
        const ths = Array.from(table.querySelectorAll('th')).map(h => h.textContent.trim());
        return ths.some(t => t.includes('商品名')) && ths.some(t => t.includes('小計'));
      });

      // 受注番号で対応テーブルを特定
      let targetTable = null;
      if (targetOrderNo) {
        for (const table of allProductTables) {
          const rows = extractProductRows(table);
          if (rows.length > 0) {
            // テーブル内の受注番号列を確認
            const ths = Array.from(table.querySelectorAll('th')).map(h => h.textContent.trim());
            const orderNoIdx = ths.findIndex(t => t === '受注番号');
            if (orderNoIdx >= 0) {
              const firstRow = rows[0];
              const cols = firstRow.querySelectorAll('td');
              const orderNoLink = cols[orderNoIdx] ? cols[orderNoIdx].querySelector('a') : null;
              const rowOrderNo  = orderNoLink ? orderNoLink.textContent.trim() : (cols[orderNoIdx] ? cols[orderNoIdx].textContent.trim() : '');
              if (rowOrderNo === targetOrderNo) {
                targetTable = table;
                break;
              }
            }
          }
        }
      }

      // 受注番号で見つからない場合は発送IDの順番で対応（フォールバック）
      if (!targetTable && allProductTables.length > 0) {
        const allText = odoc.body ? odoc.body.textContent : '';
        const idMatches = [...allText.matchAll(/Bカート発送ID\s*(\d+)/g)];
        const idList = idMatches.map(m => m[1]);
        const matchIdx = idList.findIndex(id => id === logisticsId);
        targetTable = matchIdx >= 0 && matchIdx < allProductTables.length
          ? allProductTables[matchIdx]
          : allProductTables[0];
      }

      if (targetTable) {
        const oCm = getColMap(targetTable);
        extractProductRows(targetTable).forEach(row => {
          const d       = getRowData(row, oCm);
          const sub     = parseAmount(d.sub);
          const qty     = parseInt(d.qty, 10) || 1;
          const taxRate = parseFloat(d.tax) / 100 || 0.1;
          priceMap[d.name] = { unitPrice: qty > 0 ? sub / qty : 0, taxRate };
        });
      }
    }

    // 金額計算
    let totalEx = 0, totalInc = 0;
    const enrichedRows = lRows.map(row => {
      const d    = getRowData(row, lCm);
      const qty  = parseInt(d.qty, 10) || 0;
      const info = priceMap[d.name] || { unitPrice: 0, taxRate: 0.1 };
      const sub  = Math.round(info.unitPrice * qty);
      totalEx  += sub;
      totalInc += Math.round(sub * (1 + info.taxRate));
      return { row, sub };
    });

    if (!lRows.length) {
      return `<div style="padding:12px 16px 10px;">
        <div style="border-bottom:2px solid #888;margin-bottom:10px;padding-bottom:7px;">
          <strong style="font-size:14px;color:#555;">発送ID #${logisticsId}</strong>
          <span style="float:right;font-size:12px;font-weight:bold;color:${statusColor};">${statusIcon} ${statusText}</span>
        </div>
        <p style="color:#888;font-size:12px;">商品情報なし</p>
      </div>`;
    }

    const preview = enrichedRows.slice(0, PREVIEW_COUNT);
    const rest    = enrichedRows.slice(PREVIEW_COUNT);

    let tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;
    const renderLRow = ({ row, sub }, i, hidden) => {
      const d      = getRowData(row, lCm);
      const border = i > 0 ? 'border-top:1px solid #f0f0f0;' : '';
      const cls    = hidden ? 'class="pp-hidden-lg"' : '';
      const disp   = hidden ? 'display:none;' : '';
      const subStr = sub > 0 ? formatYen(sub) : '-';
      return `<tr ${cls} style="${disp}">
        <td style="padding:4px 6px 4px 0;${border}vertical-align:top;max-width:175px;word-break:break-all;">
          ${d.name}${d.setName ? `<br><span style="color:#999;font-size:11px;">${d.setName}</span>` : ''}
        </td>
        <td style="padding:4px 6px 4px 0;${border}vertical-align:top;white-space:nowrap;">×${d.qty}</td>
        <td style="padding:4px 0;${border}vertical-align:top;white-space:nowrap;text-align:right;">${subStr}</td>
      </tr>`;
    };

    preview.forEach((er, i) => { tableHtml += renderLRow(er, i, false); });
    if (rest.length > 0) {
      rest.forEach((er, i) => { tableHtml += renderLRow(er, preview.length + i, true); });
      tableHtml += `<tr><td colspan="3" style="padding:3px 0;">
        <button class="pp-more-btn" data-group="pp-hidden-lg"
          style="background:none;border:1px solid #ccc;border-radius:4px;padding:2px 10px;font-size:11px;color:#555;cursor:pointer;">
          ▼ 他 ${rest.length} 件を表示
        </button></td></tr>`;
    }

    tableHtml += `<tr><td colspan="3" style="border-top:2px solid #eee;padding-top:5px;text-align:right;font-size:12px;">
      <span style="color:#666;">税別 ${formatYen(totalEx)}</span>　<strong>税込 ${formatYen(totalInc)}</strong>
    </td></tr></table>`;

    return `
      <div style="padding:12px 16px 0;">
        <div style="border-bottom:2px solid #888;margin-bottom:10px;padding-bottom:7px;">
          <strong style="font-size:14px;color:#555;">発送ID #${logisticsId}</strong>
          <span style="float:right;font-size:12px;font-weight:bold;color:${statusColor};">${statusIcon} ${statusText}</span>
        </div>
        ${tableHtml}
        <div style="border-top:2px solid #888;margin-top:8px;padding:8px 0 10px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;">
            <strong>合計</strong>
            <span><span style="color:#666;">税別 ${formatYen(totalEx)}</span>　<strong>税込 ${formatYen(totalInc)}</strong></span>
          </div>
        </div>
      </div>`;
  }

  // ---- データ取得 ----
  function fetchHtml(url, callback) {
    GM_xmlhttpRequest({
      method: 'GET', url,
      onload(res)  { callback(res.status === 200 ? res.responseText : null); },
      onerror()    { callback(null); }
    });
  }

  // rawHTMLキャッシュ（パース済みではなく生HTMLを保存）
  const rawCache = {};

  function fetchAndShow(url, parseFunc, x, y) {
    if (currentUrl === url) return;
    currentUrl = url;

    // キャッシュがあれば再パース（スクリプト更新後も正しく動く）
    if (rawCache[url]) {
      try {
        const result = parseFunc(rawCache[url]);
        showPopup(x, y, result);
      } catch(e) {
        showPopup(x, y, `<div style="padding:12px 16px;color:#c00;">解析エラー: ${e.message}</div>`);
      }
      return;
    }

    popup.innerHTML = '<div style="padding:14px 16px;color:#888;">読み込み中...</div>';
    popup.style.display = 'block';
    updatePosition(x, y);

    fetchHtml(url, html => {
      if (!html) {
        showPopup(x, y, '<div style="padding:12px 16px;color:#c00;">取得失敗</div>');
        return;
      }
      try {
        rawCache[url] = html;
        const result = parseFunc(html);
        if (currentUrl === url) showPopup(x, y, result);
      } catch(e) {
        showPopup(x, y, `<div style="padding:12px 16px;color:#c00;">解析エラー: ${e.message}</div>`);
      }
    });
  }

  // 出荷詳細：2段階取得（出荷詳細→受注詳細）
  function fetchLogisticsAndShow(logisticsUrl, logisticsId, x, y) {
    if (currentUrl === logisticsUrl) return;
    currentUrl = logisticsUrl;

    popup.innerHTML = '<div style="padding:14px 16px;color:#888;">読み込み中...</div>';
    popup.style.display = 'block';
    updatePosition(x, y);

    const doFetch = (logisticsHtml) => {
      const ldoc = new DOMParser().parseFromString(logisticsHtml, 'text/html');
      let orderUrl = null;
      const allLinks = ldoc.querySelectorAll('a');
      for (const a of allLinks) {
        const href = a.getAttribute('href') || '';
        if (/\/admin\/order\/\d+\/view/.test(href)) {
          orderUrl = href.startsWith('http') ? href : `https://pitto.i15.bcart.jp${href}`;
          break;
        }
      }

      const finish = (orderHtml) => {
        try {
          const result = parseLogisticsDetail(logisticsHtml, logisticsId, orderHtml);
          if (currentUrl === logisticsUrl) showPopup(x, y, result);
        } catch(e) {
          showPopup(x, y, `<div style="padding:12px 16px;color:#c00;">解析エラー: ${e.message}</div>`);
        }
      };

      if (orderUrl) {
        if (rawCache[orderUrl]) {
          finish(rawCache[orderUrl]);
        } else {
          fetchHtml(orderUrl, orderHtml => {
            if (orderHtml) rawCache[orderUrl] = orderHtml;
            finish(orderHtml);
          });
        }
      } else {
        finish(null);
      }
    };

    if (rawCache[logisticsUrl]) {
      doFetch(rawCache[logisticsUrl]);
    } else {
      fetchHtml(logisticsUrl, logisticsHtml => {
        if (!logisticsHtml) {
          showPopup(x, y, '<div style="padding:12px 16px;color:#c00;">出荷情報取得失敗</div>');
          return;
        }
        rawCache[logisticsUrl] = logisticsHtml;
        doFetch(logisticsHtml);
      });
    }
  }

  // ---- ホバーイベント ----
  function attachHover(link, fullUrl, parseFunc) {
    if (link.dataset.hoverAttached) return;
    link.dataset.hoverAttached = '1';
    link.addEventListener('mouseenter', e => { clearTimeout(hideTimer); parseFunc(fullUrl, e.clientX, e.clientY); });
    link.addEventListener('mousemove',  e => { if (popup.style.display === 'block') updatePosition(e.clientX, e.clientY); });
    link.addEventListener('mouseleave', () => { hideTimer = setTimeout(hidePopup, 400); });
  }

  function attachHoverEvents() {
    document.querySelectorAll('a[href*="/admin/order/"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!/\/admin\/order\/\d+\/view/.test(href)) return;
      if (!/^\d+$/.test(link.textContent.trim())) return;
      const url = href.startsWith('http') ? href : `https://pitto.i15.bcart.jp${href}`;
      attachHover(link, url, (u, x, y) => fetchAndShow(u, parseOrderDetail, x, y));
    });

    document.querySelectorAll('a[href*="/admin/logistics/"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      const m = href.match(/\/admin\/logistics\/(\d+)\/view/);
      if (!m) return;
      const url = href.startsWith('http') ? href : `https://pitto.i15.bcart.jp${href}`;
      attachHover(link, url, (u, x, y) => fetchLogisticsAndShow(u, m[1], x, y));
    });
  }

  attachHoverEvents();
  new MutationObserver(attachHoverEvents).observe(document.body, { childList: true, subtree: true });

})();