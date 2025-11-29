// === 系統核心常數 (CONSTANTS) ===
const DB_KEY = 'sys_ledger_v9_5_core';
const META_KEY = 'sys_ledger_v9_5_meta';
const DEFAULT_CATS = ['台北總店', '台中分店', '高雄分店', '網路商城', '雜項支出'];

// === 全域狀態 (STATE) ===
let STATE = { 
    txs: [], 
    cats: [], 
    subs: [], 
    currType: 'cost' 
};

// 狀態標記
let useMem = false; // 內存模式標記
let actionType = null; 
let targetId = null; 
let targetCat = null;

// === 錯誤攔截 (ERROR TRAP) ===
window.onerror = function(msg, url, line) {
    const bar = document.getElementById('err-bar');
    if(bar) {
        bar.style.display = 'block';
        bar.innerText = `ERR: ${msg} (Line ${line})`;
    }
    return false; // Let default handler run
};

// === 導航與介面邏輯 (UI/NAVIGATION) ===

// 切換側邊欄
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    const isOpen = !sb.classList.contains('-translate-x-full');
    
    if (isOpen) {
        sb.classList.add('-translate-x-full');
        ov.classList.add('hidden');
    } else {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
    }
}

// 路由切換
function route(v) {
    // 1. 更新選單樣式
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    const navEl = document.getElementById(`nav-${v}`);
    if(navEl) navEl.classList.add('active');
    
    // 2. 切換視圖
    ['home','credit','query','config'].forEach(id => {
        document.getElementById(`view-${id}`).classList.add('hidden');
    });
    document.getElementById(`view-${v}`).classList.remove('hidden');
    
    // 3. 更新標題
    const titles = {
        'home': '系統控制台 (CONSOLE)',
        'credit': '賒帳管理 (CREDIT)',
        'query': '商業分析 (BI)',
        'config': '系統配置 (CONFIG)'
    };
    document.getElementById('page-title').innerText = titles[v];
    
    toggleSidebar();
    
    // 4. 視圖初始化
    if(v === 'home') renderHome();
    if(v === 'credit') { renderQueryCats('crm-cat-filter'); toggleCreditDateInputs(); renderCreditManager(); }
    if(v === 'query') { renderQueryCats('qry-cat'); toggleQueryDateInputs(); runQuery(); }
    if(v === 'config') renderCatManager();
}

// 設定記帳類型
function setType(t) {
    STATE.currType = t;
    document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
        if (b.dataset.type === t) b.classList.add('active');
    });
}

// === 核心數據邏輯 (CORE DATA) ===

function initSystem() {
    // 檢測存儲權限
    try { 
        localStorage.setItem('test', '1'); 
        localStorage.removeItem('test'); 
    } catch(e) { 
        useMem = true; 
        const bar = document.getElementById('err-bar');
        if(bar) {
            bar.style.display = 'block';
            bar.innerText = 'WARN: 存儲權限受限，已啟用內存模式 (Memory Mode)';
        }
    }

    if (useMem) { 
        STATE.cats = DEFAULT_CATS; 
        return; 
    }

    try {
        const db = localStorage.getItem(DB_KEY);
        const meta = localStorage.getItem(META_KEY);
        if (db) STATE.txs = JSON.parse(db);
        if (meta) { 
            const m = JSON.parse(meta); 
            STATE.cats = m.cats || DEFAULT_CATS; 
            STATE.subs = m.subs || []; 
        } else {
            STATE.cats = DEFAULT_CATS;
        }
    } catch (e) {
        console.error("Init Error", e);
        STATE.cats = DEFAULT_CATS;
    }
}

function persist() {
    if (!useMem) {
        localStorage.setItem(DB_KEY, JSON.stringify(STATE.txs));
        localStorage.setItem(META_KEY, JSON.stringify({ cats: STATE.cats, subs: STATE.subs }));
    }
    // 如果首頁在顯示中，即時更新數據
    if (!document.getElementById('view-home').classList.contains('hidden')) renderMetrics();
}

