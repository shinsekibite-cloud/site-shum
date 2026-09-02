/**
 * Body scroll lock with scrollbar-gap compensation and scrollY restore.
 * Shared by Modal, cookie sheet, action sheets.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedPaddingRight = '';

export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  lockCount += 1;
  if (lockCount > 1) return;

  const body = document.body;
  const docEl = document.documentElement;
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  savedPaddingRight = body.style.paddingRight;

  const gap = Math.max(0, window.innerWidth - docEl.clientWidth);
  if (gap > 0) {
    body.style.paddingRight = `${gap}px`;
  }
  body.style.top = `-${savedScrollY}px`;
  body.style.position = 'fixed';
  body.style.width = '100%';
  body.classList.add('yp-scroll-locked');
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  const body = document.body;
  body.style.position = '';
  body.style.top = '';
  body.style.width = '';
  body.style.paddingRight = savedPaddingRight;
  body.classList.remove('yp-scroll-locked');
  window.scrollTo(0, savedScrollY);
}
