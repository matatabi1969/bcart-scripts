// ==UserScript==
// @name         bカート 入金日 クレジットボタン追加
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  入金日ポップアップに「日付選択」「クレジット」ボタンを追加
// @match        https://pitto.i15.bcart.jp/admin/order/list*
// @match        https://medixor.i16.bcart.jp/admin/order/list*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function addButtons() {
        const wrapper = document.querySelector('.modaal-wrapper');
        if (!wrapper) return;
        if (wrapper.querySelector('.custom-btn-credit')) return;
        if (!wrapper.textContent.includes('入金日')) return;

        const input = wrapper.querySelector('input[type="text"]');
        if (!input) return;

        // 日付ピッカー（非表示）
        const datePicker = document.createElement('input');
        datePicker.type = 'date';
        datePicker.style.cssText = 'position:absolute;opacity:0;pointer-events:none;';
        datePicker.addEventListener('change', function() {
            input.value = datePicker.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // 日付ボタン
        const btnDate = document.createElement('button');
        btnDate.textContent = '📅 日付を選ぶ';
        btnDate.type = 'button';
        btnDate.style.cssText = 'margin:8px 4px 0 0;padding:6px 12px;background:#0061c2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        btnDate.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            datePicker.showPicker();
        }, true);

        // クレジットボタン
        const btnCredit = document.createElement('button');
        btnCredit.textContent = 'クレジット';
        btnCredit.className = 'custom-btn-credit';
        btnCredit.type = 'button';
        btnCredit.style.cssText = 'margin:8px 0 0 0;padding:6px 16px;background:#e8a000;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;';
        btnCredit.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            input.value = 'クレジット';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, true);

        const wrapper2 = document.createElement('div');
        wrapper2.style.cssText = 'display:flex;gap:4px;margin-top:8px;';
        wrapper2.appendChild(datePicker);
        wrapper2.appendChild(btnDate);
        wrapper2.appendChild(btnCredit);

        input.parentNode.insertBefore(wrapper2, input.nextSibling);
    }

    document.addEventListener('click', function() {
        setTimeout(addButtons, 300);
    }, true);

})();