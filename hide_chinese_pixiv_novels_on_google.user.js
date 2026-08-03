// ==UserScript==
// @name         Hide Chinese Pixiv novels
// @namespace    http://tampermonkey.net/
// @version      2026-08-03
// @description  Hides Chinese novels on Pixiv in Google and Pixiv search results
// @author       vytah
// @match        https://www.google.com/search*
// @match        https://www.pixiv.net/novel/*
// @match        https://www.pixiv.net/search?*
// @match        https://www.pixiv.net/tags/*
// @match        https://www.pixiv.net/en/tags/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    function isGoogle() {
        return window.location.host.includes('google');
    }
    function isSearchingPixiv() {
        let search = window.location.search;
        if (!search) return false;
        for(let term of ["site:www.pixiv.net", "site:pixiv.net", "site%3Awww.pixiv.net", "site%3Apixiv.net"]) {
            if (search.includes(term)) {
                return true;
            }
        }
        return false;
    }
    function isBrowsingNovels() {
        let l = window.location.toString()
        if (l.includes('/novel/bookmark')) return true;
        if (l.includes('/novel') && l.includes('/tags')) return true;
        if (l.includes('/search') && l.includes('&type=novel') && !l.includes('work_lang=ja')) return true;
        return false;
    }
    //
    let chineseCharacters = "级给绝丝结纪续实语论认说计记设们问简轻军见则马妈饱资兴发书险脸为伦沦欢戏难压护处飞长艺".split('');
    function isInChinese(elem) {
        let text = elem.tagName === 'A' ? elem.text : elem.innerHTML;
        let lang = elem.lang;
        let isChinese;
        if (lang && lang.startsWith("zh")) {
            return true;
        } else {
            isChinese = false;
            for (let c of chineseCharacters) {
                if (text.includes(c)) {
                    return true;
                }
            }
        }
        return false;
    }
    function processElement(titleElem, containerElem) {
        if (isInChinese(titleElem)) {
            containerElem.style += ";opacity: 30%;";
        }
    }

    if (isGoogle()) {
        if (!isSearchingPixiv()) return false;
        let links = document.getElementsByTagName("a");
        console.log(`Found ${links.length} search results`);
        for (let a of links) {
            if (a.href && a.href.includes("pixiv") && a.href.includes("novel")) {
                let text = a.text;
                if (!text.includes("pixiv")) continue;
                let div = a.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement;
                processElement(a, div);
            }
        }
    } else {
        if (!isBrowsingNovels()) return false;
        function processPixivResults(retries) {
            if (retries <= 0) return;
            let cells = document.getElementsByTagName("li");
            let processed = 0;
            console.log(`Found ${cells.length} potential search results`);
            for (let cell of cells) {
                let title = cell.getElementsByClassName('charcoal-text-ellipsis');
                if (title.length > 0) {
                    console.log(title[0].innerHTML);
                    processElement(title[0], cell);
                    processed += 1;
                }
            }
            console.log(`Found ${processed} actual search results`);
            if (processed === 0) {
                setTimeout(() => processPixivResults(retries - 1), 1000);
                return;
            }
        }
        processPixivResults(10);
    }
})();
