const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

// DOM Fixture の読み込み
const enableDomHtml = fs.readFileSync(path.join(__dirname, '../docs/v6/GoogleChatEnableDom.txt'), 'utf8');
const disableDomHtml = fs.readFileSync(path.join(__dirname, '../docs/v6/GoogleChatDisableDom.txt'), 'utf8');

// セレクター定義 (content.js と同等)
const SELECTORS = {
    exitButton: 'button[jsname="CQylAd"]',
    chatContainer: 'div[jsname="xySENc"][aria-live="polite"]',
    chatMessage: 'div.Ss4fHf[jsname="Ypafjf"]',
    messageText: 'div[jsname="dTKtvb"]',
    messageTime: 'div[jsname="biJjHb"]',
    messageSender: '.poVWob',
    chatTitle: 'div[jsname="uPuGNe"] [role="heading"]',
    chatMemberName: '.ASy21[title]',
    nonSaveTargetIndicator: 'div.hsLqkc',
    removedMessage: '.lAqQo .roSPhc[jsname="r4nke"]',
    unprocessedRemovedMessage: '.lAqQo .roSPhc[jsname="r4nke"]:not([data-gmctc-processed])'
};

const CONFIG = {
    TIMEOUTS: { CHAT_TITLE_CHECK: 500, MEMBER_NAME_CHECK: 300, PINP_ELEMENT_CHECK: 5000 },
    STYLES: {
        COPY_BUTTON: { backgroundColor: 'rgba(0, 0, 0, 0)', border: 'none', padding: '12px', cursor: 'pointer', borderRadius: '50%' },
        COPY_BUTTON_HOVER: 'rgba(0, 0, 0, 0.05)',
        COPY_BUTTON_NORMAL: 'rgba(0, 0, 0, 0)',
        TEXTAREA: { width: '300px', height: '180px' },
        COPY_ICON: { color: 'rgb(95, 99, 104)' }
    }
};

const IDS = {
    copyButton: 'GMCTC-copyButton',
    chatLogTextArea: 'GMCTC-onRemoveChatLogTextArea'
};

// ヘルパー: JSDOM 環境の作成とモジュールのロード
function createEnvironment(htmlContent, url = 'https://meet.google.com/abc-defg-hij') {
    const dom = new JSDOM(htmlContent, { url, runScripts: 'dangerously' });
    const { window } = dom;

    // モジュールスクリプトを読み込み
    const observerManagerCode = fs.readFileSync(path.join(__dirname, '../modules/ObserverManager.js'), 'utf8');
    const domUtilsCode = fs.readFileSync(path.join(__dirname, '../modules/DOMUtils.js'), 'utf8');
    const chatManagerCode = fs.readFileSync(path.join(__dirname, '../modules/ChatManager.js'), 'utf8');
    const uiManagerCode = fs.readFileSync(path.join(__dirname, '../modules/UIManager.js'), 'utf8');

    // chrome.i18n のモック
    window.chrome = {
        i18n: {
            getMessage: (key) => key
        }
    };

    window.eval(observerManagerCode);
    window.eval(domUtilsCode);
    window.eval(chatManagerCode);
    window.eval(uiManagerCode);

    return { window, document: window.document, ChatManager: window.ChatManager, UIManager: window.UIManager };
}

console.log('==== v6 DOM 統合ユニットテスト開始 ====\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`[FAIL] ${name}`);
        console.error(err);
        failCount++;
    }
}

// ----------------------------------------------------
// Test Case 1: isSaveTarget 判定テスト
// ----------------------------------------------------
runTest('isSaveTarget: GoogleChatDisableDom.txt (div.hsLqkc 存在) ➔ true', () => {
    const { document, ChatManager } = createEnvironment(disableDomHtml);
    assert.strictEqual(ChatManager.isSaveTarget(document, SELECTORS), true);
});

runTest('isSaveTarget: GoogleChatEnableDom.txt (div.hsLqkc 不在) ➔ false', () => {
    const { document, ChatManager } = createEnvironment(enableDomHtml);
    assert.strictEqual(ChatManager.isSaveTarget(document, SELECTORS), false);
});

runTest('isSaveTarget: PinP document / null / 空オブジェクト入力検証', () => {
    const { window, ChatManager } = createEnvironment(disableDomHtml);
    const pinpDom = new JSDOM('<html><body><div class="hsLqkc"></div></body></html>');
    
    assert.strictEqual(ChatManager.isSaveTarget(pinpDom.window.document, SELECTORS), true);
    assert.strictEqual(ChatManager.isSaveTarget(null, SELECTORS), false);
    assert.strictEqual(ChatManager.isSaveTarget(window.document, {}), false);
});

