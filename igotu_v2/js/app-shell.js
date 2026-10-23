/* Presentation only: navigation has no dependency on authentication or data APIs. */
(() => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.navigation-toggle');
  if (!sidebar || !toggle) return;

  let lastFocused = document.activeElement;
  document.addEventListener('focusin', event => { lastFocused = event.target; });
  document.addEventListener('pointerdown', event => { lastFocused = event.target; });
  const mobile = window.matchMedia('(max-width: 1000px)');
  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(!mobile.matches || open));
    toggle.firstChild.textContent = open && mobile.matches ? 'Close ' : 'Menu ';
  }
  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
  sidebar.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && sidebar.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  mobile.addEventListener('change', () => {
    // Move focus out of links before collapsing them on a desktop-to-mobile resize.
    if (mobile.matches && sidebar.querySelector('.side-menu').contains(lastFocused)) toggle.focus();
    setOpen(false);
  });
  setOpen(false);
  sidebar.classList.add('navigation-ready');
})();