function commitData(e) {
    e.preventDefault();
    const amtVal = document.getElementById('in-amt').value;
    const amt = parseFloat(amtVal);
    const date = document.getElementById('in-date').value;
    const cat = document.getElementById('in-cat').value;
    const sub = document.getElementById('in-sub').value.trim() || '一般項目';

    if (!amt || !date) return;

    // 更新子項目記憶庫
    let entry = STATE.subs.find(s => s.cat === cat);
    if (!entry) { entry = { cat: cat, items: [] }; STATE.subs.push(entry); }
    if (!entry.items.includes(sub)) entry.items.push(sub);

    // 寫入交易
    STATE.txs.unshift({
        id: Date.now().toString(36),
        ts: Date.now(),
        date: date,
        type: STATE.currType,
        cat: cat,
        sub: sub,
        amt: amt,
        isPaid: false // 賒帳追蹤標記
    });

    persist();
    
    // 重置輸入
    document.getElementById('in-amt').value = '';
    document.getElementById('in-sub').value = '';
    document.getElementById('in-amt').focus();
    
    renderLedgerList();
}

// === 首頁渲染 (HOME RENDER) ===

function renderHome() {
    renderCats();
    renderLedgerList();
    renderMetrics();
    updateSubSuggest();
}

// 核心會計公式 (v5.1/v9.5 修正版：淨值包含應收)
function renderMetrics() {
    let dCash=0, dCredit=0, dCost=0, dExp=0;
    let aRev=0, aOut=0, aCost=0, aExp=0;
    const todayStr = document.getElementById('in-date').value;

    STATE.txs.forEach(t => {
        let type = (t.type === 'debt' || t.type === 'receivable') ? 'credit' : t.type;
        
        // 全域計算
        if (type === 'income') aRev += t.amt;
        else if (type === 'credit') { aRev += t.amt; if (!t.isPaid) aOut += t.amt; }
        else if (type === 'cost') aCost += t.amt;
        else if (type === 'expense') aExp += t.amt;

        // 今日計算
        if (t.date === todayStr) {
            if (type === 'income') dCash += t.amt;
            else if (type === 'credit') dCredit += t.amt;
            else if (type === 'cost') dCost += t.amt;
            else if (type === 'expense') dExp += t.amt;
        }
    });

    // 今日公式
    const dRev = dCash + dCredit; 
    const dGP = dRev - dCost;
    const dNet = dGP - dExp;
    const dMargin = dRev > 0 ? (dGP / dRev) * 100 : 0;

    // 全域公式
    const aGP = aRev - aCost;
    const aNet = aGP - aExp; // 淨值 = (營收+賒帳) - 成本 - 費用
    const aMargin = aRev > 0 ? (aGP / aRev) * 100 : 0;

    const f = new Intl.NumberFormat('en-US');
    
    // 更新 DOM
    document.getElementById('day-rev').innerText = f.format(dRev);
    document.getElementById('day-credit').innerText = f.format(dCredit);
    document.getElementById('day-margin').innerText = dMargin.toFixed(1) + '%';
    document.getElementById('day-cost').innerText = f.format(dCost);
    document.getElementById('day-exp').innerText = f.format(dExp);
    document.getElementById('day-net').innerText = f.format(dNet);

    document.getElementById('all-rev').innerText = f.format(aRev);
    document.getElementById('all-outstanding').innerText = f.format(aOut);
    document.getElementById('all-margin').innerText = aMargin.toFixed(1) + '%';
}

function renderLedgerList() {
    const list = document.getElementById('home-ledger-list');
    list.innerHTML = '';
    const data = STATE.txs.slice(0, 50); // 僅顯示前50筆
    
    if (data.length === 0) {
        list.innerHTML = '<div class="text-center p-4 text-xs text-gray-400">暫無數據</div>';
        return;
    }

    data.forEach(t => list.appendChild(createRow(t)));
}

