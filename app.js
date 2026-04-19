// --- 變數設定區 ---
const CLIENT_ID = '633137684724-s978llvgf4q7otjqb7rn20bimfa61dbk.apps.googleusercontent.com';
const SPREADSHEET_ID = '1S3VLZ1ZhqNmZJzA4kLoZF--a4AaQiEmm-Mgp3-BkrDY';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 緩存主表資料
let accountsData = [];
let typeData = { 'A01': '收入', 'A02': '支出' };
let paymentData = { 'P01': '現金', 'P02': '轉帳', 'P03': '刷卡' };

// --- 初始化 Google SDK ---
function gapiLoaded() {
    gapi.load('client', async () => {
        await gapi.client.init({
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        gapiInited = true;
        checkAuth();
    });
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 在點擊按鈕時觸發
    });
    gisInited = true;
    checkAuth();
}

function checkAuth() {
    if (gapiInited && gisInited) document.getElementById('auth-btn').onclick = handleAuthClick;
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('app-section').style.display = 'block';
        await loadInitialData();
        await updateDashboard();
    };
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

// --- 資料讀取與邏輯控制 ---
async function loadInitialData() {
    // 讀取 [主表]
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: '主表!A2:D',
    });
    accountsData = response.result.values;

    const accountSelect = document.getElementById('account-id');
    accountsData.forEach(row => {
        let opt = document.createElement('option');
        opt.value = row[0]; // 帳戶ID
        opt.textContent = row[1]; // 帳戶名稱
        accountSelect.appendChild(opt);
    });

    accountSelect.addEventListener('change', handleAccountChange);
}

function handleAccountChange(e) {
    const accId = e.target.value;
    const account = accountsData.find(a => a[0] === accId);
    
    const typeSelect = document.getElementById('type-id');
    const paySelect = document.getElementById('payment-id');

    if (!account) {
        typeSelect.disabled = paySelect.disabled = true;
        return;
    }

    // 帳務類型邏輯：如果“帳戶可供支出”為否(index 2)，則無法選支出(A02)
    typeSelect.innerHTML = '<option value="A01">收入</option>';
    if (account[2] === '是') {
        typeSelect.innerHTML += '<option value="A02">支出</option>';
    }
    typeSelect.disabled = false;

    // 收付方式邏輯：如果“帳戶可供刷卡”為否(index 3)，則無法選刷卡(P03)
    paySelect.innerHTML = '<option value="P01">現金</option><option value="P02">轉帳</option>';
    if (account[3] === '是') {
        paySelect.innerHTML += '<option value="P03">刷卡</option>';
    }
    paySelect.disabled = false;
}

// --- 提交記帳紀錄 ---
document.getElementById('record-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('date').value;
    const accId = document.getElementById('account-id').value;
    const typeId = document.getElementById('type-id').value;
    const payId = document.getElementById('payment-id').value;
    const category = document.getElementById('category').value;
    let amount = parseFloat(document.getElementById('amount').value);

    // 強制邏輯：如果帳務類型為支出(A02)，金額改為負數
    if (typeId === 'A02') amount = -Math.abs(amount);
    else amount = Math.abs(amount);

    const account = accountsData.find(a => a[0] === accId);
    const row = [
        "劉", // 記帳人
        date.replace(/-/g, '/'),
        accId,
        typeId,
        payId,
        account[1],
        typeData[typeId],
        paymentData[payId],
        category,
        amount
    ];

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: '紀錄!A:J',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [row] },
        });
        alert('儲存成功！');
        document.getElementById('record-form').reset();
        await updateDashboard();
    } catch (err) {
        console.error(err);
    }
};

// --- 更新報表 ---
async function updateDashboard() {
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: '紀錄!A2:J',
    });
    const records = response.result.values || [];
    
    let totalIncome = 0;
    let totalExpense = 0;
    let categoryMap = {};

    records.forEach(row => {
        const amt = parseFloat(row[9].replace(/,/g, ''));
        const cat = row[8];
        if (amt > 0) totalIncome += amt;
        else {
            totalExpense += amt;
            categoryMap[cat] = (categoryMap[cat] || 0) + Math.abs(amt);
        }
    });

    document.getElementById('total-income').textContent = totalIncome.toLocaleString();
    document.getElementById('total-expense').textContent = totalExpense.toLocaleString();

    // 更新圓餅圖
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(categoryMap),
            datasets: [{
                data: Object.values(categoryMap),
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
            }]
        },
        options: { plugins: { title: { display: true, text: '支出項目分佈' } } }
    });
}