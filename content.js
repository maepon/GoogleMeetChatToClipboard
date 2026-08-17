// 設定値の外部化
const CONFIG = {
    TIMEOUTS: {
        CHAT_TITLE_CHECK: 500,
        MEMBER_NAME_CHECK: 300,
        PINP_ELEMENT_CHECK: 5000
    },
    STYLES: {
        COPY_BUTTON: {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            border: 'none',
            padding: '12px',
            cursor: 'pointer',
            borderRadius: '50%'
        },
        COPY_BUTTON_HOVER: 'rgba(0, 0, 0, 0.05)',
        COPY_BUTTON_NORMAL: 'rgba(0, 0, 0, 0)',
        TEXTAREA: {
            width: '300px',
            height: '180px'
        },
        COPY_ICON: {
            color: 'rgb(95, 99, 104)'
        }
    }
};

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

const IDS = {
    copyButton: 'GMCTC-copyButton', 
    chatLogTextArea: 'GMCTC-onRemoveChatLogTextArea'
};

function getRoomId() {
    const match = location.pathname.match(/^\/([a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3})\/?$/i);
    return match ? match[1] : null;
}

// 状態管理オブジェクト
const AppState = {
    tmpChatLogText: '',
    pendingExitChatLogText: '',
    pendingExitRoomId: null,
    exitButtonClicked: false,
    postExitCompleted: false,
    exitedUIInserted: false,
    autoCopySucceeded: false,
    fallbackCopySucceeded: false,
    copyInProgress: false,
    copiedSuccessfully: false,
    wasSaveTarget: false,
    selfName: '',
    currentRoomId: getRoomId(),
    chatContainerElement: null,
    chatContainerRoomId: null,
    previousContainerElement: null
};

function clearExitPendingState() {
    AppState.pendingExitChatLogText = '';
    AppState.tmpChatLogText = '';
    AppState.pendingExitRoomId = null;
    AppState.exitButtonClicked = false;
    AppState.wasSaveTarget = false;
    AppState.exitedUIInserted = false;
    AppState.postExitCompleted = false;
    AppState.autoCopySucceeded = false;
    AppState.fallbackCopySucceeded = false;
    AppState.copyInProgress = false;
    AppState.copiedSuccessfully = false;
}

function disableOldRemovedMessageElements(previousRoomId) {
    if (
        AppState.chatContainerElement &&
        AppState.chatContainerRoomId === previousRoomId
    ) {
        AppState.chatContainerElement.querySelectorAll(SELECTORS.removedMessage).forEach(el => {
            el.setAttribute('data-gmctc-processed', 'true');
        });
    }
}

function resetAppState(previousRoomId) {
    disableOldRemovedMessageElements(previousRoomId);
    AppState.previousContainerElement = AppState.chatContainerElement;
    AppState.chatContainerElement = null;
    AppState.chatContainerRoomId = null;
    AppState.tmpChatLogText = '';
    AppState.selfName = '';
}

function checkRoomChangeAndReset(overrideRoomId = undefined) {
    const newRoomId = overrideRoomId !== undefined ? overrideRoomId : getRoomId();
    if (AppState.currentRoomId !== newRoomId) {
        const previousRoomId = AppState.currentRoomId;
        AppState.currentRoomId = newRoomId;

        if (previousRoomId !== null) {
            resetAppState(previousRoomId);
        }

        // 別 Room への移動、または /landing からの入室（新規会議セッション）時に退出待機状態を完全リセット
        if (newRoomId !== null && (previousRoomId === null || newRoomId !== AppState.pendingExitRoomId)) {
            clearExitPendingState();
        }
    }
}

function updateLogBackup(targetDoc = document) {
    checkRoomChangeAndReset();
    if (!ChatManager.isSaveTarget(targetDoc, SELECTORS)) {
        return;
    }

    const roomId = getRoomId();
    if (roomId == null ||
        (AppState.pendingExitRoomId != null && AppState.pendingExitRoomId !== roomId)) {
        return;
    }

    AppState.wasSaveTarget = true;
    AppState.pendingExitRoomId = roomId;
    const currentText = ChatManager.getChatText(AppState, SELECTORS, targetDoc);
    if (currentText !== '') {
        AppState.tmpChatLogText = currentText;
        AppState.pendingExitChatLogText = currentText;
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.isComposing) {
        // IMEがアクティブな状態でエンターが押された場合、イベントをキャンセル
        event.preventDefault();
        event.stopPropagation();
    }
},true);


// チャット要素を探してクリップボードに保存（退出ボタン・PinP退出用）
function saveChat() {
    updateLogBackup(document);
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    const result = ChatManager.saveChat(AppState, SELECTORS, document, true);
    if (AppState.tmpChatLogText !== '') {
        AppState.pendingExitChatLogText = AppState.tmpChatLogText;
    }
    return result;
}

// 会議中コピーボタン専用（autoCopySucceeded を立てずに手動コピー）
function saveChatManual() {
    updateLogBackup(document);
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    const result = ChatManager.saveChat(AppState, SELECTORS, document, false);
    if (AppState.tmpChatLogText !== '') {
        AppState.pendingExitChatLogText = AppState.tmpChatLogText;
    }
    return result;
}

