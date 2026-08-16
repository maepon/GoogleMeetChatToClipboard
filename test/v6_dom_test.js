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
        window.eval(contentJsCode + '; window.AppState = AppState; window.saveChat = saveChat; window.getRoomId = getRoomId; window.resetAppState = resetAppState; window.updateLogBackup = updateLogBackup; window.clearExitPendingState = clearExitPendingState; window.checkRoomChangeAndReset = checkRoomChangeAndReset;');
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

runTest('getChatText: att_002 実機DOMでのブロック単位ヘッダー抽出の完全一致検証', () => {
    const { document, ChatManager } = createEnvironment(att002DomHtml);
    const appState = { selfName: '' };
    const chatText = ChatManager.getChatText(appState, SELECTORS, document);

    const expectedText = [
        '12:37',
        '相手の送信1',
        '相手の送信2',
        '前川昌幸',
        '12:38',
        'じぶんの送信1',
        '自分の送信2',
        '12:40',
        '相手の送信3',
        '前川昌幸',
        '12:40',
        '自分の送信3',
        '12:41',
        'あいてのそうしん4',
        '相手の送信5'
    ].join('\n');

    assert.strictEqual(chatText, expectedText, '話者名・時刻がブロック毎に冒頭に1度だけ出力され、完全一致すること');
});

runTest('getChatText: フォーマット検証（話者あり・自分発言・空要素・単独発言）', () => {
    const { ChatManager } = createEnvironment('');

    // 1. 話者名ありの連続発言
    const dom1 = new JSDOM(`
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">テスト太郎</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">メッセージ1</div>
                    <div jsname="dTKtvb">メッセージ2</div>
                </div>
            </div>
        </body></html>
    `);
    const text1 = ChatManager.getChatText({ selfName: '自分' }, SELECTORS, dom1.window.document);
    assert.strictEqual(text1, 'テスト太郎\n12:00\nメッセージ1\nメッセージ2');

    // 2. 話者名なし、selfName あり（自分の連続発言）
    const dom2 = new JSDOM(`
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div jsname="biJjHb">12:05</div>
                    <div jsname="dTKtvb">自分の発言1</div>
                    <div jsname="dTKtvb">自分の発言2</div>
                </div>
            </div>
        </body></html>
    `);
    const text2 = ChatManager.getChatText({ selfName: '自分太郎' }, SELECTORS, dom2.window.document);
    assert.strictEqual(text2, '自分太郎\n12:05\n自分の発言1\n自分の発言2');

    // 3. 話者名なし、selfName なし
    const dom3 = new JSDOM(`
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div jsname="biJjHb">12:10</div>
                    <div jsname="dTKtvb">匿名発言1</div>
                    <div jsname="dTKtvb"></div>
                    <div jsname="dTKtvb">匿名発言2</div>
                </div>
            </div>
        </body></html>
    `);
    const text3 = ChatManager.getChatText({ selfName: '' }, SELECTORS, dom3.window.document);
    assert.strictEqual(text3, '12:10\n匿名発言1\n匿名発言2');

    // 4. 単独発言（従来形式維持）
    const dom4 = new JSDOM(`
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">花子</div>
                    <div jsname="biJjHb">12:15</div>
                    <div jsname="dTKtvb">単独メッセージ</div>
                </div>
            </div>
        </body></html>
    `);
    const text4 = ChatManager.getChatText({ selfName: '' }, SELECTORS, dom4.window.document);
    assert.strictEqual(text4, '花子\n12:15\n単独メッセージ');
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

runTest('removedMessageObserver: hsLqkc が存在しない退出後 DOM でも wasSaveTarget に基づき UI が挿入されること', () => {
    // 退出後 DOM (att_003 相当: hsLqkc なし)
    const { document, UIManager } = createEnvironment(`
        <html>
            <body>
                <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1></div>
            </body>
        </html>
    `);

    const AppState = {
        wasSaveTarget: true, // 会議中に対象ミーティングだったことを記憶
        pendingExitChatLogText: '自動バックアップされたチャットログ',
        exitedUIInserted: false
    };

    const removeMessageElement = document.querySelector('#target-removed');
    
    if (
        AppState.wasSaveTarget &&
        !removeMessageElement.hasAttribute('data-gmctc-processed') &&
        !document.querySelector(`#${IDS.chatLogTextArea}`) &&
        AppState.pendingExitChatLogText !== ''
    ) {
        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.pendingExitChatLogText, () => {}, document);
        assert.notStrictEqual(exitedUI, null, 'exitedUI が作成されること');
        removeMessageElement.after(exitedUI);
        removeMessageElement.setAttribute('data-gmctc-processed', 'true');
        AppState.exitedUIInserted = true;
    }

    assert.strictEqual(removeMessageElement.getAttribute('data-gmctc-processed'), 'true');
    assert.strictEqual(AppState.exitedUIInserted, true);
    assert.notStrictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, 'DOM 上にテキストエリアが挿入されていること');
});