// ----------------------------------------------------
// Test Case 2: getChatText メッセージ抽出・フォーマット
// ----------------------------------------------------
runTest('getChatText: チャット非保存ミーティング (EnableDom) では空文字を返す', () => {
    const { document, ChatManager } = createEnvironment(enableDomHtml);
    const appState = { selfName: 'テスト太郎' };
    const chatText = ChatManager.getChatText(appState, SELECTORS, document);
    assert.strictEqual(chatText, '');
});

runTest('getChatText: チャット保存ミーティング (DisableDom) でのブロック解析・名前フォールバック', () => {
    const { document, ChatManager } = createEnvironment(disableDomHtml);
    const appState = { selfName: '自分の名前' };
    const chatText = ChatManager.getChatText(appState, SELECTORS, document);

    assert.ok(chatText.length > 0, 'チャットテキストが取得されること');
    // メッセージ本文が含まれること
    assert.ok(chatText.includes('相手からのチャット') || chatText.includes('自分のチャット'), '本文が含まれること');
    // 送信時刻が含まれること
    assert.ok(chatText.includes('1:29'), '時刻が含まれること');
});

// ----------------------------------------------------
// Test Case 3: checkAndCreateCopyButton ボタン生成・非生成
// ----------------------------------------------------
runTest('checkAndCreateCopyButton: 保存対象ミーティング (DisableDom) ➔ ボタンが生成される', () => {
    const { document, UIManager } = createEnvironment(disableDomHtml);
    UIManager.checkAndCreateCopyButton(CONFIG, SELECTORS, IDS, document);
    const button = document.querySelector(`#${IDS.copyButton}`);
    assert.notStrictEqual(button, null, 'コピーボタンが DOM に追加されること');
});

runTest('checkAndCreateCopyButton: 非保存対象ミーティング (EnableDom) ➔ ボタンが生成されない', () => {
    const { document, UIManager } = createEnvironment(enableDomHtml);
    UIManager.checkAndCreateCopyButton(CONFIG, SELECTORS, IDS, document);
    const button = document.querySelector(`#${IDS.copyButton}`);
    assert.strictEqual(button, null, 'コピーボタンが生成されないこと');
});

// ----------------------------------------------------
// Test Case 4: SPA Room 遷移と複数コンテナ並存ケース
// ----------------------------------------------------
runTest('SPA 遷移: Room ID 正規表現抽出と /landing 判定', () => {
    function getRoomId(pathname) {
        const match = pathname.match(/^\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})\/?$/i);
        return match ? match[1] : null;
    }

    assert.strictEqual(getRoomId('/abc-defg-hij'), 'abc-defg-hij');
    assert.strictEqual(getRoomId('/abc-defg-hij/'), 'abc-defg-hij');
    assert.strictEqual(getRoomId('/landing'), null);
    assert.strictEqual(getRoomId('/new'), null);
});

runTest('SPA 遷移: 旧・新コンテナ並存時の querySelectorAll.find による新コンテナ特定', () => {
    const { document } = createEnvironment(`
        <html>
            <body>
                <div class="hsLqkc"></div>
                <!-- 旧コンテナ (1番目) -->
                <div jsname="xySENc" aria-live="polite" id="old-container">
                    <div class="lAqQo"><div class="roSPhc" jsname="r4nke">旧退出要素</div></div>
                </div>
                <!-- 新コンテナ (2番目) -->
                <div jsname="xySENc" aria-live="polite" id="new-container">
                    <div class="lAqQo"><div class="roSPhc" jsname="r4nke">新退出要素</div></div>
                </div>
            </body>
        </html>
    `);

    const previousContainerElement = document.querySelector('#old-container');
    const containers = [...document.querySelectorAll(SELECTORS.chatContainer)];
    const currentContainer = containers.find(c => c !== previousContainerElement);

    assert.notStrictEqual(currentContainer, null, '新コンテナが正しく見つかること');
    assert.strictEqual(currentContainer.id, 'new-container', '2番目の新コンテナが選択されること');
});

