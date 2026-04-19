/** * 請填寫以下資訊 
 */
const CLIENT_ID = '633137684724-s978llvgf4q7otjqb7rn20bimfa61dbk.apps.googleusercontent.com';
const SPREADSHEET_ID = '1S3VLZ1ZhqNmZJzA4kLoZF--a4AaQiEmm-Mgp3-BkrDY';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 緩存試算表資料
let masterData = []; // 主表
let typeData = [];   // 帳務類型
let methodData = []; // 付款方式

function gapiLoaded() {
    gapi.load('client', async () => {
        await gapi.client.init({
            // 不再需要 apiKey
            discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
        });
        gapiInited = true;
    });
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', 
    });
    gisInited = true;
}

async function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'block';
        document.getElementById('main-form').style.display = 'block';
        await loadInitialData();
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
        location.reload(); // 重新整理頁面清空狀態
    }
}

// 讀取試算表中的所有主檔
async function loadInitialData() {
    const status = document.getElementById('status-msg');
    try {
        const response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ['主表!A2:D', '帳務類型!A2:B', '付款方式!A2:B'],
        });

        const ranges = response.result.valueRanges;
        masterData = ranges[0].values || [];
        typeData = ranges[1].values || [];
        methodData = ranges[2].values || [];

        renderAccounts();
        status.innerText = "資料同步完成";
    } catch (err) {
        status.innerText = "錯誤: 無法讀取試算表。請確認 ID 與權限。";
        console.error(err);
    }
}

function renderAccounts() {
    const select = document.getElementById('select-account');
    select.innerHTML = '<option value="">請選擇帳戶</option>';
    masterData.forEach(row => {
        let opt = document.createElement('option');
        opt.value = row[0]; // B01
        opt.text = row[1];  // 聯邦
        select.appendChild(opt);
    });
}

// 邏輯處理：根據 [主表] 限制 [帳務類型]
function onAccountChange() {
    const accId = document.getElementById('select-account').value;
    const accRow = masterData.find(r => r[0] === accId);
    const typeSelect = document.getElementById('select-type');
    
    typeSelect.innerHTML = '<option value="">請選擇帳務類型</option>';
    if (!accRow) return;

    // 判斷是否可支出
    const canSpend = accRow[2] === '是';

    typeData.forEach(row => {
        // 如果不可支出 (canSpend=否)，則過濾掉支出 (A02)
        if (!canSpend && row[0] === 'A02') return;

        let opt = document.createElement('option');
        opt.value = row[0];
        opt.text = row[1];
        typeSelect.appendChild(opt);
    });
    
    onTypeChange();
}

// 邏輯處理：根據 [主表] 與 [類型] 限制 [付款方式]
function onTypeChange() {
    const accId = document.getElementById('select-account').value;
    const typeId = document.getElementById('select-type').value;
    const accRow = masterData.find(r => r[0] === accId);
    const methodSelect = document.getElementById('select-method');
    const paySection = document.getElementById('payment-section');

    methodSelect.innerHTML = '<option value="">請選擇付款方式</option>';

    // 如果是收入 (A01) 或 帳戶本身不可支出 -> 隱藏付款方式
    if (!accRow || accRow[2] === '否' || typeId === 'A01') {
        paySection.style.display = 'none';
        methodSelect.value = "";
        return;
    }

    paySection.style.display = 'block';
    const canCredit = accRow[3] === '是';

    methodData.forEach(row => {
        // 如果不可刷卡 (canCredit=否)，則過濾掉刷卡 (P03)
        if (!canCredit && row[0] === 'P03') return;

        let opt = document.createElement('option');
        opt.value = row[0];
        opt.text = row[1];
        methodSelect.appendChild(opt);
    });
}

// 寫入資料
async function submitRecord() {
    const status = document.getElementById('status-msg');
    const accId = document.getElementById('select-account').value;
    const typeId = document.getElementById('select-type').value;
    const methodId = document.getElementById('select-method').value;

    if (!accId || !typeId) {
        alert("請填寫完整資訊");
        return;
    }

    const accRow = masterData.find(r => r[0] === accId);
    const typeRow = typeData.find(r => r[0] === typeId);
    const methodRow = methodData.find(r => r[0] === methodId);

    const cash = parseFloat(document.getElementById('amt-cash').value) || 0;
    const trans = parseFloat(document.getElementById('amt-transfer').value) || 0;
    const card = parseFloat(document.getElementById('amt-card').value) || 0;

    const rowPayload = [
        document.getElementById('user-name').value,
        accId,
        typeId,
        methodId || "",
        accRow ? accRow[1] : "",
        typeRow ? typeRow[1] : "",
        methodRow ? methodRow[1] : "",
        cash,
        trans,
        card,
        (cash + trans + card) // 總計
    ];

    status.innerText = "傳輸中...";

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: '紀錄!A:A',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowPayload] },
        });
        status.innerText = "✅ 紀錄成功！";
        // 重設金額
        document.getElementById('amt-cash').value = 0;
        document.getElementById('amt-transfer').value = 0;
        document.getElementById('amt-card').value = 0;
    } catch (err) {
        status.innerText = "❌ 失敗: " + err.result.error.message;
    }
}