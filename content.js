// 通話から退出ボタンを識別するためのセレクタ
const exitButtonSelector = '[jsname="CQylAd"]';

// チャットメッセージを識別するためのセレクタ
const chatMessageSelector = '[jsname="Ypafjf"] div div';

// 退出済みメッセージを識別するためのセレクタ
const removedMessageSelector = '.lAqQo .roSPhc[jsname="r4nke"]';

// チャットの見出しを識別するためのセレクタ
const chatTitleSelector = '[jsname="uPuGNe"][role="heading"]';

// コピーボタンのID
const copyButtonId = 'GMCTC-copyButton';

// チャットログを保存するための変数
let tmpChatLogText = '';

// チャットログ表示フラグ
let chatOutputFlag = false;

// チャット要素を探してクリップボードに保存
function saveChat() {
    let chatMessage = getChatText();
    chatOutputFlag = true;
    if (chatMessage === '') {
        return;
    }
    navigator.clipboard.writeText(chatMessage);
}

function saveChatLog() {
    let chatMessage = tmpChatLogText;
    if (chatMessage === '') {
        return;
    }
    navigator.clipboard.writeText(chatMessage);
}

function getChatText() {
    let chatMessages = [...document.querySelectorAll(chatMessageSelector)].map(el => el.innerText);
    if (chatMessages.length === 0) {
        return '';
    }
    return chatMessages.join('\n');
}

// ボタンクリックを監視するためのMutationObserver
const observer = new MutationObserver((mutationsList, observer) => {
    for(let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const exitButton = document.querySelector(exitButtonSelector);
            if (exitButton) {
                exitButton.addEventListener('click', saveChat);
                observer.disconnect();  // 通話から退出ボタンが見つかったら監視を停止
            }
        }
    }
});

// ドキュメント全体の変更を監視開始
observer.observe(document, { childList: true, subtree: true });

// 退出済みメッセージを監視するためのMutationObserver
const removedMessageObserver = new MutationObserver((mutationsList, observer) => {
    for(let mutation of mutationsList) {
        if (mutation.type === 'childList') {
            const removeMessageElement = document.querySelector(removedMessageSelector);
            if (removeMessageElement) {
                if (chatOutputFlag === false){
                    const textarea = document.createElement('textarea');
                    textarea.id='GMCTC-onRemoveChatLogTextArea';
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
    const chatHeadingElement = document.querySelector(chatTitleSelector);
    if (chatHeadingElement !== null){
        // コピーボタンが配置されていなければafterで追加する
        const copyButton = document.querySelector(`#${copyButtonId}`);
        if (copyButton === null) {
            const chatHeadingElement = document.querySelector(chatTitleSelector);
            chatHeadingElement.after(createCopyButton());
        }
    }
    setTimeout(isChatTitle, 500)
}

// コピーボタンのDOMを作成する
function createCopyButton() {
    const copyIconSpan = document.createElement('span');
    copyIconSpan.classList.add('google-material-icons');
    copyIconSpan.textContent = 'content_copy';
    copyIconSpan.style.color = 'rgb(95, 99, 104)';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    copyButton.style.border = 'none';
    copyButton.style.padding = '12px';
    copyButton.style.cursor = 'pointer';
    copyButton.style.borderRadius = '50%';
    copyButton.append(copyIconSpan);
    copyButton.addEventListener('mouseenter', () => {
        copyButton.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    });
    copyButton.addEventListener('mouseleave', () => {
        copyButton.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    });
    copyButton.addEventListener('mousedown', () => {
        copyButton.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    });
    copyButton.addEventListener('mouseup', () => {
        copyButton.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    });
    copyButton.addEventListener('click',saveChat);
    copyButton.id = copyButtonId;
    const wrapDiv = document.createElement('div');
    wrapDiv.append(copyButton);
    return wrapDiv;
}

setTimeout(isChatTitle, 500);
