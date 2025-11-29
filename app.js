/**
 * SYSTEM_LEDGER v9.5 CORE LOGIC
 * Author: System
 * Date: 2025-11-29
 */

// === CONFIG & STATE ===
const STORAGE_KEY = 'SYS_LEDGER_V9_DATA';
const DEFAULT_CATS = ['總店', '二店', '線上通路'];

let DATA = {
    txs: [], // Transactions: { id, type, amt, cat, sub, date, ts, isPaid(credit) }
    cats: [...DEFAULT_CATS]
};

let APP_STATE = {
    currentType: 'cost', // cost, expense, income, credit
    view: 'home'
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initDateInputs();
    route('home'); // Default Route
    renderAll();
});

function loadData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            DATA.txs = parsed.txs || [];
            DATA.cats = parsed.cats || [...DEFAULT_CATS];
        } catch (e) {
            console.error("DATA CORRUPTION", e);
        }
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    // Console Input
    document.getElementById('in-date').value = today;
    
    // Credit Manager Inputs
    document.getElementById('crm-date-start').value = today;
    document.getElementById('crm-date-end').value = today;

    // Query Inputs
    document.getElementById('qry-date-start').value = today.substring(0, 8) + '01'; // First day of month
    document.getElementById('qry-date-end').value = today;
}

// === ROUTING & UI ===
function route(viewId) {
    // Update State
    APP_STATE.view = viewId;

    // Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navItem = document.getElementById(`nav-${viewId}`);
    if (navItem) navItem.classList.add('active');

    // View Visibility
    ['home', 'credit', 'query', 'config'].forEach(id => {
        const el = document.getElementById(`view-${id}`);
        if (id === viewId) {
            el.classList.remove('hidden');
            el.classList.add('flex');
            // Trigger specific view renders
            if (id === 'credit') renderCreditManager();
            if (id === 'query') runQuery();
            if (id === 'config') renderConfig();
        } else {
            el.classList.add('hidden');
            el.classList.remove('flex');
        }
    });

    // Mobile Sidebar Logic
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth < 1024) {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isClosed = sidebar.classList.contains('-translate-x-full');
    
    if (isClosed) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }
}

// === CONSOLE LOGIC (HOME) ===
function setType(type) {
    APP_STATE.currentType = type;
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.type === type) btn.classList.add('active');
    });
}

function updateSubSuggest() {
    const cat = document.getElementById('in-cat').value;
    const list = document.getElementById('sub-list');
    list.innerHTML = '';
    
    // Extract unique sub-categories used with this category in the past
    const usedSubs = [...new Set(DATA.txs
        .filter(t => t.cat === cat && t.sub)
        .map(t => t.sub))];
    
    usedSubs.slice(0, 10).forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        list.appendChild(opt);
    });
}

function commitData(e) {
    e.preventDefault();
    const amtInput = document.getElementById('in-amt');
    const catInput = document.getElementById('in-cat');
    const subInput = document.getElementById('in-sub');
    const dateInput = document.getElementById('in-date');

    const val = parseFloat(amtInput.value);
    if (isNaN(val) || val === 0) return alert('金額無效');

    const tx = {
        id: Date.now().toString(36),
        type: APP_STATE.currentType,
        amt: val,
        cat: catInput.value,
        sub: subInput.value || (APP_STATE.currentType.toUpperCase()),
        date: dateInput.value,
        ts: Date.now(),
        isPaid: false // Only relevant for type 'credit'
    };

    DATA.txs.unshift(tx); // Add to top
    saveData();
    
    // Reset inputs but keep Date and Cat
    amtInput.value = '';
    subInput.value = '';
    amtInput.focus();

    renderAll();
}

function deleteTx(id) {
    if(!confirm('確認刪除此筆記錄?')) return;
    DATA.txs = DATA.txs.filter(t => t.id !== id);
    saveData();
    renderAll();
}

// === CREDIT MANAGER LOGIC ===
function toggleCreditDateInputs() {
    const mode = document.getElementById('crm-time-mode').value;
    const dateEnd = document.getElementById('crm-date-end');
    if (mode === 'range') {
        dateEnd.classList.remove('hidden');
    } else {
        dateEnd.classList.add('hidden');
    }
    renderCreditManager();
}

