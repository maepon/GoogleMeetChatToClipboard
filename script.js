const chatMessageSelector = '[jsname="Ypafjf"] div div';

// beforeunload時に確認メッセージを出す
window.addEventListener('beforeunload', function(event) {
    const chatElements = document.querySelectorAll(chatMessageSelector);
    if (chatElements.length > 0){
        // このメッセージはユーザーには表示されません
        event.returnValue = 'Meetを終了する前に退出ボタンを押してください。';
    }
});