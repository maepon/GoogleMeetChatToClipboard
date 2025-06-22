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

const CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME = 'poVWob';

const SELECTORS = {
    exitButton: '[jsname="CQylAd"]',
    //[チャット本文,時刻表記,発信者]の順でセレクタを記載
    chatMessage: '[jsname="dTKtvb"] , [jsname="Ypafjf"]  [jsname="biJjHb"] , .poVWob',
    removedMessage: '.lAqQo .roSPhc[jsname="r4nke"]',
    chatTitle: '[jsname="uPuGNe"][role="heading"]',
    chatMemberName: `.ASy21[title]`,
    selfNameElement: '.Ss4fHf:has(.ym5LMd) .poVWob',
    selfNameTextElement: '[role="tooltip"]',
    keepButton: '.ym5LMd'
};

const IDS = {
    copyButton: 'GMCTC-copyButton', 
    chatLogTextArea: 'GMCTC-onRemoveChatLogTextArea'
};

// 状態管理オブジェクト
const AppState = {
    tmpChatLogText: '',
    chatOutputFlag: false,
    selfName: '',
    selfNameLabel: ''
};

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.isComposing) {
        // IMEがアクティブな状態でエンターが押された場合、イベントをキャンセル
        event.preventDefault();
        event.stopPropagation();
    }
},true);


// チャット要素を探してクリップボードに保存
function saveChat() {
    ChatManager.saveChat(AppState, SELECTORS, CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME);
}

function saveChatLog() {
    ChatManager.saveChatLog(AppState);
}

// PinP環境からのsaveChat実行（メインウィンドウから常にPinP内のデータを参照）
function saveChatFromPinP() {
    // PinPウィンドウが存在するかチェック
    if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
        ChatManager.saveChatFromPinP(AppState, SELECTORS, CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME, window.documentPictureInPicture.window.document);
    } else {
        saveChat();
    }
}

// PinP環境でのコピーボタン専用（フォーカス移動なし）
function saveChatFromPinPCopy() {
    // PinPウィンドウが存在するかチェック
    if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
        ChatManager.saveChatFromPinPCopy(AppState, SELECTORS, CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME, window.documentPictureInPicture.window.document);
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
    SELECTORS.removedMessage,
    (removeMessageElement, observer) => {
        if (AppState.chatOutputFlag === false) {
            const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.tmpChatLogText, saveChatLog);
            removeMessageElement.after(exitedUI);
            AppState.chatOutputFlag = true;
        }
    },
    true // disconnect after finding element
);

window.addEventListener('beforeunload', (e) => {
    const chatText = ChatManager.getChatText(AppState, SELECTORS, CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME);
    if (chatText !== '') {
        AppState.tmpChatLogText = chatText;
        e.returnValue = 'Remove?';
    }
});






UIManager.initializeCopyButtonObserver(CONFIG, SELECTORS, IDS);
setInterval(getChatMemberName, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);



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
window.documentPictureInPicture.addEventListener('enter',event => {
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
        // PinPウィンドウ読み込み完了時の処理
        
        // PinP内でのUIManager初期化（コピーボタンの作成）
        const pinpUIManager = {
            initializeCopyButtonObserverPinP() {
                console.log('PinP コピーボタンObserver開始');
                // PinP内のチャットタイトル要素を監視してコピーボタンを作成
                return ObserverManager.observeForUIChanges(
                    SELECTORS.chatTitle,
                    (chatHeadingElement, observer) => {
                        this.checkAndCreateCopyButtonPinP(chatHeadingElement);
                    },
                    pinpWindow.document
                );
            },
            
            checkAndCreateCopyButtonPinP(chatHeadingElement) {
                if (chatHeadingElement && !pinpWindow.document.querySelector(`#${IDS.copyButton}`)) {
                    const copyButton = UIManager.createCopyButton(CONFIG, IDS);
                    chatHeadingElement.after(copyButton);
                }
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
            const chatText = ChatManager.getChatText(AppState, SELECTORS, CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME);
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
})

