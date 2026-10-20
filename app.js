const SESSION_STORAGE_KEY = 'wanderwise-supabase-session-v1';
const CURRENCY_PREFERENCES_KEY = 'wanderwise-currency-preferences-v1';
const SUPPORTED_CURRENCIES = ['USD', 'TWD', 'EUR', 'JPY', 'CAD'];
const $ = (selector) => document.querySelector(selector);
const config = window.WANDERWISE_CONFIG || {};
const SUPABASE_URL = (config.supabaseUrl || '').replace(/\/$/, '');
const SUPABASE_KEY = config.supabaseAnonKey || '';
const symbols = { USD: '$', TWD: 'NT$', EUR: '€', JPY: '¥', CAD: 'CA$' };
const icons = { 餐飲: '☕', 住宿: '⌂', 交通: '↗', 薪資: '✳', 日用品: '◌', 娛樂: '♫', 其他: '✦' };
const today = new Date().toISOString().slice(0, 10);
let currentUser = null;
let transactions = [];
let editingTransactionId = null;
let rateTable = { USD: 1 };
let rateDate = '';
let isCustomChartRange = false;

$('#greetingDate').textContent = new Intl.DateTimeFormat('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
}).format(new Date()).toUpperCase();

function isSupabaseConfigured() {
  return SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
    SUPABASE_KEY &&
    !SUPABASE_KEY.includes('YOUR_SUPABASE');
}

