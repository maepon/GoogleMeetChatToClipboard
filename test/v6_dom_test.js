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

const createdDoms = [];

// ヘルパー: JSDOM 環境の作成と content.js を含む全モジュールのロード
function createEnvironment(htmlContent, url = 'https://meet.google.com/abc-defg-hij', loadContentJs = true) {
    const dom = new JSDOM(htmlContent, { url, runScripts: 'dangerously' });
    createdDoms.push(dom);
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

    window.document.execCommand = (cmd) => {
        if (cmd === 'copy') {
            const tempTextArea = window.document.querySelector('textarea[style*="-999999px"]');
            if (tempTextArea) {
                writtenText = tempTextArea.value;
            }
            return true;
        }
        return false;
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
        window.eval(contentJsCode + '; window.AppState = AppState; window.saveChat = saveChat; window.saveChatLog = saveChatLog; window.saveChatFromPinP = saveChatFromPinP; window.saveChatFromPinPCopy = saveChatFromPinPCopy; window.getRoomId = getRoomId; window.resetAppState = resetAppState; window.updateLogBackup = updateLogBackup; window.clearExitPendingState = clearExitPendingState; window.checkRoomChangeAndReset = checkRoomChangeAndReset; window.checkAndCreateExitedUI = checkAndCreateExitedUI;');
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

async function runTest(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            await result;
        }
        console.log(`[PASS] ${name}`);
        passCount++;
    } catch (err) {
        console.error(`[FAIL] ${name}`);
        console.error(err);
        failCount++;
    }
}

(async () => {

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

function dispatchBeforeUnload(window, captureReturnValue = false) {
    const event = new window.Event('beforeunload', { cancelable: true });
    let returnValueSet = false;
    let returnValue = undefined;

    if (captureReturnValue) {
        Object.defineProperty(event, 'returnValue', {
            configurable: true,
            get: () => returnValue,
            set: value => {
                returnValueSet = true;
                returnValue = value;
            }
        });
    }

    window.dispatchEvent(event);
    return { event, returnValueSet, returnValue };
}

runTest('beforeunload: 初回イベントで退避後にキャンセル要求を設定する', () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(window.AppState.wasSaveTarget, true, '初回イベントで保存対象が退避されること');
    assert.strictEqual(window.AppState.pendingExitRoomId, 'abc-defg-hij');
    assert.notStrictEqual(window.AppState.pendingExitChatLogText, '');
    assert.strictEqual(result.event.defaultPrevented, true);
    assert.strictEqual(result.returnValueSet, true);
    assert.strictEqual(result.returnValue, '');
});

runTest('beforeunload: live div.hsLqkc 消失後も退避状態でキャンセル要求する', () => {
    const { window, document } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.updateLogBackup();
    document.querySelector(SELECTORS.nonSaveTargetIndicator).remove();

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(result.event.defaultPrevented, true);
    assert.strictEqual(result.returnValueSet, true);
    assert.strictEqual(result.returnValue, '');
});

runTest('beforeunload: live本文が空でも既存退避ログでキャンセル要求する', () => {
    const html = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite"></div>
        </body></html>
    `;
    const { window } = createEnvironment(html, 'https://meet.google.com/abc-defg-hij');
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.pendingExitChatLogText = '退避ログ';

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(result.event.defaultPrevented, true);
    assert.strictEqual(result.returnValueSet, true);
    assert.strictEqual(result.returnValue, '');
});

runTest('beforeunload: 保存対象外ミーティングでは要求しない', () => {
    const { window } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(result.event.defaultPrevented, false);
    assert.strictEqual(result.returnValueSet, false);
});

runTest('beforeunload: 退避ログが空の場合は要求しない', () => {
    const html = '<html><body><div class="hsLqkc"></div><div jsname="xySENc" aria-live="polite"></div></body></html>';
    const { window } = createEnvironment(html, 'https://meet.google.com/abc-defg-hij');
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.pendingExitChatLogText = '';

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(result.event.defaultPrevented, false);
    assert.strictEqual(result.returnValueSet, false);
});

runTest('beforeunload: stale Room の退避状態を別 Room の live DOM で上書きせず要求しない', () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/xyz-uvwx-rst');
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.pendingExitChatLogText = 'Room A の退避ログ';

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(window.AppState.pendingExitRoomId, 'abc-defg-hij');
    assert.strictEqual(window.AppState.pendingExitChatLogText, 'Room A の退避ログ');
    assert.strictEqual(result.event.defaultPrevented, false);
    assert.strictEqual(result.returnValueSet, false);
});

runTest('beforeunload: /landing では旧 Room の退避状態で要求しない', () => {
    const { window } = createEnvironment(enableDomHtml, 'https://meet.google.com/landing');
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.pendingExitChatLogText = 'Room A の退避ログ';

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(result.event.defaultPrevented, false);
    assert.strictEqual(result.returnValueSet, false);
});

runTest('beforeunload: pendingExitRoomId 欠落時は要求しない', () => {
    const { window } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitRoomId = null;
    window.AppState.pendingExitChatLogText = '退避ログ';

    const result = dispatchBeforeUnload(window, true);

    assert.strictEqual(result.event.defaultPrevented, false);
    assert.strictEqual(result.returnValueSet, false);
});

runTest('content.js 実体: checkAndCreateExitedUI() の初回・再実行時における二重挿入防止検証', () => {
    const exitedDomHtml = `
        <html><body>
            <div class="lAqQo">
                <h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/landing');
    
    // 状態をアクティブ会議からの退避ログ保持状態にする
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避されたログ';

    // 1. 初回直接チェック（スクリプト評価時・既存 DOM）の呼び出し
    window.checkAndCreateExitedUI();
    const textAreaList1 = document.querySelectorAll(`#${IDS.chatLogTextArea}`);
    assert.strictEqual(textAreaList1.length, 1, '初回直接チェックによりテキストエリアが挿入されること');

    // 2. interval 連動および多重呼び出し（二重生成防止）の検証
    window.checkAndCreateExitedUI();
    window.checkAndCreateExitedUI();
    const textAreaList2 = document.querySelectorAll(`#${IDS.chatLogTextArea}`);
    assert.strictEqual(textAreaList2.length, 1, '複数回実行してもテキストエリアが二重挿入されないこと');
});

runTest('content.js 実体: pendingExitChatLogText 未設定時の誤属性付与防止と遅延挿入検証', () => {
    const exitedDomHtml = `
        <html><body>
            <div class="lAqQo">
                <h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/landing');
    
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = ''; // まだログが空の状態

    // ログが空の状態で checkAndCreateExitedUI が先行発火
    window.checkAndCreateExitedUI();
    const removeMsgEl = document.querySelector('#target-removed');
    assert.strictEqual(removeMsgEl.hasAttribute('data-gmctc-processed'), false, 'ログが空の時点では data-gmctc-processed 属性が付与されないこと');

    // その後ログがバックアップされた状態で再度 checkAndCreateExitedUI が発火
    window.AppState.pendingExitChatLogText = '遅延バックアップログ';
    window.checkAndCreateExitedUI();
    assert.strictEqual(removeMsgEl.hasAttribute('data-gmctc-processed'), true, 'ログ設定後に正しく属性が付与されること');
    assert.notStrictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, 'ログ設定後にテキストエリアが挿入されること');
});

runTest('content.js 実体: コピー成功済みの場合は退出後 textarea を表示しないこと', () => {
    const exitedDomHtml = `
        <html><body>
            <div class="lAqQo">
                <h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/landing');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = 'コピー済みログ';
    window.AppState.autoCopySucceeded = true;

    window.checkAndCreateExitedUI();

    const removeMsgEl = document.querySelector('#target-removed');
    assert.strictEqual(removeMsgEl.getAttribute('data-gmctc-processed'), 'true', 'コピー成功済みの退出要素は処理済みになること');
    assert.strictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, 'コピー成功済みの場合はテキストエリアが挿入されないこと');
    assert.strictEqual(window.AppState.exitedUIInserted, false, 'UI 挿入済みフラグは立たないこと');
});