function createRow(t) {
    const row = document.createElement('div'); 
    row.className = 'row-item';
    
    let color='text-gray-900', sign='', type=(t.type==='debt'||t.type==='receivable')?'credit':t.type;
    
    if(type==='income'){ color='text-income'; sign='+'; } 
    else if(type==='credit'){ color='text-credit'; sign='+'; } 
    else if(type==='cost'){ color='text-cost'; sign='-'; } 
    else if(type==='expense'){ color='text-expense'; sign='-'; }
    
    const divId = document.createElement('div');
    divId.className = 'btn-delete';
    divId.innerHTML = '<i class="fas fa-times"></i>';
    // 直接綁定點擊事件，不依賴 HTML 字串
    divId.onclick = function() { promptDeleteTx(t.id); };

    row.innerHTML = `
        <div class="num-font text-xs text-gray-500">${t.date.slice(5)}</div>
        <div class="truncate">
            <div class="font-bold text-xs text-gray-900 truncate">${t.sub}</div>
            <div class="text-[0.6rem] text-gray-400 uppercase font-mono tracking-wide">${t.cat}</div>
        </div>
        <div class="text-right num-font font-bold text-sm ${color}">${sign}${t.amt.toLocaleString()}</div>
    `;
    
    const center = document.createElement('div'); 
    center.className='justify-center flex';
    center.appendChild(divId);
    row.appendChild(center);
    return row;
}

// === 賒帳管理邏輯 (CREDIT MANAGER) ===

function toggleCreditDateInputs() {
    const mode = document.getElementById('crm-time-mode').value;
    const start = document.getElementById('crm-date-start');
    const end = document.getElementById('crm-date-end');
    
    if (mode === 'day') { start.classList.remove('hidden'); end.classList.add('hidden'); } 
    else if (mode === 'range') { start.classList.remove('hidden'); end.classList.remove('hidden'); } 
    else { start.classList.add('hidden'); end.classList.add('hidden'); }
    renderCreditManager();
}

function renderCreditManager() {
    const list = document.getElementById('credit-list'); 
    list.innerHTML = '';
    
    const mode = document.getElementById('crm-time-mode').value;
    const catFilter = document.getElementById('crm-cat-filter').value;
    const startDate = document.getElementById('crm-date-start').value;
    const endDate = document.getElementById('crm-date-end').value;

    let periodLabel = "ALL TIME";
    if(mode === 'day') periodLabel = startDate;
    else if(mode === 'range') periodLabel = `${startDate} ~ ${endDate}`;
    document.getElementById('crm-period-label').innerText = periodLabel;

    let allCredits = STATE.txs.filter(t => (t.type === 'credit' || t.type === 'receivable' || t.type === 'debt'));
    if(catFilter !== 'all') allCredits = allCredits.filter(t => t.cat === catFilter);

    let pIssued=0, pCollected=0, pOut=0;
    let tIssued=0, tCollected=0, tOut=0;

    // 全域統計
    allCredits.forEach(t => {
        tIssued += t.amt;
        if(t.isPaid) tCollected += t.amt; else tOut += t.amt;
    });

    // 區間統計與列表篩選
    const listItems = allCredits.filter(t => {
        let inRange = true;
        if (mode === 'day') inRange = (t.date === startDate);
        else if (mode === 'range') inRange = (t.date >= startDate && t.date <= endDate);
        
        if (inRange) {
            pIssued += t.amt;
            if(t.isPaid) pCollected += t.amt; else pOut += t.amt;
        }
        return inRange;
    });

    // 更新面板數據
    const f = new Intl.NumberFormat('en-US');
    document.getElementById('crm-period-issued').innerText = f.format(pIssued);
    document.getElementById('crm-period-collected').innerText = f.format(pCollected);
    document.getElementById('crm-period-outstanding').innerText = f.format(pOut);
    
    // 全域面板 (如果需要可以加回來，這裡只處理了區間)
    
    if(listItems.length === 0) {
        list.innerHTML = '<div class="text-center p-4 text-xs text-gray-400">無紀錄</div>';
    } else {
        listItems.forEach(t => {
            const row = document.createElement('div');
            row.className = `row-credit ${t.isPaid ? 'paid' : ''}`;
            
            const checkDiv = document.createElement('div'); 
            checkDiv.className='flex justify-center';
            
            const check = document.createElement('input'); 
            check.type='checkbox'; 
            check.className='credit-check'; 
            check.checked = t.isPaid;
            check.onchange = function() { toggleCredit(t.id, this); };
            
            checkDiv.appendChild(check);
            row.appendChild(checkDiv);
            
            row.innerHTML += `
                <div class="num-font text-xs text-gray-500">${t.date.slice(5)}</div>
                <div class="truncate">
                    <div class="font-bold text-xs text-gray-900 truncate ${t.isPaid ? 'line-through text-gray-400' : ''}">${t.sub}</div>
                    <div class="text-[0.6rem] text-gray-400 font-mono uppercase">${t.cat}</div>
                </div>
                <div class="text-right num-font font-bold text-xs text-credit">$${t.amt.toLocaleString()}</div>
            `;
            list.appendChild(row);
        });
    }
}

