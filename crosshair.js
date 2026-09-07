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
      transition: opacity 0.2s ease;
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
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 44px;
      height: 44px;
      background: rgba(0, 0, 0, 0.65);
      color: var(--crosshair-color, #00ff88);
      border: 2px solid var(--crosshair-color, #00ff88);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      line-height: 1;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      z-index: 2147483647;
      cursor: pointer;
      backdrop-filter: blur(4px);
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      transition: transform 0.1s ease, opacity 0.2s ease;
    }

    #vm-veck-crosshair-toggle:active {
      transform: scale(0.90);
    }

    #${id}.is-hidden {
      opacity: 0;
      visibility: hidden;
    }
  `;
  document.head.appendChild(style);

  // Build Crosshair Container
  const crosshair = document.createElement('div');
  crosshair.id = id;

  ['top', 'bottom', 'left', 'right', 'dot'].forEach(className => {
    const span = document.createElement('span');
    span.className = className;
    crosshair.appendChild(span);
  });

  // Build Touch Toggle Button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'vm-veck-crosshair-toggle';
  toggleBtn.setAttribute('aria-label', 'Toggle Crosshair Visibility');
  toggleBtn.innerHTML = '⌖';

  // Persistence State
  const STORAGE_KEY = 'vm_crosshair_visible';
  let isVisible = localStorage.getItem(STORAGE_KEY) !== 'false';

  const updateState = () => {
    crosshair.classList.toggle('is-hidden', !isVisible);
    toggleBtn.style.opacity = isVisible ? '1' : '0.4';
  };

  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isVisible = !isVisible;
    localStorage.setItem(STORAGE_KEY, isVisible.toString());
    updateState();
  });

  updateState();

  // Mount to DOM
  const mount = () => {
    document.body.appendChild(crosshair);
    document.body.appendChild(toggleBtn);
  };

  if (document.body) {
    mount();
  } else {
    window.addEventListener('DOMContentLoaded', mount, { once: true });
  }
})();
