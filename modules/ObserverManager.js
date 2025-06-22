// Observer機能の統一管理モジュール

const ObserverManager = {
    // 汎用Observer作成関数
    createObserver(options) {
        const {
            selector,
            target = document,
            callback,
            disconnect = false,
            mutationTypes = ['childList'],
            observerOptions = { childList: true, subtree: true }
        } = options;

        const observer = new MutationObserver((mutationsList, observer) => {
            for (let mutation of mutationsList) {
                if (mutationTypes.includes(mutation.type)) {
                    const element = target.querySelector(selector);
                    if (element) {
                        callback(element, observer);
                        if (disconnect) observer.disconnect();
                    }
                }
            }
        });

        observer.observe(target, observerOptions);
        return observer;
    },

    // イベント添付専用Observer
    observeAndAttachEvent(selector, event, eventHandler, disconnect = false, target = document) {
        return this.createObserver({
            selector,
            target,
            disconnect,
            callback: (element, observer) => {
                if (!element.hasAttribute(`data-event-${event}`)) {
                    element.addEventListener(event, eventHandler);
                    element.setAttribute(`data-event-${event}`, 'true');
                }
            }
        });
    },

    // 要素発見時のカスタム処理Observer
    observeForElement(selector, callback, disconnect = true, target = document) {
        return this.createObserver({
            selector,
            target,
            disconnect,
            callback
        });
    },

    // UIManager用のDOM監視Observer
    observeForUIChanges(selectors, callback, target = document) {
        const combinedSelector = Array.isArray(selectors) ? selectors.join(', ') : selectors;
        
        return this.createObserver({
            selector: combinedSelector,
            target,
            disconnect: false,
            callback: (element, observer) => {
                callback(element, observer);
            }
        });
    }
};

// モジュールとして利用可能にする
window.ObserverManager = ObserverManager;