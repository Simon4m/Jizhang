// Minimal interaction layer for SYSTEM_LEDGER
// Place this file in the same directory as index.html and include it before </body>:
// <script src="app.js"></script>

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // state
  let currentType = 'cost';

  // Sidebar toggle
  window.toggleSidebar = function toggleSidebar() {
    const sidebar = $('#sidebar');
    const overlay = $('#sidebar-overlay');
    if (!sidebar || !overlay) return;
    const isHidden = sidebar.classList.contains('-translate-x-full');
    if (isHidden) {
      sidebar.classList.remove('-translate-x-full');
      overlay.classList.remove('hidden');
    } else {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    }
  };

  // route switching
  const views = ['home', 'credit', 'query', 'config'];
  window.route = function route(view) {
    if (!views.includes(view)) return;
    views.forEach(v => {
      const el = $(`#view-${v}`);
      if (el) el.classList.add('hidden');
    });
    const target = $(`#view-${view}`);
    if (target) target.classList.remove('hidden');

    $$('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = $(`#nav-${view}`);
    if (navItem) navItem.classList.add('active');

    const title = $('#page-title');
    if (title) title.textContent = ({
      home: '系統控制台 (CONSOLE)',
      credit: '賒帳管理 (CREDIT)',
      query: '商業分析 (BI)',
      config: '系統配置 (CONFIG)'
    })[view] || 'SYSTEM_LEDGER';

    // close sidebar on small screens
    const sidebar = $('#sidebar');
    const overlay = $('#sidebar-overlay');
    if (sidebar && overlay && !sidebar.classList.contains('-translate-x-full')) {
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    }
  };

  // type button set
  window.setType = function setType(t) {
    currentType = t;
    $$('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === t);
    });
  };

  // simple commitData - prevents form default and appends a row for demo
  window.commitData = function commitData(e) {
    e.preventDefault && e.preventDefault();
    const amtEl = $('#in-amt');
    const catEl = $('#in-cat');
    const subEl = $('#in-sub');
    const dateEl = $('#in-date');

    const amt = amtEl ? parseFloat(amtEl.value || '0') : 0;
    const cat = catEl ? catEl.value : '';
    const sub = subEl ? subEl.value : '';
    const date = dateEl ? dateEl.value : new Date().toISOString().slice(0,10);

    const list = $('#home-ledger-list');
    if (list) {
      const row = document.createElement('div');
      row.className = 'row-item';
      row.innerHTML = `
        <div class="text-xs text-gray-500">${date}</div>
        <div><div class="flex items-center"><span class="tag-${currentType} tag-type">${currentType}</span><div>${cat} — ${sub}</div></div></div>
        <div class="text-right font-mono font-bold">${amt.toFixed(2)}</div>
        <div class="text-center"><button class="btn-delete" onclick="this.closest('.row-item').remove()">×</button></div>
      `;
      list.prepend(row);
    }

    if (amtEl) amtEl.value = '';
    if (subEl) subEl.value = '';
    console.log('committed', { type: currentType, amt, cat, sub, date });
  };

  // small stubs to avoid "not defined" when user clicks config buttons
  window.sysExport = function sysExport() {
    const rows = $$('#home-ledger-list .row-item').map(r => {
      return {
        date: r.querySelector('div')?.textContent?.trim(),
        desc: r.querySelectorAll('div')[1]?.textContent?.trim(),
        amt: r.querySelectorAll('div')[2]?.textContent?.trim()
      };
    });
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ledger-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  window.sysAddCat = function sysAddCat() {
    const input = $('#new-cat');
    if (!input) return;
    const v = input.value.trim();
    if (!v) return alert('請輸入分類名稱');
    const list = $('#cat-list');
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between px-2 py-1 bg-gray-50 border';
    row.innerHTML = `<div class="text-xs">${v}</div><button class="btn-config-del" onclick="this.closest('div').remove()">刪除</button>`;
    list.appendChild(row);
    input.value = '';
  };

  window.renderCreditManager = function renderCreditManager() {
    console.log('renderCreditManager called');
  };

  window.updateSubSuggest = function updateSubSuggest() {
    const cat = $('#in-cat')?.value || '';
    const datalist = $('#sub-list');
    if (!datalist) return;
    datalist.innerHTML = '';
    const common = {
      food: ['早餐','午餐','晚餐'],
      rent: ['店租','倉庫'],
      default: ['雜項','備註']
    };
    const arr = common[cat] || common.default;
    arr.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      datalist.appendChild(opt);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = $('#sidebar-overlay');
    if (overlay) overlay.addEventListener('click', toggleSidebar);
    route('home');
    if (!$('#in-date')) {
      const dateInput = document.getElementById('in-date');
      if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
    }
    $$('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => window.setType(btn.dataset.type));
    });
  });

})();