runTest('content.js 実体: clearExitPendingState() で全コピーフラグがリセットされること', () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = 'コピー済みログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.exitedUIInserted = true;
    window.AppState.autoCopySucceeded = true;
    window.AppState.fallbackCopySucceeded = true;
    window.AppState.copyInProgress = true;
    window.AppState.copiedSuccessfully = true;

    window.clearExitPendingState();

    assert.strictEqual(window.AppState.wasSaveTarget, false);
    assert.strictEqual(window.AppState.pendingExitChatLogText, '');
    assert.strictEqual(window.AppState.pendingExitRoomId, null);
    assert.strictEqual(window.AppState.exitedUIInserted, false);
    assert.strictEqual(window.AppState.autoCopySucceeded, false);
    assert.strictEqual(window.AppState.fallbackCopySucceeded, false);
    assert.strictEqual(window.AppState.copyInProgress, false);
    assert.strictEqual(window.AppState.copiedSuccessfully, false);
});

// ----------------------------------------------------
// Test Case 6: コピー状態管理・非同期競合制御・API未提供フォールバック (追加検証)
// ----------------------------------------------------
await runTest('競合制御・正常系: 自動コピー Promise 成功後に checkAndCreateExitedUI() を実行して textarea が生成されないこと', async () => {
    const exitedDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">メッセージ</div>
                </div>
            </div>
            <div class="lAqQo">
                <h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/abc-defg-hij');

    // コピー処理実行
    await window.saveChat();

    assert.strictEqual(window.AppState.autoCopySucceeded, true, 'autoCopySucceeded が true になること');
    assert.strictEqual(window.AppState.copyInProgress, false, 'copyInProgress が false に戻ること');

    // 退出後 UI チェック実行
    window.checkAndCreateExitedUI();

    const removeMsgEl = document.querySelector('#target-removed');
    assert.strictEqual(removeMsgEl.getAttribute('data-gmctc-processed'), 'true', '退出要素が処理済みになること');
    assert.strictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, 'textarea は生成されないこと');
});

await runTest('状態リセット: 1回目のコピー成功後、2回目の自動コピーが失敗した場合は次回 textarea が生成されること', async () => {
    const meetDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">1回目のメッセージ</div>
                </div>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(meetDomHtml, 'https://meet.google.com/abc-defg-hij');

    // 1回目: 正常コピー成功
    await window.saveChat();
    assert.strictEqual(window.AppState.autoCopySucceeded, true, '1回目は成功');
    assert.strictEqual(window.AppState.copiedSuccessfully, true);

    // 2回目: クリップボード API を失敗するようにモックし、execCommand も失敗させる
    window.navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard error'));
    window.document.execCommand = () => false;

    // 退出後 DOM 要素を追加
    const exitWrapper = document.createElement('div');
    exitWrapper.className = 'lAqQo';
    exitWrapper.innerHTML = '<h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>';
    document.body.appendChild(exitWrapper);

    // 2回目の saveChat() を実行（自動コピー失敗）
    await window.saveChat();
    assert.strictEqual(window.AppState.autoCopySucceeded, false, '2回目の失敗により autoCopySucceeded は false であること');
    assert.strictEqual(window.AppState.copiedSuccessfully, false, 'copiedSuccessfully も false にリセットされること');
    assert.strictEqual(window.AppState.copyInProgress, false);

    // checkAndCreateExitedUI() を実行
    window.checkAndCreateExitedUI();

    // 失敗したためフォールバック textarea が生成されること
    assert.notStrictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, '2回目失敗時はフォールバック textarea が生成されること');
});

