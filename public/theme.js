// Sets the saved light/dark theme before the page draws (no flash of the wrong colours).
// A separate file, not inline, so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem('lale_theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.style.colorScheme = t;
    }
  } catch (e) {}
})();
