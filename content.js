const SELECTORS = {
    exitButton: '[jsname="CQylAd"]',
    chatMessage: '[jsname="Ypafjf"] div div',
    removedMessage: '.lAqQo .roSPhc[jsname="r4nke"]',
    chatTitle: '[jsname="uPuGNe"][role="heading"]'
};

const IDS = {
    copyButton: 'GMCTC-copyButton',
    chatLogTextArea: 'GMCTC-onRemoveChatLogTextArea'
};
// チャットログを保存するための変数
let tmpChatLogText = '';

// チャットログ表示フラグ
let chatOutputFlag = false;

// セレクタを元にDOMを検索し、存在したら指定のイベントを追加する関数
function observeAndAttachEvent(selector, event, eventHandler, disconnect) {
    const observer = new MutationObserver((mutationsList, observer) => {
        for(let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const element = document.querySelector(selector);
                if (element) {
                    element.addEventListener(event, eventHandler);
                    if (disconnect) observer.disconnect();
                }
            }
        }
    });
    observer.observe(document, { childList: true, subtree: true });
    return observer;
}

// チャット要素を探してクリップボードに保存
function saveChat() {
    let chatMessage = getChatText();
    chatOutputFlag = true;
    if (chatMessage === '') return;
    navigator.clipboard.writeText(chatMessage);
}

function saveChatLog() {
    if (tmpChatLogText === '') return;
    navigator.clipboard.writeText(tmpChatLogText);
}

function getChatText() {
    let chatMessages = [...document.querySelectorAll(SELECTORS.chatMessage)].map(el => el.innerText);
    return chatMessages.length ? chatMessages.join('\n') : '';
}

const exitButtonObserver = observeAndAttachEvent(SELECTORS.exitButton, 'click', saveChat, true);

// 退出済みメッセージを監視するためのMutationObserver
const removedMessageObserver = new MutationObserver((mutationsList, observer) => {
    for(let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const removeMessageElement = document.querySelector(SELECTORS.removedMessage);
            if (removeMessageElement) {
                if (chatOutputFlag === false){
                    const textarea = document.createElement('textarea');
                    textarea.id=IDS.chatLogTextArea;
                    textarea.style.width = '300px';
                    textarea.style.height = '180px';
                    textarea.value = tmpChatLogText;
                    const copyButton = document.createElement('button');
                    copyButton.textContent = 'Copy';
                    copyButton.type = 'button';
                    copyButton.addEventListener('click',saveChatLog);
                    const pElement = document.createElement('p');
                    pElement.append(copyButton);
                    const wrapDiv = document.createElement('div');
                    wrapDiv.append(textarea,pElement);
                    removeMessageElement.after(wrapDiv)
                    chatOutputFlag = true;
                }
                observer.disconnect();  // 通話から退出ボタンが見つかったら監視を停止
            }
        }
    }
});

removedMessageObserver.observe(document, { childList: true, subtree: true })

window.addEventListener('beforeunload', (e) => {
    const chatText = getChatText()
    if (chatText !== ''){
        console.log(chatText);
        tmpChatLogText = chatText
        e.returnValue='Remove?';
    }
});

// チャットの見出しの存在判定を行う
function isChatTitle() {
    const chatHeadingElement = document.querySelector(SELECTORS.chatTitle);
    if (chatHeadingElement !== null){
        if (document.querySelector(`#${IDS.copyButton}`) === null) {
            chatHeadingElement.after(createCopyButton());
        }
    }
    setTimeout(isChatTitle, 500);
}

// コピーボタンクリック時のイベント
function handleCopyButtonClick() {
    saveChat()
}

// ボタンの色を変更するイベント
function handleCopyButtonColorChange(e, color) {
    e.target.style.backgroundColor = color;
}
// コピーボタンのDOMを作成する
function createCopyButton() {
    const copyIconSpan = createCopyIconSpan();
    const copyButton = createButtonWithIcon(copyIconSpan);
    copyButton.addEventListener('mouseenter', (e) => handleCopyButtonColorChange(e, 'rgba(0, 0, 0, 0.05)'));
    copyButton.addEventListener('mouseleave', (e) => handleCopyButtonColorChange(e, 'rgba(0, 0, 0, 0)'));
    copyButton.addEventListener('mousedown', (e) => handleCopyButtonColorChange(e, 'rgba(0, 0, 0, 0)'));
    copyButton.addEventListener('mouseup', (e) => handleCopyButtonColorChange(e, 'rgba(0, 0, 0, 0.05)'));
    copyButton.addEventListener('click',handleCopyButtonClick);
    const wrapDiv = document.createElement('div');
    wrapDiv.append(copyButton);
    return wrapDiv;
}

// アイコンspan要素を作成
function createCopyIconSpan() {
    const copyIconSpan = document.createElement('span');
    copyIconSpan.classList.add('google-material-icons');
    copyIconSpan.textContent = 'content_copy';
    copyIconSpan.style.color = 'rgb(95, 99, 104)';
    return copyIconSpan;
}

// ボタン要素を作成してアイコンを追加
function createButtonWithIcon(iconElement) {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    copyButton.style.border = 'none';
    copyButton.style.padding = '12px';
    copyButton.style.cursor = 'pointer';
    copyButton.style.borderRadius = '50%';
    copyButton.append(iconElement);
    copyButton.id = IDS.copyButton;
    return copyButton;
}

setTimeout(isChatTitle, 500);