await runTest('非同期競合制御: コピー Promise が保留中は textarea を生成せず、失敗確定後に生成されること', async () => {
    const exitedDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">保留テストメッセージ</div>
                </div>
            </div>
            <div class="lAqQo">
                <h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/abc-defg-hij');

    let rejectClipboardPromise;
    window.navigator.clipboard.writeText = () => new Promise((resolve, reject) => {
        rejectClipboardPromise = reject;
    });
    window.document.execCommand = () => false;

    // saveChat を開始（Promise は保留中）
    window.saveChat();

    assert.strictEqual(window.AppState.copyInProgress, true, 'コピー処理中は copyInProgress が true であること');

    // Promise 保留中に checkAndCreateExitedUI() が発火した場合
    window.checkAndCreateExitedUI();
    const removeMsgEl = document.querySelector('#target-removed');
    assert.strictEqual(removeMsgEl.hasAttribute('data-gmctc-processed'), false, 'Promise 保留中は data-gmctc-processed が付与されないこと');
    assert.strictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, 'Promise 保留中は textarea が生成されないこと');

    // Promise を reject して失敗を確定させる
    rejectClipboardPromise(new Error('Permission denied'));

    // microtask の完了を待機
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.strictEqual(window.AppState.copyInProgress, false, '失敗確定後に copyInProgress が false になること');
    assert.strictEqual(window.AppState.autoCopySucceeded, false, 'autoCopySucceeded は false のまま');

    // 失敗確定後に textarea が生成されること
    assert.notStrictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, '失敗確定後に textarea が生成されること');
    assert.strictEqual(removeMsgEl.getAttribute('data-gmctc-processed'), 'true', '退出要素が処理済みになること');
});

await runTest('API 未提供時: navigator.clipboard が未定義の環境で例外なく execCommand にフォールバックすること', async () => {
    const exitedDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">API未提供テスト</div>
                </div>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/abc-defg-hij');

    // navigator.clipboard を未定義にする
    delete window.navigator.clipboard;
    window.navigator.clipboard = undefined;

    let execCommandCalled = false;
    document.execCommand = (cmd) => {
        if (cmd === 'copy') {
            execCommandCalled = true;
            return true;
        }
        return false;
    };

    // saveChat 実行（例外が発生せず完了すること）
    await window.saveChat();

    assert.strictEqual(execCommandCalled, true, 'execCommand("copy") が呼び出されること');
    assert.strictEqual(window.AppState.autoCopySucceeded, true, 'execCommand 成功により autoCopySucceeded が true になること');
    assert.strictEqual(window.AppState.copyInProgress, false, 'copyInProgress が false になること');
});

await runTest('状態分離: saveChatLog() の手動コピーでは autoCopySucceeded を変更せず fallbackCopySucceeded のみを更新すること', async () => {
    const { window, ChatManager } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.autoCopySucceeded = false;
    window.AppState.fallbackCopySucceeded = false;
    window.AppState.pendingExitChatLogText = '退避ログテキスト';

    // 手動コピーを実行
    await ChatManager.saveChatLog(window.AppState);

    assert.strictEqual(window.AppState.autoCopySucceeded, false, 'autoCopySucceeded は false のままであること');
    assert.strictEqual(window.AppState.fallbackCopySucceeded, true, 'fallbackCopySucceeded が true になること');
});

await runTest('PinP コピー状態分離: saveChatFromPinPCopy は手動コピー、saveChatFromPinP は退出自動コピーとして扱うこと', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');
    const pinpDom = new JSDOM(`
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">PinP送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">PinPメッセージ</div>
                </div>
            </div>
        </body></html>
    `);

    window.documentPictureInPicture = {
        window: pinpDom.window
    };

    // 1回目コピー
    window.saveChatFromPinPCopy();
    assert.strictEqual(window.AppState.autoCopySucceeded, false);
    assert.strictEqual(window.AppState.fallbackCopySucceeded, true);
    assert.strictEqual(window.AppState.copyInProgress, false);

    // 2回目の saveChatFromPinP で開始時に copyInProgress が true になり、完了後に false になること
    window.saveChatFromPinP();
    assert.strictEqual(window.AppState.copyInProgress, true, 'setTimeout 待機中は copyInProgress が true であること');

    // 100ms + 非同期完了待機
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.strictEqual(window.AppState.copyInProgress, false, '完了後は copyInProgress が false になること');
    assert.strictEqual(window.AppState.autoCopySucceeded, true, 'PinP からのコピー成功で autoCopySucceeded が true であること');
});

