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

// セレクタを元にDOMを検索し、存在したら指定のイベントを追加する関数
function observeAndAttachEvent(selector, event, eventHandler, disconnect) {
    const observer = new MutationObserver((mutationsList, observer) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const element = document.querySelector(selector);
                if (element) {
                    element.addEventListener(event, eventHandler);
                    if (disconnect) observer.disconnect();
                }
            }
        }
    });

    observer.observe(document, {childList: true, subtree: true});
    return observer;
}

// チャット要素を探してクリップボードに保存
function saveChat() {
    let chatMessage = getChatText();
    AppState.chatOutputFlag = true;
    if (chatMessage === '') return;
    navigator.clipboard.writeText(chatMessage);
}

function saveChatLog() {
    if (AppState.tmpChatLogText === '') return;
    navigator.clipboard.writeText(AppState.tmpChatLogText);
}

function getChatText() {
    getSelfLabel();
    let chatMessages = [...document.querySelectorAll(SELECTORS.chatMessage)].map(el => {
        if (isSelfNameAndLabelReady() && el.classList.contains(CHAT_MEMBER_NAME_ELEMENT_CLASS_NAME) && el.innerText.toString() === AppState.selfNameLabel) {
            return AppState.selfName;
        }
        return el.innerText;
    });
    return chatMessages.length ? chatMessages.join('\n') : '';
}

// 自分の名前と自分の名前として表示されるラベルを取得する
function getSelfLabel() {
    const selfNameElement = document.querySelector(SELECTORS.selfNameElement);
    if (selfNameElement) {
        AppState.selfNameLabel = selfNameElement.textContent;
    }
}

function getChatMemberName() {
    const chatMemberNameElement = document.querySelector(SELECTORS.chatMemberName);
    if (chatMemberNameElement && chatMemberNameElement.getAttribute('title')) {
        AppState.selfName = chatMemberNameElement.getAttribute('title');
    }
}

// 自分の名前をラベルが保存されているかを確認する
function isSelfNameAndLabelReady() {
    return AppState.selfName !== '' && AppState.selfNameLabel !== '';
}

observeAndAttachEvent(SELECTORS.exitButton, 'click', saveChat, true);
observeAndAttachEvent(`#${IDS.copyButton}`, 'click', saveChat, true);

// 退出済みメッセージを監視するためのMutationObserver
const removedMessageObserver = new MutationObserver((mutationsList, observer) => {
    for (let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const removeMessageElement = document.querySelector(SELECTORS.removedMessage);
            if (removeMessageElement) {
                if (AppState.chatOutputFlag === false) {
                    const textarea = document.createElement('textarea');
                    textarea.id = IDS.chatLogTextArea;
                    textarea.style.width = CONFIG.STYLES.TEXTAREA.width;
                    textarea.style.height = CONFIG.STYLES.TEXTAREA.height;
                    textarea.value = AppState.tmpChatLogText;
                    const copyButton = document.createElement('button');
                    copyButton.textContent = 'Copy';
                    copyButton.type = 'button';
                    copyButton.addEventListener('click', saveChatLog);
                    const pElement = document.createElement('p');
                    pElement.append(copyButton);
                    const wrapDiv = document.createElement('div');
                    wrapDiv.append(textarea, pElement);
                    removeMessageElement.after(wrapDiv)
                    AppState.chatOutputFlag = true;
                }
                observer.disconnect();  // 通話から退出ボタンが見つかったら監視を停止
            }
        }
    }
});

removedMessageObserver.observe(document, {childList: true, subtree: true})

window.addEventListener('beforeunload', (e) => {
    const chatText = getChatText()
    if (chatText !== '') {
        AppState.tmpChatLogText = chatText
        e.returnValue = 'Remove?';
    }
});

// チャットの見出しの存在判定を行う
function isChatTitle() {
    const chatHeadingElement = document.querySelector(SELECTORS.chatTitle);
    if (chatHeadingElement !== null) {
        if (document.querySelector(`#${IDS.copyButton}`) === null) {
            chatHeadingElement.after(createCopyButton());
        }
    }
    setTimeout(isChatTitle, CONFIG.TIMEOUTS.CHAT_TITLE_CHECK);
}

// ボタンの色を変更するイベント
function handleCopyButtonColorChange(e, color) {
    e.target.style.backgroundColor = color;
}

// コピーボタンのDOMを作成する
function createCopyButton() {
    const copyIconSpan = createCopyIconSpan();
    const copyButton = createButtonWithIcon(copyIconSpan);
    copyButton.addEventListener('mouseenter', (e) => handleCopyButtonColorChange(e, CONFIG.STYLES.COPY_BUTTON_HOVER));
    copyButton.addEventListener('mouseleave', (e) => handleCopyButtonColorChange(e, CONFIG.STYLES.COPY_BUTTON_NORMAL));
    copyButton.addEventListener('mousedown', (e) => handleCopyButtonColorChange(e, CONFIG.STYLES.COPY_BUTTON_NORMAL));
    copyButton.addEventListener('mouseup', (e) => handleCopyButtonColorChange(e, CONFIG.STYLES.COPY_BUTTON_HOVER));
    const wrapDiv = document.createElement('div');
    wrapDiv.append(copyButton);
    return wrapDiv;
}

// アイコンspan要素を作成
function createCopyIconSpan() {
    const copyIconSpan = document.createElement('span');
    copyIconSpan.classList.add('google-material-icons');
    copyIconSpan.textContent = 'content_copy';
    copyIconSpan.style.color = CONFIG.STYLES.COPY_ICON.color;
    return copyIconSpan;
}

// ボタン要素を作成してアイコンを追加
function createButtonWithIcon(iconElement) {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.style.backgroundColor = CONFIG.STYLES.COPY_BUTTON.backgroundColor;
    copyButton.style.border = CONFIG.STYLES.COPY_BUTTON.border;
    copyButton.style.padding = CONFIG.STYLES.COPY_BUTTON.padding;
    copyButton.style.cursor = CONFIG.STYLES.COPY_BUTTON.cursor;
    copyButton.style.borderRadius = CONFIG.STYLES.COPY_BUTTON.borderRadius;
    copyButton.append(iconElement);
    copyButton.id = IDS.copyButton;
    return copyButton;
}

setTimeout(isChatTitle, CONFIG.TIMEOUTS.CHAT_TITLE_CHECK);
setInterval(getChatMemberName, CONFIG.TIMEOUTS.MEMBER_NAME_CHECK);


function observeAndAttachEventPinP(pinpWindow, selector, event, eventHandler, disconnect){
    const observer = new MutationObserver((mutationsList, observer) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const element = pinpWindow.document.querySelector(selector);
                if (element) {
                    // element.addEventListener(event, eventHandler); // Phase 2で実装予定：PinP内でのイベントリスナー追加
                    if (disconnect) observer.disconnect();
                }
            }
        }
    });

    observer.observe(pinpWindow.document, {childList: true, subtree: true});
    return observer;
}

// ピクチャーインピクチャーのオープンを監視（Phase 2で本格実装予定）
window.documentPictureInPicture.addEventListener('enter',event => {
    // Phase 2でPinP内チャット機能を実装予定
    event.target.window.addEventListener('load', () => {
        // PinPウィンドウ読み込み完了時の処理
    })
    observeAndAttachEventPinP(event.target.window, SELECTORS.exitButton, 'click', saveChat, true);
})