function saveChatLog(text) {
    return ChatManager.saveChatLog(AppState, text);
}

// PinP環境からのsaveChat実行（メインウィンドウから常にPinP内のデータを参照）
function saveChatFromPinP() {
    // PinPウィンドウが存在するかチェック
    if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
        const pinpDoc = window.documentPictureInPicture.window.document;
        updateLogBackup(pinpDoc);
        if (!ChatManager.isSaveTarget(pinpDoc, SELECTORS)) {
            return;
        }
        const result = ChatManager.saveChatFromPinP(AppState, SELECTORS, pinpDoc);
        if (AppState.tmpChatLogText !== '') {
            AppState.pendingExitChatLogText = AppState.tmpChatLogText;
        }
        return result;
    } else {
        return saveChat();
    }
}

// PinP環境でのコピーボタン専用（フォーカス移動なし）
function saveChatFromPinPCopy() {
    // PinPウィンドウが存在するかチェック
    if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
        const pinpDoc = window.documentPictureInPicture.window.document;
        updateLogBackup(pinpDoc);
        if (!ChatManager.isSaveTarget(pinpDoc, SELECTORS)) {
            return;
        }
        const result = ChatManager.saveChatFromPinPCopy(AppState, SELECTORS, pinpDoc);
        if (AppState.tmpChatLogText !== '') {
            AppState.pendingExitChatLogText = AppState.tmpChatLogText;
        }
        return result;
    } else {
        return saveChat();
    }
}

// 退出後 UI の作成・挿入チェック関数
function checkAndCreateExitedUI() {
    if (!AppState.wasSaveTarget) {
        return;
    }
    if (AppState.copyInProgress) {
        return;
    }
    const unprocessedElements = document.querySelectorAll(SELECTORS.unprocessedRemovedMessage);
    if (!unprocessedElements || unprocessedElements.length === 0) {
        return;
    }
    // 退出ボタンまたはPinP退出による自動コピーが成功している場合のみ処理済み化
    if (AppState.autoCopySucceeded) {
        unprocessedElements.forEach(el => {
            el.setAttribute('data-gmctc-processed', 'true');
        });
        AppState.postExitCompleted = true;
        AppState.pendingExitChatLogText = ''; // 自動コピー成功につきログ消費
        return;
    }
    if (document.querySelector(`#${IDS.chatLogTextArea}`)) {
        return;
    }
    const logTextToDisplay = AppState.pendingExitChatLogText || AppState.tmpChatLogText;
    if (!logTextToDisplay) {
        return;
    }

    for (let removeMessageElement of unprocessedElements) {
        if (removeMessageElement.hasAttribute('data-gmctc-processed')) {
            continue;
        }
        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, logTextToDisplay, saveChatLog, document);
        if (exitedUI) {
            removeMessageElement.after(exitedUI);
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            AppState.exitedUIInserted = true;
            AppState.postExitCompleted = true;
            // リロード競合時の beforeunload 判定のため、ここでは pendingExitChatLogText をクリアせず保持
            break;
        }
    }
}

window.checkAndCreateExitedUI = checkAndCreateExitedUI;

function getChatMemberName() {
    ChatManager.getChatMemberName(AppState, SELECTORS);
}

function handleExitButtonClick() {
    AppState.exitButtonClicked = true;
    saveChat();
}

DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', handleExitButtonClick, true);
DOMUtils.observeAndAttachEvent(`#${IDS.copyButton}`, 'click', saveChatManual, true);

// 退出済みメッセージを監視するためのObserver
const removedMessageObserver = ObserverManager.observeForElement(
    SELECTORS.unprocessedRemovedMessage,
    () => {
        checkAndCreateExitedUI();
    },
    false // 切断せず常駐
);

// 初回直接チェック（スクリプト評価時・すでに DOM が存在する場合の即時実行）
checkAndCreateExitedUI();