await runTest('API 未提供時: navigator.clipboard は存在するが writeText が未定義の場合に execCommand にフォールバックすること', async () => {
    const exitedDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">writeText未定義テスト</div>
                </div>
            </div>
        </body></html>
    `;
    const { window } = createEnvironment(exitedDomHtml, 'https://meet.google.com/abc-defg-hij');

    // clipboard オブジェクトはあるが writeText が未定義
    window.navigator.clipboard = {};

    let execCommandCalled = false;
    window.document.execCommand = (cmd) => {
        if (cmd === 'copy') {
            execCommandCalled = true;
            return true;
        }
        return false;
    };

    await window.saveChat();

    assert.strictEqual(execCommandCalled, true, 'execCommand("copy") が呼び出されること');
    assert.strictEqual(window.AppState.autoCopySucceeded, true, 'execCommand 成功により autoCopySucceeded が true になること');
    assert.strictEqual(window.AppState.copyInProgress, false);
});

await runTest('同期例外発生時: writeText が同期的に例外をスローした場合に copyInProgress が解除され execCommand にフォールバックすること', async () => {
    const exitedDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">送信者</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">同期例外テスト</div>
                </div>
            </div>
            <div class="lAqQo">
                <h1 class="roSPhc" jsname="r4nke" id="target-removed">ミーティングから退出しました</h1>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitedDomHtml, 'https://meet.google.com/abc-defg-hij');

    // writeText が同期例外をスローするモック
    window.navigator.clipboard.writeText = () => {
        throw new Error('Sync error: NotAllowedError');
    };

    let execCommandCalled = false;
    window.document.execCommand = (cmd) => {
        if (cmd === 'copy') {
            execCommandCalled = true;
            return true;
        }
        return false;
    };

    await window.saveChat();

    assert.strictEqual(execCommandCalled, true, '同期例外時にも execCommand("copy") が呼び出されること');
    assert.strictEqual(window.AppState.copyInProgress, false, '同期例外発生後も copyInProgress が false に戻ること');
    assert.strictEqual(window.AppState.autoCopySucceeded, true, 'execCommand 成功により autoCopySucceeded が true になること');

    // UI チェックで textarea が生成されないことを確認（execCommand が成功したため）
    window.checkAndCreateExitedUI();
    const removeMsgEl = document.querySelector('#target-removed');
    assert.strictEqual(removeMsgEl.getAttribute('data-gmctc-processed'), 'true');
    assert.strictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null);
});

await runTest('beforeunload (1): 初回 unload で保存対象 DOM から退避しキャンセル要求が設定されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // 事前に退避状態を設定しない
    assert.strictEqual(window.AppState.wasSaveTarget, false);
    assert.strictEqual(window.AppState.pendingExitChatLogText, '');

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(window.AppState.wasSaveTarget, true, '初回 unload で wasSaveTarget が true になること');
    assert.notStrictEqual(window.AppState.pendingExitChatLogText, '', '初回 unload で pendingExitChatLogText が記録されること');
    assert.strictEqual(event.defaultPrevented, true, 'event.preventDefault() が呼ばれ defaultPrevented が true であること');
});

await runTest('beforeunload (2): live DOM から div.hsLqkc が消失していても退避状態と Room 一致でキャンセル要求が設定されること (原因1の検証)', async () => {
    const { window, document } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // 事前状態
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '事前退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    // div.hsLqkc を DOM から削除
    const indicator = document.querySelector('div.hsLqkc');
    if (indicator) indicator.remove();

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'live DOM 消失時でも defaultPrevented が true になること');
});

await runTest('beforeunload (3): live 本文が空でも既存の退避ログと Room 一致でキャンセル要求が設定されること (原因2の検証)', async () => {
    // div.hsLqkc はあるがチャットコンテナが空の DOM
    const emptyChatHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div jsname="xySENc" aria-live="polite"></div>
        </body></html>
    `;
    const { window } = createEnvironment(emptyChatHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '事前退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'live 本文が空でも退避ログがあれば defaultPrevented が true になること');
});

await runTest('beforeunload (4): 非保存対象ミーティングではキャンセル要求が設定されないこと', async () => {
    const { window } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');

    assert.strictEqual(window.AppState.wasSaveTarget, false);

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '非保存対象では defaultPrevented が false であること');
});

await runTest('beforeunload (5): 退避ログが空の場合はキャンセル要求が設定されないこと', async () => {
    const emptyHtml = `<html><body><div class="hsLqkc"></div></body></html>`;
    const { window } = createEnvironment(emptyHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'ログ空時は defaultPrevented が false であること');
});

await runTest('beforeunload (6): Room ID が不一致の場合はキャンセル要求が設定されないこと (stale Room 抑止)', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/new-room-id');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '旧Roomのログ';
    window.AppState.pendingExitRoomId = 'old-room-id'; // 不一致

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'Room 不一致時は defaultPrevented が false であること');
});

await runTest('beforeunload (7): SPA 遷移直後 (/landing) で live getRoomId() が null の場合はキャンセル要求が設定されないこと', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/landing');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '旧Roomのログ';
    window.AppState.pendingExitRoomId = 'old-room-id';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '/landing 画面では defaultPrevented が false であること');
});

await runTest('beforeunload (8): pendingExitRoomId が null の場合はキャンセル要求が設定されないこと', async () => {
    const { window, document } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // DOM から div.hsLqkc を削除して live DOM からの Room ID 自動再補完を抑止
    const indicator = document.querySelector('div.hsLqkc');
    if (indicator) indicator.remove();

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = null; // null

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'pendingExitRoomId が null の場合は defaultPrevented が false であること');
});

// ----------------------------------------------------
// Phase 2: 退出後画面および遷移時における beforeunload 抑止テスト
// ----------------------------------------------------

await runTest('Phase 2 (1): autoCopySucceeded === true による救出完了時は beforeunload ダイアログ要求が抑止されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.autoCopySucceeded = true;
    window.AppState.copiedSuccessfully = false;
    window.AppState.postExitCompleted = false;
    window.AppState.exitedUIInserted = false;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'autoCopySucceeded === true 時はクリップボード救出完了のため defaultPrevented が false であること');
});

await runTest('Phase 2 (2): 会議中コピー負のテスト - copiedSuccessfully === true 単独でも会議中ダイアログ要求が維持されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.autoCopySucceeded = false;
    window.AppState.copiedSuccessfully = true;
    window.AppState.postExitCompleted = false;
    window.AppState.exitedUIInserted = false;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'copiedSuccessfully 単独でも会議中離脱時は defaultPrevented が true であること');
});

await runTest('Phase 2 (3): autoCopySucceeded === true と copiedSuccessfully === true の併用時もダイアログが抑止されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.autoCopySucceeded = true;
    window.AppState.copiedSuccessfully = true;
    window.AppState.postExitCompleted = false;
    window.AppState.exitedUIInserted = false;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'autoCopySucceeded === true であればダイアログが抑止されること');
});

await runTest('Phase 2 (4): キャンセル後再リロード - 同一会議室内での 2 回目の beforeunload でも要求が維持されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    // 1 回目
    const event1 = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event1);
    assert.strictEqual(event1.defaultPrevented, true, '1回目のリロードでダイアログ要求されること');

    // 2 回目（キャンセル後に再度リロード）
    const event2 = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event2);
    assert.strictEqual(event2.defaultPrevented, true, 'キャンセル後の2回目リロードでもダイアログ要求されること');
});

await runTest('Phase 2 (5): 正常退出後 - checkAndCreateExitedUI で自動コピー成功処理済み化後にダイアログ要求が抑止されること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.autoCopySucceeded = true;

    // checkAndCreateExitedUI を実行して退出要素を処理済みにし postExitCompleted を設定
    window.checkAndCreateExitedUI();

    const exitEl = document.querySelector('.lAqQo .roSPhc[jsname="r4nke"]');
    assert.strictEqual(exitEl.getAttribute('data-gmctc-processed'), 'true', '退出要素に processed 属性が付与されること');
    assert.strictEqual(window.AppState.postExitCompleted, true, 'postExitCompleted が true になること');
    assert.strictEqual(window.AppState.exitedUIInserted, false, 'textarea は挿入されないこと');

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '正常退出後は beforeunload ダイアログが抑止されること');
});

