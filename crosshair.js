// ==UserScript==
// @name         Veck.io — Mobile Custom Crosshair
// @namespace    https://veck.io/
// @version      1.1.0
// @description  Touch-friendly local crosshair overlay for Veck.io.
// @match        https://veck.io/*
// @match        https://www.veck.io/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const id = 'vm-veck-mobile-crosshair';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.textContent = `
    #${id} {
      --crosshair-color: #00ff88;
      position: fixed;
      top: 50%;
      left: 50%;
      width: 30px;
      height: 30px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 2147483647;
      filter: drop-shadow(0 0 2px #000) drop-shadow(0 0 2px #000);
    }

    #${id} span {
      position: absolute;
      display: block;
      background: var(--crosshair-color);
      border-radius: 2px;
    }

    #${id} .top,
    #${id} .bottom {
      left: 50%;
      width: 3px;
      height: 8px;
      transform: translateX(-50%);
    }

    #${id} .top { top: 0; }
    #${id} .bottom { bottom: 0; }

    #${id} .left,
    #${id} .right {
      top: 50%;
      width: 8px;
      height: 3px;
      transform: translateY(-50%);
    }

    #${id} .left { left: 0; }
    #${id} .right { right: 0; }

    #${id} .dot {
      top: 50%;
      left: 50%;
      width: 5px;
      height: 5px;
      transform: translate(-50%, -50%);
      border-radius: 50%;
    }

    #vm-veck-crosshair-toggle {
      position:
