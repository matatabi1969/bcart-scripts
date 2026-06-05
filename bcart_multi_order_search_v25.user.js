// ==UserScript==
// @name         Bカート 複数受注番号まとめて検索 v25（発送指示書デザイン統合）
// @namespace    http://tampermonkey.net/
// @version      25.41
// @description  複数受注番号の絞り込み・納品書印刷・ドラッグ移動・ポップアップ時自動非表示
// @author       You
// @match        https://*.bcart.jp/admin/order*
// @match        https://*.bcart.jp/admin/logistics*
// @match        https://*.bcart.jp/admin/order/list*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'bcart_multi_search_v4';

  // =============================================
  // GAS連携設定
  // スプレッドシートID: 1fAuULNLAFYvIt3W_D8NXX9RpmlYFBOhViuVmOhXtndw
  // GASをWebアプリとしてデプロイしたURLを下記に設定してください
  // =============================================
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwZkAZDpo7kGQDnVoyg7YxFbzsFhatASvQTc-zVbrTne53o9RjG4fPRpjT328NXrre4/exec';

  function notifyGAS(orders, shippingHtml) {
    if (!GAS_URL) return;
    try {
      const payload = JSON.stringify({
        orders: orders.map(o => ({
          logisticsId: o.logisticsId || '',
          orderCode:   o.orderCode   || '',
          companyName: o.companyName || '',
          personName:  o.personName  || '',
          tel:         o.tel         || '',
          zip:         o.zip         || '',
          address1:    o.address1    || '',
          address2:    o.address2    || '',
          address3:    o.address3    || '',
        })),
        shippingHtml: shippingHtml || '',
      });
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = GAS_URL;
      form.target = 'gas_iframe_' + Date.now();
      form.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = payload;
      form.appendChild(input);
      const iframe = document.createElement('iframe');
      iframe.name = form.target;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      document.body.appendChild(form);
      form.submit();
      setTimeout(() => {
        try { document.body.removeChild(form); document.body.removeChild(iframe); } catch(e) {}
      }, 5000);
      console.log('[GAS通知] POST送信:', orders.length, '件');
    } catch(e) {
      console.error('[GAS通知] エラー:', e);
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    #bcart-panel {
      position: fixed; top: 80px; right: 20px; z-index: 99999; width: 300px;
      background: #ffffff; border: 2px solid #3a7bd5; border-radius: 10px;
      box-shadow: 0 4px 24px rgba(58,123,213,0.18);
      font-family: 'Hiragino Kaku Gothic Pro', Meiryo, sans-serif; font-size: 13px; cursor: default;
    }
    #bcart-panel.minimized #bcart-body { display: none; }
    #bcart-panel.hidden { display: none !important; }
    #bcart-header {
      background: linear-gradient(135deg, #3a7bd5, #2563b0); color: white;
      padding: 10px 14px; border-radius: 8px 8px 0 0;
      display: flex; justify-content: space-between; align-items: center;
      user-select: none; cursor: grab;
    }
    #bcart-header:active { cursor: grabbing; }
    #bcart-header span { font-weight: bold; font-size: 13px; pointer-events: none; }
    #bcart-min-btn {
      background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 4px;
      padding: 2px 8px; cursor: pointer; font-size: 12px; pointer-events: all;
    }
    #bcart-body { padding: 14px; }
    #bcart-tabs { display: flex; border-bottom: 2px solid #e2e8f0; margin-bottom: 12px; }
    .bcart-tab {
      flex: 1; text-align: center; padding: 6px 0; cursor: pointer;
      color: #94a3b8; font-size: 12px; font-weight: bold;
      border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s;
    }
    .bcart-tab.active { color: #3a7bd5; border-bottom: 2px solid #3a7bd5; }
    .bcart-tab-content { display: none; }
    .bcart-tab-content.active { display: block; }
    #bcart-text-input {
      width: 100%; height: 100px; border: 1px solid #cbd5e1; border-radius: 6px;
      padding: 8px; font-size: 13px; resize: vertical; box-sizing: border-box;
      color: #1e293b; line-height: 1.6; outline: none;
    }
    #bcart-text-input:focus { border-color: #3a7bd5; box-shadow: 0 0 0 3px rgba(58,123,213,0.1); }
    #bcart-drop-area {
      border: 2px dashed #93c5fd; border-radius: 8px; padding: 16px 10px;
      text-align: center; color: #64748b; background: #f0f7ff;
      cursor: pointer; font-size: 12px; line-height: 1.7;
    }
    #bcart-drop-area:hover { background: #dbeafe; border-color: #3a7bd5; }
    #bcart-drop-area .icon { font-size: 20px; display: block; margin-bottom: 4px; }
    #bcart-file-input { display: none; }
    #bcart-file-name { margin-top: 6px; font-size: 11px; color: #3a7bd5; font-weight: bold; }
    #bcart-preview {
      margin-top: 6px; font-size: 11px; color: #475569; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 5px; padding: 5px 8px;
      display: none; max-height: 60px; overflow-y: auto;
    }
    .bcart-hint { color: #94a3b8; font-size: 11px; margin: 4px 0 8px; }
    #bcart-search-btn {
      width: 100%; background: linear-gradient(135deg, #3a7bd5, #2563b0);
      color: white; border: none; border-radius: 6px; padding: 9px 0;
      font-size: 13px; font-weight: bold; cursor: pointer; margin-top: 4px;
    }
    #bcart-search-btn:hover { opacity: 0.88; }
    #bcart-search-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #bcart-status { margin-top: 8px; font-size: 12px; color: #475569; text-align: center; min-height: 16px; }
    #bcart-progress-wrap { margin-top: 6px; background: #e2e8f0; border-radius: 99px; height: 6px; overflow: hidden; display: none; }
    #bcart-progress-bar { height: 100%; background: linear-gradient(90deg, #3a7bd5, #60a5fa); border-radius: 99px; width: 0%; transition: width 0.3s; }
    #bcart-restore-banner { display: none; margin-top: 8px; background: #fefce8; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #92400e; text-align: center; }
    #bcart-filter-banner { display: none; margin-top: 8px; background: #dbeafe; border: 1px solid #93c5fd; border-radius: 6px; padding: 7px 10px; font-size: 12px; color: #1d4ed8; text-align: center; line-height: 1.6; }
    #bcart-print-area { display: none; margin-top: 10px; }
    #bcart-print-area .print-title { font-size: 11px; color: #475569; font-weight: bold; margin-bottom: 6px; text-align: center; }
    .bcart-print-btn-group { display: flex; gap: 6px; }
    .bcart-print-btn { flex: 1; border: none; border-radius: 6px; padding: 8px 0; font-size: 12px; font-weight: bold; cursor: pointer; }
    .bcart-print-btn:hover { opacity: 0.85; }
    .bcart-print-btn.one { background: #f0f9ff; color: #0369a1; border: 1.5px solid #7dd3fc; }
    .bcart-print-btn.all { background: linear-gradient(135deg, #0ea5e9, #0369a1); color: white; }
    .bcart-print-btn.checked { width: 100%; margin-top: 6px; background: linear-gradient(135deg, #16a34a, #15803d); color: white; }
    .bcart-print-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    #bcart-reset-btn {
      margin-top: 6px; width: 100%; background: #fee2e2; color: #dc2626;
      border: 1px solid #fca5a5; border-radius: 6px; padding: 7px 0;
      font-size: 12px; font-weight: bold; cursor: pointer; display: none;
    }
    .bcart-filtered-out { display: none !important; }
    .bcart-highlight td { background: #eff6ff !important; }
    .bcart-date-area { margin-top: 10px; }
    .bcart-date-area .print-title { font-size: 11px; color: #475569; font-weight: bold; margin-bottom: 6px; text-align: center; }
    #bcart-date-picker {
      display: none; background: #f8fafc; border: 1.5px solid #e2e8f0;
      border-radius: 8px; padding: 10px 12px; margin-top: 6px;
    }
    .bcart-date-row {
      display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px;
    }
    .bcart-date-row label { color: #475569; font-weight: bold; min-width: 44px; }
    .bcart-date-input {
      flex: 1; border: 1px solid #cbd5e1; border-radius: 5px;
      padding: 5px 8px; font-size: 12px; color: #1e293b; outline: none;
    }
    .bcart-date-input:focus { border-color: #3a7bd5; }
    #bcart-date-apply-btn {
      width: 100%; background: linear-gradient(135deg, #0891b2, #0e7490);
      color: white; border: none; border-radius: 6px; padding: 8px 0;
      font-size: 12px; font-weight: bold; cursor: pointer; margin-top: 2px;
    }
    #bcart-date-apply-btn:hover { opacity: 0.88; }
    #bcart-date-apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'bcart-panel';
  panel.classList.add('minimized');
  panel.innerHTML = `
    <div id="bcart-header">
      <span>⠿ 複数受注番号 まとめて検索</span>
      <button id="bcart-min-btn">＋</button>
    </div>
    <div id="bcart-body">
      <div id="bcart-tabs">
        <div class="bcart-tab active" data-tab="text">手入力</div>
        <div class="bcart-tab" data-tab="csv">CSVアップロード</div>
      </div>
      <div class="bcart-tab-content active" id="tab-text">
        <textarea id="bcart-text-input" placeholder="例：&#10;17790995019&#10;20003182&#10;（受注番号・発送ID両対応）"></textarea>
        <div class="bcart-hint">※ 1行に1つ入力（受注番号・発送ID混在OK）</div>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;margin-top:4px;">
          <input type="checkbox" id="bcart-exclude-shipped" style="width:14px;height:14px;">
          発送済みを除外する
        </label>
      </div>
      <div class="bcart-tab-content" id="tab-csv">
        <div id="bcart-drop-area">
          <span class="icon">📂</span>
          クリックまたはCSVをここにドロップ<br><small>（1列目に受注番号）</small>
        </div>
        <input type="file" id="bcart-file-input" accept=".csv">
        <div id="bcart-file-name"></div>
        <div id="bcart-preview"></div>
      </div>
      <button id="bcart-search-btn">一覧に絞り込んで表示する</button>
      <div id="bcart-status"></div>
      <div id="bcart-progress-wrap"><div id="bcart-progress-bar"></div></div>
      <div id="bcart-restore-banner"></div>
      <div id="bcart-filter-banner"></div>
      <div id="bcart-print-area">
        <div class="print-title">🖨 納品書を印刷</div>
        <div class="bcart-print-btn-group">
          <button class="bcart-print-btn one" id="bcart-print-one">1件ずつ印刷</button>
          <button class="bcart-print-btn all" id="bcart-print-all">まとめて印刷</button>
        </div>
        <button class="bcart-print-btn checked" id="bcart-print-checked">☑ チェックした件を印刷</button>
        <div class="print-title" style="margin-top:10px;">📋 発送指示書</div>
        <button class="bcart-print-btn" id="bcart-shipping-inst" style="width:100%;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;">☑ チェックした件の発送指示書を作成</button>
      </div>
      <div class="bcart-date-area" id="bcart-date-area" style="display:none;">
        <div class="print-title">📅 発送日・納品日を設定</div>
        <button class="bcart-print-btn" id="bcart-date-open-btn" style="width:100%;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;">📅 日付を設定する</button>
        <div id="bcart-date-picker">
          <div class="bcart-date-row">
            <label>発送日</label>
            <input type="date" class="bcart-date-input" id="bcart-ship-date">
          </div>
          <div class="bcart-date-row">
            <label>納品日</label>
            <input type="date" class="bcart-date-input" id="bcart-arrival-date">
          </div>
          <button id="bcart-date-apply-btn">✓ チェックした件に適用</button>
        </div>
      </div>
      <button id="bcart-reset-btn">✕ 絞り込みを解除する</button>
    </div>
  `;
  document.body.appendChild(panel);

  // ドラッグ移動
  (function() {
    let dragging = false, ox = 0, oy = 0;
    const header = document.getElementById('bcart-header');
    const minBtn = document.getElementById('bcart-min-btn');
    try {
      const pos = JSON.parse(localStorage.getItem('bcart_panel_pos'));
      if (pos) { panel.style.right = 'auto'; panel.style.left = pos.left; panel.style.top = pos.top; }
    } catch(e) {}
    header.addEventListener('mousedown', function(e) {
      if (e.target === minBtn) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      panel.style.right = 'auto'; panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
      ox = e.clientX - rect.left; oy = e.clientY - rect.top;
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      let l = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, e.clientX - ox));
      let t = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - oy));
      panel.style.left = l + 'px'; panel.style.top = t + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!dragging) return; dragging = false;
      try { localStorage.setItem('bcart_panel_pos', JSON.stringify({ left: panel.style.left, top: panel.style.top })); } catch(e) {}
    });
  })();

  // 折りたたみ
  const minBtn = document.getElementById('bcart-min-btn');
  minBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    panel.classList.toggle('minimized');
    minBtn.textContent = panel.classList.contains('minimized') ? '＋' : '－';
  });

  // モーダル検知
  const modalObserver = new MutationObserver(() => {
    const hasModal = document.body.classList.contains('modaal-noscroll') || document.body.classList.contains('modal-open') || !!document.querySelector('.modaal-overlay, .modal-backdrop');
    panel.classList.toggle('hidden', hasModal);
  });
  modalObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });

  // タブ切り替え
  document.querySelectorAll('.bcart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.bcart-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.bcart-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // CSV
  let csvOrderNumbers = [];
  const dropArea = document.getElementById('bcart-drop-area');
  const fileInput = document.getElementById('bcart-file-input');
  const fileNameDiv = document.getElementById('bcart-file-name');
  const previewDiv = document.getElementById('bcart-preview');
  dropArea.addEventListener('click', () => fileInput.click());
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.background = '#dbeafe'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.background = '#f0f7ff'; });
  dropArea.addEventListener('drop', e => { e.preventDefault(); dropArea.style.background = '#f0f7ff'; if (e.dataTransfer.files[0]) parseCSV(e.dataTransfer.files[0]); });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) parseCSV(fileInput.files[0]); });
  function parseCSV(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const lines = e.target.result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const nums = [];
      lines.forEach(line => { const col = line.split(',')[0].replace(/"/g, '').trim(); if (/^\d+$/.test(col)) nums.push(col); });
      csvOrderNumbers = [...new Set(nums)];
      fileNameDiv.textContent = `📄 ${file.name}（${csvOrderNumbers.length}件）`;
      previewDiv.style.display = 'block';
      previewDiv.innerHTML = csvOrderNumbers.slice(0, 10).join('、') + (csvOrderNumbers.length > 10 ? `…他${csvOrderNumbers.length - 10}件` : '');
    };
    reader.readAsText(file, 'UTF-8');
  }

  // 状態保存
  function saveState(nums) {
    try { document.cookie = `${STORAGE_KEY}=${encodeURIComponent(JSON.stringify({ orderNumbers: nums, url: location.pathname, savedAt: Date.now() }))}; path=/; SameSite=Strict`; } catch(e) {
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ orderNumbers: nums, url: location.pathname, savedAt: Date.now() })); } catch(e2) {}
    }
  }
  function loadState() {
    try {
      const cookieMatch = document.cookie.split(';').find(c => c.trim().startsWith(STORAGE_KEY + '='));
      if (cookieMatch) {
        const data = JSON.parse(decodeURIComponent(cookieMatch.split('=').slice(1).join('=')));
        if (data && data.url === location.pathname && Date.now() - data.savedAt < 3600000) return data;
      }
    } catch(e) {}
    try { const d = JSON.parse(sessionStorage.getItem(STORAGE_KEY)); if (d && d.url === location.pathname && Date.now() - d.savedAt < 3600000) return d; } catch(e) {}
    return null;
  }
  function clearState() {
    document.cookie = `${STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch(e) {}
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    const c = document.cookie.split(';').find(x => x.trim().startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1]) : '';
  }

  // 納品書PDF生成
  async function generateDeliveryNotePDF(id, returnBuffer = false) {
    const now = new Date();
    const fd = new FormData();
    fd.append('_token', getCsrfToken());
    fd.append('logistics_id', id);
    fd.append('qualified', '1');
    fd.append('type', 'logistics');
    fd.append('pdf_type', 'delivery');
    fd.append('date[y]', now.getFullYear().toString());
    fd.append('date[m]', String(now.getMonth() + 1).padStart(2, '0'));
    fd.append('date[d]', String(now.getDate()).padStart(2, '0'));
    fd.append('text', 'この度はご注文頂きありがとうございます。下記の通り納品させて頂きます。');
    fd.append('memo', '');
    fd.append('memo_option', '0');
    fd.append('submit', '作成');
    const res = await fetch(`${location.origin}/admin/invoice/logistics`, { method: 'POST', credentials: 'same-origin', body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return returnBuffer ? res.arrayBuffer() : URL.createObjectURL(await res.blob());
  }

  // PDF-lib
  let pdfLibLoaded = false;
  async function loadPdfLib() {
    if (pdfLibLoaded) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    pdfLibLoaded = true;
  }
  async function mergePDFBuffers(buffers) {
    await loadPdfLib();
    const { PDFDocument } = window.PDFLib;
    const merged = await PDFDocument.create();
    for (const buf of buffers) {
      try { const pdf = await PDFDocument.load(buf); const pages = await merged.copyPages(pdf, pdf.getPageIndices()); pages.forEach(p => merged.addPage(p)); } catch(e) {}
    }
    return URL.createObjectURL(new Blob([await merged.save()], { type: 'application/pdf' }));
  }
  async function printMergedPDFs(ids) {
    const buffers = [];
    for (let i = 0; i < ids.length; i++) {
      statusDiv.textContent = `🖨 生成中… (${i + 1}/${ids.length}) ID: ${ids[i]}`;
      try { buffers.push(await generateDeliveryNotePDF(ids[i], true)); } catch(e) {}
      await new Promise(r => setTimeout(r, 500));
    }
    if (!buffers.length) { statusDiv.textContent = '⚠️ 生成に失敗しました'; return; }
    statusDiv.textContent = '🖨 PDF結合中…';
    const url = await mergePDFBuffers(buffers);
    statusDiv.textContent = '🖨 印刷ダイアログを表示します…';
    const w = window.open(url, '_blank');
    if (!w) { statusDiv.textContent = '⚠️ ポップアップがブロックされています'; return; }
    await new Promise(r => setTimeout(r, 2500));
    try { w.print(); } catch(e) {}
    await new Promise(r => setTimeout(r, 1000));
    URL.revokeObjectURL(url);
  }

  // 発送ID取得
  function getVisibleLogisticsIds() {
    const ids = [];
    document.querySelectorAll('table tbody tr').forEach(row => {
      for (const a of row.querySelectorAll('a')) { if (/^\d{8}$/.test(a.textContent.trim())) { if (!ids.includes(a.textContent.trim())) ids.push(a.textContent.trim()); return; } }
      for (const td of row.querySelectorAll('td')) { if (/^\d{8}$/.test(td.textContent.trim())) { if (!ids.includes(td.textContent.trim())) ids.push(td.textContent.trim()); return; } }
    });
    return ids;
  }
  function getCheckedLogisticsIds() {
    const ids = [];
    document.querySelectorAll('table tbody tr').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]'); if (!cb || !cb.checked) return;
      for (const a of row.querySelectorAll('a')) { if (/^\d{8}$/.test(a.textContent.trim())) { if (!ids.includes(a.textContent.trim())) ids.push(a.textContent.trim()); return; } }
      for (const td of row.querySelectorAll('td')) { if (/^\d{8}$/.test(td.textContent.trim())) { if (!ids.includes(td.textContent.trim())) ids.push(td.textContent.trim()); return; } }
    });
    return ids;
  }
  function getCheckedLogisticsWithOrderCode() {
    const items = [];
    document.querySelectorAll('table tbody tr').forEach(row => {
      const cb = row.querySelector('input[type="checkbox"]'); if (!cb || !cb.checked) return;
      let logisticsId = '', orderCode = '';
      for (const a of row.querySelectorAll('a')) { const txt = a.textContent.trim(); if (/^\d{8}$/.test(txt)) { logisticsId = txt; break; } }
      if (!logisticsId) { for (const td of row.querySelectorAll('td')) { const txt = td.textContent.trim(); if (/^\d{8}$/.test(txt)) { logisticsId = txt; break; } } }
      for (const a of row.querySelectorAll('a')) { const txt = a.textContent.trim(); if (/^\d{11,}$/.test(txt)) { orderCode = txt; break; } }
      if (!orderCode) { for (const td of row.querySelectorAll('td')) { const txt = td.textContent.trim(); if (/^\d{11,}$/.test(txt)) { orderCode = txt; break; } } }
      if (logisticsId) items.push({ logisticsId, orderCode });
    });
    return items;
  }

  // 絞り込み
  const searchBtn    = document.getElementById('bcart-search-btn');
  const statusDiv    = document.getElementById('bcart-status');
  const progressWrap = document.getElementById('bcart-progress-wrap');
  const progressBar  = document.getElementById('bcart-progress-bar');
  const filterBanner = document.getElementById('bcart-filter-banner');
  const restoreBanner= document.getElementById('bcart-restore-banner');
  const resetBtn     = document.getElementById('bcart-reset-btn');
  const printArea    = document.getElementById('bcart-print-area');
  const printOneBtn  = document.getElementById('bcart-print-one');
  const printAllBtn  = document.getElementById('bcart-print-all');
  const printChecked = document.getElementById('bcart-print-checked');

  async function applyFilter(orderNumbers, isRestore = false) {
    searchBtn.disabled = true; progressWrap.style.display = 'block'; progressBar.style.width = '10%';
    if (isRestore) { restoreBanner.style.display = 'block'; restoreBanner.textContent = '🔄 前回の絞り込みを復元中…'; }
    else { statusDiv.textContent = '🔄 検索中…'; }
    const allRows = [];
    for (let i = 0; i < orderNumbers.length; i++) {
      if (!isRestore) statusDiv.textContent = `🔄 検索中… (${i + 1}/${orderNumbers.length})`;
      progressBar.style.width = `${Math.round((i + 1) / orderNumbers.length * 100)}%`;
      try {
        const num = orderNumbers[i];
        const isLogisticsId = /^\d{8}$/.test(num);
        const base = location.pathname.includes('logistics') ? '/admin/logistics/list' : '/admin/order/list';
        const param = isLogisticsId ? `logistics_id=${encodeURIComponent(num)}` : `order_code=${encodeURIComponent(num)}`;
        const res = await fetch(`${base}?${param}`, { credentials: 'same-origin' });
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        doc.querySelectorAll('table tbody tr').forEach(r => {
          const excludeShipped = document.getElementById('bcart-exclude-shipped')?.checked;
          if (excludeShipped && r.innerHTML.includes('change_logistics_status_disabled')) return;
          if (r.textContent.includes(num)) allRows.push(r.outerHTML);
        });
      } catch(e) {}
      await new Promise(r => setTimeout(r, 300));
    }
    const tbody = document.querySelector('table tbody');
    if (tbody && allRows.length) { tbody.innerHTML = allRows.join(''); tbody.querySelectorAll('tr').forEach(r => r.classList.add('bcart-highlight')); }
    progressBar.style.width = '100%';
    restoreBanner.style.display = 'none';
    statusDiv.textContent = isRestore ? `🔄 復元完了（${allRows.length}件）` : `✅ ${allRows.length}件を表示しています`;
    filterBanner.style.display = 'block';
    filterBanner.innerHTML = `<b>🔍 絞り込み表示中</b><br>入力：${orderNumbers.length}件 ／ 表示：${allRows.length}件`;
    if (location.pathname.includes('logistics')) printArea.style.display = 'block';
    resetBtn.style.display = 'block';
    document.getElementById('bcart-text-input').value = orderNumbers.join('\n');
    searchBtn.disabled = false;
    saveState(orderNumbers);
  }

  searchBtn.addEventListener('click', async () => {
    const tab = document.querySelector('.bcart-tab.active').dataset.tab;
    let nums = [];
    if (tab === 'text') {
      const raw = document.getElementById('bcart-text-input').value.trim();
      if (!raw) { statusDiv.textContent = '⚠️ 受注番号を入力してください'; return; }
      nums = [...new Set(raw.split('\n').map(s => s.trim()).filter(Boolean))];
    } else {
      if (!csvOrderNumbers.length) { statusDiv.textContent = '⚠️ CSVを選択してください'; return; }
      nums = csvOrderNumbers;
    }
    await applyFilter(nums);
  });
  resetBtn.addEventListener('click', () => { clearState(); location.reload(); });

  // 冷蔵ヤマト着払い対象の商品ID（輸入代行費グループA）
  const COLD_PRODUCT_IDS = new Set(['3','4','5','6','7','8','53','65','66','84','181','190','191']);
  // ヤマトクール元払い対象商品ID
  const COOL_PREPAID_IDS = new Set(['27','55','58','170','185']);
  const productImageCache = {};
  const productBase64Cache = {};

  async function fetchImageAsBase64(imgUrl) {
    if (!imgUrl) return '';
    if (productBase64Cache[imgUrl] !== undefined) return productBase64Cache[imgUrl];
    try {
      const res = await fetch(imgUrl, { credentials: 'same-origin' });
      const blob = await res.blob();
      const base64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      productBase64Cache[imgUrl] = base64;
      return base64;
    } catch(e) {
      productBase64Cache[imgUrl] = '';
      return '';
    }
  }

  async function fetchProductImage(productId) {
    if (!productId) return '';
    if (productImageCache[productId] !== undefined) return productImageCache[productId];
    try {
      const res = await fetch(`${location.origin}/admin/products/${productId}/edit`, { credentials: 'same-origin' });
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      let imgUrl = '';
      doc.querySelectorAll('input[type="text"], input:not([type])').forEach(input => {
        const val = (input.value || input.getAttribute('value') || '').trim();
        if (!imgUrl && val.match(/\.(jpg|jpeg|png|gif|webp)/i)) imgUrl = val;
      });
      if (!imgUrl) {
        doc.querySelectorAll('img').forEach(img => {
          const src = img.getAttribute('src') || '';
          if (!imgUrl && src.match(/\.(jpg|jpeg|png|gif|webp)/i) && !src.startsWith('data:') && src.length > 10) {
            imgUrl = src.startsWith('http') ? src : `${location.origin}${src}`;
          }
        });
      }
      if (!imgUrl) {
        doc.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href') || '';
          if (!imgUrl && href.match(/\.(jpg|jpeg|png|gif|webp)/i)) imgUrl = href;
        });
      }
      productImageCache[productId] = imgUrl;
      return imgUrl;
    } catch(e) {
      productImageCache[productId] = '';
      return '';
    }
  }

  // 発送ID詳細取得
  async function fetchLogisticsDetail(logisticsId) {
    const res = await fetch(`${location.origin}/admin/logistics/${logisticsId}/view`, { credentials: 'same-origin' });
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    let deliveryGroup = '', companyName = '', orderCodeFromPage = '';
    let personName = '', tel = '', zip = '', address1 = '', address2 = '', address3 = '';
    const allTds = doc.querySelectorAll('td');

    if (allTds[7])  tel          = allTds[7].textContent.trim().replace(/\s+/g,'');
    if (allTds[10]) deliveryGroup= allTds[10].textContent.trim();
    if (allTds[14]) companyName  = allTds[14].textContent.trim();
    if (allTds[15]) personName   = allTds[15].textContent.trim();
    if (allTds[16]) {
      const addrText = allTds[16].textContent.replace(/\s+/g,'').trim();
      const zipMatch = addrText.match(/〒?(\d{3})-?(\d{4})/);
      if (zipMatch) zip = zipMatch[1] + '-' + zipMatch[2];
      const addrBody = addrText.replace(/〒?\d{3}-?\d{4}/, '').trim();
      const prefMatch = addrBody.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)(.+)/);
      if (prefMatch) {
        const pref = prefMatch[1];
        const rest = prefMatch[2];
        const streetMatch = rest.match(/^(.+?)((?:\d+[-－]\d+(?:[-－]\d+)?).*)$/);
        if (streetMatch) {
          const cityPart = streetMatch[1];
          const streetAndBuilding = streetMatch[2];
          const buildingMatch = streetAndBuilding.match(/^(\d+[-－]\d+(?:[-－]\d+)?)(.*)$/);
          if (buildingMatch) {
            address1 = pref + cityPart;
            address2 = buildingMatch[1];
            address2 = pref + cityPart + buildingMatch[1];
            address1 = pref + cityPart;
            address2 = buildingMatch[1];
            address3 = buildingMatch[2];
          } else {
            address1 = pref + cityPart;
            address2 = streetAndBuilding;
            address3 = '';
          }
        } else {
          address1 = pref + rest;
          address2 = '';
          address3 = '';
        }
      } else {
        address1 = addrBody;
        address2 = '';
        address3 = '';
      }
    }

    allTds.forEach((td, i) => {
      const label = td.textContent.trim();
      const next = allTds[i+1];
      if (label === '配送グループ' && next) deliveryGroup = deliveryGroup || next.textContent.trim();
    });
    const orderLinks = doc.querySelectorAll('a[href*="/admin/order/"]');
    orderLinks.forEach(link => { const txt = link.textContent.trim(); if (/^\d{11,}$/.test(txt) && !orderCodeFromPage) orderCodeFromPage = txt; });
    if (!orderCodeFromPage) { allTds.forEach(td => { const txt = td.textContent.trim(); if (/^\d{11,}$/.test(txt) && !orderCodeFromPage) orderCodeFromPage = txt; }); }
    if (!companyName) {
      doc.querySelectorAll('th').forEach(th => {
        if (th.textContent.trim().includes('会社名') && !companyName) {
          const td = th.parentElement && th.parentElement.querySelector('td');
          if (td) companyName = td.textContent.trim();
        }
      });
    }
    if (!companyName) {
      const fullText = doc.body.innerText || doc.body.textContent || '';
      const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) { if (lines[i].includes('会社名') && lines[i+1]) { companyName = lines[i+1].trim(); break; } }
    }
    const products = [];
    const rows = doc.querySelectorAll('table tbody tr');
    const productPromises = [];
    rows.forEach(row => {
      const productLink = row.querySelector('a[href*="/admin/products/"]');
      if (!productLink) return;
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      const rawHref = productLink.getAttribute('href') || '';
      const match = rawHref.match(/\/admin\/products\/(\d+)/);
      const productId = match ? match[1] : '';
      const productName = productLink.textContent.trim().replace(/\s+/g, ' ');
      if (!productName) return;
      let setName = '';
      if (cells[1]) {
        const setTxt = cells[1].textContent.trim().replace(/\s+/g, ' ');
        if (setTxt && setTxt !== productName) setName = setTxt;
      }
      let quantity = '1';
      cells.forEach(cell => {
        const txt = cell.textContent.trim();
        if (txt.match(/^\d+$/) && parseInt(txt) > 0 && parseInt(txt) < 10000) quantity = txt;
      });
      productPromises.push({ productId, productName, setName, quantity });
    });
    const productsWithImages = await Promise.all(
      productPromises.map(async p => {
        const imgUrl = p.productId ? await fetchProductImage(p.productId) : '';
        const imgSrc = imgUrl ? await fetchImageAsBase64(imgUrl) : '';
        return { name: p.productName, setName: p.setName || '', quantity: p.quantity, imgSrc, productId: p.productId };
      })
    );
    products.push(...productsWithImages.filter(p => p.name && p.name.length > 0));

    const hasColdProduct = products.some(p => p.productId && COLD_PRODUCT_IDS.has(p.productId));
    const hasCoolPrepaid = products.some(p => p.productId && COOL_PREPAID_IDS.has(p.productId));
    const finalDeliveryGroup = hasColdProduct ? '輸入代行費グループA' : hasCoolPrepaid ? 'ヤマトクール元払い' : '';
    return { logisticsId, orderCode: orderCodeFromPage, companyName: companyName || '（会社名取得中）', deliveryGroup: finalDeliveryGroup, personName, tel, zip, address1, address2, address3: address3||'', products };
  }

  // 発送指示書HTML生成
  function generateShippingInstructionHTML(orders) {
    const MAX_PROD_PER_PAGE = 7;
    const flatOrders = [];

    orders.forEach(order => {
      const prods = order.products || [];
      const normalProds = prods.filter(p => !COLD_PRODUCT_IDS.has(String(p.productId)) && !COOL_PREPAID_IDS.has(String(p.productId)));
      const coolProds   = prods.filter(p => COOL_PREPAID_IDS.has(String(p.productId)));
      const coldProds   = prods.filter(p => COLD_PRODUCT_IDS.has(String(p.productId)));

      const pushGroup = (groupProds, deliveryGroup) => {
        if (!groupProds.length) return;
        const groupOrder = { ...order, products: groupProds, deliveryGroup };
        if (groupProds.length > MAX_PROD_PER_PAGE) {
          const chunks = [];
          for (let i = 0; i < groupProds.length; i += MAX_PROD_PER_PAGE) chunks.push(groupProds.slice(i, i + MAX_PROD_PER_PAGE));
          chunks.forEach((chunk, ci) => flatOrders.push({ ...groupOrder, products: chunk, isContinued: ci > 0, chunkIndex: ci, totalChunks: chunks.length }));
        } else {
          flatOrders.push(groupOrder);
        }
      };

      pushGroup(normalProds, '');
      pushGroup(coolProds, 'ヤマトクール元払い');
      pushGroup(coldProds, '輸入代行費グループA');
    });

    const coldOrders   = flatOrders.filter(o => (o.deliveryGroup||'').includes('輸入代行費グループA'));
    const coolOrders   = flatOrders.filter(o => (o.deliveryGroup||'').includes('ヤマトクール元払い'));
    const normalOrders = flatOrders.filter(o => !(o.deliveryGroup||'').includes('輸入代行費グループA') && !(o.deliveryGroup||'').includes('ヤマトクール元払い'));
    function layoutOrders(orderList) {
      const MAX_PRODUCTS = 3;
      const result = [];
      let buf = [], bufTotal = 0;
      const flush = () => { if (buf.length > 0) { result.push({ orders: buf }); buf = []; bufTotal = 0; } };
      orderList.forEach(order => {
        const n = (order.products || []).length;
        const isSplit = (order.totalChunks || 1) > 1;
        if (n >= 3 || isSplit) {
          flush();
          result.push({ orders: [order] });
        } else {
          if (bufTotal + n > MAX_PRODUCTS) flush();
          buf.push(order);
          bufTotal += n;
        }
      });
      flush();
      return result;
    }
    const pages = [...layoutOrders(normalOrders), ...layoutOrders(coolOrders), ...layoutOrders(coldOrders)];
    const totalPages = pages.length;
    const today = new Date();
    const dateStr = today.getFullYear()+'/'+String(today.getMonth()+1).padStart(2,'0')+'/'+String(today.getDate()).padStart(2,'0');

    function renderOrder(order) {
      const isLarge = (order.totalChunks||1) > 1;
      const isContinued = order.isContinued||false;
      const chunkLabel = isLarge ? ` <span class="large-badge">⚡ 大量注文 ${(order.chunkIndex||0)+1}/${order.totalChunks}</span>` : '';
      const coldLabel = (order.deliveryGroup||'').includes('輸入代行費グループA')
        ? '<div class="cold-badge">🧊 冷蔵ヤマト着払いで配送</div>'
        : (order.deliveryGroup||'').includes('ヤマトクール元払い')
        ? '<div class="cool-badge">🚚 ヤマトクール元払いで配送</div>'
        : '';
      const rows = (order.products||[]).map(p => `
        <tr>
          <td class="col-ck">
            <div class="ck-row"><div class="ck-label">作業</div><div class="ck-box"></div></div>
            <div class="ck-row"><div class="ck-label">ダブル</div><div class="ck-box"></div></div>
          </td>
          <td class="col-img">${p.imgSrc ? `<img src="${p.imgSrc}" class="product-img" onerror="this.style.display='none'">` : ''}</td>
          <td>${p.name||''}${p.setName ? `<div class="set-name">${p.setName}</div>` : ''}</td>
          <td class="col-qty"><span class="qty-badge">×<span class="qty-num">${p.quantity||p.qty||1}</span></span></td>
        </tr>`).join('');
      const staffCheck = isContinued
        ? `<div class="continued-note">▶ 前ページからの続き</div>`
        : `<div class="check-block">
            <div class="check-title">✅ 作業担当者 CK</div>
            <div class="check-list">
              <div class="check-item"><div class="check-box"></div>塩津</div>
              <div class="check-item"><div class="check-box"></div>上郷</div>
              <div class="check-item"><div class="check-box"></div>田中</div>
              <div class="check-item"><div class="check-box"></div>坂口</div>
              <div class="check-item check-item-other"><div class="check-box"></div>その他（<div class="other-line"></div>）</div>
            </div>
          </div>
          <div class="check-block check-block-second">
            <div class="check-title">✅ 梱包前ダブルCK</div>
            <div class="check-list">
              <div class="check-item"><div class="check-box"></div>塩津</div>
              <div class="check-item"><div class="check-box"></div>上郷</div>
              <div class="check-item"><div class="check-box"></div>田中</div>
              <div class="check-item"><div class="check-box"></div>坂口</div>
              <div class="check-item check-item-other"><div class="check-box"></div>その他（<div class="other-line"></div>）</div>
            </div>
          </div>`;
      const leftBlock = `
        <div class="left-block">
          <div class="id-block">
            <div class="id-row"><span class="id-label">発送ID</span><span class="id-value">${order.logisticsId||order.orderInternalId||''}${chunkLabel}</span></div>
            <div class="id-row"><span class="id-label">受注番号</span><span class="id-value">${order.orderCode||''}</span></div>
          </div>
          <div class="company-block"><div class="company-name">${order.companyName||'（会社名不明）'}</div></div>
          ${coldLabel}
          ${staffCheck}
        </div>`;
      return `<div class="order-card${isLarge?' large':''}">${leftBlock}
        <table class="product-table">
          <thead><tr><th class="col-ck">CK</th><th class="col-img">画像</th><th>商品名</th><th class="col-qty">数量</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
    }

    const pagesHTML = pages.map((page, pi) => `
      <div class="print-page">
        <div class="page-header">
          <div class="title">🚚 発送指示書</div>
          <div class="meta">発行日：${dateStr}　　全${orders.length}件</div>
        </div>
        <div class="orders-list">${page.orders.map(renderOrder).join('')}</div>
        <div class="page-footer"><span>リアス株式会社</span><span class="page-num">${pi+1} / ${totalPages} ページ</span></div>
      </div>`).join('');

    return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>発送指示書</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
  :root{--primary:#1e3a8a;--primary-light:#2563eb;--primary-pale:#eff6ff;--border:#e2e8f0;--text:#0f172a;--text-muted:#475569;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Noto Sans JP','Hiragino Kaku Gothic Pro',Meiryo,sans-serif;background:white;color:var(--text);}
  @page{size:A4 portrait;margin:0;}
  @media print{
    html,body{background:white!important;padding:0!important;margin:0!important;width:210mm;}
    .print-page{width:210mm!important;height:297mm!important;margin:0!important;padding:6mm 8mm!important;border-radius:0!important;box-shadow:none!important;page-break-after:always!important;break-after:page!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;}
    .print-page:last-child{page-break-after:avoid!important;break-after:avoid!important;}
    .orders-list{flex:1;overflow:hidden;}
    .order-card{page-break-inside:avoid!important;break-inside:avoid!important;}
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  }
  .print-page{max-width:820px;margin:0 auto 24px;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);overflow:hidden;display:flex;flex-direction:column;}
  .page-header{background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:white;padding:6px 20px;display:flex;justify-content:space-between;align-items:center;}
  .page-header .title{font-size:15px;font-weight:900;letter-spacing:.08em;}
  .page-header .meta{font-size:11px;opacity:.9;text-align:right;}
  .orders-list{border-top:4px solid #1e3a8a;flex:1;}
  .order-card{border-bottom:2px solid var(--border);padding:10px 16px;display:grid;grid-template-columns:180px 1fr;gap:12px;align-items:start;}
  .order-card:last-child{border-bottom:none;}
  .order-card.large{background:#fffbeb;border-left:5px solid #f59e0b;}
  .left-block{display:flex;flex-direction:column;gap:8px;}
  .id-block{background:var(--primary-pale);border-radius:6px;padding:6px 10px;border-left:3px solid var(--primary-light);}
  .id-row{display:flex;align-items:baseline;gap:6px;margin-bottom:3px;}
  .id-row:last-child{margin-bottom:0;}
  .id-label{font-size:10px;font-weight:700;color:var(--primary);white-space:nowrap;min-width:50px;}
  .id-value{font-size:13px;font-weight:900;color:var(--primary);}
  .company-block{background:var(--primary-pale);border-radius:6px;padding:8px 10px;border-left:3px solid var(--primary-light);}
  .company-name{font-size:13px;font-weight:900;color:var(--primary);line-height:1.4;}
  .product-table{width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:6px;overflow:hidden;}
  .product-table thead tr{background:#1e3a8a;color:white;}
  .product-table thead th{padding:6px 8px;text-align:left;font-weight:700;font-size:11px;}
  .product-table thead th.col-ck{width:52px;text-align:center;}
  .product-table thead th.col-img{width:130px;text-align:center;}
  .product-table thead th.col-qty{width:55px;text-align:center;}
  .product-table tbody tr{border-bottom:1px solid var(--border);}
  .product-table tbody tr:last-child{border-bottom:none;}
  .product-table tbody tr:nth-child(even){background:#f8fafc;}
  .product-table tbody td{padding:6px 8px;vertical-align:middle;line-height:1.4;font-size:12px;}
  .product-table tbody td.col-ck{text-align:center;vertical-align:middle;padding:4px;}
  .ck-row{display:flex;align-items:center;justify-content:center;gap:3px;margin-bottom:3px;}
  .ck-row:last-child{margin-bottom:0;}
  .ck-label{font-size:9px;font-weight:700;color:var(--text-muted);white-space:nowrap;min-width:28px;text-align:right;}
  .ck-box{width:18px;height:18px;border:2px solid #1e3a8a;border-radius:3px;background:white;flex-shrink:0;}
  .product-table tbody td.col-img{text-align:center;padding:4px;}
  .product-table tbody td.col-qty{text-align:center;white-space:nowrap;}
  .product-img{width:116px;height:116px;object-fit:contain;border:1px solid var(--border);border-radius:4px;background:white;padding:2px;display:block;margin:0 auto;}
  .qty-badge{background:#fef3c7;color:#1e3a8a;border-radius:5px;padding:2px 6px;font-weight:900;font-size:14px;display:inline-block;}
  .qty-num{font-size:20px;}
  .set-name{font-size:10px;color:var(--text-muted);margin-top:2px;}
  .large-badge{display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:4px;vertical-align:middle;}
  .cold-badge{display:block;background:#fff1f2;color:#dc2626;border:1.5px solid #fca5a5;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;text-align:center;}
  .cool-badge{display:block;background:#f0fdf4;color:#16a34a;border:1.5px solid #86efac;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;text-align:center;}
  .check-block{background:#f8fafc;border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;}
  .check-block-second{background:#fff7ed;border-color:#fed7aa;}
  .check-title{font-size:10px;font-weight:700;color:var(--text-muted);margin-bottom:3px;}
  .check-list{display:grid;grid-template-columns:1fr 1fr;gap:3px 6px;}
  .check-item{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;}
  .check-item-other{grid-column:1/-1;}
  .check-box{width:15px;height:15px;border:2px solid var(--primary);border-radius:3px;flex-shrink:0;background:white;}
  .other-line{flex:1;border-bottom:1.5px solid #94a3b8;height:15px;margin-top:2px;}
  .continued-note{background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:700;text-align:center;}
  .page-footer{background:#f1f5f9;border-top:1px solid var(--border);padding:5px 20px;display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);}
  .page-num{font-weight:700;color:var(--primary);font-size:12px;}
</style></head><body>${pagesHTML}</body></html>`;
  }

  // 発送指示書ボタン（出荷一覧のみ）
  document.getElementById('bcart-shipping-inst').addEventListener('click', async () => {
    const items = getCheckedLogisticsWithOrderCode();
    if (!items.length) { statusDiv.textContent = '⚠️ チェックされた発送IDがありません'; return; }
    const btn = document.getElementById('bcart-shipping-inst');
    btn.disabled = true; printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = true;
    const orders = [];
    for (let i = 0; i < items.length; i++) {
      const { logisticsId, orderCode } = items[i];
      statusDiv.textContent = `📋 情報取得中… (${i + 1}/${items.length}) ID: ${logisticsId}`;
      try { const detail = await fetchLogisticsDetail(logisticsId); detail.orderCode = orderCode || detail.orderCode || ''; orders.push(detail); }
      catch(e) { console.error('取得エラー:', logisticsId, e); orders.push({ logisticsId, orderCode, companyName: '（取得エラー）', products: [] }); }
      await new Promise(r => setTimeout(r, 400));
    }
    if (!orders.length) { statusDiv.textContent = '⚠️ 情報の取得に失敗しました'; btn.disabled = false; printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = false; return; }
    statusDiv.textContent = '📋 発送指示書を生成中…';
    const html = generateShippingInstructionHTML(orders);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const win = window.open(url, '_blank');
    if (win) { await new Promise(r => setTimeout(r, 2000)); win.print(); } else { statusDiv.textContent = '⚠️ ポップアップがブロックされています'; }
    statusDiv.textContent = '📨 記録・通知中…';
    notifyGAS(orders, html);
    statusDiv.textContent = `✅ ${orders.length}件の発送指示書を生成しました`;
    btn.disabled = false; printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = false;
  });

  // 納品書PDF＋発送指示書を合体して印刷
  async function printWithShippingInstruction(ids) {
    const pdfBuffers = [];
    const orders = [];
    for (let i = 0; i < ids.length; i++) {
      statusDiv.textContent = `🖨 生成中… (${i + 1}/${ids.length}) ID: ${ids[i]}`;
      try {
        pdfBuffers.push(await generateDeliveryNotePDF(ids[i], true));
        const detail = await fetchLogisticsDetail(ids[i]);
        orders.push(detail);
      } catch(e) { console.error('取得エラー:', ids[i], e); }
      await new Promise(r => setTimeout(r, 500));
    }
    if (!pdfBuffers.length) { statusDiv.textContent = '⚠️ 生成に失敗しました'; return; }

    statusDiv.textContent = '🖨 PDF結合中…';
    const pdfUrl = await mergePDFBuffers(pdfBuffers);
    statusDiv.textContent = '🖨 印刷ダイアログを表示します…';
    const w = window.open(pdfUrl, '_blank');
    if (!w) { statusDiv.textContent = '⚠️ ポップアップがブロックされています'; return; }
    await new Promise(r => setTimeout(r, 2500));
    try { w.print(); } catch(e) {}

    if (orders.length) {
      statusDiv.textContent = '📨 記録・通知中…';
      const instHtml = generateShippingInstructionHTML(orders);
      notifyGAS(orders, instHtml);
    }
  }

  // 印刷ボタン
  printOneBtn.addEventListener('click', async () => {
    const ids = getVisibleLogisticsIds();
    if (!ids.length) { statusDiv.textContent = '⚠️ 発送IDが見つかりません'; return; }
    printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = true;
    await printWithShippingInstruction(ids);
    statusDiv.textContent = `✅ ${ids.length}件 印刷完了`;
    printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = false;
  });
  printAllBtn.addEventListener('click', async () => {
    const ids = getVisibleLogisticsIds();
    if (!ids.length) { statusDiv.textContent = '⚠️ 発送IDが見つかりません'; return; }
    printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = true;
    await printWithShippingInstruction(ids);
    statusDiv.textContent = `✅ ${ids.length}件 印刷完了`;
    printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = false;
  });
  printChecked.addEventListener('click', async () => {
    const ids = getCheckedLogisticsIds();
    if (!ids.length) { statusDiv.textContent = '⚠️ チェックされた発送IDがありません'; return; }
    printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = true;
    await printWithShippingInstruction(ids);
    statusDiv.textContent = `✅ ${ids.length}件 印刷完了`;
    printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = false;
  });

  // =============================================
  // 発送日・納品日一括設定
  // =============================================

  // 日付をYYYY-MM-DD形式で返す
  function formatDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  // デフォルト日付をセット（当日・翌日）
  function initDatePicker() {
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const shipInput    = document.getElementById('bcart-ship-date');
    const arrivalInput = document.getElementById('bcart-arrival-date');
    if (shipInput)    shipInput.value    = formatDate(today);
    if (arrivalInput) arrivalInput.value = formatDate(tomorrow);
  }

  // 発送日・納品日を1件の発送IDに設定（fetch POST）
  async function applyDateToLogistics(logisticsId, shipDate, arrivalDate) {
    // まず編集ページを取得してCSRFトークンと既存データを取得
    const viewRes = await fetch(`${location.origin}/admin/logistics/${logisticsId}/edit`, { credentials: 'same-origin' });
    const viewText = await viewRes.text();
    const viewDoc = new DOMParser().parseFromString(viewText, 'text/html');

    const fd = new FormData();
    fd.append('_token', getCsrfToken());
    fd.append('_method', 'PUT');

    // 既存フォームの値をそのままコピー（上書き防止）
    viewDoc.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      const name = el.name;
      if (!name || name === '_token' || name === '_method') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) fd.append(name, el.value);
      } else {
        fd.append(name, el.value || '');
      }
    });

    // 発送日・納品日を上書き
    if (shipDate) {
      fd.set('delivery_date', shipDate);
    }
    if (arrivalDate) {
      fd.set('arrival_date', arrivalDate);
    }

    const res = await fetch(`${location.origin}/admin/logistics/${logisticsId}/edit`, {
      method: 'POST',
      credentials: 'same-origin',
      body: fd,
    });
    return res.ok;
  }

  // 日付設定ボタンの開閉
  const dateOpenBtn   = document.getElementById('bcart-date-open-btn');
  const datePicker    = document.getElementById('bcart-date-picker');
  const dateApplyBtn  = document.getElementById('bcart-date-apply-btn');

  if (dateOpenBtn) {
    dateOpenBtn.addEventListener('click', () => {
      const isOpen = datePicker.style.display !== 'none';
      datePicker.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) initDatePicker();
    });
  }

  if (dateApplyBtn) {
    dateApplyBtn.addEventListener('click', async () => {
      const shipDate    = document.getElementById('bcart-ship-date').value;
      const arrivalDate = document.getElementById('bcart-arrival-date').value;

      if (!shipDate && !arrivalDate) {
        statusDiv.textContent = '⚠️ 発送日または納品日を入力してください';
        return;
      }

      const ids = getCheckedLogisticsIds();
      if (!ids.length) {
        statusDiv.textContent = '⚠️ チェックされた発送IDがありません';
        return;
      }

      dateApplyBtn.disabled = true;
      let successCount = 0;

      for (let i = 0; i < ids.length; i++) {
        statusDiv.textContent = `📅 日付設定中… (${i+1}/${ids.length}) ID: ${ids[i]}`;
        try {
          const ok = await applyDateToLogistics(ids[i], shipDate, arrivalDate);
          if (ok) successCount++;
        } catch(e) {
          console.error('日付設定エラー:', ids[i], e);
        }
        await new Promise(r => setTimeout(r, 400));
      }

      statusDiv.textContent = `✅ ${successCount}件に日付を設定しました`;
      dateApplyBtn.disabled = false;
      datePicker.style.display = 'none';
    });
  }



  // ページ読み込み
  async function waitForTable(maxWait = 5000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) { if (document.querySelector('table tbody tr')) return true; await new Promise(r => setTimeout(r, 200)); }
    return false;
  }
  async function onPageReady() {
    if (location.pathname.includes('logistics')) {
      printArea.style.display = 'block';
      const dateArea = document.getElementById('bcart-date-area');
      if (dateArea) dateArea.style.display = 'block';
    }
    const saved = loadState();
    if (saved && saved.orderNumbers && saved.orderNumbers.length) {
      restoreBanner.style.display = 'block'; restoreBanner.textContent = `🔄 前回の絞り込み（${saved.orderNumbers.length}件）を復元中…`;
      resetBtn.style.display = 'block'; await waitForTable(); await applyFilter(saved.orderNumbers, true);
    }
  }
  let pageReadyDone = false;
  async function tryRestore() { if (pageReadyDone) return; pageReadyDone = true; await onPageReady(); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', tryRestore); } else { setTimeout(tryRestore, 300); }
  window.addEventListener('load', () => { setTimeout(tryRestore, 300); });
  window.addEventListener('pageshow', () => {
    pageReadyDone = false;
    setTimeout(async () => {
      if (location.pathname.includes('logistics')) {
        printArea.style.display = 'block';
        const dateArea = document.getElementById('bcart-date-area');
        if (dateArea) dateArea.style.display = 'block';
      }
      const saved = loadState();
      if (saved && saved.orderNumbers && saved.orderNumbers.length) {
        restoreBanner.style.display = 'block'; restoreBanner.textContent = `🔄 前回の絞り込み（${saved.orderNumbers.length}件）を復元中…`;
        resetBtn.style.display = 'block'; await waitForTable(); await applyFilter(saved.orderNumbers, true);
      }
    }, 500);
  });

})();