await runTest('Phase 2 (6): リロード過渡期の未処理退出要素存在時 - exitButtonClicked === false であればダイアログ要求されること', async () => {
    const unprocessedHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window } = createEnvironment(unprocessedHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.exitButtonClicked = false;
    window.AppState.postExitCompleted = false;
    window.AppState.exitedUIInserted = false;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'リロード過渡期は exitButtonClicked === false のため defaultPrevented が true であること');
});

await runTest('Phase 2 (7): 正常退出後遷移 - exitButtonClicked === true かつ exitedUIInserted === true でダイアログ要求が抑止されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.exitButtonClicked = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.postExitCompleted = true;
    window.AppState.exitedUIInserted = true;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '正常退出後は defaultPrevented が false であること');
});

await runTest('Phase 2 (8): 退出ボタン押下後の textarea 表示 - exitButtonClicked === true かつ exitedUIInserted === true でダイアログ要求が抑止されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.exitButtonClicked = true;
    window.AppState.pendingExitChatLogText = '退避ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.postExitCompleted = false;
    window.AppState.exitedUIInserted = true;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '正常退出フローでは defaultPrevented が false であること');
});

await runTest('Phase 2 (9): 旧 Room 処理済み要素残留時 - 新 Room の会議中ダイアログ要求を誤抑止しないこと', async () => {
    const staleDomHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke" data-gmctc-processed="true">旧Roomの退出要素</h1></div>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">新ユーザー</div>
                    <div jsname="biJjHb">12:00</div>
                    <div jsname="dTKtvb">新Roomのチャット</div>
                </div>
            </div>
        </body></html>
    `;
    const { window } = createEnvironment(staleDomHtml, 'https://meet.google.com/xyz-uvwx-rst');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '新Roomの退避ログ';
    window.AppState.pendingExitRoomId = 'xyz-uvwx-rst';
    window.AppState.postExitCompleted = false;
    window.AppState.exitedUIInserted = false;

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, '旧Room処理済み要素があっても新Roomの会議中は defaultPrevented が true であること');
});

await runTest('Phase 2 (10): 同一 Room 再参加時 - /landing 経由で再入室時に旧セッション状態がリセットされ会議中ダイアログが維持されること', async () => {
    const { window } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // 1. セッション1: Room A を正常退出
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = 'セッション1のログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.postExitCompleted = true;

    // 2. /landing へ遷移
    window.checkRoomChangeAndReset(null);
    assert.strictEqual(window.AppState.currentRoomId, null, '/landing 画面へ遷移');

    // 3. 同一 Room A へ再入室（新規セッション開始）
    window.checkRoomChangeAndReset('abc-defg-hij');
    assert.strictEqual(window.AppState.currentRoomId, 'abc-defg-hij', 'Room A へ再入室');
    assert.strictEqual(window.AppState.postExitCompleted, false, '再入室により postExitCompleted が false にリセットされること');
    assert.strictEqual(window.AppState.pendingExitChatLogText, '', '旧セッションログがリセットされること');

    // 4. 新セッションでの会議中チャット開始
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = 'セッション2の新規ログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, '再参加後の新規会議中リロードでは defaultPrevented が true であること');
});

await runTest('Phase 2 (11): 手動コピー後に新着メッセージありで退出ボタン押さずに退出要素出現時、textarea が正常生成されること', async () => {
    const meetHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <button jsname="CQylAd">退出ボタン</button>
            <button id="GMCTC-copyButton">コピー</button>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">自分</div>
                    <div jsname="biJjHb">10:00</div>
                    <div jsname="dTKtvb">初期メッセージ</div>
                </div>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(meetHtml, 'https://meet.google.com/abc-defg-hij');

    // 1. 会議中にコピーボタンを押下
    await window.saveChatManual();
    assert.strictEqual(window.AppState.fallbackCopySucceeded, true, '手動コピー成功で fallbackCopySucceeded が true');
    assert.strictEqual(window.AppState.autoCopySucceeded, false, '手動コピーでは autoCopySucceeded は false のまま');

    // 2. 新しいチャットメッセージが追加され、定期バックアップが実行される
    const chatContainer = document.querySelector('div[jsname="xySENc"]');
    const newMsg = document.createElement('div');
    newMsg.className = 'Ss4fHf';
    newMsg.setAttribute('jsname', 'Ypafjf');
    newMsg.innerHTML = '<div class="poVWob">相手</div><div jsname="biJjHb">10:30</div><div jsname="dTKtvb">新着メッセージ</div>';
    chatContainer.appendChild(newMsg);
    window.updateLogBackup();

    // 3. 通話が終了し（退出ボタン経由でなく）退出後メッセージが出現
    const exitMsgEl = document.createElement('div');
    exitMsgEl.className = 'lAqQo';
    exitMsgEl.innerHTML = '<h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1>';
    document.body.appendChild(exitMsgEl);

    // 4. checkAndCreateExitedUI が実行された際、autoCopySucceeded が false のため textarea が生成されること
    window.checkAndCreateExitedUI();

    const textarea = document.querySelector(`#${IDS.chatLogTextArea}`);
    assert.notStrictEqual(textarea, null, '新着メッセージを含むフォールバック textarea が生成されること');
    assert.ok(textarea.value.includes('新着メッセージ'), '新着メッセージが textarea に含まれること');
});