function readCurrencyPreferences() {
  try {
    return JSON.parse(localStorage.getItem(CURRENCY_PREFERENCES_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveCurrencyPreference(name, value) {
  if (!SUPPORTED_CURRENCIES.includes(value)) return;
  const preferences = readCurrencyPreferences();
  preferences[name] = value;
  try {
    localStorage.setItem(CURRENCY_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Keep the current selection even if browser storage is unavailable.
  }
}

function restoreCurrencyPreferences() {
  const preferences = readCurrencyPreferences();
  const controls = [
    ['#displayCurrency', 'overview'],
    ['#rateFromCurrency', 'converterFrom'],
    ['#rateToCurrency', 'converterTo'],
    ['#transactionForm select[name="currency"]', 'transaction']
  ];

  controls.forEach(([selector, name]) => {
    const control = $(selector);
    const savedValue = preferences[name];
    if (SUPPORTED_CURRENCIES.includes(savedValue) && [...control.options].some(option => option.value === savedValue)) {
      control.value = savedValue;
    } else {
      control.value = 'TWD';
    }
  });
}

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function storeSession(data) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at_ms: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user: data.user
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function authRequest(path, { method = 'GET', body, accessToken } = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error_description || data?.error || '帳號服務暫時無法使用。');
  }
  return data;
}

async function getAccessToken(forceRefresh = false) {
  let session = getStoredSession();
  if (!session?.refresh_token || !session?.access_token) {
    throw new Error('登入已逾期，請重新登入。');
  }

  if (!forceRefresh && session.expires_at_ms > Date.now() + 60_000) {
    return session.access_token;
  }

  try {
    const refreshed = await authRequest('token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    });
    session = storeSession(refreshed);
    return session.access_token;
  } catch (error) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    throw error;
  }
}

async function databaseRequest(path, { method = 'GET', body } = {}) {
  async function send(accessToken) {
    return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(['POST', 'PATCH'].includes(method) ? { Prefer: 'return=representation' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }

  let response = await send(await getAccessToken());
  if (response.status === 401) {
    response = await send(await getAccessToken(true));
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.details || '無法存取雲端記帳資料。');
  }
  return data;
}

function setAuthMode(mode) {
  const isRegistering = mode === 'register';
  $('#authTitle').textContent = isRegistering ? '建立你的帳號' : '歡迎回來';
  $('#authDescription').textContent = isRegistering
    ? '建立專屬帳號，讓每筆旅居收支都有自己的位置。'
    : '登入帳號，繼續管理你的旅居收支。';
  $('#authSubmit').textContent = isRegistering ? '建立帳號' : '登入';
  $('#confirmPasswordField').classList.toggle('hidden', !isRegistering);
  $('#authPasswordConfirm').required = isRegistering;
  $('#authPassword').autocomplete = isRegistering ? 'new-password' : 'current-password';
  $('#loginTab').classList.toggle('active', !isRegistering);
  $('#registerTab').classList.toggle('active', isRegistering);
  $('#loginTab').setAttribute('aria-selected', String(!isRegistering));
  $('#registerTab').setAttribute('aria-selected', String(isRegistering));
  $('#authMessage').textContent = '';
  $('#authForm').dataset.mode = mode;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  $('#authMessage').textContent = '';

  if (!isSupabaseConfigured()) {
    $('#authMessage').textContent = '尚未設定 Supabase。請依 README 建立專案並填入 config.js。';
    return;
  }

  const email = $('#authEmail').value.trim().toLowerCase();
  const password = $('#authPassword').value;
  const isRegistering = $('#authForm').dataset.mode === 'register';
  const button = $('#authSubmit');
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = '處理中…';

  try {
    if (isRegistering) {
      if (password !== $('#authPasswordConfirm').value) {
        throw new Error('兩次輸入的密碼不一致。');
      }
      const result = await authRequest('signup', {
        method: 'POST',
        body: { email, password }
      });

      if (result.access_token && result.refresh_token) {
        storeSession(result);
        await enterAccount(result.user);
        $('#authForm').reset();
      } else {
        $('#authMessage').textContent = '帳號已建立。請先到電子郵件收取驗證連結，再回來登入。';
      }
      return;
    }

    const result = await authRequest('token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
    storeSession(result);
    await enterAccount(result.user);
    $('#authForm').reset();
  } catch (error) {
    $('#authMessage').textContent = error.message || '登入失敗，請稍後再試。';
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function enterAccount(user) {
  currentUser = user;
  $('#signedInEmail').textContent = user.email || '';
  $('#authScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#appMessage').classList.add('hidden');
  await loadTransactions();
}

async function loadTransactions() {
  if (!currentUser) return;
  try {
    const rows = await databaseRequest('transactions?select=*&order=date.desc,created_at.desc');
    transactions = rows || [];
    render();
  } catch (error) {
    $('#appMessage').textContent = error.message + ' 請確認已在 Supabase 執行 supabase/schema.sql。';
    $('#appMessage').classList.remove('hidden');
  }
}

async function restoreSession() {
  if (!isSupabaseConfigured()) {
    $('#authMessage').textContent = '請先設定 Supabase：建立專案、執行資料表 SQL，並填入 config.js。';
    return;
  }

  const authParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const redirectAccessToken = authParams.get('access_token');
  const redirectRefreshToken = authParams.get('refresh_token');
  if (redirectAccessToken && redirectRefreshToken) {
    storeSession({
      access_token: redirectAccessToken,
      refresh_token: redirectRefreshToken,
      expires_in: authParams.get('expires_in') || 3600
    });
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }

  const session = getStoredSession();
  if (!session) return;

  try {
    const user = await authRequest('user', { accessToken: await getAccessToken() });
    await enterAccount(user);
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

async function logout() {
  try {
    const accessToken = await getAccessToken();
    await authRequest('logout', { method: 'POST', accessToken });
  } catch {
    // Even if the network is unavailable, clear the local session.
  }

  localStorage.removeItem(SESSION_STORAGE_KEY);
  currentUser = null;
  transactions = [];
  $('#appShell').classList.add('hidden');
  $('#authScreen').classList.remove('hidden');
  $('#authForm').reset();
  setAuthMode('login');
}

function money(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2
  }).format(amount);
}

function convert(amount, from, to) {
  if (from === to) return amount;
  if (!rateTable[from] || !rateTable[to]) return null;
  return (amount / rateTable[from]) * rateTable[to];
}

function displayAmount(amount, currency) {
  const target = $('#displayCurrency').value;
  const converted = convert(amount, currency, target);
  return converted === null
    ? `${symbols[currency] || currency}${amount.toFixed(2)}`
    : money(converted, target);
}

function isThisMonth(date) {
  return date.slice(0, 7) === today.slice(0, 7);
}

function render() {
  if (!currentUser) return;
  const month = transactions.filter(item => isThisMonth(item.date));
  const currency = $('#displayCurrency').value;
  const income = month
    .filter(item => item.type === 'income')
    .reduce((sum, item) => sum + (convert(item.amount, item.currency, currency) ?? item.amount), 0);
  const expenses = month
    .filter(item => item.type === 'expense')
    .reduce((sum, item) => sum + (convert(item.amount, item.currency, currency) ?? item.amount), 0);

  $('#balance').textContent = money(income - expenses, currency);
  $('#income').textContent = money(income, currency);
  $('#expense').textContent = money(expenses, currency);
  $('#expenseCount').textContent = month.filter(item => item.type === 'expense').length;
  $('#chartCurrency').textContent = currency;
  updateChartMonthOptions(transactions);
  renderChart(transactions, currency);
  renderRows();
  updateConverter();
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function updateChartMonthOptions(items) {
  const select = $('#chartMonthSelect');
  const selectedMonth = select.value || currentMonthKey();
  const months = new Set();
  const now = new Date();

  for (let offset = 0; offset < 12; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  items.forEach(item => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date)) months.add(item.date.slice(0, 7));
  });

  select.innerHTML = [...months].sort((a, b) => b.localeCompare(a)).map(value => {
    const [year, month] = value.split('-').map(Number);
    const label = value === currentMonthKey() ? `本月 · ${year}/${String(month).padStart(2, '0')}` : `${year}年${month}月`;
    return `<option value="${value}">${label}</option>`;
  }).join('');
  select.value = months.has(selectedMonth) ? selectedMonth : currentMonthKey();
}

function renderChart(items, currency) {
  const chart = $('#chart');
  chart.innerHTML = '';
  const selectedMonth = $('#chartMonthSelect').value || currentMonthKey();
  const [year, month] = selectedMonth.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const from = isCustomChartRange ? parseLocalDate($('#chartStartDate').value) : monthStart;
  const to = isCustomChartRange ? parseLocalDate($('#chartEndDate').value) : monthEnd;

  if (!from || !to || from > to) {
    chart.innerHTML = '<p class="chart-empty">請選擇有效的日期區間</p>';
    $('#chartIntervalNote').textContent = '日期區間無效';
    return;
  }

  const dayNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  const days = dayNumber(to) - dayNumber(from) + 1;
  // Keep the chart readable for long custom ranges by showing no more than
  // about eight buckets. Short ranges are grouped by week.
  const bucketDays = 7 * Math.max(1, Math.ceil(days / 56));
  const bucketCount = Math.ceil(days / bucketDays);
  const matchingItems = items.filter(item => {
    const date = parseLocalDate(item.date);
    return date && date >= from && date <= to;
  });
  const bucketFor = date => Math.min(bucketCount - 1, Math.floor((dayNumber(parseLocalDate(date)) - dayNumber(from)) / bucketDays));
  const totalsFor = (bucket, type) => matchingItems
    .filter(item => item.type === type && bucketFor(item.date) === bucket)
    .reduce((sum, item) => sum + (convert(item.amount, item.currency, currency) ?? item.amount), 0);
  const buckets = Array.from({ length: bucketCount }, (_, index) => index);
  // Scale against each bucket's total, so no column can exceed the chart.
  const max = Math.max(1, ...buckets.flatMap(bucket => ['income', 'expense'].map(type => totalsFor(bucket, type))));

  $('#chartIntervalNote').textContent = isCustomChartRange
    ? (bucketDays === 7 ? '自訂區間 · 每週統計' : `自訂區間 · 每 ${bucketDays} 天統計`)
    : `${year}年${month}月 · 每週統計`;

  buckets.forEach(bucket => {
    const group = document.createElement('div');
    group.className = 'week-group';

    ['income', 'expense'].forEach(type => {
      const total = totalsFor(bucket, type);
      const bar = document.createElement('div');
      bar.className = 'bar ' + (type === 'expense' ? 'out' : '');
      bar.style.height = Math.min(100, Math.max(total ? 5 : 0, total / max * 100)) + '%';
      bar.title = (type === 'income' ? '收入 ' : '支出 ') + money(total, currency);
      group.append(bar);
    });

    const label = document.createElement('span');
    label.className = 'week-label';
    const bucketStart = new Date(from.getFullYear(), from.getMonth(), from.getDate() + bucket * bucketDays);
    const proposedEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate() + (bucket + 1) * bucketDays - 1);
    const bucketEnd = dayNumber(proposedEnd) > dayNumber(to) ? to : proposedEnd;
    label.textContent = `${bucketStart.getMonth() + 1}/${bucketStart.getDate()}–${bucketEnd.getMonth() + 1}/${bucketEnd.getDate()}`;
    group.append(label);
    chart.append(group);
  });
}

function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function escapeHtml(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node.innerHTML;
}

function renderRows() {
  const filter = $('#filterType').value;
  const rows = transactions
    .filter(item => filter === 'all' || item.type === filter)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  $('#transactionRows').innerHTML = rows.map(item => {
    const title = escapeHtml(item.title);
    const category = escapeHtml(item.category);
    const sign = item.type === 'income' ? '+' : '−';
    const label = item.type === 'income' ? '收入' : '支出';
    return '<tr>' +
      '<td><div class="txn-title"><span class="txn-icon">' + (icons[item.category] || '✦') + '</span>' +
      '<span>' + title + '<span class="txn-sub">' + label + ' · ' + item.currency + '</span></span></div></td>' +
      '<td><span class="category-pill">' + category + '</span></td>' +
      '<td>' + String(item.date).replaceAll('-', '.') + '</td>' +
      '<td class="text-right amount ' + item.type + '">' + sign + displayAmount(Number(item.amount), item.currency) + '</td>' +
      '<td class="text-right"><div class="transaction-actions">' +
      '<button class="edit-button" type="button" data-edit-id="' + item.id + '" aria-label="編輯 ' + title + '">編輯</button>' +
      '<button class="delete-button" type="button" data-delete-id="' + item.id + '" aria-label="刪除 ' + title + '">刪除</button>' +
      '</div></td>' +
      '</tr>';
  }).join('');

  $('#emptyState').classList.toggle('hidden', rows.length > 0);
}

async function loadRates() {
  const button = $('#refreshRates');
  button.disabled = true;
  button.textContent = '載入中…';
  $('#rateValue').textContent = '載入匯率中…';

  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rates?base=USD&quotes=TWD,EUR,JPY,CAD');
    if (!response.ok) throw new Error('匯率服務暫時無法使用');
    const data = await response.json();
    data.forEach(item => { rateTable[item.quote] = item.rate; });
    rateDate = data[0]?.date || '日期未知';
    $('#rateDate').textContent = '參考匯率 · 更新日期 ' + rateDate;
    updateRateDisplay();
    render();
  } catch {
    $('#rateValue').textContent = '暫時無法取得';
    $('#rateDate').textContent = '請確認網路連線後重新整理';
  } finally {
    button.disabled = false;
    button.textContent = '↻ 更新';
  }
}

function updateConverter() {
  const amount = Number($('#convertAmount').value) || 0;
  const from = $('#rateFromCurrency').value;
  const to = $('#rateToCurrency').value;
  const value = convert(amount, from, to);
  $('#convertFromLabel').textContent = from;
  $('#convertedAmount').textContent = value === null ? '— ' + to : money(value, to) + ' ' + to;
}

function updateRateDisplay() {
  const from = $('#rateFromCurrency').value;
  const to = $('#rateToCurrency').value;
  const rate = convert(1, from, to);
  $('#rateValue').textContent = rate === null
    ? '匯率暫不可用'
    : '1 ' + from + ' = ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(rate) + ' ' + to;
}

function openDialog() {
  if (!currentUser) return;
  const form = $('#transactionForm');
  form.reset();
  editingTransactionId = null;
  form.elements.date.value = today;
  $('#transactionDialogTitle').textContent = '新增紀錄';
  form.querySelector('[type="submit"]').textContent = '儲存紀錄';
  $('#transactionDialog').showModal();
}

function openEditDialog(transaction) {
  if (!currentUser || !transaction) return;
  const form = $('#transactionForm');
  form.reset();
  editingTransactionId = transaction.id;
  form.elements.title.value = transaction.title;
  form.elements.type.value = transaction.type;
  form.elements.category.value = transaction.category;
  form.elements.amount.value = transaction.amount;
  form.elements.currency.value = transaction.currency;
  form.elements.date.value = transaction.date;
  $('#transactionDialogTitle').textContent = '編輯紀錄';
  form.querySelector('[type="submit"]').textContent = '儲存變更';
  $('#transactionDialog').showModal();
}

restoreCurrencyPreferences();

$('#addTop').addEventListener('click', openDialog);
$('#addBottom').addEventListener('click', openDialog);
$('#mobileAdd').addEventListener('click', openDialog);
$('#closeDialog').addEventListener('click', () => $('#transactionDialog').close());
$('#transactionDialog').addEventListener('close', () => {
  editingTransactionId = null;
  $('#transactionDialogTitle').textContent = '新增紀錄';
  $('#transactionForm').querySelector('[type="submit"]').textContent = '儲存紀錄';
});
$('#logoutButton').addEventListener('click', logout);
$('#refreshRates').addEventListener('click', loadRates);
$('#displayCurrency').addEventListener('change', event => {
  saveCurrencyPreference('overview', event.currentTarget.value);
  render();
});
$('#filterType').addEventListener('change', renderRows);
$('#chartMonthSelect').addEventListener('change', () => {
  isCustomChartRange = false;
  $('#customChartRange').hidden = true;
  $('#openCustomRange').setAttribute('aria-expanded', 'false');
  $('#chartRangeError').hidden = true;
  render();
});
$('#openCustomRange').addEventListener('click', () => {
  const range = $('#customChartRange');
  range.hidden = !range.hidden;
  $('#openCustomRange').setAttribute('aria-expanded', String(!range.hidden));
});
$('#applyChartRange').addEventListener('click', () => {
  if (!$('#chartStartDate').reportValidity() || !$('#chartEndDate').reportValidity()) return;
  const from = parseLocalDate($('#chartStartDate').value);
  const to = parseLocalDate($('#chartEndDate').value);
  if (!from || !to || from > to) {
    $('#chartRangeError').hidden = false;
    return;
  }
  $('#chartRangeError').hidden = true;
  isCustomChartRange = true;
  $('#customChartRange').hidden = true;
  $('#openCustomRange').setAttribute('aria-expanded', 'false');
  render();
});
$('#convertAmount').addEventListener('input', updateConverter);
$('#rateFromCurrency').addEventListener('change', event => {
  saveCurrencyPreference('converterFrom', event.currentTarget.value);
  updateRateDisplay();
  updateConverter();
});
$('#rateToCurrency').addEventListener('change', event => {
  saveCurrencyPreference('converterTo', event.currentTarget.value);
  updateRateDisplay();
  updateConverter();
});
$('#transactionForm select[name="currency"]').addEventListener('change', event => {
  saveCurrencyPreference('transaction', event.currentTarget.value);
});
$('#loginTab').addEventListener('click', () => setAuthMode('login'));
$('#registerTab').addEventListener('click', () => setAuthMode('register'));
$('#authForm').addEventListener('submit', handleAuthSubmit);

$('#transactionRows').addEventListener('click', async event => {
  const editButton = event.target.closest('[data-edit-id]');
  if (editButton && currentUser) {
    const transaction = transactions.find(item => item.id === editButton.dataset.editId);
    if (transaction) openEditDialog(transaction);
    return;
  }

  const button = event.target.closest('[data-delete-id]');
  if (!button || !currentUser) return;
  const transaction = transactions.find(item => item.id === button.dataset.deleteId);
  if (!transaction || !window.confirm('確定刪除「' + transaction.title + '」這筆紀錄嗎？')) return;

  try {
    await databaseRequest('transactions?id=eq.' + encodeURIComponent(transaction.id), { method: 'DELETE' });
    transactions = transactions.filter(item => item.id !== transaction.id);
    render();
  } catch (error) {
    $('#appMessage').textContent = error.message;
    $('#appMessage').classList.remove('hidden');
  }
});

$('#transactionForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) return;

  // Save the form reference before awaiting: event.currentTarget becomes null
  // once the submit event listener yields back to the browser.
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const item = {
    user_id: currentUser.id,
    title: form.get('title').trim(),
    type: form.get('type'),
    category: form.get('category'),
    amount: Number(form.get('amount')),
    currency: form.get('currency'),
    date: form.get('date')
  };
  if (!item.title || !item.amount || item.amount <= 0) return;

  const submitButton = formElement.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    if (editingTransactionId) {
      const transactionId = editingTransactionId;
      const updated = await databaseRequest('transactions?id=eq.' + encodeURIComponent(transactionId), {
        method: 'PATCH',
        body: item
      });
      if (!updated?.[0]) throw new Error('沒有更新到這筆紀錄，請重新整理後再試。');
      transactions = transactions.map(transaction => transaction.id === transactionId ? updated[0] : transaction);
    } else {
      const inserted = await databaseRequest('transactions', { method: 'POST', body: item });
      transactions.unshift(inserted[0]);
    }
    formElement.reset();
    formElement.elements.date.value = today;
    formElement.elements.currency.value = item.currency;
    $('#transactionDialog').close();
    $('#appMessage').classList.add('hidden');
    render();
  } catch (error) {
    $('#appMessage').textContent = error.message;
    $('#appMessage').classList.remove('hidden');
  } finally {
    submitButton.disabled = false;
  }
});

$('#transactionForm').elements.date.value = today;
const localToday = new Date();
const localTodayValue = [localToday.getFullYear(), String(localToday.getMonth() + 1).padStart(2, '0'), String(localToday.getDate()).padStart(2, '0')].join('-');
const localMonthStartValue = [localToday.getFullYear(), String(localToday.getMonth() + 1).padStart(2, '0'), '01'].join('-');
$('#chartStartDate').value = localMonthStartValue;
$('#chartEndDate').value = localTodayValue;
setAuthMode('login');
restoreSession();
loadRates();