function toggleCreditStatus(id) {
    const tx = DATA.txs.find(t => t.id === id);
    if (tx) {
        tx.isPaid = !tx.isPaid;
        saveData();
        renderCreditManager(); // Re-render credit view
        renderConsole(); // Re-render console metrics (risk changed)
    }
}

function renderCreditManager() {
    const listEl = document.getElementById('credit-list');
    listEl.innerHTML = '';

    // Filters
    const mode = document.getElementById('crm-time-mode').value;
    const catFilter = document.getElementById('crm-cat-filter').value;
    const dStart = document.getElementById('crm-date-start').value;
    const dEnd = document.getElementById('crm-date-end').value;

    let filtered = DATA.txs.filter(t => t.type === 'credit');

    // Filter Logic
    if (catFilter !== 'all') filtered = filtered.filter(t => t.cat === catFilter);
    
    if (mode === 'day') {
        filtered = filtered.filter(t => t.date === dStart);
        document.getElementById('crm-period-label').textContent = dStart;
    } else if (mode === 'range') {
        filtered = filtered.filter(t => t.date >= dStart && t.date <= dEnd);
        document.getElementById('crm-period-label').textContent = `${dStart} ~ ${dEnd}`;
    } else {
        document.getElementById('crm-period-label').textContent = 'ALL TIME';
    }

    // Sort: Unpaid first, then by date desc
    filtered.sort((a, b) => (a.isPaid === b.isPaid) ? (b.ts - a.ts) : (a.isPaid ? 1 : -1));

    // Metrics
    const issued = sum(filtered);
    const collected = sum(filtered.filter(t => t.isPaid));
    const outstanding = issued - collected;

    // Global Metrics (All time)
    const allCredit = DATA.txs.filter(t => t.type === 'credit');
    const totalIssued = sum(allCredit);
    const totalCollected = sum(allCredit.filter(t => t.isPaid));
    const totalOutstanding = totalIssued - totalCollected;

    // DOM Update
    document.getElementById('crm-period-issued').textContent = fmt(issued);
    document.getElementById('crm-period-collected').textContent = fmt(collected);
    document.getElementById('crm-period-outstanding').textContent = fmt(outstanding);
    
    document.getElementById('crm-total-issued').textContent = fmt(totalIssued);
    document.getElementById('crm-total-collected').textContent = fmt(totalCollected);
    document.getElementById('crm-total-outstanding').textContent = fmt(totalOutstanding);

    // List Render
    filtered.forEach(t => {
        const div = document.createElement('div');
        div.className = `row-credit ${t.isPaid ? 'paid' : ''}`;
        div.innerHTML = `
            <div class="flex justify-center">
                <input type="checkbox" class="credit-check" ${t.isPaid ? 'checked' : ''} onchange="toggleCreditStatus('${t.id}')">
            </div>
            <div class="font-mono text-gray-500">${t.date.slice(5)}</div>
            <div class="text-info">
                <div class="font-bold text-gray-800">${t.cat}</div>
                <div class="text-xs text-gray-400">${t.sub}</div>
            </div>
            <div class="text-right font-mono font-bold text-amt">${fmt(t.amt)}</div>
        `;
        listEl.appendChild(div);
    });
}

// === QUERY / BI LOGIC ===
function toggleQueryDateInputs() {
    const mode = document.getElementById('qry-time-mode').value;
    const inputs = document.getElementById('qry-date-inputs');
    const endInput = document.getElementById('qry-date-end');
    
    if (mode === 'range') {
        inputs.classList.remove('hidden');
        endInput.classList.remove('hidden');
    } else if (mode === 'day') {
        inputs.classList.remove('hidden');
        endInput.classList.add('hidden');
    } else {
        inputs.classList.add('hidden');
    }
    runQuery();
}