function toggleCredit(id, checkbox) {
    const t = STATE.txs.find(x => x.id === id);
    if(t) {
        t.isPaid = checkbox.checked;
        persist();
        renderCreditManager();
    }
}

// === 商業分析邏輯 (QUERY/BI) ===

function toggleQueryDateInputs() {
    const mode = document.getElementById('qry-time-mode').value;
    const start = document.getElementById('qry-date-start');
    const end = document.getElementById('qry-date-end');
    
    const needsInputs = (mode === 'day' || mode === 'range');
    const needsEnd = (mode === 'range');

    if(needsInputs) document.getElementById('qry-date-inputs').classList.remove('hidden'); 
    else document.getElementById('qry-date-inputs').classList.add('hidden');
    
    start.classList.remove('hidden');
    if(needsEnd) end.classList.remove('hidden'); else end.classList.add('hidden');
    
    runQuery();
}

function runQuery() {
    const tm = document.getElementById('qry-time-mode').value;
    const kw = document.getElementById('qry-keyword').value.trim().toLowerCase();
    const cat = document.getElementById('qry-cat').value;
    const now = new Date(); 
    let s, e;

    if(tm==='month'){ s=new Date(now.getFullYear(),now.getMonth(),1); e=new Date(now.getFullYear(),now.getMonth()+1,0); }
    else if(tm==='last_month'){ s=new Date(now.getFullYear(),now.getMonth()-1,1); e=new Date(now.getFullYear(),now.getMonth(),0); }
    else if(tm==='year'){ s=new Date(now.getFullYear(),0,1); e=new Date(now.getFullYear(),11,31); }
    else if(tm==='day') { 
        const d = document.getElementById('qry-date-start').value; 
        if(d){ s=new Date(d); e=new Date(d); } 
    }
    else if(tm==='range') { 
        const d1=document.getElementById('qry-date-start').value; 
        const d2=document.getElementById('qry-date-end').value; 
        if(d1) s=new Date(d1); if(d2) e=new Date(d2); 
    }

    // 顯示標籤
    let label = ""; 
    if(s && e){ 
        const fd = d => d.toISOString().split('T')[0]; 
        if(s.getTime()===e.getTime()) label=fd(s); else label=`${fd(s)} ~ ${fd(e)}`; 
    } else if(tm==='all') label="ALL TIME";
    document.getElementById('qry-period-label').innerText = label;

    const res = STATE.txs.filter(t => {
        if(cat!=='all' && t.cat!==cat) return false;
        if(kw && !(t.sub.toLowerCase().includes(kw) || t.cat.toLowerCase().includes(kw))) return false;
        
        if(tm!=='all' && s && e) { 
            // 字串比較日期 YYYY-MM-DD
            const d = t.date;
            const ds = s.toISOString().split('T')[0];
            const de = e.toISOString().split('T')[0];
            if (d < ds || d > de) return false;
        }
        return true;
    });

    renderQueryResults(res);
}

function renderQueryResults(data) {
    let cash=0, credit=0, cost=0, exp=0;
    data.forEach(t => {
        let tp = (t.type==='debt'||t.type==='receivable')?'credit':t.type;
        if(tp==='income') cash+=t.amt; 
        else if(tp==='credit') credit+=t.amt; 
        else if(tp==='cost') cost+=t.amt; 
        else if(tp==='expense') exp+=t.amt;
    });

    const rev = cash + credit; 
    const gp = rev - cost; 
    const m = rev > 0 ? (gp/rev)*100 : 0;
    
    const f = new Intl.NumberFormat('en-US');
    document.getElementById('res-rev').innerText = f.format(rev);
    document.getElementById('res-cost').innerText = f.format(cost);
    document.getElementById('res-exp').innerText = f.format(exp);
    document.getElementById('res-gp').innerText = f.format(gp);
    document.getElementById('res-margin').innerText = m.toFixed(1)+'%';
    document.getElementById('res-count').innerText = data.length;

    const l = document.getElementById('query-list'); 
    l.innerHTML = '';
    
    if(!data.length) l.innerHTML='<div class="text-center p-4 text-xs text-gray-400">無符合數據</div>';
    else data.forEach(t => l.appendChild(createRow(t)));
}