runTest('SPA 遷移: 3つ以上のコンテナが並存する場合の動作', () => {
    const { document } = createEnvironment(`
        <html>
            <body>
                <div class="hsLqkc"></div>
                <div jsname="xySENc" aria-live="polite" id="container-1"></div>
                <div jsname="xySENc" aria-live="polite" id="container-2"></div>
                <div jsname="xySENc" aria-live="polite" id="container-3"></div>
            </body>
        </html>
    `);

    const previousContainerElement = document.querySelector('#container-1');
    const containers = [...document.querySelectorAll(SELECTORS.chatContainer)];
    const currentContainer = containers.find(c => c !== previousContainerElement);

    assert.strictEqual(currentContainer.id, 'container-2', '旧コンテナ(container-1)以外の最初のコンテナが選ばれること');
});

runTest('SPA 遷移: Room A ➔ /landing ➔ Room B のステートリセット連続検証', () => {
    const { document } = createEnvironment(disableDomHtml);
    
    let previousContainerElement = null;
    let chatContainerElement = document.querySelector(SELECTORS.chatContainer);
    let chatContainerRoomId = 'room-a';

    // /landing への遷移
    function resetAppState(prevRoomId) {
        if (chatContainerElement && chatContainerRoomId === prevRoomId) {
            chatContainerElement.querySelectorAll(SELECTORS.removedMessage).forEach(el => {
                el.setAttribute('data-gmctc-processed', 'true');
            });
        }
        previousContainerElement = chatContainerElement;
        chatContainerElement = null;
        chatContainerRoomId = null;
    }

    resetAppState('room-a');
    assert.strictEqual(chatContainerElement, null);
    assert.notStrictEqual(previousContainerElement, null);

    // Room B への到達
    const containers = [...document.querySelectorAll(SELECTORS.chatContainer)];
    const newContainer = containers.find(c => c !== previousContainerElement);
    // 元の DOM には 1 つしかコンテナがないので null
    assert.strictEqual(newContainer, undefined);
});

runTest('removedMessageObserver: 新コンテナ配下の removedMessage 判定と processed 付与', () => {
    const { document, ChatManager, UIManager } = createEnvironment(`
        <html>
            <body>
                <div class="hsLqkc"></div>
                <div jsname="xySENc" aria-live="polite" id="active-container">
                    <div class="lAqQo"><div class="roSPhc" jsname="r4nke" id="target-removed">退出済み要素</div></div>
                </div>
            </body>
        </html>
    `);

    const AppState = {
        currentRoomId: 'room-1',
        chatContainerElement: document.querySelector('#active-container'),
        chatContainerRoomId: 'room-1',
        chatOutputFlag: false,
        tmpChatLogText: 'チャットログ'
    };

    const removeMessageElement = document.querySelector('#target-removed');
    const activeContainer = (AppState.chatContainerRoomId === AppState.currentRoomId)
        ? AppState.chatContainerElement
        : null;

    assert.ok(activeContainer && activeContainer.contains(removeMessageElement), 'アクティブコンテナの子孫であること');

    if (AppState.chatOutputFlag === false) {
        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.tmpChatLogText, () => {}, document);
        assert.notStrictEqual(exitedUI, null, 'exitedUI が作成されること');
        removeMessageElement.after(exitedUI);
        removeMessageElement.setAttribute('data-gmctc-processed', 'true');
        AppState.chatOutputFlag = true;
    }

    assert.strictEqual(removeMessageElement.getAttribute('data-gmctc-processed'), 'true');
    assert.strictEqual(AppState.chatOutputFlag, true);
});

runTest('コンテナ削除・再生成: 旧コンテナが完全に削除され新コンテナが生成された場合', () => {
    const { document } = createEnvironment(`
        <html>
            <body>
                <div class="hsLqkc"></div>
                <div jsname="xySENc" aria-live="polite" id="container-old"></div>
            </body>
        </html>
    `);

    let previousContainerElement = document.querySelector('#container-old');
    
    // 旧コンテナを DOM から削除
    previousContainerElement.remove();

    // 新コンテナを DOM に生成
    const newContainerEl = document.createElement('div');
    newContainerEl.setAttribute('jsname', 'xySENc');
    newContainerEl.setAttribute('aria-live', 'polite');
    newContainerEl.id = 'container-new';
    document.body.appendChild(newContainerEl);

    const containers = [...document.querySelectorAll(SELECTORS.chatContainer)];
    const currentContainer = containers.find(c => c !== previousContainerElement);

    assert.notStrictEqual(currentContainer, null, '新コンテナが発見されること');
    assert.strictEqual(currentContainer.id, 'container-new', '新しいコンテナが正しく取得されること');
});

// ----------------------------------------------------
// テスト結果集計
// ----------------------------------------------------
console.log(`\n==== テスト実行完了: PASS: ${passCount}, FAIL: ${failCount} ====`);
if (failCount > 0) {
    process.exit(1);
}
