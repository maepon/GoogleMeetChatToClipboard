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



function getChatMemberName() {
    ChatManager.getChatMemberName(AppState, SELECTORS);
}


DOMUtils.observeAndAttachEvent(SELECTORS.exitButton, 'click', saveChat, true);
DOMUtils.observeAndAttachEvent(`#${IDS.copyButton}`, 'click', saveChat, true);

// 退出済みメッセージを監視するためのMutationObserver
const removedMessageObserver = new MutationObserver((mutationsList, observer) => {
    for (let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const removeMessageElement = document.querySelector(SELECTORS.removedMessage);
            if (removeMessageElement) {
                if (AppState.chatOutputFlag === false) {
                    const exitedUI = UIManager.createExitedUI(CONFIG, IDS, AppState.tmpChatLogText, saveChatLog);
                    removeMessageElement.after(exitedUI);
                    AppState.chatOutputFlag = true;
                }
                observer.disconnect();  // 通話から退出ボタンが見つかったら監視を停止
            }
        }
    }
});

removedMessageObserver.observe(document, {childList: true, subtree: true})

window.addEventListener('beforeunload', (e) => {
    const chatText = ChatManager.getChatText(AppState, SELECTORS, CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME);
    if (chatText !== '') {
        AppState.tmpChatLogText = chatText;
        e.returnValue = 'Remove?';
    }
});






setTimeout(() => UIManager.checkAndCreateCopyButton(CONFIG, SELECTORS, IDS), CONFIG.TIMEOUTS.CHAT_TITLE_CHECK);
setInterval(getChatMemberName, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);



// ピクチャーインピクチャーのオープンを監視（Phase 2で本格実装予定）
window.documentPictureInPicture.addEventListener('enter',event => {
    // Phase 2でPinP内チャット機能を実装予定
    event.target.window.addEventListener('load', () => {
        // PinPウィンドウ読み込み完了時の処理
    })
    DOMUtils.observeAndAttachEventPinP(event.target.window, SELECTORS.exitButton, 'click', saveChat, true);
})