function runQuery() {
    const listEl = document.getElementById('query-list');
    listEl.innerHTML = '';
    
    const mode = document.getElementById('qry-time-mode').value;
    const cat = document.getElementById('qry-cat').value;
    const keyword = document.getElementById('qry-keyword').value.toLowerCase();
    
    // Date Logic
    const today = new Date();
    const dStart = document.getElementById('qry-date-start').value;
    const dEnd = document.getElementById('qry-date-end').value;

    let res = DATA.txs;

    // Time Filter
    if (mode === 'day') {
        res = res.filter(t => t.date === dStart);
        document.getElementById('qry-period-label').textContent = dStart;
    } else if (mode === 'range') {
        res = res.filter(t => t.date >= dStart && t.date <= dEnd);
        document.getElementById('qry-period-label').textContent = `${dStart}~${dEnd}`;
    } else if (mode === 'month') {
        const ym = today.toISOString().slice(0, 7); // YYYY-MM
        res = res.filter(t => t.date.startsWith(ym));
        document.getElementById('qry-period-label').textContent = 'THIS MONTH';
    } else if (mode === 'year') {
        const y = today.getFullYear();
        res = res.filter(t => t.date.startsWith(y));
        document.getElementById('qry-period-label').textContent = 'THIS YEAR';
    } else {
        document.getElementById('qry-period-label').textContent = 'ALL';
    }

    // Cat Filter
    if (cat !== 'all') res = res.filter(t => t.cat === cat);

    // Keyword Filter
    if (keyword) res = res.filter(t => t.sub.toLowerCase().includes(keyword) || t.cat.toLowerCase().includes(keyword));

    // Calculate Metrics
    const rev = sum(res.filter(t => t.type === 'income' || t.type === 'credit'));
    const cost = sum(res.filter(t => t.type === 'cost'));
    const exp = sum(res.filter(t => t.type === 'expense'));
    const gp = rev - cost;
    const margin = rev ? (gp / rev * 100).toFixed(1) : 0;

    // Update UI
    document.getElementById('res-rev').textContent = fmt(rev);
    document.getElementById('res-cost').textContent = fmt(cost);
    document.getElementById('res-exp').textContent = fmt(exp);
    document.getElementById('res-gp').textContent = fmt(gp);
    document.getElementById('res-margin').textContent = margin + '%';
    document.getElementById('res-count').textContent = res.length;

    // Render List
    res.sort((a,b) => b.ts - a.ts).forEach(t => {
        const div = document.createElement('div');
        div.className = 'row-item';
        div.innerHTML = `
            <div class="font-mono text-gray-500 text-xs">${t.date.slice(5)}</div>
            <div>
                <span class="tag-type ${getTagClass(t.type)}">${getTypeLabel(t.type)}</span>
                <span class="font-bold text-gray-700">${t.sub}</span>
                <div class="text-[0.6rem] text-gray-400">${t.cat}</div>
            </div>
            <div class="text-right font-mono font-bold">${fmt(t.amt)}</div>
            <div class="text-center"></div>
        `;
        listEl.appendChild(div);
    });
}

// === CONFIG LOGIC ===
function renderConfig() {
    const list = document.getElementById('cat-list');
    list.innerHTML = '';
    DATA.cats.forEach(c => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-gray-50 p-2 border border-gray-100 text-xs font-bold';
        div.innerHTML = `
            <span>${c}</span>
            <div class="btn-config-del" onclick="sysDelCat('${c}')"><i class="fas fa-trash"></i></div>
        `;
        list.appendChild(div);
    });
}

function sysAddCat() {
    const inp = document.getElementById('new-cat');
    const val = inp.value.trim();
    if (val && !DATA.cats.includes(val)) {
        DATA.cats.push(val);
        inp.value = '';
        saveData();
        renderAll();
    }
}

function sysDelCat(cat) {
    if(!confirm(`確認刪除分類 [${cat}]?`)) return;
    DATA.cats = DATA.cats.filter(c => c !== cat);
    saveData();
    renderAll();
}