await runTest('Phase 2 (12): 退出ボタン押下時の実経路 - 自動コピー成功・失敗双方での postExitCompleted と beforeunload 検証', async () => {
    const meetHtml = `
        <html><body>
            <div class="hsLqkc"></div>
            <button jsname="CQylAd">退出ボタン</button>
            <div jsname="xySENc" aria-live="polite">
                <div class="Ss4fHf" jsname="Ypafjf">
                    <div class="poVWob">自分</div>
                    <div jsname="biJjHb">10:00</div>
                    <div jsname="dTKtvb">退出テストチャット</div>
                </div>
            </div>
        </body></html>
    `;
    const { window, document } = createEnvironment(meetHtml, 'https://meet.google.com/abc-defg-hij');

    // 1. 退出ボタン押下による saveChat 実行
    await window.saveChat();
    assert.strictEqual(window.AppState.autoCopySucceeded, true, '退出 saveChat 成功で autoCopySucceeded が true');

    // 2. 退出後画面の出現（退出ボタンは消滅）
    document.querySelector('button[jsname="CQylAd"]').remove();
    const exitMsgEl = document.createElement('div');
    exitMsgEl.className = 'lAqQo';
    exitMsgEl.innerHTML = '<h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1>';
    document.body.appendChild(exitMsgEl);

    // 3. UI 作成処理
    window.checkAndCreateExitedUI();
    assert.strictEqual(window.AppState.postExitCompleted, true, 'postExitCompleted が true');
    assert.strictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, '自動コピー成功のため textarea は生成されない');

    // 4. 退出後画面からの遷移（beforeunload）が抑止されること
    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    assert.strictEqual(event.defaultPrevented, false, '退出後画面からの遷移ではダイアログ要求が抑止されること');
});

await runTest('Phase 2 (13): 監視間隔内の高速同一 Room 再参加時 - 即時セッション判定により新会議中のダイアログが維持されること', async () => {
    const { window, document } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // 1. セッション1の退出状態
    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '旧セッションログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.postExitCompleted = true;

    // 2. 新セッションの DOM 状態（アクティブな退出ボタンが存在する）
    const exitBtn = document.createElement('button');
    exitBtn.setAttribute('jsname', 'CQylAd');
    document.body.appendChild(exitBtn);

    // 3. setInterval のポーリングを待たずに beforeunload が発火
    window.AppState.pendingExitChatLogText = '新セッションログ';
    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'アクティブ通話中は postExitCompleted フラグに関わらずダイアログ要求が維持されること');
});

await runTest('Phase 2 (14): copiedSuccessfully 単独では退出完了扱いせずフォールバック UI を生成すること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退出後フォールバックログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.autoCopySucceeded = false;
    window.AppState.copiedSuccessfully = true;
    window.AppState.postExitCompleted = false;

    window.checkAndCreateExitedUI();

    assert.strictEqual(window.AppState.postExitCompleted, true, 'copiedSuccessfully 単独では処理済み化せずフォールバック経路が完了すること');
    assert.strictEqual(window.AppState.exitedUIInserted, true, 'フォールバック textarea が挿入されること');
    assert.notStrictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, 'copiedSuccessfully 単独で textarea が生成されること');
});

// ----------------------------------------------------
// Phase 3: 退避ログ駆動型 beforeunload 再設計 & textarea 直接コピーテスト
// ----------------------------------------------------
await runTest('Phase 3 (1): textarea 挿入とログ消費テスト - textarea に退避ログがセットされ pendingExitChatLogText がクリアされること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '退避されたチャットメッセージ本文';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    window.checkAndCreateExitedUI();

    const textarea = document.querySelector(`#${IDS.chatLogTextArea}`);
    assert.notStrictEqual(textarea, null, 'textarea が挿入されていること');
    assert.strictEqual(textarea.value, '退避されたチャットメッセージ本文', 'textarea に退避ログの内容が設定されていること');
    assert.strictEqual(window.AppState.pendingExitChatLogText, '退避されたチャットメッセージ本文', 'リロード競合に備えて textarea 挿入後も pendingExitChatLogText が保持されること');
    assert.strictEqual(window.AppState.exitedUIInserted, true, 'exitedUIInserted が true であること');
    assert.strictEqual(window.AppState.postExitCompleted, true, 'postExitCompleted が true であること');
});

await runTest('Phase 3 (2): AppState クリア後の textarea コピーテスト (必須対応) - AppState が空でも textarea.value から直接コピーできること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document, getWrittenText } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '重要チャットログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    window.checkAndCreateExitedUI();

    // AppState 上の全テキストを完全にクリア（Room 移動や初期化のシミュレーション）
    window.AppState.pendingExitChatLogText = '';
    window.AppState.tmpChatLogText = '';

    const copyBtn = document.querySelector('.lAqQo p button');
    assert.notStrictEqual(copyBtn, null, '退出後 UI のコピーボタンが存在すること');

    // ユーザーがコピーボタンをクリック
    await copyBtn.click();

    assert.strictEqual(getWrittenText(), '重要チャットログ', 'AppState が空でも textarea の value からクリップボードにコピーされること');
    assert.strictEqual(window.AppState.fallbackCopySucceeded, true, 'fallbackCopySucceeded が true になること');
});

await runTest('Phase 3 (3): 正常退出後の通常遷移抑止テスト - 退出ボタン押下後の textarea 表示後は beforeunload ダイアログが抑止されること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.exitButtonClicked = true; // 明示的な退出ボタンクリック
    window.AppState.pendingExitChatLogText = 'チャットログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    window.checkAndCreateExitedUI();

    // 正常退出後に「ホームに戻る」や「再参加」を押して beforeunload が発火
    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '正常退出フローでは beforeunload ダイアログが抑止されること');
});

await runTest('Phase 3 (4): 自動コピー成功後のログ消費テスト - autoCopySucceeded 時は pendingExitChatLogText がクリアされ textarea は生成されないこと', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '自動コピーされたログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.autoCopySucceeded = true;

    window.checkAndCreateExitedUI();

    assert.strictEqual(window.AppState.pendingExitChatLogText, '', '自動コピー成功後に pendingExitChatLogText が空にクリアされること');
    assert.strictEqual(window.AppState.postExitCompleted, true, 'postExitCompleted が true であること');
    assert.strictEqual(document.querySelector(`#${IDS.chatLogTextArea}`), null, '自動コピー成功時は textarea が生成されないこと');
});

