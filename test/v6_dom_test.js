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

// ヘルパー: JSDOM 環境の作成と content.js を含む全モジュールのロード
function createEnvironment(htmlContent, url = 'https://meet.google.com/abc-defg-hij', loadContentJs = true) {
    const dom = new JSDOM(htmlContent, { url, runScripts: 'dangerously' });
    const { window } = dom;

    // ブラウザ API のモック
    window.chrome = {
        i18n: {
            getMessage: (key) => key
        }
    };

    window.documentPictureInPicture = {
        addEventListener: () => {},
        window: null
    };

    let writtenText = '';
    window.navigator.clipboard = {
        writeText: (text) => {
            writtenText = text;
            return Promise.resolve();
        },
        getWrittenText: () => writtenText
    };

    // モジュールスクリプトを読み込み
    const observerManagerCode = fs.readFileSync(path.join(__dirname, '../modules/ObserverManager.js'), 'utf8');
    const domUtilsCode = fs.readFileSync(path.join(__dirname, '../modules/DOMUtils.js'), 'utf8');
    const chatManagerCode = fs.readFileSync(path.join(__dirname, '../modules/ChatManager.js'), 'utf8');
    const uiManagerCode = fs.readFileSync(path.join(__dirname, '../modules/UIManager.js'), 'utf8');
    const contentJsCode = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

    window.eval(observerManagerCode);
    window.eval(domUtilsCode);
    window.eval(chatManagerCode);
    window.eval(uiManagerCode);

    if (loadContentJs) {
        window.eval(contentJsCode + '; window.AppState = AppState; window.saveChat = saveChat; window.getRoomId = getRoomId; window.resetAppState = resetAppState;');
    }

    return { 
        window, 
        document: window.document, 
        ChatManager: window.ChatManager, 
        UIManager: window.UIManager,
        getWrittenText: () => writtenText
    };
}

console.log('==== v6 DOM & content.js 実体統合ユニットテスト開始 ====\n');

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

const att002DomHtml = fs.readFileSync(path.join(__dirname, '../docs/v6/test_result/att_002/dom.txt'), 'utf8');

runTest('getChatText: 同一メンバーの連続送信メッセージ (att_002) が順序通り漏れなく重複なく抽出されること', () => {
    const { document, ChatManager } = createEnvironment(att002DomHtml);
    const appState = { selfName: '前川昌幸' };
    const chatText = ChatManager.getChatText(appState, SELECTORS, document);

    const expectedMessages = [
        '相手の送信1',
        '相手の送信2',
        'じぶんの送信1',
        '自分の送信2',
        '相手の送信3',
        '自分の送信3',
        'あいてのそうしん4',
        '相手の送信5'
    ];

    let lastIndex = -1;
    expectedMessages.forEach(msg => {
        const index = chatText.indexOf(msg);
        assert.ok(index > lastIndex, `メッセージ "${msg}" が正しい順序（index: ${index} > ${lastIndex}）で抽出されていること`);
        lastIndex = index;
    });

    expectedMessages.forEach(msg => {
        const occurrences = chatText.split(msg).length - 1;
        assert.strictEqual(occurrences, 1, `メッセージ "${msg}" が重複なく1回だけ抽出されていること`);
    });
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
// Test Case 4: content.js 実体の関数・イベントの実動作検証
// ----------------------------------------------------
runTest('content.js 実体: saveChat() ガードとクリップボード書き込み検証', () => {
    const { window, getWrittenText } = createEnvironment(disableDomHtml);
    window.saveChat();
    assert.ok(getWrittenText().length > 0, 'クリップボードにテキストが書き込まれること');
});

runTest('content.js 実体: 非保存対象 (EnableDom) での saveChat() ガード検証', () => {
    const { window, getWrittenText } = createEnvironment(enableDomHtml);
    window.saveChat();
    assert.strictEqual(getWrittenText(), '', '保存対象外ではクリップボードに書き込まれないこと');
});

runTest('content.js 実体: getRoomId() 正規表現抽出と /landing /new 判定検証', () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(window.getRoomId(), 'abc-defg-hij');

    const landingEnv = createEnvironment(disableDomHtml, 'https://meet.google.com/landing');
    assert.strictEqual(landingEnv.window.getRoomId(), null);
});

runTest('content.js 実体: AppState.currentRoomId と resetAppState() の統合実体動作検証', () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(window.AppState.currentRoomId, 'abc-defg-hij');

    window.AppState.chatContainerElement = window.document.querySelector(SELECTORS.chatContainer);
    window.AppState.chatContainerRoomId = 'abc-defg-hij';

    window.resetAppState('abc-defg-hij');
    assert.strictEqual(window.AppState.chatContainerElement, null);
    assert.strictEqual(window.AppState.chatContainerRoomId, null);
    assert.notStrictEqual(window.AppState.previousContainerElement, null);
});

// ----------------------------------------------------
// Test Case 5: SPA 遷移および複数コンテナ並存ケース
// ----------------------------------------------------
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

runTest('removedMessageObserver: 退出済み画面での UI 挿入と processed 付与', () => {
    const { document, UIManager } = createEnvironment(`
        <html>
            <body>
                <div class="hsLqkc"></div>
                <div class="lAqQo"><div class="roSPhc" jsname="r4nke" id="target-removed">退出済み要素</div></div>
            </body>
        </html>
    `);

    const AppState = {
        currentRoomId: 'room-1',
        exitedUIInserted: false,
        tmpChatLogText: 'チャットログ'
    };

    const removeMessageElement = document.querySelector('#target-removed');
    
    if (
        !removeMessageElement.hasAttribute('data-gmctc-processed') &&
        !document.querySelector(`#${IDS.chatLogTextArea}`) &&
        AppState.tmpChatLogText !== ''
    ) {
        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.tmpChatLogText, () => {}, document);
        assert.notStrictEqual(exitedUI, null, 'exitedUI が作成されること');
        removeMessageElement.after(exitedUI);
        removeMessageElement.setAttribute('data-gmctc-processed', 'true');
        AppState.exitedUIInserted = true;
    }

    assert.strictEqual(removeMessageElement.getAttribute('data-gmctc-processed'), 'true');
    assert.strictEqual(AppState.exitedUIInserted, true);
});

// ----------------------------------------------------
// テスト結果集計
// ----------------------------------------------------
console.log(`\n==== テスト実行完了: PASS: ${passCount}, FAIL: ${failCount} ====`);
if (failCount > 0) {
    process.exit(1);
}