// === 系統配置 (CONFIG) & 輔助函數 (HELPERS) ===

function renderQueryCats(id) { 
    const s=document.getElementById(id); const v=s.value; 
    s.innerHTML='<option value="all">-- 全選 --</option>'; 
    STATE.cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.text=c;s.add(o)}); 
    s.value=v; 
}

function renderCats() { 
    const s=document.getElementById('in-cat'); const v=s.value; 
    s.innerHTML=''; 
    STATE.cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.text=c;s.add(o)}); 
    if(STATE.cats.includes(v)) s.value=v; 
}

function updateSubSuggest() { 
    const c=document.getElementById('in-cat').value; 
    const l=document.getElementById('sub-list'); 
    l.innerHTML=''; 
    const e=STATE.subs.find(x=>x.cat===c); 
    if(e) e.items.forEach(i=>{const o=document.createElement('option');o.value=i;l.appendChild(o)}); 
}

function renderCatManager() {
    const l=document.getElementById('cat-list'); 
    l.innerHTML=''; 
    STATE.cats.forEach(c=>{ 
        const d=document.createElement('div'); 
        d.className='flex justify-between items-center bg-gray-50 px-2 py-2 border-b border-gray-100 last:border-0'; 
        
        const span = document.createElement('span'); 
        span.innerText = c;
        span.className = 'text-sm text-gray-700 font-bold';
        
        const btn = document.createElement('div');
        btn.className = 'btn-config-del';
        btn.innerHTML = '<i class="fas fa-times"></i>';
        btn.onclick = function() { promptDelCat(c); };
        
        d.appendChild(span); 
        d.appendChild(btn); 
        l.appendChild(d); 
    }); 
}

function sysAddCat() { 
    const v=document.getElementById('new-cat').value.trim(); 
    if(v && !STATE.cats.includes(v)){ 
        STATE.cats.push(v); 
        persist(); 
        renderCatManager(); 
        document.getElementById('new-cat').value=''; 
    } 
}

// === 導出修復 (EXPORT FIX) ===

function sysExport() {
    const j = JSON.stringify(STATE, null, 2);
    document.getElementById('export-area').value = j;
    document.getElementById('modal-export').classList.remove('hidden');
    // 嘗試觸發下載
    downloadFile();
}

function downloadFile() {
    const b = new Blob([document.getElementById('export-area').value], {type:'application/json'});
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(b); 
    a.download = `LEDGER_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
}

function copyExport() { 
    document.getElementById('export-area').select(); 
    document.execCommand('copy'); 
    alert('已複製代碼'); 
}

function closeExport() { 
    document.getElementById('modal-export').classList.add('hidden'); 
}

function sysImport(i) { 
    const f=i.files[0]; if(!f)return; 
    const r=new FileReader(); 
    r.onload=e=>{ 
        try{ 
            const d=JSON.parse(e.target.result); 
            if(d.txs){ STATE=d; persist(); location.reload(); } 
        }catch(x){ alert('無效檔案'); } 
    }; 
    r.readAsText(f); 
}

// === 警示系統 (ALERT SYSTEM) ===

function openAlert(t, m, d) {
    document.getElementById('alert-title').innerText = t;
    document.getElementById('alert-msg').innerText = m;
    const det = document.getElementById('alert-detail');
    if(d) { det.innerHTML = d; det.classList.remove('hidden'); } else { det.classList.add('hidden'); }
    document.getElementById('modal-alert').classList.remove('hidden');
}

function closeAlert() { 
    document.getElementById('modal-alert').classList.add('hidden'); 
    actionType=null; targetId=null; targetCat=null; 
}

function promptDeleteTx(id) { 
    const t=STATE.txs.find(x=>x.id===id); 
    if(t){ actionType='delTx'; targetId=id; openAlert('刪除紀錄', '確認移除？', `${t.sub} $${t.amt}`); } 
}

function promptDelCat(c) { 
    actionType='delCat'; targetCat=c; 
    openAlert('刪除分類', `移除「${c}」？`, '歷史帳務保留。'); 
}

fun