await runTest('Phase 3 (5): チャットパネル閉じ状態 (div.hsLqkc なし) でも退避ログがあれば通話中リロードでダイアログ要求されること', async () => {
    // チャットパネルを閉じている状態（div.hsLqkc やチャット DOM なし、退出ボタンあり）
    const panelClosedHtml = `
        <html><body>
            <button jsname="CQylAd">退出ボタン</button>
        </body></html>
    `;
    const { window, document } = createEnvironment(panelClosedHtml, 'https://meet.google.com/abc-defg-hij');

    // 通話中に以前取得・退避されたログが存在する
    window.AppState.pendingExitChatLogText = '退避済みログテキスト';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'div.hsLqkc が DOM に存在しなくても、退避ログがあればダイアログが要求されること');
});

await runTest('Phase 3 (6): チャット 0 件 (pendingExitChatLogText 空) の場合は通話中リロードでもダイアログ要求されないこと', async () => {
    const { window, document } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // チャットを受信しておらず退避ログが空
    window.AppState.pendingExitChatLogText = '';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'チャット 0 件の場合はダイアログが要求されないこと');
});

// ----------------------------------------------------
// Phase 4: chrome.i18n 未定義・例外スローに対する包括的防御 & フォールバックテスト
// ----------------------------------------------------
await runTest('Phase 4 (1): chrome が undefined の場合 - 例外なく "コピー" でボタンが生成されること', async () => {
    const { window, document, UIManager } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.chrome = undefined;

    const ui = UIManager.createExitedUI(CONFIG, IDS, 'テストログ', () => {}, document);
    assert.notStrictEqual(ui, null, 'UI 要素が生成されること');
    const button = ui.querySelector('button');
    assert.notStrictEqual(button, null, 'ボタンが生成されること');
    assert.strictEqual(button.textContent, 'コピー', 'ボタン文言がフォールバック "コピー" であること');
});

await runTest('Phase 4 (2): chrome.i18n が undefined の場合 - 例外なく "コピー" でボタンが生成されること', async () => {
    const { window, document, UIManager } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.chrome = {};

    const ui = UIManager.createExitedUI(CONFIG, IDS, 'テストログ', () => {}, document);
    assert.notStrictEqual(ui, null, 'UI 要素が生成されること');
    const button = ui.querySelector('button');
    assert.notStrictEqual(button, null, 'ボタンが生成されること');
    assert.strictEqual(button.textContent, 'コピー', 'ボタン文言がフォールバック "コピー" であること');
});

await runTest('Phase 4 (3): getMessage が関数でない場合 - 例外なく "コピー" でボタンが生成されること', async () => {
    const { window, document, UIManager } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.chrome = { i18n: {} };

    const ui = UIManager.createExitedUI(CONFIG, IDS, 'テストログ', () => {}, document);
    assert.notStrictEqual(ui, null, 'UI 要素が生成されること');
    const button = ui.querySelector('button');
    assert.notStrictEqual(button, null, 'ボタンが生成されること');
    assert.strictEqual(button.textContent, 'コピー', 'ボタン文言がフォールバック "コピー" であること');
});

await runTest('Phase 4 (4): getMessage() が空文字列を返す場合 - フォールバック "コピー" でボタンが生成されること', async () => {
    const { window, document, UIManager } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.chrome = {
        i18n: {
            getMessage: () => ''
        }
    };

    const ui = UIManager.createExitedUI(CONFIG, IDS, 'テストログ', () => {}, document);
    assert.notStrictEqual(ui, null, 'UI 要素が生成されること');
    const button = ui.querySelector('button');
    assert.notStrictEqual(button, null, 'ボタンが生成されること');
    assert.strictEqual(button.textContent, 'コピー', '空文字戻り値時にフォールバック "コピー" が設定されること');
});

await runTest('Phase 4 (5): getMessage() が例外をスローする場合 - 例外を捕捉し "コピー" でボタンが生成されること', async () => {
    const { window, document, UIManager } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.chrome = {
        i18n: {
            getMessage: () => {
                throw new Error('Extension context invalidated.');
            }
        }
    };

    const ui = UIManager.createExitedUI(CONFIG, IDS, 'テストログ', () => {}, document);
    assert.notStrictEqual(ui, null, '例外がスローされず UI 要素が生成されること');
    const button = ui.querySelector('button');
    assert.notStrictEqual(button, null, 'ボタンが生成されること');
    assert.strictEqual(button.textContent, 'コピー', '例外発生時にフォールバック "コピー" が設定されること');
});

await runTest('Phase 4 (6): 正常な i18n API が利用可能な場合 - 取得文言でボタンが生成されること', async () => {
    const { window, document, UIManager } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');
    window.chrome = {
        i18n: {
            getMessage: (key) => key === 'copyButtonText' ? 'カスタムコピー' : ''
        }
    };

    const ui = UIManager.createExitedUI(CONFIG, IDS, 'テストログ', () => {}, document);
    assert.notStrictEqual(ui, null, 'UI 要素が生成されること');
    const button = ui.querySelector('button');
    assert.notStrictEqual(button, null, 'ボタンが生成されること');
    assert.strictEqual(button.textContent, 'カスタムコピー', 'i18n から取得した文言が設定されること');
});

await runTest('Phase 4 (7): 退出後 UI の実経路結合テスト (chrome.i18n 未定義時) - checkAndCreateExitedUI が中断せず UI を生成し data-gmctc-processed を付与すること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');
    // 拡張機能コンテキスト無効化をシミュレーション
    window.chrome.i18n = undefined;

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '実経路チャットログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    window.checkAndCreateExitedUI();

    const textarea = document.querySelector(`#${IDS.chatLogTextArea}`);
    assert.notStrictEqual(textarea, null, 'textarea が挿入されていること');
    assert.strictEqual(textarea.value, '実経路チャットログ', 'textarea に退避ログの内容が設定されていること');

    const copyBtn = document.querySelector('.lAqQo p button');
    assert.notStrictEqual(copyBtn, null, 'コピーボタンが挿入されていること');
    assert.strictEqual(copyBtn.textContent, 'コピー', '未定義環境下でフォールバック文言 "コピー" が設定されていること');

    const removedMessageEl = document.querySelector(SELECTORS.removedMessage);
    assert.strictEqual(removedMessageEl.getAttribute('data-gmctc-processed'), 'true', '退出要素に data-gmctc-processed 属性が付与されること');

    assert.strictEqual(window.AppState.pendingExitChatLogText, '実経路チャットログ', '実経路で textarea 挿入後も pendingExitChatLogText が保持されること');
    assert.strictEqual(window.AppState.postExitCompleted, true, 'postExitCompleted が true であること');
    assert.strictEqual(window.AppState.exitedUIInserted, true, 'exitedUIInserted が true であること');
});