window.addEventListener('beforeunload', (event) => {
    checkRoomChangeAndReset();
    // 1. ハンドラー冒頭で無条件に退避処理を実行（初回 unload の取りこぼし防止）
    updateLogBackup(document);

    const activeRoomId = getRoomId();
    let currentChatText = '';

    // 2. 同一 Room または初回のみ live DOM から本文を更新（Room 保護の迂回防止）
    if (activeRoomId != null && (AppState.pendingExitRoomId == null || AppState.pendingExitRoomId === activeRoomId)) {
        currentChatText = ChatManager.getChatText(AppState, SELECTORS, document);
        if (currentChatText !== '') {
            AppState.tmpChatLogText = currentChatText;
            AppState.pendingExitChatLogText = currentChatText;
            AppState.pendingExitRoomId = activeRoomId;
        }
    }

    const effectiveChatLog = AppState.pendingExitChatLogText || AppState.tmpChatLogText;
    const hasPendingLog = effectiveChatLog !== '';
    const isCurrentRoom = AppState.pendingExitRoomId != null &&
        activeRoomId != null &&
        AppState.pendingExitRoomId === activeRoomId;

    // 実機切り分け用の一時デバッグログ（本文は出さずフラグ・文字数のみ）
    console.debug('[GMCTC] beforeunload state', {
        wasSaveTarget: AppState.wasSaveTarget,
        isLiveSaveTarget: ChatManager.isSaveTarget(document, SELECTORS),
        chatTextLength: currentChatText.length,
        pendingTextLength: effectiveChatLog.length,
        pendingExitRoomId: AppState.pendingExitRoomId,
        activeRoomId: activeRoomId,
        exitButtonClicked: AppState.exitButtonClicked,
        autoCopySucceeded: AppState.autoCopySucceeded,
        exitedUIInserted: AppState.exitedUIInserted,
        visibilityState: document.visibilityState
    });

    // 1. 退避ログなし、または Room 不一致の場合は要求しない
    if (!hasPendingLog || !isCurrentRoom) {
        return;
    }

    // 2. 自動コピーが成功している場合は要求しない（クリップボード救出完了）
    if (AppState.autoCopySucceeded) {
        return;
    }

    // 3. 退出ボタンによる正常退出フローで textarea が挿入済みの場合は要求しない（通常遷移）
    if (AppState.exitButtonClicked && AppState.exitedUIInserted) {
        return;
    }

    // 4. それ以外（通話中リロード、またはリロード過渡期の先行切断・textarea先行挿入時）はダイアログを要求
    event.preventDefault();
    event.returnValue = '';
});

UIManager.initializeCopyButtonObserver(CONFIG, SELECTORS, IDS, document);

setInterval(() => {
    checkRoomChangeAndReset();
    updateLogBackup(document);
    getChatMemberName();
    checkAndCreateExitedUI();

    const activeRoomId = getRoomId();
    if (activeRoomId) {
        const containers = [...document.querySelectorAll(SELECTORS.chatContainer)];
        const currentContainer = containers.find(container => container !== AppState.previousContainerElement);
        if (currentContainer) {
            AppState.chatContainerElement = currentContainer;
            AppState.chatContainerRoomId = activeRoomId;
        }
    }
}, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);

// PinPからのメッセージを受信するリスナー
window.addEventListener('message', (event) => {
    // React DevToolsのメッセージを除外
    if (event.data && event.data.source === 'react-devtools-content-script') {
        return;
    }
    if (event.data.type === 'PINP_EVENT') {
        // PinPからのイベントを受信した際の処理
        if (event.data.eventType === 'click') {
            if (event.data.selector === SELECTORS.exitButton) {
                // PinP内の退出ボタンがクリックされた場合（フォーカス移動あり）
                AppState.exitButtonClicked = true;
                saveChatFromPinP();
            } else if (event.data.selector === `#${IDS.copyButton}`) {
                // PinP内のコピーボタンがクリックされた場合（フォーカス移動なし）
                saveChatFromPinPCopy();
            }
        }
    }
});

// ピクチャーインピクチャーのオープンを監視
window.documentPictureInPicture.addEventListener('enter', event => {
    console.log('PinP enter イベント発生', event);
    const pinpWindow = event.target.window;
    
    // PinPウィンドウが正しく取得できているかチェック
    if (!pinpWindow || !pinpWindow.document) {
        console.error('PinPウィンドウが正しく取得できませんでした');
        return;
    }
    
    console.log('PinPウィンドウ取得成功', pinpWindow);
    
    // PinP初期化処理関数
    const initializePinP = () => {
        console.log('PinP初期化処理開始');
        
        // PinP内でのUIManager初期化（コピーボタンの作成）
        const pinpUIManager = {
            initializeCopyButtonObserverPinP() {
                console.log('PinP コピーボタンObserver開始');
                return UIManager.initializeCopyButtonObserver(CONFIG, SELECTORS, IDS, pinpWindow.document);
            }
        };
        
        // PinP内でのコピーボタン監視を開始
        pinpUIManager.initializeCopyButtonObserverPinP();
        
        // 退出ボタンのイベントリスナーを設定
        DOMUtils.observeAndAttachEventPinP(pinpWindow, SELECTORS.exitButton, 'click', saveChat, true);
        
        // PinP内でのコピーボタンのイベントリスナーを設定
        DOMUtils.observeAndAttachEventPinP(pinpWindow, `#${IDS.copyButton}`, 'click', saveChatFromPinPCopy, true);
        
        // PinPウィンドウのbeforeunloadイベント対応
        pinpWindow.addEventListener('beforeunload', (e) => {
            if (!ChatManager.isSaveTarget(pinpWindow.document, SELECTORS)) {
                return;
            }
            const chatText = ChatManager.getChatText(AppState, SELECTORS, pinpWindow.document);
            if (chatText !== '') {
                AppState.tmpChatLogText = chatText;
                e.returnValue = 'Remove?';
            }
        });
    };
    
    // PinPウィンドウが既に読み込まれている場合は即座に初期化
    if (pinpWindow.document.readyState === 'complete') {
        initializePinP();
    } else {
        pinpWindow.addEventListener('load', () => {
            initializePinP();
        });
    }
});
