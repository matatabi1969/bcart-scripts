// ==UserScript==
// @name         Bカート 複数受注番号まとめて検索 v25（発送指示書デザイン統合）
// @namespace    http://tampermonkey.net/
// @version      25.93
// @description  複数受注番号の絞り込み・納品書印刷・ドラッグ移動・ポップアップ時自動非表示・会員ID抽出
// @author       You
// @match        https://*.bcart.jp/admin/order*
// @match        https://*.bcart.jp/admin/logistics*
// @match        https://*.bcart.jp/admin/order/list*
// @match        https://*.bcart.jp/admin/customer/list*
// @updateURL    https://raw.githubusercontent.com/matatabi1969/bcart-scripts/main/bcart_multi_order_search_v25.user.js
// @downloadURL  https://raw.githubusercontent.com/matatabi1969/bcart-scripts/main/bcart_multi_order_search_v25.user.js
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
    // 呼び出し元を確認
    console.log('[GAS通知] 呼び出し元:', new Error().stack);
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
      // fetchでPOST送信（form/iframe方式を廃止）
      fetch(GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'payload=' + encodeURIComponent(payload),
      }).then(() => {
        console.log('[GAS通知] 送信完了:', orders.length, '件');
      }).catch(e => {
        console.error('[GAS通知] エラー:', e);
      });
    } catch(e) {
      console.error('[GAS通知] エラー:', e);
    }
  }

  // =============================================
  // 使用状況の記録（v25.83）
  // 誰がどのバージョンを使っているかを、記録専用GAS（利用状況ログ）へ1日1回送信
  // USAGE_LOG_URL に記録用GASのWebアプリURLを設定してください（空なら送信しません）
  // =============================================
  const USAGE_LOG_URL = 'https://script.google.com/macros/s/AKfycbxVzsv-KPTexWUID3Km1ZmPfF6oN-hf84limAdx_a4H_NmuRgH_Q5EOnnPvp3lhtFn_/exec';
  const USER_NAME_KEY = 'bcart_user_name';
  const USAGE_LAST_KEY = 'bcart_usage_last';
  const USER_CHOICES = ['塩津', '上郷', '田中', '坂口'];

  function getScriptVersion() {
    try { return GM_info.script.version; } catch(e) { return '不明'; }
  }
  function getUserName() {
    try { return localStorage.getItem(USER_NAME_KEY) || ''; } catch(e) { return ''; }
  }
  function setUserName(name) {
    try { localStorage.setItem(USER_NAME_KEY, name); } catch(e) {}
  }

  // 利用者名の選択画面（初回のみ／パネルから変更可）
  function askUserName(current) {
    return new Promise(resolve => {
      document.getElementById('bcart-user-modal')?.remove();
      const modal = document.createElement('div');
      modal.id = 'bcart-user-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Hiragino Kaku Gothic Pro,Meiryo,sans-serif;';
      const btns = USER_CHOICES.map(n =>
        `<button data-name="${n}" style="padding:10px 0;border:1.5px solid ${n === current ? '#3a7bd5' : '#cbd5e1'};background:${n === current ? '#eff6ff' : 'white'};border-radius:8px;font-size:14px;font-weight:bold;cursor:pointer;color:#1e293b;">${n}</button>`
      ).join('');
      modal.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);padding:22px;width:90%;max-width:340px;border:3px solid #3a7bd5;">
          <div style="color:#2563b0;font-size:15px;font-weight:bold;margin-bottom:6px;">👤 このPCの利用者を選んでください</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:14px;">スクリプトの利用状況（バージョン）の確認に使います。最初の1回だけ表示されます。</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">${btns}</div>
          <div style="display:flex;gap:6px;">
            <input id="bcart-user-other" placeholder="その他（名前を入力）" style="flex:1;padding:8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:13px;">
            <button id="bcart-user-other-ok" style="padding:0 14px;background:linear-gradient(135deg,#3a7bd5,#2563b0);color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">決定</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const done = name => { modal.remove(); resolve(name); };
      modal.querySelectorAll('button[data-name]').forEach(b => b.addEventListener('click', () => done(b.dataset.name)));
      document.getElementById('bcart-user-other-ok').addEventListener('click', () => {
        const v = document.getElementById('bcart-user-other').value.trim();
        if (v) done(v);
      });
    });
  }

  function sendUsageLog(force = false) {
    if (!USAGE_LOG_URL) return;
    const name = getUserName();
    if (!name) return;
    const version = getScriptVersion();
    const today = new Date().toLocaleDateString('ja-JP');
    const stamp = `${today}|${version}|${name}`;
    try { if (!force && localStorage.getItem(USAGE_LAST_KEY) === stamp) return; } catch(e) {}
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : 'その他';
    const usage = JSON.stringify({ name, version, site: location.host, page: location.pathname, browser });
    fetch(USAGE_LOG_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'usage=' + encodeURIComponent(usage),
    }).then(() => {
      try { localStorage.setItem(USAGE_LAST_KEY, stamp); } catch(e) {}
      console.log('[利用状況] 記録しました:', name, version);
    }).catch(e => console.error('[利用状況] 送信エラー:', e));
  }

  async function initUsageLog() {
    if (!USAGE_LOG_URL) return;
    if (!getUserName()) {
      const name = await askUserName('');
      setUserName(name);
    }
    sendUsageLog();
  }

  const style = document.createElement('style');
  style.textContent = `
    #bcart-panel {
      position: fixed; top: 80px; right: 20px; z-index: 99999; width: 300px;
      background: #ffffff; border: 2px solid #3a7bd5; border-radius: 10px;
      box-shadow: 0 4px 24px rgba(58,123,213,0.18);
      font-family: 'Hiragino Kaku Gothic Pro', Meiryo, sans-serif; font-size: 13px; cursor: default;
      max-height: 90vh; flex-direction: column;
    }
    #bcart-panel.minimized #bcart-body { display: none !important; }
    #bcart-panel.hidden { display: none !important; }
    #bcart-body {
      padding: 14px; overflow-y: auto; flex: 1; max-height: calc(90vh - 44px);
    }
    #bcart-body::-webkit-scrollbar { width: 6px; }
    #bcart-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
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
    #bcart-unpaid-warning {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 999999;
      display: none; align-items: center; justify-content: center;
    }
    #bcart-unpaid-warning.show { display: flex; }
    #bcart-unpaid-warning-box {
      background: white; border-radius: 12px; padding: 24px; max-width: 480px; width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      font-family: 'Hiragino Kaku Gothic Pro', Meiryo, sans-serif;
    }
    #bcart-unpaid-warning-box h3 { color: #dc2626; font-size: 15px; margin: 0 0 12px; }
    #bcart-unpaid-warning-box .warn-list {
      background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px;
      padding: 10px 14px; margin: 0 0 16px; max-height: 200px; overflow-y: auto;
      font-size: 12px; line-height: 1.8;
    }
    #bcart-unpaid-warning-box .warn-item { color: #dc2626; }
    #bcart-unpaid-warning-box .warn-item span { color: #475569; margin-left: 8px; }
    .bcart-warn-btns { display: flex; gap: 8px; }
    #bcart-warn-continue { flex: 1; background: linear-gradient(135deg,#dc2626,#b91c1c); color: white; border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: bold; cursor: pointer; }
    #bcart-warn-cancel { flex: 1; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: bold; cursor: pointer; }
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
  // パネルの高さ制限をインラインで設定
  panel.style.display = 'flex';
  panel.style.maxHeight = '90vh';
  panel.style.flexDirection = 'column';
  panel.innerHTML = `
    <div id="bcart-header">
      <span>⠿ 複数受注番号 まとめて検索</span>
      <button id="bcart-min-btn">＋</button>
    </div>
    <div id="bcart-body" style="overflow-y:auto;flex:1;padding:14px;">
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
      <div id="bcart-unpaid-area" style="display:none;margin-top:10px;">
        <div class="print-title">💰 未入金を検索</div>
        <button class="bcart-print-btn" id="bcart-unpaid-open-btn" style="width:100%;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;">💰 未入金を全件抽出</button>
        <div id="bcart-unpaid-picker" style="display:none;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-top:6px;">
          <div class="bcart-date-row">
            <label style="min-width:52px;">金額 下限</label>
            <input type="number" class="bcart-date-input" id="bcart-amount-min" placeholder="例: 10000" min="0">
            <span style="font-size:11px;color:#64748b;">円以上</span>
          </div>
          <div class="bcart-date-row">
            <label style="min-width:52px;">金額 上限</label>
            <input type="number" class="bcart-date-input" id="bcart-amount-max" placeholder="上限なし" min="0">
            <span style="font-size:11px;color:#64748b;">円以下</span>
          </div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#475569;margin-bottom:8px;">
            <input type="checkbox" id="bcart-unpaid-bank-only" checked style="width:14px;height:14px;">
            銀行振込のみ（クレジット除外）
          </label>
          <button id="bcart-unpaid-search-btn" style="width:100%;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;border:none;border-radius:6px;padding:8px 0;font-size:12px;font-weight:bold;cursor:pointer;">🔍 未入金を全件抽出</button>
        </div>
      </div>
      <div id="bcart-payment-date-area" style="display:none;margin-top:10px;">
        <div class="print-title">📅 入金日で抽出</div>
        <button class="bcart-print-btn" id="bcart-payment-date-open-btn" style="width:100%;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;">📅 入金日の期間で抽出</button>
        <div id="bcart-payment-date-picker" style="display:none;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-top:6px;">
          <div class="bcart-date-row">
            <label style="min-width:44px;">開始日</label>
            <input type="date" class="bcart-date-input" id="bcart-payment-date-start">
          </div>
          <div class="bcart-date-row">
            <label style="min-width:44px;">終了日</label>
            <input type="date" class="bcart-date-input" id="bcart-payment-date-end">
          </div>
          <button id="bcart-payment-date-search-btn" style="width:100%;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;border:none;border-radius:6px;padding:8px 0;font-size:12px;font-weight:bold;cursor:pointer;">🔍 入金日で全件抽出</button>
        </div>
      </div>
      <div id="bcart-credit-area" style="display:none;margin-top:10px;">
        <div class="print-title">💳 クレジット払いを抽出</div>
        <button class="bcart-print-btn" id="bcart-credit-open-btn" style="width:100%;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;">💳 クレジット払いを抽出</button>
        <div id="bcart-credit-picker" style="display:none;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-top:6px;">
          <div class="bcart-date-row">
            <label style="min-width:44px;">年月</label>
            <input type="month" class="bcart-date-input" id="bcart-credit-month">
          </div>
          <button id="bcart-credit-search-btn" style="width:100%;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:white;border:none;border-radius:6px;padding:8px 0;font-size:12px;font-weight:bold;cursor:pointer;">🔍 クレジット払いを全件抽出</button>
        </div>
      </div>
      <div id="bcart-member-area" style="display:none;margin-top:10px;">
        <div class="print-title">🆔 会員IDで抽出</div>
        <textarea id="bcart-member-id-input" placeholder="例：&#10;1001&#10;1002&#10;1003" style="width:100%;height:80px;border:1px solid #cbd5e1;border-radius:6px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;color:#1e293b;line-height:1.6;outline:none;"></textarea>
        <div class="bcart-hint">※ 1行に1つ、会員ID（顧客番号）を入力</div>
        <button id="bcart-member-search-btn" style="width:100%;background:linear-gradient(135deg,#16a34a,#15803d);color:white;border:none;border-radius:6px;padding:8px 0;font-size:12px;font-weight:bold;cursor:pointer;">🔍 会員IDで全件抽出</button>
      </div>

      <button id="bcart-reset-btn">✕ 絞り込みを解除する</button>
      <div id="bcart-user-footer" style="margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;align-items:center;">
        <span>v<span id="bcart-footer-ver"></span>・利用者：<span id="bcart-footer-user">未設定</span></span>
        <a href="#" id="bcart-user-change" style="color:#3a7bd5;text-decoration:none;">変更</a>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // 利用者表示・変更
  (function() {
    const verEl = document.getElementById('bcart-footer-ver');
    const userEl = document.getElementById('bcart-footer-user');
    verEl.textContent = getScriptVersion();
    userEl.textContent = getUserName() || '未設定';
    document.getElementById('bcart-user-change').addEventListener('click', async e => {
      e.preventDefault();
      const name = await askUserName(getUserName());
      setUserName(name);
      userEl.textContent = name;
      sendUsageLog(true);
    });
    initUsageLog().then(() => { userEl.textContent = getUserName() || '未設定'; });
  })();

  // 未入金警告モーダル
  const warnModal = document.createElement('div');
  warnModal.id = 'bcart-unpaid-warning';
  warnModal.innerHTML = `
    <div id="bcart-unpaid-warning-box">
      <h3>⚠️ 未入金の受注が含まれています</h3>
      <div class="warn-list" id="bcart-warn-list"></div>
      <div class="bcart-warn-btns">
        <button id="bcart-warn-cancel">キャンセル</button>
        <button id="bcart-warn-continue">続けて印刷する</button>
      </div>
    </div>
  `;
  document.body.appendChild(warnModal);
  document.getElementById('bcart-warn-cancel').addEventListener('click', () => {
    warnModal.classList.remove('show');
    warnPendingResolve && warnPendingResolve(false);
  });
  document.getElementById('bcart-warn-continue').addEventListener('click', () => {
    warnModal.classList.remove('show');
    warnPendingResolve && warnPendingResolve(true);
  });
  let warnPendingResolve = null;

  // パネルボディのスクロール設定（インラインで強制適用）
  setTimeout(() => {
    const body = document.getElementById('bcart-body');
    if (body) {
      body.style.overflowY = 'auto';
      body.style.maxHeight = 'calc(90vh - 50px)';
      body.style.flex = '1';
    }
  }, 100);

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
    if (hasModal) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'flex';
    }
  });
  modalObserver.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });

  // =============================================
  // 納品書作成iframeの出現を監視して未入金チェック
  // iframe URL: /admin/invoice/invoice?oId={受注ID}&is_modal=1
  //             /admin/invoice/logistics?logistics_id={発送ID}&is_modal=1
  // =============================================
  let lastCheckedIframeSrc = '';

  // モーダルが閉じたらlastCheckedIframeSrcをリセット
  const resetObserver = new MutationObserver(() => {
    const hasInvoiceIframe = !!document.querySelector('iframe[src*="/admin/invoice/"]');
    if (!hasInvoiceIframe) lastCheckedIframeSrc = '';
  });
  resetObserver.observe(document.body, { childList: true, subtree: true });
  // v25.88：帳票画面を開いた時点では確認せず、納品書の「作成」を押した時点で確認する
  // 戻り値：true=作成を続ける / false=中止
  async function checkInvoiceIframeUnpaid(iframe) {
    {
      const src = iframe.getAttribute('src') || '';
      console.log('[未入金チェック] 納品書作成時のチェック:', src);

      // 受注ID or 発送IDを取得
      const oIdMatch  = src.match(/[?&]oId=(\d+)/);
      const lidMatch  = src.match(/[?&](?:logistics_id|id)=(\d+)/);

      let orderCode = '', companyName = '', isUnpaid = false;

      if (oIdMatch) {
        // 受注IDから受注番号を取得してチェック
        const orderId = oIdMatch[1];
        try {
          const res  = await fetch(`${location.origin}/admin/order/${orderId}/view`, { credentials: 'same-origin' });
          const text = await res.text();
          const doc  = new DOMParser().parseFromString(text, 'text/html');
          // 受注番号：11桁以上の数字をtdから取得
          doc.querySelectorAll('td').forEach(td => {
            const txt = td.textContent.trim();
            if (/^\d{11,}$/.test(txt) && !orderCode) orderCode = txt;
          });
          console.log('[未入金チェック] 受注番号:', orderCode);
          // 会社名取得
          doc.querySelectorAll('tr').forEach(row => {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            if (th && td && (th.textContent.includes('会社名') || th.textContent.includes('会員名'))) {
              companyName = companyName || td.textContent.trim();
            }
          });
          // 受注番号で受注一覧を検索して入金日確認
          if (orderCode) {
            const sRes  = await fetch(`${location.origin}/admin/order/list?order_code=${encodeURIComponent(orderCode)}`, { credentials: 'same-origin' });
            const sText = await sRes.text();
            const sDoc  = new DOMParser().parseFromString(sText, 'text/html');
            sDoc.querySelectorAll('table tbody tr').forEach(row => {
              const tds = row.querySelectorAll('td');
              if (tds.length < 11) return;
              if (tds[3] && tds[3].textContent.includes(orderCode)) {
                const firstChar = tds[10] ? tds[10].textContent.trim().charAt(0) : '';
                if (firstChar === 'ー' || firstChar === '-' || firstChar === '—') isUnpaid = true;
              }
            });
          }
        } catch(e) { console.error('未入金チェックエラー:', e); }

      } else if (lidMatch) {
        // 発送IDから受注番号を取得してチェック
        const logisticsId = lidMatch[1];
        try {
          const res  = await fetch(`${location.origin}/admin/logistics/${logisticsId}/view`, { credentials: 'same-origin' });
          const text = await res.text();
          const doc  = new DOMParser().parseFromString(text, 'text/html');
          doc.querySelectorAll('a[href*="/admin/order/"]').forEach(a => {
            const txt = a.textContent.trim();
            if (/^\d{11,}$/.test(txt) && !orderCode) orderCode = txt;
          });
          companyName = doc.querySelectorAll('td')[14]?.textContent.trim() || '';
          if (orderCode) {
            const sRes  = await fetch(`${location.origin}/admin/order/list?order_code=${encodeURIComponent(orderCode)}`, { credentials: 'same-origin' });
            const sText = await sRes.text();
            const sDoc  = new DOMParser().parseFromString(sText, 'text/html');
            sDoc.querySelectorAll('table tbody tr').forEach(row => {
              const tds = row.querySelectorAll('td');
              if (tds.length < 11) return;
              if (tds[3] && tds[3].textContent.includes(orderCode)) {
                const firstChar = tds[10] ? tds[10].textContent.trim().charAt(0) : '';
                if (firstChar === 'ー' || firstChar === '-' || firstChar === '—') isUnpaid = true;
              }
            });
          }
        } catch(e) { console.error('未入金チェックエラー:', e); }
      }

      // 未入金の場合は警告を表示して選択を待つ
      if (!isUnpaid) return true;
      return await new Promise(resolve => {
        // 既存の警告があれば削除
        const existingWarn = document.getElementById('bcart-iframe-warn');
        if (existingWarn) existingWarn.remove();

        const warn = document.createElement('div');
        warn.id = 'bcart-iframe-warn';
        warn.style.cssText = [
          'position:fixed', 'top:50%', 'left:50%',
          'transform:translate(-50%,-50%)',
          'z-index:9999999',
          'background:white', 'border-radius:12px',
          'box-shadow:0 8px 32px rgba(0,0,0,0.3)',
          'padding:24px', 'max-width:420px', 'width:90%',
          'font-family:Hiragino Kaku Gothic Pro,Meiryo,sans-serif',
          'border:3px solid #dc2626'
        ].join(';');
        warn.innerHTML = `
          <div style="color:#dc2626;font-size:16px;font-weight:bold;margin-bottom:12px;">⚠️ 未入金の受注です</div>
          <div style="font-size:13px;color:#475569;margin-bottom:8px;">
            <b>受注番号：</b>${orderCode || '不明'}<br>
            <b>会社名：</b>${companyName || '不明'}
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-bottom:16px;">入金が確認されていません。納品書を作成しますか？</div>
          <div style="display:flex;gap:8px;">
            <button id="bcart-iframe-warn-cancel" style="flex:1;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">キャンセル</button>
            <button id="bcart-iframe-warn-ok" style="flex:1;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">続けて印刷</button>
          </div>
        `;
        document.body.appendChild(warn);

        // 背景オーバーレイ
        const overlay = document.createElement('div');
        overlay.id = 'bcart-iframe-warn-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999998;';
        document.body.appendChild(overlay);

        document.getElementById('bcart-iframe-warn-cancel').addEventListener('click', () => {
          warn.remove(); overlay.remove();
          resolve(false); // 作成しない（帳票画面はそのまま）
        });
        document.getElementById('bcart-iframe-warn-ok').addEventListener('click', () => {
          warn.remove(); overlay.remove();
          resolve(true);
        });
      });
    }
  }
  // （v25.88で帳票画面を開いた時点の自動チェックは廃止）

  // =============================================
  // Bカート標準の納品書作成画面（出荷）でも発送日・納品日の入力を必須にする（v25.82）
  // iframe: /admin/invoice/logistics?...  内の「作成」ボタン・submitを横取りし、
  // 日付入力 → 出荷情報へ反映 → 元の作成処理を実行
  // =============================================
  function collectLogisticsIdsFromInvoice(iframe, form) {
    const ids = new Set();
    if (form) {
      try {
        for (const [key, val] of new FormData(form).entries()) {
          if (/logistics_id|^id$|^ids/.test(key)) String(val).split(/[,\s]+/).forEach(v => { if (/^\d+$/.test(v)) ids.add(v); });
        }
      } catch(e) {}
    }
    if (!ids.size) {
      const src = iframe.getAttribute('src') || '';
      const qs = src.includes('?') ? src.split('?')[1] : '';
      new URLSearchParams(qs).forEach((val, key) => {
        if (/logistics_id|^id$|^ids/.test(key)) String(val).split(/[,\s]+/).forEach(v => { if (/^\d+$/.test(v)) ids.add(v); });
      });
    }
    return [...ids];
  }

  // =============================================
  // 納品書の印刷後：受注管理シートへの入力確認（v25.92）
  // 「はい」→ 閉じる ／「いいえ」→ 受注管理シートへのリンクを表示
  // =============================================
  const ORDER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1ya6PgMBfmbLamf4ByuYijPbMS4Qzt5dUspiuZwPBido/edit?gid=1529015826#gid=1529015826';

  function showSheetEntryNotice() {
    document.getElementById('bcart-sheet-notice')?.remove();
    const modal = document.createElement('div');
    modal.id = 'bcart-sheet-notice';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Hiragino Kaku Gothic Pro,Meiryo,sans-serif;';
    modal.innerHTML = `
      <div style="background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);padding:24px;width:90%;max-width:420px;border:3px solid #0891b2;">
        <div style="color:#0e7490;font-size:16px;font-weight:bold;margin-bottom:12px;">📋 受注管理シートの入力確認</div>
        <div style="font-size:14px;color:#334155;margin-bottom:16px;">受注管理シートに<b>納品日・納品数</b>を入力しましたか？</div>
        <div id="bcart-sn-ask" style="display:flex;gap:8px;">
          <button id="bcart-sn-no" style="flex:1;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:14px;font-weight:bold;cursor:pointer;">いいえ<span style="display:block;font-size:11px;font-weight:normal;margin-top:2px;">（受注管理シートを開く）</span></button>
          <button id="bcart-sn-yes" style="flex:1;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;border:none;border-radius:8px;padding:10px;font-size:14px;font-weight:bold;cursor:pointer;">はい</button>
        </div>
        <div id="bcart-sn-link" style="display:none;">
          <div style="font-size:13px;color:#dc2626;font-weight:bold;margin-bottom:10px;">⚠️ 下のリンクから受注管理シートを開いて、納品日・納品数を入力してください。</div>
          <a id="bcart-sn-open" href="${ORDER_SHEET_URL}" target="_blank" rel="noopener"
             style="display:block;text-align:center;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;border-radius:8px;padding:10px;font-size:14px;font-weight:bold;text-decoration:none;margin-bottom:8px;">📄 受注管理シートを開く</a>
          <div style="font-size:11px;color:#64748b;word-break:break-all;margin-bottom:10px;">${ORDER_SHEET_URL}</div>
          <button id="bcart-sn-close" style="width:100%;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-size:13px;cursor:pointer;">閉じる</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('bcart-sn-yes').addEventListener('click', () => modal.remove());
    // 「いいえ」→ 受注管理シートを別タブで開く（v25.93）
    // ポップアップがブロックされた場合のみ、リンクを表示して押してもらう
    document.getElementById('bcart-sn-no').addEventListener('click', () => {
      const w = window.open(ORDER_SHEET_URL, '_blank');
      if (w) { try { w.opener = null; } catch(e) {} modal.remove(); return; }
      document.getElementById('bcart-sn-ask').style.display = 'none';
      document.getElementById('bcart-sn-link').style.display = 'block';
    });
    document.getElementById('bcart-sn-open').addEventListener('click', () => setTimeout(() => modal.remove(), 300));
    document.getElementById('bcart-sn-close').addEventListener('click', () => modal.remove());
  }

  // =============================================
  // 受注管理（受注単位）の納品書作成でも発送日・納品日を入力（v25.85）
  // iframe: /admin/invoice/invoice?oId={受注ID}&is_modal=1
  // =============================================
  function collectOrderIdsFromInvoice(iframe, form) {
    const ids = new Set();
    const add = val => String(val).split(/[,\s]+/).forEach(v => { if (/^\d+$/.test(v)) ids.add(v); });
    if (form) {
      try { for (const [key, val] of new FormData(form).entries()) if (/^oId$|order_id|^oIds?\[?\]?$/i.test(key)) add(val); } catch(e) {}
    }
    if (!ids.size) {
      const src = iframe.getAttribute('src') || '';
      const qs = src.includes('?') ? src.split('?')[1] : '';
      new URLSearchParams(qs).forEach((val, key) => { if (/^oId|order_id/i.test(key)) add(val); });
    }
    return [...ids];
  }

  // 受注詳細画面から出荷情報（発送ID・商品・発送状況・発送日・納品日）を取得
  async function fetchOrderShipments(orderId) {
    const res = await fetch(`${location.origin}/admin/order/${orderId}/view`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');

    let orderCode = '';
    doc.querySelectorAll('td').forEach(td => { const t = td.textContent.trim(); if (/^\d{11,}$/.test(t) && !orderCode) orderCode = t; });

    const countIds = el => (el.textContent.match(/Bカート発送ID/g) || []).length;
    const labelOf = el => {
      let n = el;
      for (let d = 0; d < 3 && n; d++) {
        let sib = n.previousElementSibling;
        while (sib) { const t = sib.textContent.trim(); if (t) return t; sib = sib.previousElementSibling; }
        n = n.parentElement;
      }
      return '';
    };
    const valueOf = (block, word) => {
      const inp = Array.from(block.querySelectorAll('input')).find(i => labelOf(i).startsWith(word));
      return inp ? inp.value.trim() : '';
    };

    const shipments = [];
    const seen = new Set();
    Array.from(doc.querySelectorAll('td, th, dt, div, span')).forEach(cell => {
      if (cell.children.length || cell.textContent.trim() !== 'Bカート発送ID') return;
      const valEl = cell.nextElementSibling;
      const id = valEl ? valEl.textContent.trim() : '';
      if (!/^\d{6,}$/.test(id) || seen.has(id)) return;
      seen.add(id);

      // この出荷だけを含む最大の範囲
      let block = cell;
      while (block.parentElement && block.parentElement !== doc.body && countIds(block.parentElement) === 1) block = block.parentElement;

      const statusSel = Array.from(block.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.text.trim() === '発送済'));
      const statusOpt = statusSel ? (Array.from(statusSel.options).find(o => o.hasAttribute('selected')) || statusSel.options[0]) : null;
      const products = Array.from(block.querySelectorAll('a[href*="/admin/products/"]'))
        .map(a => a.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean);

      shipments.push({
        id, orderCode,
        status: statusOpt ? statusOpt.text.trim() : '',
        shipDate: valueOf(block, '発送日'),
        arrivalDate: valueOf(block, '納品日'),
        products
      });
    });
    return shipments;
  }

  // 出荷を選んで発送日・納品日を入力するモーダル
  function askOrderInvoiceDates(shipments) {
    return new Promise(resolve => {
      document.getElementById('bcart-order-date-modal')?.remove();
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const toInput = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const esc = t => String(t || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      // 初期選択：発送済でなく、日付が未入力の出荷（全部埋まっていれば全件）
      const defaults = shipments.map(s => s.status !== '発送済' && (!s.shipDate || !s.arrivalDate));
      if (!defaults.some(Boolean)) defaults.fill(true);

      const rows = shipments.map((s, i) => `
        <label style="display:flex;gap:10px;align-items:flex-start;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;cursor:pointer;">
          <input type="checkbox" class="bcart-od-chk" data-id="${esc(s.id)}" ${defaults[i] ? 'checked' : ''} style="margin-top:3px;">
          <div style="flex:1;font-size:12px;color:#334155;">
            <div><b>出荷情報${i + 1}</b>　発送ID ${esc(s.id)}${s.status ? `　<span style="color:${s.status === '発送済' ? '#16a34a' : '#b45309'};">${esc(s.status)}</span>` : ''}</div>
            <div style="color:#64748b;">${s.products.map(esc).join('<br>') || '（商品名を取得できませんでした）'}</div>
            <div style="color:#64748b;">現在：発送日 ${esc(s.shipDate) || '未入力'} ／ 納品日 ${esc(s.arrivalDate) || '未入力'}</div>
          </div>
        </label>`).join('');

      const modal = document.createElement('div');
      modal.id = 'bcart-order-date-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Hiragino Kaku Gothic Pro,Meiryo,sans-serif;';
      modal.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);padding:24px;width:92%;max-width:520px;max-height:90vh;overflow:auto;border:3px solid #0891b2;">
          <div style="color:#0e7490;font-size:16px;font-weight:bold;margin-bottom:6px;">📅 発送日・納品日を入力</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:12px;">受注番号 ${esc(shipments[0].orderCode)}：日付を設定する出荷を選んでから納品書を作成します。</div>
          ${rows}
          <div style="display:flex;align-items:center;gap:10px;margin:12px 0 10px;">
            <label style="min-width:48px;font-size:13px;font-weight:bold;color:#334155;">発送日</label>
            <input type="date" id="bcart-od-ship" value="${toInput(today)}" style="flex:1;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <label style="min-width:48px;font-size:13px;font-weight:bold;color:#334155;">納品日</label>
            <input type="date" id="bcart-od-arrival" value="${toInput(tomorrow)}" style="flex:1;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
          </div>
          <div id="bcart-od-error" style="color:#dc2626;font-size:12px;min-height:18px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:8px;">
            <button id="bcart-od-cancel" style="flex:1;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">キャンセル</button>
            <button id="bcart-od-skip" style="flex:1;background:white;color:#0e7490;border:1.5px solid #0891b2;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">日付なしで作成</button>
            <button id="bcart-od-ok" style="flex:1;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">設定して納品書作成</button>
          </div>
        </div>`;
      document.body.appendChild(modal);

      const errEl = document.getElementById('bcart-od-error');
      const close = r => { modal.remove(); resolve(r); };
      document.getElementById('bcart-od-cancel').addEventListener('click', () => close(null));
      // 日付を設定せずにそのまま納品書を作成（v25.86）
      document.getElementById('bcart-od-skip').addEventListener('click', () => close({ ids: [], shipDate: '', arrivalDate: '', skipped: true }));
      document.getElementById('bcart-od-ok').addEventListener('click', () => {
        const ids = Array.from(modal.querySelectorAll('.bcart-od-chk:checked')).map(c => c.dataset.id);
        const shipDate = document.getElementById('bcart-od-ship').value;
        const arrivalDate = document.getElementById('bcart-od-arrival').value;
        if (!ids.length) { errEl.textContent = '⚠️ 日付を設定する出荷を1つ以上選んでください'; return; }
        if (!shipDate || !arrivalDate) { errEl.textContent = '⚠️ 発送日と納品日の両方を入力してください'; return; }
        if (arrivalDate < shipDate) { errEl.textContent = '⚠️ 納品日が発送日より前になっています'; return; }
        close({ ids, shipDate, arrivalDate });
      });
      document.getElementById('bcart-od-ship').focus();
    });
  }

  function hookNativeInvoiceIframe(iframe) {
    let doc;
    try { doc = iframe.contentDocument; } catch(e) { return; }
    if (!doc || !doc.body || doc._bcartDateHooked) return;
    doc._bcartDateHooked = true;

    let bypass = false;   // 日付設定後の再実行時はスルー
    let busy = false;

    const isSubmitter = el => {
      if (!el) return false;
      const btn = el.closest('button, input[type="submit"], input[type="button"]');
      if (!btn) return null;
      const label = (btn.value || btn.textContent || '').trim();
      if (btn.type === 'submit' || btn.name === 'submit' || /作成|印刷|発行/.test(label)) return btn;
      return null;
    };

    async function gate(btn, form) {
      if (busy) return;
      busy = true;
      try {
        // 未入金チェック（納品書の作成時のみ・v25.88）
        if (!(await checkInvoiceIframeUnpaid(iframe))) return;

        let ids, dates;
        if ((iframe.getAttribute('src') || '').includes('/admin/invoice/invoice')) {
          // 受注管理（受注単位）の納品書：受注に含まれる出荷を選んで日付を設定（v25.85）
          const orderIds = collectOrderIdsFromInvoice(iframe, form);
          if (!orderIds.length) {
            if (!confirm('受注を特定できなかったため、発送日・納品日を設定できません。\n日付を設定せずに納品書を作成しますか？')) return;
          }
          const shipments = [];
          for (const oid of orderIds) {
            try { shipments.push(...await fetchOrderShipments(oid)); }
            catch(e) { console.error('出荷情報取得エラー:', oid, e); }
          }
          if (!shipments.length) {
            if (!confirm('この受注の出荷情報（発送ID）を取得できなかったため、発送日・納品日を設定できません。\n日付を設定せずに納品書を作成しますか？')) return;
            ids = []; dates = {};
          } else {
            const sel = await askOrderInvoiceDates(shipments);
            if (!sel) return; // キャンセル → 作成しない
            ids = sel.ids; dates = sel;   // 「日付なしで作成」のときは ids が空（v25.86）
          }
        } else {
          ids = collectLogisticsIdsFromInvoice(iframe, form);
          if (!ids.length) {
            alert('発送IDを特定できなかったため、発送日・納品日を設定できません。\nパネルの印刷ボタンから印刷してください。');
            return;
          }
          dates = await askPrintDates(ids.length);
          if (!dates) return; // キャンセル → 作成しない
          if (dates.skipped) ids = []; // 日付なしで作成（v25.89）
        }

        const failed = [];
        for (const id of ids) {
          try { if (!(await applyDateToLogistics(id, dates.shipDate, dates.arrivalDate))) failed.push(id); }
          catch(e) { console.error('日付設定エラー:', id, e); failed.push(id); }
          await new Promise(r => setTimeout(r, 300));
        }
        if (failed.length && !confirm(`次の発送IDで日付を設定できませんでした:\n${failed.join(', ')}\n\nこのまま納品書を作成しますか？`)) return;

        // 元の作成処理を実行
        bypass = true;
        try {
          if (btn) btn.click();
          else if (form && form.requestSubmit) form.requestSubmit();
          else if (form) form.submit();
        } finally {
          setTimeout(() => { bypass = false; }, 500);
        }
        // 受注管理シートへの入力確認（v25.92）
        setTimeout(showSheetEntryNotice, 1500);
      } finally {
        busy = false;
      }
    }

    // 帳票の種類が納品書以外（請求書・領収書・見積書など）なら日付入力を出さない（v25.87）
    // 納品書は pdf_type=delivery。判別できない場合は従来どおり納品書として扱う
    const isNonDeliveryDoc = form => {
      let type = '';
      try { if (form) type = String(new FormData(form).get('pdf_type') || ''); } catch(e) {}
      if (!type) {
        const el = doc.querySelector('input[name="pdf_type"]:checked, select[name="pdf_type"], input[type="hidden"][name="pdf_type"]');
        if (el) type = String(el.value || '');
      }
      if (type) return type !== 'delivery';
      // pdf_type がない場合は、選択中の項目の表示名で判定
      const texts = [];
      doc.querySelectorAll('input[type="radio"]:checked').forEach(r => {
        const lab = r.closest('label') || (r.id && doc.querySelector(`label[for="${r.id}"]`));
        texts.push(lab ? lab.textContent : (r.nextSibling ? r.nextSibling.textContent || '' : ''));
      });
      doc.querySelectorAll('select').forEach(sel => { const o = sel.options[sel.selectedIndex]; if (o) texts.push(o.text); });
      const t = texts.join(' ');
      return /請求|領収|見積/.test(t) && !/納品/.test(t);
    };

    // ボタンクリックを横取り（JS処理型のボタンにも対応）
    doc.addEventListener('click', e => {
      if (bypass) return;
      const btn = isSubmitter(e.target);
      if (!btn) return;
      const form = btn.form || btn.closest('form');
      if (isNonDeliveryDoc(form)) return; // 請求書などはそのまま作成
      e.preventDefault();
      e.stopImmediatePropagation();
      gate(btn, form);
    }, true);

    // Enterキー等によるsubmitも横取り
    doc.addEventListener('submit', e => {
      if (bypass) return;
      if (isNonDeliveryDoc(e.target)) return; // 請求書などはそのまま作成
      e.preventDefault();
      e.stopImmediatePropagation();
      gate(e.submitter || null, e.target);
    }, true);

    console.log('[発送日・納品日チェック] 納品書作成画面にフックしました');
  }

  function watchNativeInvoiceIframes() {
    document.querySelectorAll('iframe[src*="/admin/invoice/logistics"], iframe[src*="/admin/invoice/invoice"]').forEach(iframe => {
      if (!iframe._bcartDateLoadHooked) {
        iframe._bcartDateLoadHooked = true;
        iframe.addEventListener('load', () => hookNativeInvoiceIframe(iframe));
      }
      try {
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') hookNativeInvoiceIframe(iframe);
      } catch(e) {}
    });
  }
  new MutationObserver(watchNativeInvoiceIframes)
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  watchNativeInvoiceIframes();

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
  async function generateDeliveryNotePDF(id, returnBuffer = false, memo = '') {
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
    fd.append('memo', memo || '');  // 納品書のコメント（v25.90）
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

  // =============================================
  // 未入金チェック（印刷前に警告表示）
  // 出荷一覧：発送IDから受注詳細を取得して入金日を確認
  // 受注一覧：テーブルのtd[10]を直接確認
  // =============================================
  async function checkUnpaidAndWarn(ids, isLogistics = true) {
    statusDiv.textContent = '💰 未入金チェック中…';
    const unpaidItems = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      try {
        let orderCode = '', companyName = '';

        if (isLogistics) {
          // 発送IDから受注番号・会社名を取得
          const res  = await fetch(`${location.origin}/admin/logistics/${id}/view`, { credentials: 'same-origin' });
          const text = await res.text();
          const doc  = new DOMParser().parseFromString(text, 'text/html');
          doc.querySelectorAll('a[href*="/admin/order/"]').forEach(a => {
            const txt = a.textContent.trim();
            if (/^\d{11,}$/.test(txt) && !orderCode) orderCode = txt;
          });
          companyName = doc.querySelectorAll('td')[14]?.textContent.trim() || '';
        } else {
          // 受注一覧のテーブルから受注番号・会社名を直接取得
          const row = document.querySelector(`table tbody tr:has(input[name="id_check[]"][value="${id}"])`);
          if (row) {
            const tds = row.querySelectorAll('td');
            orderCode   = tds[3] ? tds[3].textContent.trim().split(/\s/)[0] : id;
            companyName = tds[2] ? tds[2].textContent.trim().split('\n')[0].trim() : '';
          }
        }

        // 受注番号で受注一覧を検索して入金日(td[10])を確認
        if (orderCode) {
          const searchRes  = await fetch(`${location.origin}/admin/order/list?order_code=${encodeURIComponent(orderCode)}`, { credentials: 'same-origin' });
          const searchText = await searchRes.text();
          const searchDoc  = new DOMParser().parseFromString(searchText, 'text/html');
          let isUnpaid = false;
          searchDoc.querySelectorAll('table tbody tr').forEach(row => {
            const tds = row.querySelectorAll('td');
            if (tds.length < 11) return;
            if (tds[3] && tds[3].textContent.includes(orderCode)) {
              const firstChar = tds[10] ? tds[10].textContent.trim().charAt(0) : '';
              if (firstChar === 'ー' || firstChar === '-' || firstChar === '—') {
                isUnpaid = true;
              }
            }
          });
          if (isUnpaid) unpaidItems.push({ id, orderCode, companyName });
        }
      } catch(e) { console.error('未入金チェックエラー:', id, e); }
      await new Promise(r => setTimeout(r, 300));
    }

    if (!unpaidItems.length) return true; // 未入金なし→そのまま印刷

    // 警告モーダルを表示
    const list = document.getElementById('bcart-warn-list');
    list.innerHTML = unpaidItems.map(item =>
      `<div class="warn-item">⚠️ 発送ID: ${item.id}<span>${item.companyName} / 受注番号: ${item.orderCode}</span></div>`
    ).join('');
    document.getElementById('bcart-unpaid-warning').classList.add('show');

    // ユーザーの選択を待つ
    return new Promise(resolve => { warnPendingResolve = resolve; });
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
      // name="id_check[]" のチェックボックスを優先
      const cb = row.querySelector('input[name="id_check[]"], input[type="checkbox"]');
      if (!cb || !cb.checked) return;
      // チェックボックスのvalue（発送ID）を直接使う
      if (cb.name === 'id_check[]' && cb.value && !ids.includes(cb.value)) {
        ids.push(cb.value); return;
      }
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
        // 出荷一覧の発送IDパラメータは order_logistics_id、受注一覧は order_code
        let param;
        if (location.pathname.includes('logistics')) {
          param = isLogisticsId ? `order_logistics_id=${encodeURIComponent(num)}` : `order_code=${encodeURIComponent(num)}`;
        } else {
          param = isLogisticsId ? `logistics_id=${encodeURIComponent(num)}` : `order_code=${encodeURIComponent(num)}`;
        }
        const res = await fetch(`${base}?${param}`, { credentials: 'same-origin' });
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        doc.querySelectorAll('table tbody tr').forEach(r => {
          const excludeShipped = document.getElementById('bcart-exclude-shipped')?.checked;
          if (excludeShipped && r.innerHTML.includes('change_logistics_status_disabled')) return;
          // テキスト全体またはリンクのテキストに番号が含まれるか確認
          const rowText = r.textContent.replace(/\s+/g, '');
          const numClean = num.replace(/\s+/g, '');
          if (rowText.includes(numClean)) allRows.push(r.outerHTML);
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

      // ① name="image" のinputを直接取得（最優先）
      const imageInput = doc.querySelector('input[name="image"]');
      if (imageInput) {
        const val = imageInput.getAttribute('value') || '';
        if (val.match(/\.(jpg|jpeg|png|gif|webp)/i)) imgUrl = val;
      }

      // ② 全inputのvalue属性から画像URLを探す
      if (!imgUrl) {
        doc.querySelectorAll('input').forEach(input => {
          if (imgUrl) return;
          const val = input.getAttribute('value') || '';
          if (val.match(/\.(jpg|jpeg|png|gif|webp)/i) && val.startsWith('http')) imgUrl = val;
        });
      }

      // ③ img要素のsrcから取得
      if (!imgUrl) {
        doc.querySelectorAll('img').forEach(img => {
          if (imgUrl) return;
          const src = img.getAttribute('src') || '';
          if (src.match(/\.(jpg|jpeg|png|gif|webp)/i) && !src.startsWith('data:') && src.includes('uploads')) {
            imgUrl = src.startsWith('http') ? src : `${location.origin}${src}`;
          }
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

        return { name: p.productName, setName: p.setName || '', quantity: p.quantity, imgSrc: imgUrl, productId: p.productId };
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
    statusDiv.textContent = `✅ ${orders.length}件の発送指示書を生成しました`;
    btn.disabled = false; printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = false;
  });

  // 納品書PDF＋発送指示書を合体して印刷
  async function printWithShippingInstruction(ids, memo = '') {
    // memo は全件共通の文字列、または { 発送ID: コメント } の形（v25.91）
    const memoFor = id => (memo && typeof memo === 'object') ? (memo[id] || '') : (memo || '');
    const pdfBuffers = [];
    const orders = [];
    for (let i = 0; i < ids.length; i++) {
      statusDiv.textContent = `🖨 生成中… (${i + 1}/${ids.length}) ID: ${ids[i]}`;
      try {
        pdfBuffers.push(await generateDeliveryNotePDF(ids[i], true, memoFor(ids[i])));
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

    // 納品書印刷時にGAS通知
    if (orders.length) {
      statusDiv.textContent = '📨 記録・通知中…';
      const instHtml = generateShippingInstructionHTML(orders);
      notifyGAS(orders, instHtml);
    }
  }

  // =============================================
  // 印刷前の発送日・納品日入力モーダル（v25.81）
  // 出荷一覧で納品書を印刷する前に、発送日・納品日の入力を必須にする
  // =============================================
  // 出荷一覧の行から 会社名・受注番号 を取得（コメント入力欄の見出し用・v25.91）
  function getLogisticsRowInfo(id) {
    const info = { company: '', orderCode: '' };
    try {
      for (const row of document.querySelectorAll('table tbody tr')) {
        const hit = [...row.querySelectorAll('a, td')].some(el => el.textContent.trim() === id)
                 || [...row.querySelectorAll('input[type="checkbox"]')].some(cb => cb.value === id);
        if (!hit) continue;
        for (const a of row.querySelectorAll('a')) { const t = a.textContent.trim(); if (/^\d{11,}$/.test(t)) { info.orderCode = t; break; } }
        const table = row.closest('table');
        const ths = table ? [...table.querySelectorAll('thead th, thead td')] : [];
        const idx = ths.findIndex(th => /配送先\s*会社名/.test(th.textContent));
        const tds = row.querySelectorAll('td');
        if (idx >= 0 && tds[idx]) {
          info.company = (tds[idx].innerText || tds[idx].textContent).split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
        }
        break;
      }
    } catch(e) {}
    return info;
  }

  function askPrintDates(count, withMemo = false, ids = []) {
    return new Promise(resolve => {
      document.getElementById('bcart-print-date-modal')?.remove();
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const toInput = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');

      // コメント欄：1件なら1つ、複数なら出荷ごとに1つずつ（v25.91）
      const escH = t => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const taStyle = 'width:100%;box-sizing:border-box;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:13px;line-height:1.5;resize:vertical;font-family:inherit;';
      let memoListHtml = '';
      if (withMemo && ids.length > 1) {
        memoListHtml = `
          <div style="font-size:11px;color:#64748b;margin-bottom:6px;">出荷ごとに別々のコメントを入れられます。空欄の出荷はコメントなしで印刷されます。</div>
          <div style="max-height:40vh;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#f8fafc;">
            ${ids.map(id => {
              const r = getLogisticsRowInfo(id);
              return `<div style="margin-bottom:8px;">
                <div style="font-size:12px;color:#334155;margin-bottom:3px;"><b>${escH(id)}</b>${r.company ? '　' + escH(r.company) : ''}${r.orderCode ? `<span style="color:#94a3b8;font-size:11px;">（受注 ${escH(r.orderCode)}）</span>` : ''}</div>
                <textarea class="bcart-pd-memo-item" data-id="${escH(id)}" rows="2" style="${taStyle}"></textarea>
              </div>`;
            }).join('')}
          </div>
          <button type="button" id="bcart-pd-memo-copy" style="margin-top:6px;background:none;border:1px solid #cbd5e1;border-radius:6px;padding:4px 10px;font-size:11px;color:#475569;cursor:pointer;">↓ 1件目のコメントを全件にコピー</button>`;
      } else {
        memoListHtml = `<textarea id="bcart-pd-memo" rows="3" placeholder="例：ご不明点がございましたらお問い合わせください。" style="${taStyle}"></textarea>`;
      }

      const modal = document.createElement('div');
      modal.id = 'bcart-print-date-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Hiragino Kaku Gothic Pro,Meiryo,sans-serif;';
      modal.innerHTML = `
        <div style="background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);padding:24px;width:90%;max-width:${withMemo && ids.length > 1 ? 520 : 440}px;max-height:92vh;overflow-y:auto;box-sizing:border-box;border:3px solid #0891b2;">
          <div style="color:#0e7490;font-size:16px;font-weight:bold;margin-bottom:6px;">📅 発送日・納品日を入力</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:14px;">印刷する ${count} 件の出荷に設定してから納品書を印刷します。</div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <label style="min-width:48px;font-size:13px;font-weight:bold;color:#334155;">発送日</label>
            <input type="date" id="bcart-pd-ship" value="${toInput(today)}" style="flex:1;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <label style="min-width:48px;font-size:13px;font-weight:bold;color:#334155;">納品日</label>
            <input type="date" id="bcart-pd-arrival" value="${toInput(tomorrow)}" style="flex:1;padding:6px 8px;border:1.5px solid #cbd5e1;border-radius:6px;font-size:14px;">
          </div>
          <div style="margin-bottom:8px;${withMemo ? '' : 'display:none;'}">
            <label style="display:block;font-size:13px;font-weight:bold;color:#334155;margin-bottom:4px;">納品書のコメント <span style="font-weight:normal;color:#94a3b8;font-size:11px;">（任意）</span></label>
            ${memoListHtml}
          </div>
          <div id="bcart-pd-error" style="color:#dc2626;font-size:12px;min-height:18px;margin-bottom:8px;"></div>
          <div style="display:flex;gap:8px;">
            <button id="bcart-pd-cancel" style="flex:1;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">キャンセル</button>
            <button id="bcart-pd-skip" style="flex:1;background:white;color:#0e7490;border:1.5px solid #0891b2;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">日付なしで印刷</button>
            <button id="bcart-pd-ok" style="flex:1;background:linear-gradient(135deg,#0891b2,#0e7490);color:white;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:bold;cursor:pointer;">設定して印刷</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const shipEl = document.getElementById('bcart-pd-ship');
      const arrivalEl = document.getElementById('bcart-pd-arrival');
      const errEl = document.getElementById('bcart-pd-error');
      const memoEl = document.getElementById('bcart-pd-memo');
      const itemEls = [...modal.querySelectorAll('.bcart-pd-memo-item')];
      if (itemEls.length) {
        document.getElementById('bcart-pd-memo-copy').addEventListener('click', () => {
          const v = itemEls[0].value;
          itemEls.forEach(el => { el.value = v; });
        });
      }
      const close = result => {
        if (result) {
          if (itemEls.length) {
            result.memo = {};
            itemEls.forEach(el => { const v = el.value.trim(); if (v) result.memo[el.dataset.id] = v; });
          } else {
            result.memo = memoEl ? memoEl.value.trim() : '';
          }
        }
        modal.remove(); resolve(result);
      };

      document.getElementById('bcart-pd-cancel').addEventListener('click', () => close(null));
      // 日付を設定せずに印刷・作成（v25.89）
      document.getElementById('bcart-pd-skip').addEventListener('click', () => close({ shipDate: '', arrivalDate: '', skipped: true }));
      document.getElementById('bcart-pd-ok').addEventListener('click', () => {
        const shipDate = shipEl.value, arrivalDate = arrivalEl.value;
        if (!shipDate || !arrivalDate) { errEl.textContent = '⚠️ 発送日と納品日の両方を入力してください'; return; }
        if (arrivalDate < shipDate) { errEl.textContent = '⚠️ 納品日が発送日より前になっています'; return; }
        close({ shipDate, arrivalDate });
      });
      shipEl.focus();
    });
  }

  // 印刷共通処理：未入金チェック → 日付入力 → 日付反映 → 印刷
  async function runPrintFlow(ids) {
    const setBtns = d => { printOneBtn.disabled = printAllBtn.disabled = printChecked.disabled = d; };
    setBtns(true);
    try {
      const proceed = await checkUnpaidAndWarn(ids, true);
      if (!proceed) return;

      const dates = await askPrintDates(ids.length, true, ids);  // パネル印刷ではコメント欄を表示（v25.90）・出荷ごとのコメント（v25.91）
      if (!dates) { statusDiv.textContent = '印刷をキャンセルしました'; return; }

      const failed = [];
      const dateIds = dates.skipped ? [] : ids; // 日付なしで印刷（v25.89）
      for (let i = 0; i < dateIds.length; i++) {
        statusDiv.textContent = `📅 日付設定中… (${i + 1}/${ids.length}) ID: ${ids[i]}`;
        try {
          const ok = await applyDateToLogistics(ids[i], dates.shipDate, dates.arrivalDate);
          if (!ok) failed.push(ids[i]);
        } catch(e) {
          console.error('日付設定エラー:', ids[i], e);
          failed.push(ids[i]);
        }
        await new Promise(r => setTimeout(r, 400));
      }
      if (failed.length) {
        const cont = confirm(`次の発送IDで日付を設定できませんでした:\n${failed.join(', ')}\n\nこのまま印刷を続けますか？`);
        if (!cont) { statusDiv.textContent = `⚠️ 日付設定に失敗した件があるため中止しました（${failed.length}件）`; return; }
      }

      await printWithShippingInstruction(ids, dates.memo);
      // 受注管理シートへの入力確認（v25.92）
      showSheetEntryNotice();
      statusDiv.textContent = dates.skipped
        ? `✅ ${ids.length}件 印刷完了（日付は設定していません）`
        : `✅ ${ids.length}件 印刷完了（発送日 ${dates.shipDate} / 納品日 ${dates.arrivalDate}）`;
    } finally {
      setBtns(false);
    }
  }

  // 印刷ボタン
  printOneBtn.addEventListener('click', async () => {
    const ids = getVisibleLogisticsIds();
    if (!ids.length) { statusDiv.textContent = '⚠️ 発送IDが見つかりません'; return; }
    await runPrintFlow(ids);
  });
  printAllBtn.addEventListener('click', async () => {
    const ids = getVisibleLogisticsIds();
    if (!ids.length) { statusDiv.textContent = '⚠️ 発送IDが見つかりません'; return; }
    await runPrintFlow(ids);
  });
  printChecked.addEventListener('click', async () => {
    const ids = getCheckedLogisticsIds();
    if (!ids.length) { statusDiv.textContent = '⚠️ チェックされた発送IDがありません'; return; }
    await runPrintFlow(ids);
  });

  // =============================================
  // 発送日・納品日一括設定
  // =============================================

  // 日付をYYYY-MM-DD形式で返す
  // YYYY/MM/DD形式（Bカートの日付形式）
  function formatDate(d) {
    return d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
  }
  // input[type=date]用のYYYY-MM-DD形式
  function formatDateInput(d) {
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  // デフォルト日付をセット（当日・翌日）
  function initDatePicker() {
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const shipInput    = document.getElementById('bcart-ship-date');
    const arrivalInput = document.getElementById('bcart-arrival-date');
    if (shipInput)    shipInput.value    = formatDateInput(today);
    if (arrivalInput) arrivalInput.value = formatDateInput(tomorrow);
  }

  // 発送日・納品日を1件の発送IDに設定（fetch POST）
  async function applyDateToLogistics(logisticsId, shipDate, arrivalDate) {
    // 編集ページを取得してフォームの既存値とCSRFトークンを取得
    const viewRes = await fetch(`${location.origin}/admin/logistics/${logisticsId}/edit`, { credentials: 'same-origin' });
    const viewText = await viewRes.text();
    const viewDoc = new DOMParser().parseFromString(viewText, 'text/html');

    // フォームのaction URLを取得
    const form = viewDoc.querySelector('form');
    if (!form) throw new Error('フォームが見つかりません');

    const fd = new FormData();

    // CSRFトークン
    const tokenEl = viewDoc.querySelector('input[name="_token"]');
    fd.append('_token', tokenEl ? tokenEl.value : getCsrfToken());

    // 既存フォームの値をコピー
    viewDoc.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
      const name = el.name;
      if (!name || name === '_token') return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.checked) fd.append(name, el.value);
      } else {
        fd.append(name, el.value || '');
      }
    });

    // 発送日・納品日をYYYY/MM/DD形式で上書き
    if (shipDate) {
      // input[type=date]の値(YYYY-MM-DD)をYYYY/MM/DDに変換
      fd.set('delivery_date', shipDate.replace(/-/g, '/'));
    }
    if (arrivalDate) {
      fd.set('arrival_date', arrivalDate.replace(/-/g, '/'));
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



  // =============================================
  // 入金日期間抽出
  // =============================================
  const paymentDateOpenBtn   = document.getElementById('bcart-payment-date-open-btn');
  const paymentDatePicker    = document.getElementById('bcart-payment-date-picker');
  const paymentDateSearchBtn = document.getElementById('bcart-payment-date-search-btn');

  if (paymentDateOpenBtn) {
    paymentDateOpenBtn.addEventListener('click', () => {
      const isOpen = paymentDatePicker.style.display !== 'none';
      paymentDatePicker.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        // デフォルト：当月の1日〜末日
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth()+1).padStart(2,'0');
        const lastDay = new Date(y, today.getMonth()+1, 0).getDate();
        document.getElementById('bcart-payment-date-start').value = `${y}-${m}-01`;
        document.getElementById('bcart-payment-date-end').value   = `${y}-${m}-${String(lastDay).padStart(2,'0')}`;
      }
    });
  }

  if (paymentDateSearchBtn) {
    paymentDateSearchBtn.addEventListener('click', async () => {
      const startDate = document.getElementById('bcart-payment-date-start').value;
      const endDate   = document.getElementById('bcart-payment-date-end').value;
      if (!startDate || !endDate) { statusDiv.textContent = '⚠️ 開始日と終了日を入力してください'; return; }

      paymentDateSearchBtn.disabled = true;
      await runOrderSearch({
        label: `📅 入金日 ${startDate}〜${endDate}`,
        matchFn: (tds) => {
          const txt = tds[10] ? tds[10].textContent.trim() : '';
          const dateMatch = txt.match(/(\d{4}-\d{2}-\d{2})/);
          if (!dateMatch) return false;
          return dateMatch[1] >= startDate && dateMatch[1] <= endDate;
        },
      });
      paymentDateSearchBtn.disabled = false;
      paymentDatePicker.style.display = 'none';
    });
  }

  // =============================================
  // クレジット払い抽出
  // =============================================
  const creditOpenBtn   = document.getElementById('bcart-credit-open-btn');
  const creditPicker    = document.getElementById('bcart-credit-picker');
  const creditSearchBtn = document.getElementById('bcart-credit-search-btn');

  if (creditOpenBtn) {
    creditOpenBtn.addEventListener('click', () => {
      const isOpen = creditPicker.style.display !== 'none';
      creditPicker.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        const today = new Date();
        document.getElementById('bcart-credit-month').value =
          today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0');
      }
    });
  }

  if (creditSearchBtn) {
    creditSearchBtn.addEventListener('click', async () => {
      const month = document.getElementById('bcart-credit-month').value; // YYYY-MM
      if (!month) { statusDiv.textContent = '⚠️ 年月を選択してください'; return; }

      creditSearchBtn.disabled = true;
      await runOrderSearch({
        label: `💳 クレジット ${month}`,
        matchFn: (tds) => {
          // td[3]=受注番号・受注日時、td[12]=決済方法
          const orderDateTxt = tds[3] ? tds[3].textContent.trim() : '';
          const dateMatch = orderDateTxt.match(/(\d{4}-\d{2})-\d{2}/);
          if (!dateMatch || dateMatch[1] !== month) return false;
          const payment = tds[12] ? tds[12].textContent.trim() : '';
          return payment.includes('クレジット');
        },
      });
      creditSearchBtn.disabled = false;
      creditPicker.style.display = 'none';
    });
  }

  // =============================================
  // キャンセルメモ抽出（出荷一覧）
  // 各発送IDの詳細ページを取得してメモを確認
  // =============================================
  // =============================================
  // キャンセルメモ抽出 - 別ウィンドウで表示
  // =============================================
  const cancelMemoOpenBtn = document.getElementById('bcart-cancel-memo-open-btn');

  if (cancelMemoOpenBtn) {
    cancelMemoOpenBtn.addEventListener('click', () => {
      openCancelMemoWindow();
    });
  }

  function openCancelMemoWindow() {
    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>🚫 キャンセルメモ抽出</title>
<style>
  body { font-family: 'Hiragino Kaku Gothic Pro', Meiryo, sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
  h2 { color: #ea580c; margin: 0 0 16px; font-size: 16px; }
  .card { background: white; border-radius: 10px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 16px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; margin-bottom: 12px; cursor: pointer; }
  button { background: linear-gradient(135deg,#ea580c,#c2410c); color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 14px; font-weight: bold; cursor: pointer; width: 100%; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  #progress-wrap { background: #e2e8f0; border-radius: 99px; height: 8px; margin: 12px 0; overflow: hidden; display: none; }
  #progress-bar { height: 100%; background: linear-gradient(90deg,#ea580c,#f97316); border-radius: 99px; width: 0%; transition: width 0.3s; }
  #status { font-size: 13px; color: #475569; margin: 8px 0; min-height: 20px; text-align: center; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #ea580c; color: white; padding: 8px 10px; text-align: left; }
  td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #fff7ed; }
  tr:hover td { background: #fed7aa; }
  a { color: #ea580c; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .memo { color: #dc2626; font-weight: bold; }
  #result-area { display: none; }
  .hint { font-size: 11px; color: #94a3b8; margin-bottom: 8px; line-height: 1.6; }
</style></head>
<body>
<div class="card">
  <h2>🚫 キャンセルメモ抽出</h2>
  <div class="hint">期間を指定して発送メモ・送り状番号に「キャンセル」を含む件を抽出します</div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    <label style="font-size:13px;min-width:44px;">開始日</label>
    <input type="date" id="date-start" style="flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
  </div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
    <label style="font-size:13px;min-width:44px;">終了日</label>
    <input type="date" id="date-end" style="flex:1;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
  </div>
  <label><input type="checkbox" id="unshipped-only" checked> 未発送のみ対象</label>
  <button id="search-btn" onclick="startSearch()">🔍 キャンセルを全件抽出</button>
  <div id="progress-wrap"><div id="progress-bar"></div></div>
  <div id="status">ボタンを押して開始してください</div>
</div>
<div id="result-area" class="card">
  <h2 id="result-title"></h2>
  <table id="result-table">
    <thead><tr><th>発送ID</th><th>送り状番号</th><th>発送メモ</th><th>会社名</th><th>発送状況</th></tr></thead>
    <tbody id="result-body"></tbody>
  </table>
</div>
<script>
const origin = '${location.origin}';
// デフォルト日付：直近1ヶ月
window.addEventListener('load', () => {
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setMonth(today.getMonth() - 1);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  document.getElementById('date-start').value = fmt(monthAgo);
  document.getElementById('date-end').value   = fmt(today);
});

async function startSearch() {
  const btn = document.getElementById('search-btn');
  const unshippedOnly = document.getElementById('unshipped-only').checked;
  btn.disabled = true;
  document.getElementById('progress-wrap').style.display = 'block';
  document.getElementById('result-area').style.display = 'none';
  document.getElementById('result-body').innerHTML = '';

  const setStatus = (msg) => document.getElementById('status').textContent = msg;
  const setProgress = (pct) => document.getElementById('progress-bar').style.width = pct + '%';

  // 全発送IDを収集
  setStatus('📋 出荷一覧を取得中...');
  const allIds = [];
  try {
    const dateStart = document.getElementById('date-start').value;
    const dateEnd   = document.getElementById('date-end').value;
    if (!dateStart || !dateEnd) { setStatus('⚠️ 開始日と終了日を入力してください'); btn.disabled = false; return; }
    const dateParam = '&order_time[start]=' + dateStart + '&order_time[end]=' + dateEnd;
    const firstRes = await fetch(origin + '/admin/logistics/list?limit=100&page=1' + dateParam, { credentials: 'same-origin' });
    const firstText = await firstRes.text();
    const firstDoc = new DOMParser().parseFromString(firstText, 'text/html');
    const totalStr = firstDoc.body.innerHTML; const totalMatch = totalStr.indexOf("件中") > -1 ? totalStr.substring(0, totalStr.indexOf("件中")).trim().match(/([0-9, ]+)$/) : null;
    const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/[, ]/g,'')) : 0;
    const firstRows = firstDoc.querySelectorAll('table tbody tr');
    const rowsPerPage = firstRows.length || 25;
    const totalPages = Math.ceil(totalCount / rowsPerPage);

    const extractIds = (doc) => {
      doc.querySelectorAll('table tbody tr').forEach(row => {
        if (unshippedOnly && row.innerHTML.includes('change_logistics_status_disabled')) return;
        const cb = row.querySelector('input[name="id_check[]"]');
        if (cb && cb.value) allIds.push(cb.value);
      });
    };
    extractIds(firstDoc);

    for (let page = 2; page <= totalPages; page++) {
      setStatus('📋 出荷一覧取得中... (' + page + '/' + totalPages + 'ページ)');
      setProgress(Math.round(page/totalPages*30));
      const res = await fetch(origin + '/admin/logistics/list?limit=100&page=' + page + dateParam, { credentials: 'same-origin' });
      const text = await res.text();
      extractIds(new DOMParser().parseFromString(text, 'text/html'));
      await new Promise(r => setTimeout(r, 200));
    }
  } catch(e) {
    setStatus('⚠️ 出荷一覧の取得に失敗しました');
    btn.disabled = false;
    return;
  }

  // 各発送IDの詳細を確認
  const results = [];
  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    setStatus('🔍 詳細確認中... ' + (i+1) + '/' + allIds.length + '件 (ID:' + id + ')');
    setProgress(30 + Math.round((i+1)/allIds.length*70));
    try {
      const res = await fetch(origin + '/admin/logistics/' + id + '/view', { credentials: 'same-origin' });
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');

      let shipMemo = '', shipCode = '', companyName = '', status = '';

      // th=ラベル、td=値 の構造で取得
      doc.querySelectorAll('tr').forEach(row => {
        const th = row.querySelector('th');
        const td = row.querySelector('td');
        if (!th || !td) return;
        const label = th.textContent.trim();
        const val   = td.textContent.trim();
        if (label.includes('送り状番号')) shipCode    = val;
        if (label.includes('発送メモ'))   shipMemo    = val;
        if (label.includes('会社名'))     companyName = companyName || val;
      });

      // 発送状況はtd[11]固定
      const allTds = doc.querySelectorAll('td');
      if (allTds[11]) status = allTds[11].textContent.trim();
      if (!companyName && allTds[14]) companyName = allTds[14].textContent.trim();

      // キャンセルチェック
      const hasCancelMemo = shipMemo.includes('キャンセル') || shipCode.includes('キャンセル');
      if (hasCancelMemo) {
        results.push({ id, shipMemo, shipCode, companyName, status });
      }
    } catch(e) {}
    await new Promise(r => setTimeout(r, 250));
  }

  setProgress(100);

  if (!results.length) {
    setStatus('✅ キャンセルメモの発送IDは見つかりませんでした（' + allIds.length + '件確認）');
    btn.disabled = false;
    return;
  }

  // 結果を表示
  document.getElementById('result-title').textContent = '🚫 キャンセルメモ該当：' + results.length + '件';
  const tbody = document.getElementById('result-body');
  tbody.innerHTML = results.map(r => \`<tr>
    <td><a href="\${origin}/admin/logistics/\${r.id}/view" target="_blank">\${r.id}</a></td>
    <td class="memo">\${r.shipCode || '－'}</td>
    <td class="memo">\${r.shipMemo || '－'}</td>
    <td>\${r.companyName || '－'}</td>
    <td>\${r.status || '－'}</td>
  </tr>\`).join('');
  document.getElementById('result-area').style.display = 'block';
  setStatus('✅ 完了：' + results.length + '件見つかりました');
  btn.disabled = false;
}
</script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank', 'width=900,height=700,scrollbars=yes');
  }

  // =============================================
  // 受注一覧 全件スキャン共通処理
  // =============================================
  async function runOrderSearch({ label, matchFn }) {
    statusDiv.textContent = `🔍 ${label} 検索中…`;
    progressWrap.style.display = 'block';
    progressBar.style.width = '5%';
    const allRows = [];

    try {
      const firstRes = await fetch(`${location.origin}/admin/order/list?limit=100&page=1`, { credentials: 'same-origin' });
      const firstText = await firstRes.text();
      const firstDoc  = new DOMParser().parseFromString(firstText, 'text/html');

      const totalStr = firstDoc.body.innerHTML; const totalMatch = totalStr.indexOf("件中") > -1 ? totalStr.substring(0, totalStr.indexOf("件中")).trim().match(/([0-9, ]+)$/) : null;
      const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/[, ]/g,'')) : 0;
      const firstRows  = firstDoc.querySelectorAll('table tbody tr');
      const rowsPerPage = firstRows.length || 25;
      const totalPages  = Math.ceil(totalCount / rowsPerPage);

      firstRows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length >= 13 && matchFn(tds)) allRows.push(row.outerHTML);
      });
      progressBar.style.width = `${Math.round(1/totalPages*100)}%`;

      for (let page = 2; page <= totalPages; page++) {
        statusDiv.textContent = `🔍 ${label} (${page}/${totalPages}ページ)`;
        progressBar.style.width = `${Math.round(page/totalPages*100)}%`;
        try {
          const res  = await fetch(`${location.origin}/admin/order/list?limit=100&page=${page}`, { credentials: 'same-origin' });
          const text = await res.text();
          const doc  = new DOMParser().parseFromString(text, 'text/html');
          doc.querySelectorAll('table tbody tr').forEach(row => {
            const tds = row.querySelectorAll('td');
            if (tds.length >= 13 && matchFn(tds)) allRows.push(row.outerHTML);
          });
        } catch(e) { console.error(`ページ${page}取得エラー:`, e); }
        await new Promise(r => setTimeout(r, 300));
      }
    } catch(e) {
      statusDiv.textContent = '⚠️ 検索に失敗しました';
      return;
    }

    const tbody = document.querySelector('table tbody');
    if (tbody && allRows.length) {
      tbody.innerHTML = allRows.join('');
      tbody.querySelectorAll('tr').forEach(r => r.classList.add('bcart-highlight'));
    } else if (tbody) {
      tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;padding:20px;color:#64748b;">${label}の受注が見つかりませんでした</td></tr>`;
    }

    progressBar.style.width = '100%';
    statusDiv.textContent = `✅ ${label}：${allRows.length}件`;
    filterBanner.style.display = 'block';
    filterBanner.innerHTML = `<b>🔍 ${label}</b><br>該当：${allRows.length}件`;
    resetBtn.style.display = 'block';
  }

  // =============================================
  // 会員一覧 全件スキャン共通処理（受注一覧とはテーブル構造が異なるため専用実装）
  // =============================================
  async function runCustomerSearch(memberIds) {
    const label = `🆔 会員ID抽出（${memberIds.length}件指定）`;
    statusDiv.textContent = `🔍 ${label} 検索中…`;
    progressWrap.style.display = 'block';
    progressBar.style.width = '5%';
    const allRows = [];
    const idsClean = memberIds.map(n => n.replace(/\s+/g, ''));

    const matchRow = (row) => {
      const rowText = row.textContent.replace(/\s+/g, '');
      return idsClean.some(id => rowText.includes(id));
    };

    try {
      const firstRes = await fetch(`${location.origin}/admin/customer/list?limit=100&page=1`, { credentials: 'same-origin' });
      const firstText = await firstRes.text();
      const firstDoc  = new DOMParser().parseFromString(firstText, 'text/html');

      const totalStr = firstDoc.body.innerHTML;
      const totalMatch = totalStr.indexOf("件中") > -1 ? totalStr.substring(0, totalStr.indexOf("件中")).trim().match(/([0-9, ]+)$/) : null;
      const totalCount = totalMatch ? parseInt(totalMatch[1].replace(/[, ]/g,'')) : 0;
      const firstRows  = firstDoc.querySelectorAll('table tbody tr');
      const rowsPerPage = firstRows.length || 25;
      const totalPages  = totalCount ? Math.ceil(totalCount / rowsPerPage) : 1;

      firstRows.forEach(row => { if (matchRow(row)) allRows.push(row.outerHTML); });
      progressBar.style.width = `${Math.round(1/totalPages*100)}%`;

      for (let page = 2; page <= totalPages; page++) {
        statusDiv.textContent = `🔍 ${label} (${page}/${totalPages}ページ)`;
        progressBar.style.width = `${Math.round(page/totalPages*100)}%`;
        try {
          const res  = await fetch(`${location.origin}/admin/customer/list?limit=100&page=${page}`, { credentials: 'same-origin' });
          const text = await res.text();
          const doc  = new DOMParser().parseFromString(text, 'text/html');
          doc.querySelectorAll('table tbody tr').forEach(row => { if (matchRow(row)) allRows.push(row.outerHTML); });
        } catch(e) { console.error(`ページ${page}取得エラー:`, e); }
        await new Promise(r => setTimeout(r, 300));
      }
    } catch(e) {
      statusDiv.textContent = '⚠️ 検索に失敗しました';
      return;
    }

    const tbody = document.querySelector('table tbody');
    if (tbody && allRows.length) {
      tbody.innerHTML = allRows.join('');
      tbody.querySelectorAll('tr').forEach(r => r.classList.add('bcart-highlight'));
    } else if (tbody) {
      const colCount = (document.querySelectorAll('table thead th').length) || 10;
      tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:20px;color:#64748b;">該当する会員が見つかりませんでした</td></tr>`;
    }

    progressBar.style.width = '100%';
    statusDiv.textContent = `✅ ${label}：${allRows.length}件`;
    filterBanner.style.display = 'block';
    filterBanner.innerHTML = `<b>🔍 会員IDで絞り込み表示中</b><br>入力：${memberIds.length}件 ／ 表示：${allRows.length}件`;
    resetBtn.style.display = 'block';
  }

  const memberSearchBtn = document.getElementById('bcart-member-search-btn');
  if (memberSearchBtn) {
    memberSearchBtn.addEventListener('click', async () => {
      const raw = document.getElementById('bcart-member-id-input').value.trim();
      if (!raw) { statusDiv.textContent = '⚠️ 会員IDを入力してください'; return; }
      const ids = [...new Set(raw.split('\n').map(s => s.trim()).filter(Boolean))];
      memberSearchBtn.disabled = true;
      await runCustomerSearch(ids);
      memberSearchBtn.disabled = false;
    });
  }


  const unpaidOpenBtn   = document.getElementById('bcart-unpaid-open-btn');
  const unpaidPicker    = document.getElementById('bcart-unpaid-picker');
  const unpaidSearchBtn = document.getElementById('bcart-unpaid-search-btn');

  if (unpaidOpenBtn) {
    unpaidOpenBtn.addEventListener('click', () => {
      const isOpen = unpaidPicker.style.display !== 'none';
      unpaidPicker.style.display = isOpen ? 'none' : 'block';
    });
  }

  if (unpaidSearchBtn) {
    unpaidSearchBtn.addEventListener('click', async () => {
      const amountMin = parseInt(document.getElementById('bcart-amount-min').value) || 0;
      const amountMax = parseInt(document.getElementById('bcart-amount-max').value) || Infinity;
      const bankOnly  = document.getElementById('bcart-unpaid-bank-only').checked;
      unpaidSearchBtn.disabled = true;
      await runOrderSearch({
        label: '💰 未入金',
        matchFn: (tds) => {
          const firstChar = tds[10] ? tds[10].textContent.trim().charAt(0) : '';
          const isUnpaid = firstChar === 'ー' || firstChar === '-' || firstChar === '—';
          if (!isUnpaid) return false;
          if (bankOnly && !(tds[12] ? tds[12].textContent.includes('銀行振込') : false)) return false;
          if (amountMin > 0 || amountMax !== Infinity) {
            const amount = parseInt((tds[4] ? tds[4].textContent.replace(/[^\d]/g,'') : '0')) || 0;
            if (amount < amountMin || amount > amountMax) return false;
          }
          return true;
        },
      });
      unpaidSearchBtn.disabled = false;
      unpaidPicker.style.display = 'none';
    });
  }



  // ページ読み込み
  async function waitForTable(maxWait = 5000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) { if (document.querySelector('table tbody tr')) return true; await new Promise(r => setTimeout(r, 200)); }
    return false;
  }
  // 出荷一覧に独立したキャンセルメモボタンを追加
  function addCancelMemoButton() {
    if (!location.pathname.includes('logistics')) return;
    if (document.getElementById('bcart-cancel-floating-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'bcart-cancel-floating-btn';
    btn.textContent = '🚫 キャンセルメモを抽出';
    btn.style.cssText = [
      'position:fixed', 'bottom:80px', 'right:20px', 'z-index:99998',
      'background:linear-gradient(135deg,#ea580c,#c2410c)', 'color:white',
      'border:none', 'border-radius:8px', 'padding:10px 16px',
      'font-size:13px', 'font-weight:bold', 'cursor:pointer',
      'box-shadow:0 4px 12px rgba(234,88,12,0.4)',
      'font-family:Hiragino Kaku Gothic Pro,Meiryo,sans-serif'
    ].join(';');
    btn.addEventListener('click', openCancelMemoWindow);
    document.body.appendChild(btn);
  }

  async function onPageReady() {
    if (location.pathname.includes('logistics')) {
      printArea.style.display = 'block';
      addCancelMemoButton();
      const dateArea = document.getElementById('bcart-date-area');
      if (dateArea) dateArea.style.display = 'block';
    }
    if (location.pathname.includes('/order')) {
      const unpaidArea = document.getElementById('bcart-unpaid-area');
      if (unpaidArea) unpaidArea.style.display = 'block';
      const paymentDateArea = document.getElementById('bcart-payment-date-area');
      if (paymentDateArea) paymentDateArea.style.display = 'block';
      const creditArea = document.getElementById('bcart-credit-area');
      if (creditArea) creditArea.style.display = 'block';

    }
    if (location.pathname.includes('/customer')) {
      const memberArea = document.getElementById('bcart-member-area');
      if (memberArea) memberArea.style.display = 'block';
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
        addCancelMemoButton();
        const dateArea = document.getElementById('bcart-date-area');
        if (dateArea) dateArea.style.display = 'block';
      }
      if (location.pathname.includes('/order')) {
        const unpaidArea = document.getElementById('bcart-unpaid-area');
        if (unpaidArea) unpaidArea.style.display = 'block';
      }
      if (location.pathname.includes('/customer')) {
        const memberArea = document.getElementById('bcart-member-area');
        if (memberArea) memberArea.style.display = 'block';
      }
      const saved = loadState();
      if (saved && saved.orderNumbers && saved.orderNumbers.length) {
        restoreBanner.style.display = 'block'; restoreBanner.textContent = `🔄 前回の絞り込み（${saved.orderNumbers.length}件）を復元中…`;
        resetBtn.style.display = 'block'; await waitForTable(); await applyFilter(saved.orderNumbers, true);
      }
    }, 500);
  });

})();