// ----------------------------------------------------
// Phase 5: リロード時レースコンディション（ログ先行クリア・早期抑止）解消テスト
// ----------------------------------------------------
await runTest('Phase 5 (1): リロード競合時（textarea 先行挿入・ボタン未押下）- ダイアログが要求されること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.exitButtonClicked = false; // リロード開始（退出ボタンは押していない）
    window.AppState.pendingExitChatLogText = '重要メッセージ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    // Meet の切断処理が先行して checkAndCreateExitedUI が発火
    window.checkAndCreateExitedUI();
    assert.strictEqual(window.AppState.exitedUIInserted, true, 'textarea が挿入されていること');

    // その直後に beforeunload が発火
    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, 'リロード競合時でもダイアログ要求されること');
});

await runTest('Phase 5 (2): 正常退出後遷移（退出ボタン押下・textarea 表示）- ダイアログが抑止されること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.exitButtonClicked = true; // 明示的な退出ボタンクリック
    window.AppState.pendingExitChatLogText = 'チャットログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    window.checkAndCreateExitedUI();
    assert.strictEqual(window.AppState.exitedUIInserted, true, 'textarea が挿入されていること');

    // 正常退出後に「ホームに戻る」等で beforeunload が発火
    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '正常退出フローではダイアログが抑止されること');
});

await runTest('Phase 5 (3): 自動コピー成功後遷移 - ダイアログが抑止されること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.autoCopySucceeded = true; // クリップボード救出完了
    window.AppState.pendingExitChatLogText = '';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '自動コピー成功後はダイアログが抑止されること');
});

await runTest('Phase 5 (4): textarea 先行挿入時のログ保持テスト - checkAndCreateExitedUI 実行後もログが保持されること', async () => {
    const exitDomHtml = `
        <html><body>
            <div class="lAqQo"><h1 class="roSPhc" jsname="r4nke">通話から退出しました</h1></div>
        </body></html>
    `;
    const { window, document } = createEnvironment(exitDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitChatLogText = '保持されるべきログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    window.checkAndCreateExitedUI();

    assert.strictEqual(window.AppState.pendingExitChatLogText, '保持されるべきログ', 'textarea 挿入後もメモリログが保持されていること');
});

await runTest('Phase 5 (5): 両ログ空の場合はダイアログが抑止されること', async () => {
    const { window, document } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.pendingExitChatLogText = '';
    window.AppState.tmpChatLogText = '';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, '両ログが空の場合はダイアログが抑止されること');
});

await runTest('Phase 5 (6): 別 Room 入室時に旧 Room の状態が初期化され旧ログによるダイアログ誤判定が抑止されること', async () => {
    const { window, document } = createEnvironment(enableDomHtml, 'https://meet.google.com/abc-defg-hij');

    window.AppState.pendingExitChatLogText = '旧Roomログ';
    window.AppState.tmpChatLogText = '旧Roomログ';
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.exitButtonClicked = true;

    // 新しい Room B (xyz-uvwx-rst) へ入室
    window.checkRoomChangeAndReset('xyz-uvwx-rst');

    assert.strictEqual(window.AppState.pendingExitChatLogText, '', 'pendingExitChatLogText がリセットされること');
    assert.strictEqual(window.AppState.tmpChatLogText, '', 'tmpChatLogText がリセットされること');
    assert.strictEqual(window.AppState.pendingExitRoomId, null, 'pendingExitRoomId が null にリセットされること');
    assert.strictEqual(window.AppState.exitButtonClicked, false, 'exitButtonClicked が false にリセットされること');

    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, false, 'リセット後はダイアログが抑止されること');
});

await runTest('Phase 5 (7): 同一 Room 再参加時のフラグ分離 - 再参加後の新セッション通話中リロードでダイアログが要求されること', async () => {
    const { window, document } = createEnvironment(disableDomHtml, 'https://meet.google.com/abc-defg-hij');

    // 1回目の通話で退出ボタンをクリック
    window.AppState.exitButtonClicked = true;
    window.AppState.exitedUIInserted = true;

    // 一旦 /landing へ遷移
    window.checkRoomChangeAndReset(null);

    // 再び同一 Room へ /landing 経由で新規再入室（previousRoomId === null ➔ clearExitPendingState 発火）
    window.checkRoomChangeAndReset('abc-defg-hij');
    assert.strictEqual(window.AppState.exitButtonClicked, false, '再入室で exitButtonClicked が false にリセットされること');

    window.AppState.wasSaveTarget = true;
    window.AppState.pendingExitRoomId = 'abc-defg-hij';
    window.AppState.pendingExitChatLogText = '新セッションログ';

    // 新セッションで通話中リロード（退出ボタンは押していない）
    const event = new window.Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    assert.strictEqual(event.defaultPrevented, true, '同一 Room 再参加後は旧フラグが引き継がれず新セッションでダイアログ要求されること');
});

// 全 JSDOM インスタンスを閉じてタイマー (setInterval 等) を解放し、テストプロセスが自然終了できるようにする
for (const dom of createdDoms) {
    try {
        dom.window.close();
    } catch (e) {}
}

// ----------------------------------------------------
// テスト結果集計
// ----------------------------------------------------
console.log(`\n==== テスト実行完了: PASS: ${passCount}, FAIL: ${failCount} ====`);
if (failCount > 0) {
    process.exit(1);
}
})();