runTest('content.js 実体: updateLogBackup() と saveChatLog() の pendingExit 相互作用検証', () => {
    const { window, getWrittenText, ChatManager } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');
    
    // updateLogBackup 関数の直接実行
    window.updateLogBackup();
    assert.strictEqual(window.AppState.wasSaveTarget, true);
    assert.ok(window.AppState.pendingExitChatLogText.length > 0, 'updateLogBackup() により pendingExitChatLogText にログが格納されること');
    assert.strictEqual(window.AppState.pendingExitRoomId, 'abc-defg-hij');

    // /landing 遷移 (resetAppState 呼び出し) で tmpChatLogText は消えるが pendingExitChatLogText は保護されること
    window.resetAppState('abc-defg-hij');
    assert.strictEqual(window.AppState.tmpChatLogText, '', 'tmpChatLogText は消去されること');
    assert.ok(window.AppState.pendingExitChatLogText.length > 0, 'pendingExitChatLogText は保護されて残ること');
    assert.strictEqual(window.AppState.wasSaveTarget, true, 'wasSaveTarget も保護されて残ること');

    // saveChatLog の呼び出しで pendingExitChatLogText がコピーされること
    ChatManager.saveChatLog(window.AppState);
    assert.strictEqual(getWrittenText(), window.AppState.pendingExitChatLogText, 'saveChatLog で pendingExitChatLogText がクリップボードにコピーされること');
});

runTest('content.js 実体: Room A -> /landing -> Room B 遷移時のログ混入防止検証 (実コード自動遷移)', () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');
    
    // Room A (abc-defg-hij) でログバックアップ
    window.updateLogBackup();
    assert.strictEqual(window.AppState.pendingExitRoomId, 'abc-defg-hij');
    assert.ok(window.AppState.pendingExitChatLogText.length > 0);

    // /landing への遷移 (Room ID = null) ➔ 退避ログが保護されて残る
    window.checkRoomChangeAndReset(null);
    assert.strictEqual(window.AppState.currentRoomId, null);
    assert.ok(window.AppState.pendingExitChatLogText.length > 0, '/landing 遷移時も Room A の退避ログが残ること');
    assert.strictEqual(window.AppState.wasSaveTarget, true);

    // 新しい Room B (xyz-uvwx-rst) への入室 ➔ checkRoomChangeAndReset により Room A の退避ログが自動クリアされること
    window.checkRoomChangeAndReset('xyz-uvwx-rst');
    assert.strictEqual(window.AppState.currentRoomId, 'xyz-uvwx-rst');
    assert.strictEqual(window.AppState.pendingExitChatLogText, '', '新 Room B 入室時に旧 Room A の退避ログが自動クリアされること');
    assert.strictEqual(window.AppState.wasSaveTarget, false, 'wasSaveTarget も自動リセットされること');
    assert.strictEqual(window.AppState.pendingExitRoomId, null);
});

runTest('content.js 実体: updateLogBackup(targetDoc) の PinP document 対応検証', () => {
    const { window } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    const pinpDom = new JSDOM(`
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">PinPのメッセージ</div>
                </div>
            </div>
        </body></html>
    `);

    // PinP 側の document を渡して updateLogBackup を呼び出し
    window.updateLogBackup(pinpDom.window.document);
    assert.strictEqual(window.AppState.wasSaveTarget, true, 'PinP document でも wasSaveTarget が true になること');
    assert.ok(window.AppState.pendingExitChatLogText.includes('PinPのメッセージ'), 'PinP 内のメッセージが pendingExitChatLogText にバックアップされること');
});

// ----------------------------------------------------
// テスト結果集計
// ----------------------------------------------------
console.log(`\n==== テスト実行完了: PASS: ${passCount}, FAIL: ${failCount} ====`);
if (failCount > 0) {
    process.exit(1);
}
