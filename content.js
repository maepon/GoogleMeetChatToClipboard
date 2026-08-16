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
    exitedUIInserted: false,
    wasSaveTarget: false,
    selfName: '',
    currentRoomId: getRoomId(),
    chatContainerElement: null,
    chatContainerRoomId: null,
    previousContainerElement: null
};

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
    AppState.pendingExitChatLogText = '';
    AppState.exitedUIInserted = false;
    AppState.wasSaveTarget = false;
    AppState.selfName = '';
}

function checkRoomChangeAndReset() {
    const newRoomId = getRoomId();
    if (AppState.currentRoomId !== newRoomId) {
        const previousRoomId = AppState.currentRoomId;
        AppState.currentRoomId = newRoomId;
        if (previousRoomId !== null) {
            resetAppState(previousRoomId);
        }
    }
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.isComposing) {
        // IMEがアクティブな状態でエンターが押された場合、イベントをキャンセル
        event.preventDefault();
        event.stopPropagation();
    }
},true);


// チャット要素を探してクリップボードに保存
function saveChat() {
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    ChatManager.saveChat(AppState, SELECTORS, document);
    if (AppState.tmpChatLogText !== '') {
        AppState.pendingExitChatLogText = AppState.tmpChatLogText;
    }
}

function saveChatLog() {
    ChatManager.saveChatLog(AppState);
}

// PinP環境からのsaveChat実行（メインウィンドウから常にPinP内のデータを参照）
function saveChatFromPinP() {
    // PinPウィンドウが存在するかチェック
    if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
        const pinpDoc = window.documentPictureInPicture.window.document;
        if (!ChatManager.isSaveTarget(pinpDoc, SELECTORS)) {
            return;
        }
        ChatManager.saveChatFromPinP(AppState, SELECTORS, pinpDoc);
        if (AppState.tmpChatLogText !== '') {
            AppState.pendingExitChatLogText = AppState.tmpChatLogText;
        }
    } else {
        saveChat();
    }
}

// PinP環境でのコピーボタン専用（フォーカス移動なし）
function saveChatFromPinPCopy() {
    // PinPウィンドウが存在するかチェック
    if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
        const pinpDoc = window.documentPictureInPicture.window.document;
        if (!ChatManager.isSaveTarget(pinpDoc, SELECTORS)) {
            return;
        }
        ChatManager.saveChatFromPinPCopy(AppState, SELECTORS, pinpDoc);
        if (AppState.tmpChatLogText !== '') {
            AppState.pendingExitChatLogText = AppState.tmpChatLogText;
        }
    } else {
        saveChat();
    }
}

function getChatMemberName() {
    ChatManager.getChatMemberName(AppState, SELECTORS);
}

DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', saveChat, true);
DOMUtils.observeAndAttachEvent(`#${IDS.copyButton}`, 'click', saveChat, true);

// 退出済みメッセージを監視するためのObserver
const removedMessageObserver = ObserverManager.observeForElement(
    SELECTORS.unprocessedRemovedMessage,
    (removeMessageElement) => {
        if (!AppState.wasSaveTarget) {
            return;
        }

        if (removeMessageElement.hasAttribute('data-gmctc-processed')) {
            return;
        }

        if (document.querySelector(`#${IDS.chatLogTextArea}`)) {
            return;
        }

        if (AppState.pendingExitChatLogText === '') {
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            return;
        }

        const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.pendingExitChatLogText, saveChatLog, document);
        if (exitedUI) {
            removeMessageElement.after(exitedUI);
            removeMessageElement.setAttribute('data-gmctc-processed', 'true');
            AppState.exitedUIInserted = true;
        }
    },
    false // 切断せず常駐
);

window.addEventListener('beforeunload', (e) => {
    if (!ChatManager.isSaveTarget(document, SELECTORS)) {
        return;
    }
    const chatText = ChatManager.getChatText(AppState, SELECTORS, document);
    if (chatText !== '') {
        AppState.tmpChatLogText = chatText;
        AppState.pendingExitChatLogText = chatText;
        e.returnValue = 'Remove?';
    }
});

UIManager.initializeCopyButtonObserver(CONFIG, SELECTORS, IDS, document);

setInterval(() => {
    checkRoomChangeAndReset();
    getChatMemberName();

    const activeRoomId = getRoomId();
    if (activeRoomId) {
        if (ChatManager.isSaveTarget(document, SELECTORS)) {
            AppState.wasSaveTarget = true;
            const currentText = ChatManager.getChatText(AppState, SELECTORS, document);
            if (currentText !== '') {
                AppState.tmpChatLogText = currentText;
                AppState.pendingExitChatLogText = currentText;
            }
        }

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
        DOMUtils.observeAndAttachEventPinP(pinpWindow, `#${IDS.copyButton}`, 'click', saveChat, true);
        
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
