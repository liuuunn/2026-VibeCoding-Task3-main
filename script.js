/* === 設定區 === */
const CLIENT_ID = '633137684724-s978llvgf4q7otjqb7rn20bimfa61dbk.apps.googleusercontent.com';
const API_KEY = '你的_GOOGLE_API_KEY';
const SPREADSHEET_ID = '1S3VLZ1ZhqNmZJzA4kLoZF--a4AaQiEmm-Mgp3-BkrDY'; // 從 URL 取得，例如 1abc123...
/* ============== */

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 儲存從試算表讀取的資料
let masterData = []; // 主表
let typeData = [];   // 帳務類型
let methodData = []; // 付款方式

function gapiLoaded() {
    gapi.load('client', intializeGapiClient);
}

async function intializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
    });
    gapiInited = true;
    checkBeforeStart();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // 後續在 handleAuthClick 中定義
    });
    gisInited = true;
    checkBeforeStart();
}

function checkBeforeStart() {
    if (gapiInited && gisInited) {
        // 準備就緒
    }
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';
        document.getElementById('main-form').style.display = 'block';
        await loadAllData();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('login-btn').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'none';
        document.getElementById('main-form').style.display = 'none';
    }
}

// 載入試算表資料
async function loadAllData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ['主表!A2:D', '帳務類型!A2:B', '付款方式!A2:B'],
        });

        const valueRanges = response.result.valueRanges;
        masterData = valueRanges[0].values || [];
        typeData = valueRanges[1].values || [];
        methodData = valueRanges[2].values || [];

        renderAccountOptions();
    } catch (err) {
        console.error(err);
        alert('讀取資料失敗，請檢查權限與 ID。');
    }
}

// 渲染帳戶選單
function renderAccountOptions() {
    const select = document.getElementById('select-account');
    select.innerHTML = '<option value="">請選擇帳戶</option>';
    masterData.forEach(row => {
        let opt = document.createElement('option');
        opt.value = row[0]; // ID
        opt.text = row[1];  // 名稱
        select.appendChild(opt);
    });
}

// 當帳戶改變：限制帳務類型
function onAccountChange() {
    const accId = document.getElementById('select-account').value;
    const accountInfo = masterData.find(r => r[0] === accId);
    const typeSelect = document.getElementById('select-type');
    
    typeSelect.innerHTML = '<option value="">請選擇帳務類型</option>';
    
    if (!accountInfo) return;

    const canSpend = accountInfo[2] === '是';

    typeData.forEach(row => {
        // 如果帳戶不可支出，且該類型是 A02 (支出)，則跳過
        if (!canSpend && row[0] === 'A02') return;

        let opt = document.createElement('option');
        opt.value = row[0];
        opt.text = row[1];
        typeSelect.appendChild(opt);
    });
    
    onTypeChange(); // 重置付款方式
}

// 當類型改變：限制付款方式
function onTypeChange() {
    const accId = document.getElementById('select-account').value;
    const typeId = document.getElementById('select-type').value;
    const accountInfo = masterData.find(r => r[0] === accId);
    const methodSelect = document.getElementById('select-method');
    const paySection = document.getElementById('payment-section');

    methodSelect.innerHTML = '<option value="">請選擇付款方式</option>';

    // 邏輯 1: 如果主表「帳戶可供支出」為否，不需選擇付款方式
    if (!accountInfo || accountInfo[2] === '否' || typeId === 'A01') {
        paySection.style.visibility = 'hidden';
        methodSelect.value = "";
        return;
    }

    paySection.style.visibility = 'visible';
    const canCard = accountInfo[3] === '是';

    methodData.forEach(row => {
        // 邏輯 2: 如果「帳戶可供刷卡」為否，無法選擇刷卡 (P03)
        if (!canCard && row[0] === 'P03') return;

        let opt = document.createElement('option');
        opt.value = row[0];
        opt.text = row[1];
        methodSelect.appendChild(opt);
    });
}

// 提交資料
async function submitRecord() {
    const status = document.getElementById('status-msg');
    status.innerText = "提交中...";
    
    const accId = document.getElementById('select-account').value;
    const typeId = document.getElementById('select-type').value;
    const methodId = document.getElementById('select-method').value;
    
    const accountInfo = masterData.find(r => r[0] === accId);
    const typeInfo = typeData.find(r => r[0] === typeId);
    const methodInfo = methodData.find(r => r[0] === methodId);

    const cash = parseFloat(document.getElementById('amt-cash').value) || 0;
    const trans = parseFloat(document.getElementById('amt-transfer').value) || 0;
    const card = parseFloat(document.getElementById('amt-card').value) || 0;
    const total = cash + trans + card;

    // 依照紀錄工作表的欄位順序：
    // 記帳人, 帳戶ID, 帳務類型ID, 付款方式ID, 帳戶名稱, 帳務類型, 付款方式, 現金金額, 轉帳金額, 刷卡金額, 總計金額
    const values = [[
        document.getElementById('user-name').value,
        accId,
        typeId,
        methodId || "",
        accountInfo ? accountInfo[1] : "",
        typeInfo ? typeInfo[1] : "",
        methodInfo ? methodInfo[1] : "",
        cash,
        trans,
        card,
        total
    ]];

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: '紀錄!A:A',
            valueInputOption: 'USER_ENTERED',
            resource: { values: values },
        });
        status.innerText = "✅ 提交成功！";
        // 清空部分欄位
        document.getElementById('amt-cash').value = 0;
        document.getElementById('amt-transfer').value = 0;
        document.getElementById('amt-card').value = 0;
    } catch (err) {
        status.innerText = "❌ 提交失敗：" + err.result.error.message;
    }
}