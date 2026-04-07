'use strict';
var STORE = 'sober_v13';
var HIGH_PRICE_THRESHOLD = 3000;
var FIXED_AMOUNTS = { conv: 2000, uber: 3000, drink: 6000 };
var AI_PERSONA = {
name: 'Sober',
icon: '🧊',
persona: '無駄遣いに否定的な友人。データで冷静に引き留める。'
};
var DEF_FAILS = [
{ id: 1, cat: 'コンビニ', name: '導線トラップ浪費', cond: '仕事帰りに「ちょっと寄るだけ」と思い、つい新作スイーツやビールを買ってしまう。' },
{ id: 2, cat: 'Amazon', name: '深夜のドーパミン買い', cond: '23時以降、仕事のストレスから解放された反動で、不要なガジェットをポチる。' },
{ id: 3, cat: 'Uber', name: '悪天候の妥協', cond: '雨が降っていると「買い物に行く時間と労力がもったいない」と自分に言い訳してしまう。' }
];
var MINDFUL_MSGS = [
{ t: 30, msg: '目を閉じて、深く息を吸い込んでください...' },
{ t: 20, msg: '息をゆっくりと吐き出します...' },
{ t: 10, msg: '衝動は波のようなものです。波が過ぎ去るのを待ちましょう...' },
{ t: 0, msg: '決断の時です。' }
];
var WHY_OPTS = [
{ id: 'hours', icon: 'fa-briefcase', label: '時給換算の非効率性', color: 'var(--amber)' },
{ id: 'ai', icon: 'fa-robot', label: 'AIの分析・客観的指摘', color: 'var(--cyan)' },
{ id: 'deficit', icon: 'fa-chart-line', label: '赤字リスクへの危機感', color: 'var(--red)' },
{ id: 'cooled', icon: 'fa-snowflake', label: '冷却期間による冷静化', color: 'var(--tx2)' },
{ id: 'price', icon: 'fa-tag', label: '価格の妥当性欠如', color: 'var(--green)' }
];
var LATE_TX = [
{ kw: ['セール', '割引', '限定', 'タイムセール'], txt: 'セールはマーケティングの基本。価値を見失っています。' },
{ kw: ['気づいたら', '無意識', 'なんとなく'], txt: '認知バイアスです。プロセスを経ない支出はリスク。' },
{ kw: ['急い', '時間', 'すぐ', '今すぐ'], txt: '判断を急がされる支出は不合理なことが多いです。' },
{ kw: ['ストレス', '疲れ', '嫌', '発散'], txt: '感情的支出ですね。根本的解決にはなりません。' },
{ kw: ['お酒', '酒', 'ビール', 'コンビニ'], txt: '少額の積み重ねが予算を破壊します。' },
{ kw: [], txt: '記録完了。次回の判断材料になります。' }
];
function mKey(d) {
if (!d) d = new Date();
return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function today() {
var d = new Date();
return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysInM(key) {
if (!key) key = mKey();
var parts = key.split('-');
return new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
}
function remDays(key) {
if (!key) key = mKey();
return daysInM(key) - new Date().getDate() + 1;
}
function yenHtml(n) {
var num = Number(n || 0);
var sign = num < 0 ? '-' : '';
return sign + '<span class="text-[0.6em] text-slate-500 mr-0.5 font-sans font-normal">¥</span>' + Math.abs(num).toLocaleString();
}
function fmtM(k) {
var parts = k.split('-');
return parts[0] + '.' + parseInt(parts[1]);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function safeInt(val, fallback) {
var n = parseInt(val, 10);
return isNaN(n) ? (fallback !== undefined ? fallback : 0) : n;
}
function hourly(data) { return Math.round((data.income || 0) / 160); }
function freeAmt(data) { return (data.income || 0) - (data.savingsGoal || 0) - (data.fixedCost || 0); }
function getRegrets(data, cat, fallback) {
var rg = [];
Object.keys(data.months || {}).forEach(function (k) {
(data.months[k].records || []).forEach(function (r) {
if (r.regret && r.cat === cat) rg.push(r.name + '→「' + r.regret + '」');
});
});
return rg.length > 0 ? rg.slice(-3).join('\\n') : (fallback || '');
}
function usedAmt(data, key) {
if (!key) key = mKey();
var m = data.months ? data.months[key] : null;
if (!m || !Array.isArray(m.records)) return 0;
return m.records.filter(function (r) { return r.result === 'buy' || r.result === 'late_buy'; }).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
}
function load() { try { var r = localStorage.getItem(STORE); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
function save(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) { console.error(e); } }
function getMonth(data, key) {
if (!key) key = mKey();
if (!data.months) data.months = {};
if (!data.months[key]) data.months[key] = { records: [], zaimTotal: null };
return data.months[key];
}
var _toastTimer = null;
function showToast(msg) {
var el = document.getElementById('toast');
document.getElementById('toast_t').textContent = msg;
el.classList.add('show');
if (_toastTimer) clearTimeout(_toastTimer);
_toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3000);
}
var ALL_SCR = ['scSetup', 'scHome', 'scChecker', 'scAiChat', 'scFinalCheck', 'scMindful', 'scReport', 'scSettings', 'scHistory'];
var NAV_SCR = ['scHome', 'scHistory', 'scReport', 'scSettings'];
function showScreen(id) {
ALL_SCR.forEach(function (s) { document.getElementById(s).style.display = 'none'; });
document.getElementById(id).style.display = 'block';
document.getElementById('botNav').style.display = NAV_SCR.indexOf(id) >= 0 ? 'flex' : 'none';
if (id === 'scHome') renderHome();
if (id === 'scHistory') renderHistory();
if (id === 'scReport') renderReport();
if (id === 'scSettings') renderSettings();
window.scrollTo(0, 0);
}
function navTo(scr, nid) {
showScreen(scr);
document.querySelectorAll('.nb').forEach(function (b) { b.classList.remove('on'); });
if (nid) document.getElementById(nid).classList.add('on');
}
function cancelProcess() {
var data = load();
if (data && _jgItem) {
data.pendingBuys = (data.pendingBuys || []).filter(function (p) { return p.id !== _jgItem.id; });
save(data);
}
_jgItem = null;
clearTimers();
navTo('scHome', 'nb_h');
showToast('分析を中断しました');
}
function initSetup() {
var data = load() || {};
document.getElementById('su_i').value = data.income || 280000;
document.getElementById('su_g').value = data.savingsGoal || 30000;
document.getElementById('su_f').value = data.fixedCost !== undefined ? data.fixedCost : 98000;
if (data.geminiKey) document.getElementById('su_k').value = data.geminiKey;
if (data.gasUrl) document.getElementById('su_gas').value = data.gasUrl;
var updatePrev = function () {
var i = parseInt(document.getElementById('su_i').value) || 0;
var g = parseInt(document.getElementById('su_g').value) || 0;
var f = parseInt(document.getElementById('su_f').value) || 0;
var pr = document.getElementById('su_prev');
if (i > 0) { document.getElementById('su_free').innerHTML = yenHtml(i - g - f); pr.style.display = 'block'; }
else pr.style.display = 'none';
};
['su_i', 'su_g', 'su_f'].forEach(function (id) { document.getElementById(id).addEventListener('input', updatePrev); });
updatePrev();
}
function doSetup() {
var inc = safeInt(document.getElementById('su_i').value);
var goal = safeInt(document.getElementById('su_g').value);
var fix = safeInt(document.getElementById('su_f').value, 0);
var key = document.getElementById('su_k').value.trim();
var gas = document.getElementById('su_gas').value.trim();
if (!inc || inc < 1000) { showToast('月収を入力してください'); return; }
if (!goal || goal < 100) { showToast('貯金目標を入力してください'); return; }
if (goal >= inc) { showToast('目標が月収を超えています'); return; }
var data = load() || { months: {}, pendingBuys: [] };
data.income = inc; data.savingsGoal = goal; data.fixedCost = fix; data.geminiKey = key; data.gasUrl = gas; data.setup = true;
if (!data.failures) data.failures = DEF_FAILS;
if (!data.months) data.months = {};
if (!data.pendingBuys) data.pendingBuys = [];
save(data);
navTo('scHome', 'nb_h');
showToast('SYSTEM READY');
}
function renderHome() {
var data = load(); if (!data) return;
var key = mKey(); var month = getMonth(data, key); save(data);
var free = freeAmt(data); var used = usedAmt(data, key); var remM = free - used;
var remPct = free > 0 ? Math.max(0, Math.round((remM / free) * 100)) : 0;
var dNum = new Date().getDate(); var dRem = remDays(key);
var dailyLimit = remM > 0 ? Math.round(remM / dRem) : 0;
var dailyBurn = used / dNum;
var thr = data.wishThreshold || HIGH_PRICE_THRESHOLD;
var statusPanel = document.getElementById('hm_status_panel');
var sTitle = document.getElementById('hm_status_title');
var sIcon = document.getElementById('hm_status_icon');
var sDesc = document.getElementById('hm_status_desc');
var sBurn = document.getElementById('hm_burn_rate');
if (dNum <= 10) {
statusPanel.className = 'gc p-4 a0 flex flex-col justify-center border-l-2 border-l-amber-500 bg-amber-500/5';
sTitle.textContent = 'STATUS: 月初バイアス警戒期'; sTitle.className = 'text-[10px] font-bold tracking-widest uppercase text-amber-500';
sIcon.className = 'fas fa-exclamation-triangle text-amber-500';
sDesc.textContent = '給料日後の余裕錯覚に注意。' + thr.toLocaleString() + '円以上の決済は強力に抑制されます。';
} else if (dNum <= 20) {
statusPanel.className = 'gc p-4 a0 flex flex-col justify-center border-l-2 border-l-cyan-500 bg-cyan-500/5';
sTitle.textContent = 'STATUS: 支出コントロール期'; sTitle.className = 'text-[10px] font-bold tracking-widest uppercase text-cyan-400';
sIcon.className = 'fas fa-scale-balanced text-cyan-400';
sDesc.textContent = '小さな無駄遣いの積み重ねに注意。「本当に必要？」を意識して。';
} else {
statusPanel.className = 'gc p-4 a0 flex flex-col justify-center border-l-2 border-l-red-500 bg-red-500/5';
sTitle.textContent = 'STATUS: 予算防衛フェーズ'; sTitle.className = 'text-[10px] font-bold tracking-widest uppercase text-red-500';
sIcon.className = 'fas fa-shield-halved text-red-500';
sDesc.textContent = '予算枯渇期。来月への前借りを防いで。';
}
if (dailyBurn > 0) {
var daysToZero = free / dailyBurn; var shortDate = Math.round(daysToZero); var dInM = daysInM(key);
if (shortDate <= dInM) { sBurn.innerHTML = '<span class="text-red-400"><i class="fas fa-fire-flame-curved mr-1"></i>BURN RATE ALERT: ' + shortDate + '日目にショート</span>'; }
else { sBurn.innerHTML = '<span class="text-emerald-400"><i class="fas fa-check mr-1"></i>SAFE: 月末まで維持予測</span>'; }
} else { sBurn.innerHTML = '<span class="text-emerald-400"><i class="fas fa-check mr-1"></i>NO SPEND</span>'; }
document.getElementById('hm_month').textContent = fmtM(key);
document.getElementById('hm_daily').innerHTML = yenHtml(dailyLimit);
document.getElementById('hm_remM').innerHTML = yenHtml(remM);
document.getElementById('hm_remM').style.color = remPct > 40 ? 'var(--tx)' : remPct > 15 ? 'var(--amber)' : 'var(--red)';
var bar = document.getElementById('hm_bar'); bar.style.width = remPct + '%'; bar.style.background = remPct > 40 ? 'var(--gold)' : remPct > 15 ? 'var(--amber)' : 'var(--red)';
document.getElementById('hm_up').textContent = 'USED ' + (100 - remPct) + '%';
document.getElementById('hm_rp').textContent = 'LEFT ' + remPct + '%';
var av = month.records.filter(function (r) { return r.result === 'avoid'; });
var bu = month.records.filter(function (r) { return r.result === 'buy'; });
var la = month.records.filter(function (r) { return r.result === 'late_buy'; });
document.getElementById('hm_ac').textContent = av.length; document.getElementById('hm_ay').innerHTML = yenHtml(av.reduce(function (s, r) { return s + r.amount; }, 0));
document.getElementById('hm_bc').textContent = bu.length; document.getElementById('hm_by').innerHTML = yenHtml(bu.reduce(function (s, r) { return s + r.amount; }, 0));
document.getElementById('hm_gc').textContent = la.length; document.getElementById('hm_gy').innerHTML = yenHtml(la.reduce(function (s, r) { return s + r.amount; }, 0));
var recent = month.records.slice().reverse().slice(0, 5);
var listEl = document.getElementById('hm_list');
if (!recent.length) { listEl.innerHTML = '<div class="text-center py-6 text-[10px] tracking-widest text-slate-600 uppercase border border-white/5 rounded">No Data Available</div>'; }
else { listEl.innerHTML = recent.map(function (r, i) { return recRow(r, i, false); }).join(''); }
}
var _currentSituation = 'other';
function startAnalysis(type) {
_currentSituation = type;
var amtInput = document.getElementById('ck_a');
amtInput.readOnly = false; amtInput.style.opacity = '1';
var btnNext = document.getElementById('ck_btn_next');
btnNext.style.display = 'none'; btnNext.disabled = true;
document.getElementById('ck_fixed_badge').style.display = 'none';
document.getElementById('ck_amt_label').textContent = 'Target Price';
['ck_a', 'ck_n', 'ck_r', 'ck_u'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
var titles = { conv: 'コンビニ', amazon: 'Amazon', uber: 'Uber Eats', drink: '居酒屋', other: '詳細分析' };
document.getElementById('ck_title').textContent = titles[type] || 'Analyzer';
document.getElementById('f_url').style.display = type === 'amazon' ? 'block' : 'none';
document.getElementById('f_detail').style.display = (type === 'other' || type === 'amazon') ? 'block' : 'none';
var defaultNames = { drink: '居酒屋 / タクシー代', uber: 'デリバリー食費', conv: 'コンビニ購入' };
document.getElementById('ck_n').value = defaultNames[type] || '';
showScreen('scChecker');
var fixedAmt = FIXED_AMOUNTS[type];
if (fixedAmt) {
amtInput.value = fixedAmt; amtInput.readOnly = true; amtInput.style.opacity = '0.55';
document.getElementById('ck_fixed_badge').style.display = 'inline-flex';
document.getElementById('ck_amt_label').textContent = 'Fixed Amount (\u00A5' + fixedAmt.toLocaleString() + ')';
onAmt();
} else {
setTimeout(function () { amtInput.focus(); }, 350);
}
}
function onAmt() {
var amt = parseInt(document.getElementById('ck_a').value) || 0;
var btnNext = document.getElementById('ck_btn_next');
if (amt <= 0) { btnNext.style.display = 'none'; return; }
btnNext.style.display = 'block'; btnNext.disabled = false;
}
var _jgItem = null;
var _chatHistory = [];
function goNextStep() {
var amt = safeInt(document.getElementById('ck_a').value);
var name = document.getElementById('ck_n').value.trim() || 'ITEM';
var url = document.getElementById('ck_u').value.trim();
if (!amt || amt <= 0) { showToast('AMOUNT REQUIRED'); return; }
var data = load();
var reason = '';
if (_currentSituation === 'other' || _currentSituation === 'amazon') {
reason = document.getElementById('ck_r').value.trim();
}
_jgItem = { id: uid(), name: name, amount: amt, cat: _currentSituation, catIcon: '\uD83D\uDED2', reason: reason, url: url, createdAt: Date.now() };
if (!data.pendingBuys) data.pendingBuys = [];
data.pendingBuys.push(_jgItem); save(data);
showScreen('scAiChat');
document.getElementById('ai_report_area').style.display = 'none';
document.getElementById('ai_report_area').innerHTML = '';
document.getElementById('ai_chat_area').innerHTML = '';
document.getElementById('chat_action_area').style.display = 'none';
document.getElementById('chat_loading').style.display = 'block';
document.getElementById('chat_loading_txt').textContent = '過去データを分析中...';
if (data.geminiKey) {
startAiReport(data);
} else {
startAiReportMock(data);
}
}
function buildReportPrompt(data) {
var hr = hourly(data);
var hrs = hr > 0 ? (_jgItem.amount / hr).toFixed(1) : '不明';
var free = freeAmt(data); var used = usedAmt(data); var remM = free - used;
var dRem = remDays(); var dailyLimit = remM > 0 ? Math.round(remM / dRem) : 0;
var dateNum = new Date().getDate();
var allMonths = data.months || {};
var pastSameCat = [];
Object.keys(allMonths).forEach(function (k) {
var recs = allMonths[k].records || [];
recs.forEach(function (r) {
if (r.cat === _jgItem.cat && (r.result === 'buy' || r.result === 'late_buy')) {
pastSameCat.push(r.name + ' (' + r.amount + '円, ' + (r.date || '') + ')');
}
});
});
var pastStr = pastSameCat.length > 0 ? pastSameCat.slice(-5).join('\n') : 'なし';
var fails = (data.failures || DEF_FAILS).map(function (f) { return f.cat + '「' + f.name + '」: ' + f.cond; }).join('\n');
var sitCtx = '';
if (_jgItem.cat === 'conv') sitCtx = 'コンビニへ行こうとしている。';
else if (_jgItem.cat === 'amazon') sitCtx = 'Amazon等ECで' + _jgItem.name + 'を買おうとしている。URL: ' + (_jgItem.url || 'なし') + '。理由: ' + (_jgItem.reason || 'なし');
else if (_jgItem.cat === 'uber') sitCtx = 'Uber Eatsを頼もうとしている。';
else if (_jgItem.cat === 'drink') sitCtx = '飲み会の2次会または深夜タクシーを使おうとしている。';
else sitCtx = _jgItem.name + 'に' + _jgItem.amount + '円使おうとしている。理由: ' + (_jgItem.reason || 'なし');
var personaTxt = data.aiPersona || '無駄遣いに否定的な友人。データで冷静に引き留める。';
var regretStr = getRegrets(data, _jgItem.cat, 'なし');
return 'あなたはSoberアプリのAIアナリストです。\n' +
'出費を分析し否定的なレポートを作成してください。\n' +
'【あなたの人格】' + personaTxt + '\n\n' +
'【分析対象】' + _jgItem.name + ' / ' + _jgItem.amount + '円\n' +
'【状況】' + sitCtx + '\n' +
'【時給換算】約' + hrs + '時間分の労働\n' +
'【今日の予算残】' + dailyLimit + '円（購入後: ' + (dailyLimit - _jgItem.amount) + '円）\n' +
'【月末残高予測】' + (remM - _jgItem.amount) + '円\n' +
'【月の' + dateNum + '日目】\n' +
'【過去の同カテゴリ購入】\n' + pastStr + '\n' +
'【失敗パターンDB】\n' + fails + '\n' +
'【同カテゴリの後悔コメント】\n' + regretStr + '\n\n' +
'以下のJSON形式で回答してください。\n' +
'{"report":{"past_pattern":"失敗パターン一致分析(40字)","alternative":"代替案(40字)","budget_warning":"予算警告(40字)"},"first_message":"一言(60字)"}';
}
function buildChatSystemPrompt(data) {
var hr = hourly(data);
var hrs = hr > 0 ? (_jgItem.amount / hr).toFixed(1) : '不明';
var free = freeAmt(data); var used = usedAmt(data); var remM = free - used;
var fails = (data.failures || DEF_FAILS).map(function (f) { return f.cat + '「' + f.name + '」: ' + f.cond; }).join('\n');
var personaTxt = data.aiPersona || '無駄遣いに否定的な友人。データで冷静に引き留める。';
var regretStr = getRegrets(data, _jgItem.cat, '');
return 'あなたはSoberアプリのAI友人「Sober」です。\n【人格】' + personaTxt + '\n' +
'ユーザーは「' + _jgItem.name + '」に' + _jgItem.amount + '円使おうとしています。\n' +
'労働時間換算: 約' + hrs + '時間。月末残高予測: ' + (remM - _jgItem.amount) + '円。\n' +
'失敗パターンDB:\n' + fails + '\n' +
(regretStr ? '【過去の後悔】\n' + regretStr + '\n' : '') +
'ルール:\n- 否定的に応答\n- データを根拠に\n- 代替案を提案する\n- 60字以内で簡潔に\n- JSON形式: {"message":"応答テキスト"}';
}
async function startAiReport(data) {
var apiKey = data.geminiKey;
try {
var res = await fetch(
'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
{
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
contents: [{ role: 'user', parts: [{ text: buildReportPrompt(data) }] }],
generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
})
}
);
if (!res.ok) {
var errBody = await res.text();
throw new Error('HTTP ' + res.status + ': ' + errBody.slice(0, 150));
}
var json = await res.json();
var raw = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) || '{}';
var parsed;
try {
parsed = JSON.parse(raw.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim());
} catch (e) {
parsed = { report: { past_pattern: '分析エラー', alternative: '代替案なし', budget_warning: '予算注意' }, first_message: raw.slice(0, 60) };
}
showAiReport(parsed.report || {});
_chatHistory = [
{ role: 'user', parts: [{ text: buildChatSystemPrompt(data) }] },
{ role: 'model', parts: [{ text: JSON.stringify({ message: parsed.first_message || 'この出費、本当に必要？' }) }] }
];
document.getElementById('chat_loading').style.display = 'none';
document.getElementById('chat_action_area').style.display = 'block';
appendChatBubble(AI_PERSONA, parsed.first_message || 'この出費、本当に必要？');
} catch (e) {
console.error('AI Report Error:', e);
showAiReport({ past_pattern: '通信エラーで分析不可', alternative: 'APIキーを確認してください', budget_warning: '手動で判断してください' });
document.getElementById('chat_loading').style.display = 'none';
document.getElementById('chat_action_area').style.display = 'block';
appendChatBubble(AI_PERSONA, 'API接続エラー: ' + e.message);
appendRetryButton();
}
}
function startAiReportMock(data) {
setTimeout(function () {
var hr = hourly(data); var hrs = hr > 0 ? (_jgItem.amount / hr).toFixed(1) : '---';
var free = freeAmt(data); var used = usedAmt(data); var remM = free - used;
var mockReport = { past_pattern: '', alternative: '', budget_warning: '' };
if (_jgItem.cat === 'conv') {
mockReport.past_pattern = '「ちょっと寄るだけ」の積み重ねパターンに一致。';
mockReport.alternative = '家のストックで代用可能。確認しましょう。';
} else if (_jgItem.cat === 'uber') {
mockReport.past_pattern = '悪天候時のデリバリー依存パターンに該当。';
mockReport.alternative = '店舗より30%割高。歩けば健康にもプラス。';
} else if (_jgItem.cat === 'drink') {
mockReport.past_pattern = '2次会以降は効用低下。翌日への悪影響大。';
mockReport.alternative = '帰宅して浮いたお金を週末の楽しみに。';
} else if (_jgItem.cat === 'amazon') {
mockReport.past_pattern = '深夜のストレス反動ポチパターンに該当。';
mockReport.alternative = '1週間待って。家にあるもので代用検討。';
} else {
mockReport.past_pattern = '同カテゴリ支出の類似パターン。使わなくなるリスク。';
mockReport.alternative = '手持ちで一旦代用できないか検討を。';
}
mockReport.budget_warning = '購入後の月末残高: ' + (remM - _jgItem.amount).toLocaleString() + '円。労働' + hrs + '時間分が消えます。';
showAiReport(mockReport);
_chatHistory = [];
document.getElementById('chat_loading').style.display = 'none';
document.getElementById('chat_action_area').style.display = 'block';
var firstMsg = _jgItem.cat === 'conv' ? '今行く必要ある？家のもので我慢できない？'
: _jgItem.cat === 'uber' ? '店舗より割高。歩いて買いに行かない？'
: _jgItem.cat === 'drink' ? 'もう十分楽しんだでしょ。明日のために帰ろう。'
: 'その出費、本当に必要？もう少し考えてみない？';
appendChatBubble(AI_PERSONA, '【モック】' + firstMsg);
}, 1500);
}
function showAiReport(report) {
var area = document.getElementById('ai_report_area');
var cards = '';
if (report.past_pattern) {
cards += '<div class="report-card"><div class="rc-title text-orange-500"><i class="fas fa-history mr-1"></i>Past Pattern Match</div><div class="rc-body">' + escapeHtml(report.past_pattern) + '</div></div>';
}
if (report.alternative) {
cards += '<div class="report-card" style="border-left-color:var(--green)"><div class="rc-title text-emerald-500"><i class="fas fa-lightbulb mr-1"></i>Alternative</div><div class="rc-body">' + escapeHtml(report.alternative) + '</div></div>';
}
if (report.budget_warning) {
cards += '<div class="report-card" style="border-left-color:var(--red)"><div class="rc-title text-red-500"><i class="fas fa-chart-line mr-1"></i>Budget Warning</div><div class="rc-body">' + escapeHtml(report.budget_warning) + '</div></div>';
}
area.innerHTML = '<div class="sec text-cyan-500 mb-3"><i class="fas fa-file-alt mr-1"></i>AI Denial Report</div>' + cards;
area.style.display = 'block';
}
function escapeHtml(str) {
var div = document.createElement('div');
div.appendChild(document.createTextNode(str));
return div.innerHTML;
}
async function sendChat() {
var inputEl = document.getElementById('chat_input');
var msg = inputEl.value.trim(); if (!msg) return;
appendChatBubble(null, msg); inputEl.value = '';
var sB = document.getElementById('chat_send_btn');
sB.disabled = true;
sB.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs"></i>';
var data = load();
if (!data.geminiKey) {
setTimeout(function () {
appendChatBubble(AI_PERSONA, '【モック】「' + msg + '」って言うけど、データが物語ってるよ。冷静にね。');
sB.disabled = false; sB.innerHTML = '<i class="fas fa-paper-plane text-sm"></i>';
}, 1500);
return;
}
_chatHistory.push({ role: 'user', parts: [{ text: 'ユーザー:「' + msg + '」\n否定的な友人として、データを根拠に反論してください。JSON: {"message":"応答(60字)"}' }] });
try {
var res = await fetch(
'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + data.geminiKey,
{
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
contents: _chatHistory,
generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
})
}
);
if (!res.ok) throw new Error('API Error');
var json = await res.json();
var raw = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) || '{}';
var parsed;
try { parsed = JSON.parse(raw.replace(/```[a-z]*/gi, '').replace(/```/g, '').trim()); }
catch (e) { parsed = { message: raw.slice(0, 60) }; }
_chatHistory.push({ role: 'model', parts: [{ text: raw }] });
appendChatBubble(AI_PERSONA, parsed.message || '...');
} catch (e) {
appendChatBubble(AI_PERSONA, '通信エラー。再送信するか「それでも進む」から先へ。');
}
sB.disabled = false; sB.innerHTML = '<i class="fas fa-paper-plane text-sm"></i>';
}
function appendChatBubble(persona, text) {
var chatArea = document.getElementById('ai_chat_area');
var el = document.createElement('div'); el.className = 'a-fade';
if (persona) {
var data = load();
var iconImg = (data && data.aiPersonaImg) ? data.aiPersonaImg : '';
var iconHtml = iconImg ? '<img src="' + iconImg + '" style="width:100%;height:100%;object-fit:cover">' : '<span class="text-sm">' + persona.icon + '</span>';
el.innerHTML = '<div class="bw l"><div class="bi">' + iconHtml + '</div><div class="bc"><div class="bn">' + escapeHtml(persona.name) + '</div><div class="bl">' + escapeHtml(text) + '</div></div></div>';
} else {
el.innerHTML = '<div class="bw r"><div class="bc"><div class="bn text-slate-500">You</div><div style="padding:10px 14px;border-radius:12px 2px 12px 12px;font-size:13px;line-height:1.5;background:rgba(255,255,255,0.05);color:var(--tx);border:1px solid var(--bd)">' + escapeHtml(text) + '</div></div></div>';
}
chatArea.appendChild(el);
el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
function appendRetryButton() {
var chatArea = document.getElementById('ai_chat_area');
var el = document.createElement('div'); el.className = 'a-fade text-center my-3';
var btn = document.createElement('button');
btn.className = 'tap px-4 py-2 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-bold tracking-widest uppercase';
btn.innerHTML = '<i class="fas fa-redo mr-1"></i>RETRY';
btn.addEventListener('click', function () {
el.remove();
document.getElementById('chat_loading').style.display = 'block';
document.getElementById('chat_action_area').style.display = 'none';
document.getElementById('ai_report_area').style.display = 'none';
document.getElementById('ai_report_area').innerHTML = '';
document.getElementById('ai_chat_area').innerHTML = '';
var data = load();
if (data && data.geminiKey) { startAiReport(data); } else { startAiReportMock(data); }
});
el.appendChild(btn);
chatArea.appendChild(el);
el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
function doAvoidFromChat() { doAvoid(); }
function goFinalCheck() {
if (!_jgItem) return;
showScreen('scFinalCheck');
var data = load();
var hr = hourly(data); var hrs = hr > 0 ? (_jgItem.amount / hr).toFixed(1) : '---';
var free = freeAmt(data); var used = usedAmt(data); var remM = free - used;
var dRem = remDays(); var dailyLimit = remM > 0 ? Math.round(remM / dRem) : 0;
var remAfterT = dailyLimit - _jgItem.amount;
var remAfterM = remM - _jgItem.amount;
document.getElementById('fc_amt').innerHTML = yenHtml(_jgItem.amount);
document.getElementById('fc_hrs').innerHTML = '<span class="mono text-xl">' + hrs + '</span><span class="text-[9px] ml-0.5">h</span>';
var tc = remAfterT > 0 ? 'var(--green)' : 'var(--red)';
document.getElementById('fc_daily').innerHTML = '<span class="mono line-through text-slate-500 text-sm mr-2">' + yenHtml(dailyLimit) + '</span><span class="mono text-lg" style="color:' + tc + '">' + yenHtml(remAfterT) + '</span>';
var mc = remAfterM < 0 ? 'var(--red)' : 'var(--green)';
document.getElementById('fc_month').innerHTML = '<span class="mono text-lg" style="color:' + mc + '">' + yenHtml(remAfterM) + '</span>' + (remAfterM < 0 ? '<span class="text-[8px] tracking-widest text-red-500 uppercase ml-1">Deficit</span>' : '');
var allMonths = data.months || {};
var pastSameCat = [];
Object.keys(allMonths).forEach(function (k) {
(allMonths[k].records || []).forEach(function (r) {
if (r.cat === _jgItem.cat && (r.result === 'buy' || r.result === 'late_buy')) pastSameCat.push(r);
});
});
pastSameCat = pastSameCat.slice(-3);
if (pastSameCat.length > 0) {
document.getElementById('fc_past_area').style.display = 'block';
document.getElementById('fc_past_list').innerHTML = pastSameCat.map(function (r) {
return '<div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0"><div><div class="text-[11px] font-bold text-slate-300">' + escapeHtml(r.name) + '</div><div class="text-[9px] text-slate-500 tracking-widest mt-0.5">' + (r.date || '').replace(/-/g, '.') + '</div></div><span class="mono text-sm text-orange-400">-' + yenHtml(r.amount) + '</span></div>';
}).join('');
} else {
document.getElementById('fc_past_area').style.display = 'none';
}
}
var _mfTimer = null;
function goMindful() {
showScreen('scMindful');
var timerEl = document.getElementById('mf_timer');
var msgEl = document.getElementById('mf_msg');
var decisionArea = document.getElementById('mf_decision');
timerEl.style.opacity = '1'; timerEl.textContent = '30'; msgEl.style.opacity = '0';
decisionArea.style.opacity = '0'; decisionArea.style.display = 'none'; decisionArea.style.pointerEvents = 'none';
var sec = 30;
function tick() {
timerEl.textContent = sec;
var targetMsg = MINDFUL_MSGS.find(function (m) { return m.t === sec; });
if (targetMsg) {
msgEl.style.opacity = '0';
setTimeout(function () { msgEl.textContent = targetMsg.msg; msgEl.style.opacity = '1'; }, 500);
}
if (sec <= 0) {
clearInterval(_mfTimer);
timerEl.style.opacity = '0'; msgEl.style.opacity = '0';
setTimeout(function () {
decisionArea.style.display = 'block';
requestAnimationFrame(function () { decisionArea.style.opacity = '1'; decisionArea.style.pointerEvents = 'all'; });
}, 800);
return;
}
sec--;
}
tick(); _mfTimer = setInterval(tick, 1000);
}
function clearTimers() { if (_mfTimer) { clearInterval(_mfTimer); _mfTimer = null; } }
var _lastAvoidId = null;
function doAvoid() {
if (!_jgItem) return; clearTimers();
var data = load(); var key = mKey(); var month = getMonth(data, key);
var rec = { id: uid(), date: today(), month: key, name: _jgItem.name, amount: _jgItem.amount, cat: _jgItem.cat, catIcon: _jgItem.catIcon, result: 'avoid', impulse: null, stopReason: null };
month.records.push(rec);
data.pendingBuys = (data.pendingBuys || []).filter(function (p) { return p.id !== _jgItem.id; });
save(data);
_lastAvoidId = rec.id; _jgItem = null; openWhyOv();
}
function doBuy() {
if (!_jgItem) return; clearTimers();
var data = load(); var key = mKey(); var month = getMonth(data, key);
var rec = { id: uid(), date: today(), month: key, name: _jgItem.name, amount: _jgItem.amount, cat: _jgItem.cat, catIcon: _jgItem.catIcon, result: 'buy', impulse: null };
month.records.push(rec);
data.pendingBuys = (data.pendingBuys || []).filter(function (p) { return p.id !== _jgItem.id; });
save(data); _jgItem = null;
navTo('scHome', 'nb_h'); showToast('PURCHASE VERIFIED');
}
var _whyTimer = null;
function openWhyOv() {
var ov = document.getElementById('whyOv'); var sh = document.getElementById('whySh');
document.getElementById('why_opts').innerHTML = WHY_OPTS.map(function (o) {
return '<button onclick="selectWhy(\'' + o.id + '\')" class="tap w-full flex items-center gap-3 px-4 py-3 rounded gc" style="border-color:var(--bd)"><div class="w-6 h-6 rounded flex items-center justify-center gc2 flex-shrink-0"><i class="fa-solid ' + o.icon + ' text-[10px]" style="color:' + o.color + '"></i></div><span class="text-xs font-bold text-slate-300">' + o.label + '</span><i class="fa-solid fa-chevron-right text-[8px] ml-auto" style="color:var(--tx3)"></i></button>';
}).join('');
ov.style.opacity = '0'; ov.style.pointerEvents = 'all'; sh.style.transform = 'translateY(100%)'; ov.style.display = 'flex';
requestAnimationFrame(function () { ov.style.transition = 'opacity .25s'; ov.style.opacity = '1'; sh.style.transition = 'transform .36s cubic-bezier(.16,1,.3,1)'; sh.style.transform = 'translateY(0)'; });
var bar = document.getElementById('why_bar'); bar.style.transition = 'none'; bar.style.width = '100%';
requestAnimationFrame(function () { bar.style.transition = 'width 3s linear'; bar.style.width = '0%'; });
if (_whyTimer) clearTimeout(_whyTimer);
_whyTimer = setTimeout(function () { selectWhy(null); }, 3000);
}
function selectWhy(reasonId) {
if (_whyTimer) clearTimeout(_whyTimer); _whyTimer = null;
if (_lastAvoidId) {
var data = load(); var key = mKey(); var month = data.months ? data.months[key] : null;
if (month) {
var rec = month.records.find(function (r) { return r.id === _lastAvoidId; });
if (rec) { rec.stopReason = reasonId; save(data); }
}
}
var ov = document.getElementById('whyOv'); var sh = document.getElementById('whySh');
sh.style.transform = 'translateY(100%)';
setTimeout(function () { ov.style.opacity = '0'; ov.style.pointerEvents = 'none'; }, 360);
navTo('scHome', 'nb_h'); showToast('DATA LOGGED'); _lastAvoidId = null;
}
var _rpKey = mKey();
function renderReport() {
document.getElementById('rp_b').textContent = fmtM(_rpKey);
document.getElementById('rp_ml').textContent = fmtM(_rpKey);
var data = load(); var month = data ? (data.months ? data.months[_rpKey] : null) : null;
if (!month || !month.records.length) { document.getElementById('rp_score').style.display = 'none'; document.getElementById('rp_emp').style.display = 'block'; document.getElementById('rp_zi').value = ''; return; }
document.getElementById('rp_emp').style.display = 'none';
if (month.zaimTotal !== null && month.zaimTotal !== undefined) { document.getElementById('rp_zi').value = month.zaimTotal; renderReportScore(data, month); }
else { document.getElementById('rp_score').style.display = 'none'; }
}
function saveReport() {
var zaim = parseInt(document.getElementById('rp_zi').value) || 0; var data = load(); var month = getMonth(data, _rpKey);
month.zaimTotal = zaim; save(data); renderReportScore(data, month); showToast('REPORT GENERATED');
}
function renderReportScore(data, month) {
document.getElementById('rp_score').style.display = 'block';
var appBought = month.records.filter(function (r) { return r.result === 'buy'; }).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
var late = month.records.filter(function (r) { return r.result === 'late_buy'; }).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
var avoided = month.records.filter(function (r) { return r.result === 'avoid'; });
var avoidedTot = avoided.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
var zaim = month.zaimTotal || 0; var totalDisc = appBought + late + zaim;
var rows = [
{ icon: 'fa-shield-check', col: 'var(--green)', sign: '+', val: avoidedTot, label: 'Avoided' },
{ icon: 'fa-bag-shopping', col: 'var(--tx)', sign: '-', val: appBought, label: 'Verified' },
{ icon: 'fa-clock-rotate-left', col: 'var(--orange)', sign: '-', val: late, label: 'Unverified' },
{ icon: 'fa-database', col: 'var(--red)', sign: '-', val: zaim, label: 'External (ZAIM)' }
];
document.getElementById('rp_bd').innerHTML = rows.map(function (r) { return '<div class="flex items-center justify-between py-2 border-b border-white/5 last:border-0"><div class="flex items-center gap-2"><div class="w-5 flex items-center justify-center"><i class="fa-solid ' + r.icon + ' text-[10px]" style="color:' + r.col + '"></i></div><div class="text-[11px] font-bold" style="color:' + r.col + '">' + r.label + '</div></div><div class="mono text-sm" style="color:' + r.col + '">' + r.sign + yenHtml(r.val) + '</div></div>'; }).join('');
document.getElementById('rp_tot').innerHTML = yenHtml(totalDisc);
document.getElementById('rp_sh').innerHTML = '+' + yenHtml(avoidedTot);
var total = totalDisc + avoidedTot; var saveRate = total > 0 ? avoidedTot / total : 0;
var card = document.getElementById('rp_mc'); var icon = document.getElementById('rp_mi'); var ttl = document.getElementById('rp_mt'); var txt = document.getElementById('rp_mx');
if (saveRate >= 0.4) { card.style.cssText = 'border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.05);'; icon.innerHTML = '<i class="fa-solid fa-trophy" style="color:var(--green)"></i>'; ttl.textContent = 'EXCELLENT'; ttl.style.color = 'var(--green)'; txt.textContent = '節約率 ' + Math.round(saveRate * 100) + '% は極めて優秀。'; }
else if (saveRate >= 0.2) { card.style.cssText = 'border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.05);'; icon.innerHTML = '<i class="fa-solid fa-chart-line" style="color:var(--amber)"></i>'; ttl.textContent = 'NEEDS IMPROVEMENT'; ttl.style.color = 'var(--amber)'; txt.textContent = '事後記録の削減を次月KPIに。'; }
else { card.style.cssText = 'border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.05);'; icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i>'; ttl.textContent = 'CRITICAL ALERT'; ttl.style.color = 'var(--red)'; txt.textContent = '裁量支出が基準値超過。アプリ経由率の改善が急務。'; }
}
function rpPrev() { var parts = _rpKey.split('-').map(Number); _rpKey = mKey(new Date(parts[0], parts[1] - 2, 1)); renderReport(); }
function rpNext() { var parts = _rpKey.split('-').map(Number); _rpKey = mKey(new Date(parts[0], parts[1], 1)); renderReport(); }
var _curTab = 'base';
function switchTab(name) {
_curTab = name;
['base', 'fail'].forEach(function (t) {
document.getElementById('tb_' + t).classList.toggle('on', t === name);
document.getElementById('tb_' + t + '_b').style.display = t === name ? 'block' : 'none';
});
if (name === 'fail') renderFailTab();
}
function onAiIconImg(event) {
var file = event.target.files[0]; if (!file) return;
var reader = new FileReader();
reader.onload = function (e) {
var img = new Image();
img.onload = function () {
var cv = document.createElement('canvas'); cv.width = cv.height = 120;
var ctx = cv.getContext('2d'); var side = Math.min(img.width, img.height);
ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 120, 120);
var b64 = cv.toDataURL('image/jpeg', 0.75);
var data = load(); data.aiPersonaImg = b64; save(data);
var iconEl = document.getElementById('st_ai_icon');
iconEl.innerHTML = '<img src="' + b64 + '" style="width:100%;height:100%;object-fit:cover">';
showToast('ICON UPDATED');
};
img.onerror = function () { showToast('IMAGE ERROR'); };
img.src = e.target.result;
};
reader.onerror = function () { showToast('READ ERROR'); };
reader.readAsDataURL(file);
}
function renderSettings() {
var data = load(); if (!data) return;
document.getElementById('st_i').value = data.income || '';
document.getElementById('st_g').value = data.savingsGoal || '';
document.getElementById('st_f').value = data.fixedCost || '';
document.getElementById('st_k').value = data.geminiKey || '';
document.getElementById('st_gas').value = data.gasUrl || '';
document.getElementById('st_wt').value = data.wishThreshold || HIGH_PRICE_THRESHOLD;
document.getElementById('st_persona').value = data.aiPersona || '';
var aiIconEl = document.getElementById('st_ai_icon');
if (data.aiPersonaImg) {
aiIconEl.innerHTML = '<img src="' + data.aiPersonaImg + '" style="width:100%;height:100%;object-fit:cover">';
} else {
aiIconEl.innerHTML = '🧊';
}
updateStFree();
['st_i', 'st_g', 'st_f'].forEach(function (id) {
var el = document.getElementById(id);
if (!el._b) { el.addEventListener('input', updateStFree); el._b = true; }
});
switchTab(_curTab);
}
function updateStFree() {
var i = parseInt(document.getElementById('st_i').value) || 0;
var g = parseInt(document.getElementById('st_g').value) || 0;
var f = parseInt(document.getElementById('st_f').value) || 0;
document.getElementById('st_fp').innerHTML = yenHtml(i - g - f);
}
function saveBase() {
var inc = safeInt(document.getElementById('st_i').value);
var goal = safeInt(document.getElementById('st_g').value);
var fix = safeInt(document.getElementById('st_f').value, 0);
var key = document.getElementById('st_k').value.trim();
var gas = document.getElementById('st_gas').value.trim();
var thr = safeInt(document.getElementById('st_wt').value, HIGH_PRICE_THRESHOLD);
var persona = document.getElementById('st_persona').value.trim();
if (!inc || inc < 1000) { showToast('月収を入力してください'); return; }
if (!goal || goal < 100) { showToast('貯金目標を入力してください'); return; }
if (goal >= inc) { showToast('目標が月収を超えています'); return; }
var data = load(); data.income = inc; data.savingsGoal = goal; data.fixedCost = fix; data.geminiKey = key; data.gasUrl = gas; data.wishThreshold = thr; data.aiPersona = persona; save(data); showToast('SAVED');
}
async function backupToGAS() {
var data = load();
if (!data || !data.gasUrl) { showToast('GAS URL未設定'); return; }
showToast('バックアップ中...');
try {
var res = await fetch(data.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ action: 'backup', timestamp: new Date().toISOString(), payload: data }), redirect: 'follow' });
await res.text(); showToast('バックアップ完了');
} catch (e) { console.error(e); showToast('GAS接続エラー'); }
}
async function fetchFailuresFromGAS() {
var data = load();
if (!data || !data.gasUrl) { showToast('GAS URL未設定'); return; }
showToast('失敗DB同期中...');
try {
var res = await fetch(data.gasUrl + '?action=get_failures', { redirect: 'follow' });
var textRes = await res.text(); var failures = [];
try { failures = JSON.parse(textRes); } catch (e) { /* ignore */ }
if (Array.isArray(failures) && failures.length > 0) { data.failures = failures; save(data); renderFailTab(); showToast(failures.length + '件を同期'); }
else { showToast('データなし'); }
} catch (e) { console.error(e); showToast('GAS接続エラー'); }
}
function renderFailTab() {
var data = load(); var fails = (data ? data.failures : null) || DEF_FAILS;
document.getElementById('st_fails').innerHTML = fails.map(function (f) {
return '<div class="gc p-3 space-y-2"><div class="flex gap-2 items-center"><input type="text" id="fc_' + f.id + '" value="' + escapeAttr(f.cat) + '" class="inp w-24 text-xs" style="padding:6px 10px" placeholder="カテゴリ"><input type="text" id="fn_' + f.id + '" value="' + escapeAttr(f.name) + '" class="inp flex-1 text-xs" style="padding:6px 10px" placeholder="失敗名"><button onclick="delFail(\'' + f.id + '\')" class="tap w-8 h-8 rounded flex items-center justify-center flex-shrink-0 bg-red-500/10 text-red-500"><i class="fa-solid fa-xmark text-xs"></i></button></div><input type="text" id="fcond_' + f.id + '" value="' + escapeAttr(f.cond) + '" class="inp text-[10px]" placeholder="条件・心理状態"></div>';
}).join('');
}
function escapeAttr(str) { return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;'); }
function saveFails() {
var data = load(); var fails = data.failures || DEF_FAILS;
data.failures = fails.map(function (f) {
return {
id: f.id,
cat: (document.getElementById('fc_' + f.id) ? document.getElementById('fc_' + f.id).value : f.cat).trim(),
name: (document.getElementById('fn_' + f.id) ? document.getElementById('fn_' + f.id).value : f.name).trim(),
cond: (document.getElementById('fcond_' + f.id) ? document.getElementById('fcond_' + f.id).value : f.cond).trim()
};
}); save(data); showToast('SAVED');
}
function addFail() { var data = load(); if (!data.failures) data.failures = DEF_FAILS.slice(); data.failures.push({ id: Date.now(), cat: '新規', name: '新しい失敗', cond: '' }); save(data); renderFailTab(); }
function delFail(id) { var data = load(); data.failures = (data.failures || DEF_FAILS).filter(function (f) { return String(f.id) !== String(id); }); save(data); renderFailTab(); }
var _hf = 'all';
function setHF(f) {
_hf = f;
['all', 'av', 'bu', 'la'].forEach(function (t) {
var btn = document.getElementById('hf_' + t); if (!btn) return;
var isActive = (f === 'all' && t === 'all') || (f === 'avoid' && t === 'av') || (f === 'buy' && t === 'bu') || (f === 'late' && t === 'la');
btn.style.background = isActive ? 'var(--gold-d)' : 'transparent';
btn.style.color = isActive ? 'var(--gold)' : 'var(--tx3)';
btn.style.borderColor = isActive ? 'rgba(212,175,55,0.3)' : 'var(--bd)';
});
renderHistory();
}
function renderHistory() {
var data = load(); if (!data) return;
var key = mKey(); var month = data.months ? data.months[key] : null;
document.getElementById('hi_b').textContent = fmtM(key);
var allRecs = (month ? month.records : null) || [];
var filtered = _hf === 'all' ? allRecs : _hf === 'avoid' ? allRecs.filter(function (r) { return r.result === 'avoid'; }) : _hf === 'buy' ? allRecs.filter(function (r) { return r.result === 'buy'; }) : allRecs.filter(function (r) { return r.result === 'late_buy'; });
var sorted = filtered.slice().reverse();
var listEl = document.getElementById('hi_list'); var emEl = document.getElementById('hi_emp');
if (!sorted.length) { listEl.innerHTML = ''; emEl.style.display = 'block'; return; }
emEl.style.display = 'none';
listEl.innerHTML = sorted.map(function (r, i) { return recRow(r, i, true); }).join('');
}
function recRow(r, idx, canDel) {
var isAvoid = r.result === 'avoid'; var isLate = r.result === 'late_buy'; var isBuy = r.result === 'buy';
var col = isAvoid ? 'var(--green)' : isLate ? 'var(--orange)' : 'var(--tx)';
var sign = isAvoid ? '+' : '-';
var stopReason = r.stopReason ? (WHY_OPTS.find(function (o) { return o.id === r.stopReason; }) || {}).label || '' : '';
var tagLabel = isAvoid ? 'AVOID' : isLate ? 'LATE' : 'BUY';
var tagCol = isAvoid ? 'var(--green)' : isLate ? 'var(--orange)' : 'var(--tx2)';
var del = canDel ? '<button onclick="delRec(\'' + (r.id || '') + '\')" class="tap w-6 h-6 rounded flex items-center justify-center ml-2 border border-white/10 hover:bg-red-500/10 hover:text-red-500"><i class="fa-solid fa-xmark text-[10px]"></i></button>' : '';
var numStr = Math.abs(Number(r.amount || 0)).toLocaleString();
var formattedYen = sign + '<span class="text-[10px] text-slate-500 mr-0.5">¥</span>' + numStr;
var regretHtml = '';
if ((isBuy || isLate) && canDel) {
if (r.regret) {
regretHtml = '<div class="mt-1 text-[9px] text-red-400 italic truncate"><i class="fas fa-heart-crack mr-1"></i>' + escapeHtml(r.regret) + '</div>';
} else {
regretHtml = '<button onclick="openRegret(\'' + (r.id || '') + '\')" class="tap mt-1 text-[8px] text-slate-500 border border-white/5 rounded px-2 py-0.5 hover:text-red-400">+ 後悔メモ</button>';
}
}
return '<div class="gc flex flex-col p-3 mb-2" style="animation:fadeUp .3s ' + (idx * 0.04) + 's ease both;border-left:2px solid ' + tagCol + '"><div class="flex items-center justify-between"><div class="flex flex-col gap-1 min-w-0 flex-1 pl-1"><div class="flex items-center gap-2"><span class="text-[9px] font-bold tracking-widest uppercase" style="color:' + tagCol + '">' + tagLabel + '</span>' + (stopReason ? '<span class="text-[9px] text-slate-400 border-l border-white/20 pl-2">' + stopReason + '</span>' : '') + '</div><div class="text-xs font-bold truncate text-white">' + escapeHtml(r.name) + '</div><div class="text-[9px] font-bold tracking-widest uppercase text-slate-500">' + (r.date || '').replace(/-/g, '.') + ' · ' + escapeHtml(r.cat || '') + '</div></div><div class="flex items-center flex-shrink-0"><span class="mono text-sm" style="color:' + col + '">' + formattedYen + '</span>' + del + '</div></div>' + regretHtml + '</div>';
}
function delRec(id) { var data = load(); var key = mKey(); var month = getMonth(data, key); month.records = month.records.filter(function (r) { return r.id !== id; }); save(data); renderHistory(); renderHome(); showToast('DELETED'); }
var _regretTargetId = null;
function openRegret(id) {
_regretTargetId = id;
var data = load(); var key = mKey(); var month = data.months ? data.months[key] : null;
var rec = month ? month.records.find(function (r) { return r.id === id; }) : null;
if (!rec) { showToast('RECORD NOT FOUND'); return; }
document.getElementById('rg_target_name').textContent = rec.name + ' (' + (rec.date || '').replace(/-/g, '.') + ')';
document.getElementById('rg_target_amt').innerHTML = yenHtml(rec.amount);
document.getElementById('rg_text').value = rec.regret || '';
document.getElementById('regretOv').classList.add('open');
}
function saveRegret() {
var txt = document.getElementById('rg_text').value.trim();
if (!txt) { showToast('内容を入力してください'); return; }
var data = load(); var key = mKey(); var month = data.months ? data.months[key] : null;
if (month) {
var rec = month.records.find(function (r) { return r.id === _regretTargetId; });
if (rec) { rec.regret = txt; save(data); }
}
document.getElementById('regretOv').classList.remove('open');
_regretTargetId = null;
renderHistory(); renderHome(); showToast('REGRET SAVED');
}
function openLate() {
['lt_n', 'lt_a', 'lt_y', 'lt_w'].forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });
document.getElementById('lt_rep').style.display = 'none';
var data = load(); var fails = (data ? data.failures : null) || DEF_FAILS;
var uniqueCats = []; fails.forEach(function (f) { if (uniqueCats.indexOf(f.cat) < 0) uniqueCats.push(f.cat); });
var catsArea = document.getElementById('lt_cats_area');
if (catsArea) {
catsArea.innerHTML = uniqueCats.map(function (cat) { return '<button onclick="setLtW(\'' + escapeAttr(cat) + '\')" class="tap px-2 py-1 rounded border border-white/10 text-[10px] text-slate-400">' + escapeHtml(cat) + '</button>'; }).join('') + '<button onclick="setLtW(\'その他\')" class="tap px-2 py-1 rounded border border-white/10 text-[10px] text-slate-400">その他</button>';
}
document.getElementById('lateOv').classList.add('open');
}
function setLtW(v) { document.getElementById('lt_w').value = v; }
function submitLate() {
var name = document.getElementById('lt_n').value.trim();
var amt = safeInt(document.getElementById('lt_a').value);
var why = document.getElementById('lt_y').value.trim();
var where = document.getElementById('lt_w').value.trim();
if (!name || !amt || amt <= 0 || !why) { showToast('DATA MISSING'); return; }
var data = load(); var key = mKey(); var month = getMonth(data, key);
var rec = { id: uid(), date: today(), month: key, name: name, amount: amt, cat: where || 'その他', catIcon: '\uD83C\uDFF7\uFE0F', result: 'late_buy', where: where || '不明', why: why };
month.records.push(rec); save(data);
var lower = why.toLowerCase(); var reply = LATE_TX[LATE_TX.length - 1].txt;
for (var i = 0; i < LATE_TX.length; i++) {
if (LATE_TX[i].kw.length && LATE_TX[i].kw.some(function (k) { return lower.indexOf(k.toLowerCase()) >= 0; })) { reply = LATE_TX[i].txt; break; }
}
document.getElementById('lt_rt').textContent = reply; document.getElementById('lt_rep').style.display = 'block';
setTimeout(function () { document.getElementById('lateOv').classList.remove('open'); renderHistory(); renderHome(); showToast('RECORD SAVED'); }, 2500);
}
function closeOv(e, id) { if (e.target === document.getElementById(id)) document.getElementById(id).classList.remove('open'); }
(function init() {
var data = load();
if (!data || !data.setup) { document.getElementById('scSetup').style.display = 'block'; initSetup(); }
else { navTo('scHome', 'nb_h'); }
})();
