// ==UserScript==
// @name         Add JPDB/Jiten/Kotobank links to jisho.org
// @namespace    http://tampermonkey.net/
// @version      2026-08-14
// @description  Add JPDB.org, Jiten.org and Kotobank.jp links to jisho.org
// @author       vytah
// @match        https://jisho.org/search/*
// @match        https://jisho.org/word/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=jisho.org
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function findId(element) {
        let ids = [...element.querySelectorAll("li")]
            .map(li => li.querySelector("a")?.href)
            .filter(url => url?.includes('www.edrdg.org'))
            .map(url => url.match(/q=(\d+)/)?.[1]);
        if (!ids?.length) {
            return null;
        }
        return ids[0] ?? null;
    }
    function buildLinks(className, id, text) {
        let encoded = encodeURIComponent(text);
        return `
            <a target="_blank" class="${className}" href="https://jpdb.io/vocabulary/${id}/${encoded}#a">Open in JPDB ▸</a>
            <a target="_blank" class="${className}" href="https://jpdb.io/search?q=${encoded}">Search in JPDB ▸</a>
            <a target="_blank" class="${className}" href="https://jiten.moe/vocabulary/${id}/0">Open in Jiten ▸</a>
            <a target="_blank" class="${className}" href="https://jiten.moe/parse?text=${encoded}">Search in Jiten ▸</a>
            <a target="_blank" class="${className}" href="https://kotobank.jp/search?q=${encoded}&t=ja">Search in Kotobank ▸</a>
        `;
    }
    if (window.location.pathname.startsWith("/search/")) {
        let searchResults = document.querySelectorAll("#main_results div.exact_block div.clearfix");
        for (let result of searchResults) {
            try {
                let text = result.querySelector("span.text")?.innerText;
                if (!text) continue;
                let id = findId(result);
                if (!id) continue;
                let detailsLink = result.querySelector("a.light-details_link");
                if (!detailsLink) continue;
                detailsLink.outerHTML += buildLinks("light-details_link", id, text);
            } catch (e) {
                console.log(e);
            }
        }
    }
    if (window.location.pathname.startsWith("/word/")) {
        document.querySelectorAll('a.concept_light-status_link[href="#"]');
        let text = decodeURI(window.location.pathname.substring(6));
        let id = findId(document);
        if (!id) return;
        let detailsLink = document.querySelector('a.concept_light-status_link[href="#"]')
        if (!detailsLink) return;
        detailsLink.outerHTML += buildLinks("light-details_link", id, text);
    }
})();