function sysExport() {
    const str = JSON.stringify(DATA, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LEDGER_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function sysImport(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (json.txs && json.cats) {
                if(confirm('導入將覆蓋當前數據，確定?')) {
                    DATA = json;
                    saveData();
                    renderAll();
                    alert('導入成功');
                }
            } else {
                alert('無效的備份文件');
            }
        } catch (err) {
            alert('JSON 解析失敗');
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset
}

function sysPurge() {
    if(confirm('嚴重警告：這將清除所有數據且無法恢復！確定執行？')) {
        DATA.txs = [];
        DATA.cats = [...DEFAULT_CATS];
        saveData();
        renderAll();
    }
}

// === CORE RENDERER ===
function renderAll() {
    // 1. Update Category Selectors
    const updateSelect = (id, includeAll) => {
        const sel = document.getElementById(id);
        const curr = sel.value;
        sel.innerHTML = includeAll ? '<option value="all">-- 所有店鋪 --</option>' : '';
        DATA.cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            sel.appendChild(opt);
        });
        if (curr && (DATA.cats.includes(curr) || curr === 'all')) sel.value = curr;
    };
    
    updateSelect('in-cat', false);
    updateSelect('crm-cat-filter', true);
    updateSelect('qry-cat', true);

    updateSubSuggest();
    renderConsole();
    if(APP_STATE.view === 'credit') renderCreditManager();
    if(APP_STATE.view === 'query') runQuery();
    if(APP_STATE.view === 'config') renderConfig();
}

function renderConsole() {
    const today = document.getElementById('in-date').value;
    const txToday = DATA.txs.filter(t => t.date === today);

    // Calc Today
    const rev = sum(txToday.filter(t => t.type === 'income' || t.type === 'credit'));
    const credit = sum(txToday.filter(t => t.type === 'credit'));
    const cost = sum(txToday.filter(t => t.type === 'cost'));
    const exp = sum(txToday.filter(t => t.type === 'expense'));
    const gp = rev - cost;
    const net = gp - exp;
    const margin = rev ? (gp / rev * 100).toFixed(0) + '%' : '0%';

    document.getElementById('day-rev').textContent = fmt(rev);
    document.getElementById('day-credit').textContent = fmt(credit);
    document.getElementById('day-margin').textContent = margin;
    document.getElementById('day-cost').textContent = fmt(cost);
    document.getElementById('day-exp').textContent = fmt(exp);
    document.getElementById('day-net').textContent = fmt(net);

    // Calc History Total
    const allRev = sum(DATA.txs.filter(t => t.type === 'income' || t.type === 'credit'));
    const allCost = sum(DATA.txs.filter(t => t.type === 'cost'));
    const allExp = sum(DATA.txs.filter(t => t.type === 'expense'));
    const allOutstanding = sum(DATA.txs.filter(t => t.type === 'credit' && !t.isPaid));
    const allGp = allRev - allCost;
    const allNet = allGp - allExp;
    const allMargin = allRev ? (allGp / allRev * 100).toFixed(0) + '%' : '0%';

    document.getElementById('all-rev').textContent = fmt(allRev);
    document.getElementById('all-outstanding').textContent = fmt(allOutstanding);
    document.getElementById('all-margin').textContent = allMargin;
    document.getElementById('all-cost').textContent = fmt(allCost);
    document.getElementById('all-exp').textContent = fmt(allExp);
    document.getElementById('all-net').textContent = fmt(allNet);

    // Render Recent List (Top 50)
    const listEl = document.getElementById('home-ledger-list');
    listEl.innerHTML = '';
    
    DATA.txs.slice(0, 50).forEach(t => {
        const div = document.createElement('div');
        div.className = 'row-item';
        div.innerHTML = `
            <div class="font-mono text-gray-500 text-xs">${t.date.slice(5)}</div>
            <div>
                <span class="tag-type ${getTagClass(t.type)}">${getTypeLabel(t.type)}</span>
                <span class="font-bold text-gray-700">${t.sub}</span>
                <span class="text-[0.6rem] text-gray-400 ml-1">(${t.cat})</span>
            </div>
            <div class="text-right font-mono font-bold">${fmt(t.amt)}</div>
            <div class="flex justify-center">
                <div class="btn-delete" onclick="deleteTx('${t.id}')"><i class="fas fa-times"></i></div>
            </div>
        `;
        listEl.appendChild(div);
    });
}

// === UTILS ===
function sum(arr) { return arr.reduce((a, b) => a + (b.amt || 0), 0); }
function fmt(num) { return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 }); }
function getTagClass(type) {
    return {
        'cost': 'tag-cost',
        'expense': 'tag-exp',
        'income': 'tag-inc',
        'credit': 'tag-credit'
    }[type] || '';
}
function getTypeLabel(type) {
    return {
        'cost': '成本',
        'expense': '費用',
        'income': '營收',
        'credit': '賒帳'
    }[type] || '?';
}
